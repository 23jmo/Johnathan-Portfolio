/**
 * Bakes the two displacement/mask images the scroll-chat glass filter needs
 * (`components/scrollchat/PageWarp.tsx`) into real PNGs under `public/`.
 *
 * These used to be built at mount with a 256x256 per-pixel JS loop plus
 * `canvas.toDataURL()`. Both maps read ONLY the constants in this file — nothing
 * about the visitor's viewport, the page, or how far the pull has progressed —
 * so the image bytes are identical on every device and every frame. Generating
 * them at runtime was paying a per-visit cost for a build-time constant.
 *
 * Run after changing any constant below:
 *
 *   npm run generate:glass-maps
 *
 * It also rewrites `lib/scrollchat/glassMapManifest.json`, which PageWarp imports
 * to read GLASS_BEZEL. That indirection is deliberate: the bezel width shapes the
 * baked map AND scales the per-frame displacement, so if the two ever disagreed
 * the refraction would silently stop lining up with the sphere's rim. Reading it
 * from the manifest makes THIS file the single source of truth.
 *
 * Deliberately dependency-free (a hand-rolled PNG encoder over `node:zlib`) so
 * the repo doesn't take on `canvas`/`sharp` just to emit two 256px images.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The maps are rendered as UNIT squares at this resolution; PageWarp's <feImage>
 * rescales the single square onto the sphere. 256 gives the thin bezel enough
 * gradient to read smoothly even when the sphere is at its largest.
 */
const GLASS_MAP_SIZE = 256;

/**
 * Fraction of the radius occupied by the refracting bezel. The inner
 * (1 - BEZEL) of the disc is perfectly clear; only this outer band bends. Small
 * = a tight glassy rim (Apple / wabi); large = a soft, thick lens edge. 0.50
 * spreads the distortion across the outer HALF of the radius (only the inner 50%
 * stays clear) - a much thicker warped band, i.e. the falloff toward the centre
 * is far gentler. (Note: bezel width does NOT affect folding - the gradient is
 * set by REFRACT x exponent alone - so widening the band only spreads the same
 * bend over more area, it can never echo.)
 */
const GLASS_BEZEL = 0.5;

/**
 * Exponent of the bezel refraction profile (mag = e^RIM_EXP across the band).
 * Controls how the bend is DISTRIBUTED through the bezel, and with it how hard
 * the very edge spikes relative to the interior:
 *   - ~1.1 spreads the bend evenly (strong across the whole band, rim gradient
 *     just under the caustic -> no fold anywhere).
 *   - HIGHER concentrates the bend into the outermost ring: the interior of the
 *     band stays gentle while the very rim spikes WAY past the caustic into a
 *     tight multi-fold - content WRAPS CONCENTRIC with the silhouette in a band
 *     right at the edge, while the exponent keeps that fold a thin ring so it
 *     never doubles readable body text further in.
 * The rim gradient is RIM_EXP x REFRACT (PageWarp's GLASS_REFRACT); at
 * 2.6 x 0.88 ~= 2.29 the outermost ~10% of the radius folds hard into those
 * concentric bands, the rest magnifies cleanly.
 */
const GLASS_RIM_EXP = 2.6;

/**
 * Edge blur - the rim of the glass softly blurs the refracted content so it
 * "melds" through the edge (Apple liquid-glass) instead of the hard, crisp
 * meniscus. BLUR_INNER is where the blur starts (fraction of the radius; the
 * inner disc stays perfectly sharp), ramping to full at the rim.
 */
const BLUR_INNER = 0.72;

const smoothstep = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

/**
 * The liquid-glass displacement map: an inscribed disc that is NEUTRAL (no
 * displacement) through its clear middle and refracts only in the outer bezel -
 * exactly how a real glass slab bends light just where its surface curves, at
 * the rim. The refraction magnitude is the horizontal component of the glass
 * surface's NORMAL: ~0 across the flat interior, rising to a bounded peak at the
 * very edge. Encoded so feDisplacementMap bends the page RADIALLY at the rim.
 */
function buildGlassMap() {
  const size = GLASS_MAP_SIZE;
  const pixels = Buffer.alloc(size * size * 4);
  const centre = size / 2;
  const radius = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - centre + 0.5;
      const dy = y - centre + 0.5;
      const distance = Math.hypot(dx, dy);
      const unitRadius = distance / radius; // 0 centre -> 1 at the inscribed rim
      let red = 128;
      let green = 128;
      if (distance > 0.0001 && unitRadius < 1) {
        // Bezel coordinate: 0 at the inner edge of the bezel -> 1 at the rim
        // (and 0 across the whole clear interior). mag = e^RIM_EXP concentrates
        // the bend toward the rim: the inner band magnifies as a clean single
        // image, and the outermost ring - where the gradient (RIM_EXP.REFRACT)
        // is driven FAR past the caustic - folds MULTIPLE times, smearing content
        // into CONCENTRIC bands that wrap the silhouette right at the edge. The
        // exponent stays >1 so the onset at the inner bezel edge is smooth
        // (slope -> 0 there), no hard ring where the distortion begins.
        const bezelCoord = 1 - Math.min(1, (1 - unitRadius) / GLASS_BEZEL);
        const magnitude = Math.pow(bezelCoord, GLASS_RIM_EXP);
        red = 128 + (dx / distance) * magnitude * 127;
        green = 128 + (dy / distance) * magnitude * 127;
      }
      const i = (y * size + x) * 4;
      pixels[i] = Math.max(0, Math.min(255, Math.round(red)));
      pixels[i + 1] = Math.max(0, Math.min(255, Math.round(green)));
      pixels[i + 2] = 128;
      pixels[i + 3] = 255;
    }
  }
  return encodePng(size, size, pixels);
}

/**
 * The RIM ALPHA MASK: fully transparent through the clear centre
 * (unitRadius < BLUR_INNER) and ramping to fully opaque at the rim. Positioned
 * onto the sphere like the glass map, it's the `in2` of the edge-blur composite -
 * the blurred copy of the refracted page is kept ONLY where this mask is opaque,
 * so the softening lives at the edge while the centre stays crisp.
 */
function buildBlurMask() {
  const size = GLASS_MAP_SIZE;
  const pixels = Buffer.alloc(size * size * 4);
  const centre = size / 2;
  const radius = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - centre + 0.5;
      const dy = y - centre + 0.5;
      const unitRadius = Math.hypot(dx, dy) / radius;
      // Transparent through the sharp interior, smooth ramp to opaque at the rim.
      const alpha =
        unitRadius < 1 ? smoothstep((unitRadius - BLUR_INNER) / (1 - BLUR_INNER)) : 0;
      const i = (y * size + x) * 4;
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
      pixels[i + 3] = Math.round(alpha * 255);
    }
  }
  return encodePng(size, size, pixels);
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
  ["public/scrollchat/glass-map.png", buildGlassMap()],
  ["public/scrollchat/glass-rim-mask.png", buildBlurMask()],
];

for (const [relativePath, bytes] of outputs) {
  const absolutePath = resolve(repoRoot, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, bytes);
  console.log(`wrote ${relativePath} (${bytes.length} bytes)`);
}

const manifestPath = resolve(repoRoot, "lib/scrollchat/glassMapManifest.json");
mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-glass-maps.mjs",
      mapSize: GLASS_MAP_SIZE,
      bezel: GLASS_BEZEL,
      rimExponent: GLASS_RIM_EXP,
      blurInner: BLUR_INNER,
    },
    null,
    2
  )}\n`
);
console.log("wrote lib/scrollchat/glassMapManifest.json");
