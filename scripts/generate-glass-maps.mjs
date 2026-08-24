/**
 * Bakes the three displacement/mask images the scroll-chat glass filter needs
 * (`components/scrollchat/PageWarp.tsx`) into real PNGs under `public/`.
 *
 * These used to be built at mount with a 256x256 per-pixel JS loop plus
 * `canvas.toDataURL()`. The pixels read ONLY the profile - nothing about the
 * visitor's viewport, the page, or how far the pull has progressed - so the
 * image bytes are identical on every device and every frame. Generating them at
 * runtime was paying a per-visit cost for a build-time constant.
 *
 * Run after changing the profile:
 *
 *   npm run generate:glass-maps
 *
 * THE MATH IS NOT HERE. It lives in `lib/scrollchat/glassProfile.mjs`, because
 * `components/scrollchat/GlassDials.tsx` re-bakes the very same maps in the
 * browser on every dial drag. Two copies of a lens profile is two lenses, and
 * the second one only shows up as "the dials lie". This file is now just the
 * Node-side wrapper: profile in, PNG bytes and a manifest out.
 *
 * It also rewrites `lib/scrollchat/glassMapManifest.json`, which PageWarp and
 * the glass demo import to read the filter-side scales. That indirection is
 * deliberate: `bezel` shapes the baked map AND scales the per-frame
 * displacement, so if the two ever disagreed the refraction would silently stop
 * lining up with the porthole's rim.
 *
 * Deliberately dependency-free (a hand-rolled PNG encoder over `node:zlib`) so
 * the repo doesn't take on `canvas`/`sharp` just to emit three 256px images.
 *
 * DETERMINISM: the pixels are fully deterministic - re-running this on any
 * machine produces byte-identical RGBA. The FILE bytes additionally depend on
 * whatever `node:zlib` links against, so a future Node/zlib whose deflate output
 * differs would produce a diff here even though nothing about the images
 * changed. If that ever happens, compare decoded pixels, not file hashes.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GLASS_MAP_SIZE,
  GLASS_PROFILE_DEFAULTS,
  profileHeadroom,
  writeBlurMaskPixels,
  writeGlassMapPixels,
  writeHeightPixels,
} from "../lib/scrollchat/glassProfile.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const profile = GLASS_PROFILE_DEFAULTS;

/**
 * Run one of the profile's pixel writers into a fresh RGBA buffer and encode it.
 *
 * @param {(pixels: Uint8Array, size: number, profile: typeof GLASS_PROFILE_DEFAULTS) => void} write
 */
function bake(write) {
  const pixels = Buffer.alloc(GLASS_MAP_SIZE * GLASS_MAP_SIZE * 4);
  write(pixels, GLASS_MAP_SIZE, profile);
  return encodePng(GLASS_MAP_SIZE, GLASS_MAP_SIZE, pixels);
}

/* ------------------------------------------------------------------ */
/* Minimal PNG encoder (8-bit RGBA, no interlacing, filter type 0).    */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, checksum]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: truecolour with alpha
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  // Every scanline is prefixed with filter byte 0 ("None"). These maps are smooth
  // radial fields, so zlib compresses them well enough without per-row filtering.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ */

const outputs = [
  ["public/scrollchat/glass-map.png", bake(writeGlassMapPixels)],
  ["public/scrollchat/glass-rim-mask.png", bake(writeBlurMaskPixels)],
  ["public/scrollchat/glass-height.png", bake(writeHeightPixels)],
];

for (const [relativePath, bytes] of outputs) {
  const absolutePath = resolve(repoRoot, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, bytes);
  console.log(`wrote ${relativePath} (${bytes.length} bytes)`);
}

/**
 * The manifest is the ONE place the filter graph reads its scales from, so the
 * baked pixels and the per-frame displacement can never drift apart. It carries
 * the whole profile rather than a hand-picked subset: a knob that shapes the map
 * but is missing here is a knob a dial can move without the filter noticing.
 */
const manifestPath = resolve(repoRoot, "lib/scrollchat/glassMapManifest.json");
mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-glass-maps.mjs",
      mapSize: GLASS_MAP_SIZE,
      ...profile,
    },
    null,
    2
  )}\n`
);
console.log("wrote lib/scrollchat/glassMapManifest.json");

const headroom = profileHeadroom(profile);
console.log(`peak magnitude ${headroom.toFixed(3)} of the channel's 1.0 swing`);
if (headroom > 1) {
  console.warn(
    "  WARNING: over budget - the rim will clip flat into a hard ring. " +
      "Lower magnifyZoom, broadWeight or rimWeight until this is <= 1."
  );
}
