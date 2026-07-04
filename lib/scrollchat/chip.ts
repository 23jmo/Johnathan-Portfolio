/**
 * Geometry of the resting "chip" — the warped page-circle's landing spot, just
 * above the chat input. Shared between PageWarp's fly math (which sends the
 * page-circle here) and the ChatChip component (which renders the visible chip
 * at the same spot), so they always agree.
 */

/** Diameter (px) the warped page-circle shrinks to once it lands as the chip.
 * Matches ChatChip's SIZE (30) — this constant only feeds PageWarp's fallback
 * landing slot when the chip isn't mounted (e.g. the name gate is showing). */
export const CHIP_DIAMETER = 30;

/** Chip CENTER, in px above the viewport bottom (sits just above the input). */
export const CHIP_CENTER_FROM_BOTTOM = 132;
