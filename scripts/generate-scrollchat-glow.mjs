#!/usr/bin/env node

/**
 * Regenerates public/images/scrollchat/screen-glow.png using only Node built-ins.
 *
 * The 1102px source doubles to 2204px in CSS: just over a 1920x1080 viewport's
 * diagonal. Larger viewports use 142vmax so the rotating square still covers
 * every corner. The softness comes from CSS filters, making that upscale free.
 *
 * The old `radial-gradient(125% 125%, transparent 38%, #000 74%)` mask is baked
 * into alpha on a square canvas. Equal axes make it circular and therefore
 * rotation-invariant; the conic colors can turn without spinning the frame's
 * edge weighting along with them.
 *
 * Run from the repository root:
 *   node scripts/generate-scrollchat-glow.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const IMAGE_SIZE = 1102;
const MASK_INNER_STOP = 0.38;
const MASK_OUTER_STOP = 0.74;
const MASK_RADIUS_SCALE = 1.25;
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
  "../public/images/scrollchat/screen-glow.png"
);

const crcTable = new Uint32Array(256);
for (let tableIndex = 0; tableIndex < crcTable.length; tableIndex += 1) {
  let checksum = tableIndex;
  for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
    checksum = checksum & 1 ? 0xedb88320 ^ (checksum >>> 1) : checksum >>> 1;
  }
  crcTable[tableIndex] = checksum >>> 0;
}

function calculateCrc32(bytes) {
  let checksum = 0xffffffff;
  for (const byte of bytes) {
    checksum = crcTable[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function createPngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const lengthBytes = Buffer.alloc(4);
  lengthBytes.writeUInt32BE(data.length);

  const checksumBytes = Buffer.alloc(4);
  checksumBytes.writeUInt32BE(calculateCrc32(Buffer.concat([typeBytes, data])));

  return Buffer.concat([lengthBytes, typeBytes, data, checksumBytes]);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function interpolateChannel(start, end, amount) {
  return Math.round(start + (end - start) * amount);
}

const bytesPerRow = IMAGE_SIZE * 4 + 1;
const rawPixels = Buffer.alloc(bytesPerRow * IMAGE_SIZE);
const imageCenter = IMAGE_SIZE / 2;
const maskRadius = IMAGE_SIZE * MASK_RADIUS_SCALE;

for (let y = 0; y < IMAGE_SIZE; y += 1) {
  const rowOffset = y * bytesPerRow;
  rawPixels[rowOffset] = 0; // PNG filter: None.

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

    const normalizedRadius = Math.hypot(offsetX, offsetY) / maskRadius;
    const maskOpacity = clamp(
      (normalizedRadius - MASK_INNER_STOP) /
        (MASK_OUTER_STOP - MASK_INNER_STOP),
      0,
      1
    );

    const pixelOffset = rowOffset + 1 + x * 4;
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
    rawPixels[pixelOffset + 3] = Math.round(maskOpacity * 255);
  }
}

const header = Buffer.alloc(13);
header.writeUInt32BE(IMAGE_SIZE, 0);
header.writeUInt32BE(IMAGE_SIZE, 4);
header[8] = 8; // Bit depth.
header[9] = 6; // RGBA.

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  createPngChunk("IHDR", header),
  createPngChunk("IDAT", deflateSync(rawPixels, { level: 9 })),
  createPngChunk("IEND", Buffer.alloc(0)),
]);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, png);
console.log(`Wrote ${IMAGE_SIZE}x${IMAGE_SIZE} glow bake to ${outputPath}`);
