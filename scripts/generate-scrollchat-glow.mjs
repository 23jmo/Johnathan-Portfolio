#!/usr/bin/env node

/**
 * Regenerates public/images/scrollchat/screen-glow.webp.
 *
 * The source is intentionally only 256px: CSS enlarges it behind 15px/26px
 * blur filters that erase finer detail. The conic stays fully opaque because
 * the original aspect-correct radial mask now lives on a static viewport frame
 * outside the rotating square.
 *
 * Requires Sharp, provided by this project's Next.js installation. Encoded
 * bytes are reproducible within a fixed toolchain but can shift across
 * Sharp/libvips/libwebp versions; Math.atan2 precision is implementation-defined
 * too. Neither affects the rendered result in practice.
 *
 * Run from the repository root:
 *   node scripts/generate-scrollchat-glow.mjs
 */

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const IMAGE_SIZE = 256;
const WEBP_QUALITY = 85;
const CONIC_COLORS = [
  [0xff, 0x2d, 0x55],
  [0xff, 0x95, 0x00],
  [0xff, 0xcc, 0x00],
  [0x34, 0xc7, 0x59],
  [0x32, 0xad, 0xe6],
  [0x00, 0x7a, 0xff],
  [0xaf, 0x52, 0xde],
  [0xff, 0x2d, 0x55],
];

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(
  scriptDirectory,
  "../public/images/scrollchat/screen-glow.webp"
);

function interpolateChannel(start, end, amount) {
  return Math.round(start + (end - start) * amount);
}

const rawPixels = Buffer.alloc(IMAGE_SIZE * IMAGE_SIZE * 3);
const imageCenter = IMAGE_SIZE / 2;

for (let y = 0; y < IMAGE_SIZE; y += 1) {
  for (let x = 0; x < IMAGE_SIZE; x += 1) {
    const offsetX = x + 0.5 - imageCenter;
    const offsetY = y + 0.5 - imageCenter;

    // CSS conic gradients start at 12 o'clock and advance clockwise.
    const angle = Math.atan2(offsetX, -offsetY);
    const normalizedTurn = (angle / (Math.PI * 2) + 1) % 1;
    const colorPosition = normalizedTurn * (CONIC_COLORS.length - 1);
    const colorIndex = Math.min(
      CONIC_COLORS.length - 2,
      Math.floor(colorPosition)
    );
    const colorProgress = colorPosition - colorIndex;
    const startColor = CONIC_COLORS[colorIndex];
    const endColor = CONIC_COLORS[colorIndex + 1];
    const pixelOffset = (y * IMAGE_SIZE + x) * 3;

    rawPixels[pixelOffset] = interpolateChannel(
      startColor[0],
      endColor[0],
      colorProgress
    );
    rawPixels[pixelOffset + 1] = interpolateChannel(
      startColor[1],
      endColor[1],
      colorProgress
    );
    rawPixels[pixelOffset + 2] = interpolateChannel(
      startColor[2],
      endColor[2],
      colorProgress
    );
  }
}

mkdirSync(dirname(outputPath), { recursive: true });
await sharp(rawPixels, {
  raw: { width: IMAGE_SIZE, height: IMAGE_SIZE, channels: 3 },
})
  .webp({ quality: WEBP_QUALITY, smartSubsample: true, effort: 6 })
  .toFile(outputPath);

console.log(
  `Wrote ${IMAGE_SIZE}x${IMAGE_SIZE} q${WEBP_QUALITY} glow bake to ${outputPath}`
);
