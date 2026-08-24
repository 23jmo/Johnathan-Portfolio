/**
 * The glass lens PROFILE: the pure math behind the displacement map, the rim
 * blur mask and the meniscus height field, plus the handful of filter-side
 * scales that have to agree with them.
 *
 * This lives in its own dependency-free `.mjs` module because it has two very
 * different consumers that must never disagree:
 *
 *   - `scripts/generate-glass-maps.mjs` bakes the shipped PNGs from it at build
 *     time (Node, `node:zlib` PNG encoder).
 *   - `components/scrollchat/GlassDials.tsx` re-bakes them in the browser on
 *     every dial drag (canvas `putImageData` + `toDataURL`).
 *
 * Plain JS with JSDoc types rather than TypeScript so Node can import it with no
 * build step and no experimental type-stripping flag, while `tsc` still type
 * checks the callers through the annotations (the repo has `allowJs`).
 *
 * ---------------------------------------------------------------------------
 * THREE SUPERPOSED LOBES
 * ---------------------------------------------------------------------------
 *
 * The map encodes, per pixel, a RADIAL displacement magnitude in 0..1. Every
 * version of this lens before now summed at most two lobes, and both of them
 * were zero across the clear interior:
 *
 *     magnitude = broadWeight * broadCoord^broadExp     // wide, gentle: bends
 *               + rimWeight   * rimCoord^rimExp         // narrow, steep: folds
 *
 * which is why the middle of the porthole has always shown the page at exactly
 * 1:1. A displacement field that is zero somewhere does not magnify there — it
 * does nothing there. No amount of widening the bezel changes that, because
 * widening it only moves where the ramp STARTS; the interior stays flat.
 *
 * Magnification is a different animal entirely. A uniform scale by Z about the
 * lens centre means sampling `centre + (p - centre) / Z`, i.e. a displacement
 * that is LINEAR IN RADIUS and non-zero everywhere except the exact centre:
 *
 *     offset = -(p - centre) * (1 - 1/Z)
 *
 * So the third lobe is `unitRadius^magnifyExp`, and at `magnifyExp = 1` it is
 * precisely a magnifying glass. That is the term the lens never had.
 *
 * ---------------------------------------------------------------------------
 * THE BUDGET
 * ---------------------------------------------------------------------------
 *
 * All three lobes peak at the rim and are summed into ONE 8-bit channel, so the
 * encoded swing has a hard ceiling: `magnifyWeight + broadWeight + rimWeight`
 * must stay at or under 1. Past it the outer ring clips flat, which reads as a
 * hard band where the bend simply stops increasing. `profileHeadroom` reports
 * the sum so a tuning panel can show it rather than letting it fail silently.
 */

/**
 * Fraction of `feDisplacementMap`'s `scale` that a full-swing channel actually
 * commands. The map writes `128 +/- 127`, and the primitive computes
 * `scale * (channel/255 - 0.5)`, so a channel pinned to 255 moves a pixel by
 * `scale * 127/255`, not by `scale`. Every conversion between "how much zoom do
 * I want" and "what magnitude do I encode" has to carry this factor or the lens
 * comes out half a stop weak.
 */
export const CHANNEL_SWING = 127 / 255;

/**
 * @typedef {Object} GlassProfile
 *
 * Map-side (changing any of these means re-baking the PNGs):
 * @property {number} magnifyZoom  Interior magnification as a real zoom factor.
 *   1 = the historical behaviour, a dead-flat 1:1 middle. 1.15 = the page inside
 *   the porthole is 15% larger. This is converted to a lobe weight against
 *   `bezel` and `refract`, so it is only exact while those two hold.
 * @property {number} magnifyExp   Shape of the magnify lobe. 1 is a true uniform
 *   scale. Above 1 the magnification pushes outward (a clear middle that swells
 *   toward the rim, i.e. barrel); below 1 it crowds into the centre.
 * @property {number} bezel        BROAD lobe width, as a fraction of the radius.
 *   Also the per-frame displacement scale (`r * bezel * refract`), which is why
 *   it is the one number both the bake and the filter must read from one place.
 * @property {number} broadExp     BROAD lobe exponent. Kept low so this lobe's
 *   gradient stays under the caustic threshold of 1 and it bends as a single
 *   clean image rather than doubling readable text.
 * @property {number} broadWeight  BROAD lobe share of the swing.
 * @property {number} rimBezel     RIM lobe width. Much narrower, so the same
 *   exponent ramps over a shorter distance and the gradient lands far past the
 *   caustic — the outermost ring folds several times and smears content into
 *   concentric bands.
 * @property {number} rimExp       RIM lobe exponent. This is the fold violence
 *   knob; it is an exponent, so small changes travel a long way.
 * @property {number} rimWeight    RIM lobe share of the swing.
 * @property {number} blurInner    Where the frost starts, as a fraction of the
 *   radius. The inner disc stays perfectly sharp.
 *
 * Filter-side (live; no re-bake needed):
 * @property {number} refract      Multiplier on the per-frame displacement
 *   scale. The map stores a SHAPE; this stores how hard to drive it.
 * @property {number} chromatic    Per-channel spread of the displacement scale,
 *   as a fraction of it. This is the prismatic fringing at the fold.
 * @property {number} blurFraction Frost blur radius, as a fraction of the
 *   porthole radius, so the meld reads the same at every size.
 */

/**
 * The shipped profile.
 *
 * `magnifyZoom` is deliberately above 1 here: a lens whose middle is 1:1 is not
 * a lens, it is a window with a decorated edge, and every earlier version of
 * this file shipped exactly that. The three weights are balanced to land the
 * peak magnitude at 0.999 — full swing, no clipping.
 *
 * @type {GlassProfile}
 */
export const GLASS_PROFILE_DEFAULTS = {
  magnifyZoom: 1.12,
  magnifyExp: 1,
  bezel: 0.5,
  broadExp: 1.3,
  broadWeight: 0.16,
  rimBezel: 0.24,
  rimExp: 2.6,
  rimWeight: 0.35,
  blurInner: 0.8,
  refract: 0.91,
  chromatic: 0.1,
  blurFraction: 0.06,
};

/** The maps are baked as UNIT squares at this resolution and rescaled onto the
 *  porthole by `<feImage>`. 256 gives the thin rim lobe enough gradient to read
 *  smoothly even when the porthole fills the viewport. */
export const GLASS_MAP_SIZE = 256;

/**
 * Convert `magnifyZoom` into the lobe weight that actually produces it.
 *
 * Working backwards through the whole chain: the filter offsets a pixel by
 * `scale * (channel/255 - 0.5)` with `scale = -radius * bezel * refract`, and
 * the map writes `channel = 128 + direction * magnitude * 127`. So the pixel
 * moves inward by `radius * bezel * refract * CHANNEL_SWING * magnitude`.
 * A uniform zoom of Z needs it to move inward by `unitRadius * radius * (1 - 1/Z)`.
 * Setting those equal and cancelling `radius` leaves the weight below.
 *
 * @param {GlassProfile} profile
 * @returns {number}
 */
export function magnifyWeightFor(profile) {
  const zoom = Math.max(1, profile.magnifyZoom);
  const scalePerUnitMagnitude = profile.bezel * profile.refract * CHANNEL_SWING;
  if (scalePerUnitMagnitude <= 0) return 0;
  return (1 - 1 / zoom) / scalePerUnitMagnitude;
}

/**
 * Radial displacement magnitude at a given normalised radius, 0..1.
 *
 * @param {number} unitRadius 0 at the centre, 1 at the inscribed rim.
 * @param {GlassProfile} profile
 * @returns {number}
 */
export function displacementMagnitude(unitRadius, profile) {
  if (unitRadius <= 0 || unitRadius >= 1) return 0;

  // MAGNIFY: non-zero everywhere, linear at magnifyExp 1. This is the only lobe
  // that does anything at all across the clear interior.
  const magnify =
    magnifyWeightFor(profile) * Math.pow(unitRadius, profile.magnifyExp);

  // BROAD: a wide, gentle ramp confined to the outer `bezel` of the radius.
  // Bends the outer band as one clean image.
  const broadCoord = 1 - Math.min(1, (1 - unitRadius) / profile.bezel);

  // RIM: the same idea over a much shorter distance, so its gradient runs past
  // the caustic and the outermost ring folds onto itself.
  const rimCoord = 1 - Math.min(1, (1 - unitRadius) / profile.rimBezel);

  return Math.min(
    1,
    magnify +
      profile.broadWeight * Math.pow(broadCoord, profile.broadExp) +
      profile.rimWeight * Math.pow(rimCoord, profile.rimExp)
  );
}

/**
 * Peak magnitude BEFORE the 0..1 clamp — i.e. how much of the channel's swing
 * the three lobes are asking for between them. At or under 1 the map is clean;
 * above it the rim clips flat.
 *
 * @param {GlassProfile} profile
 * @returns {number}
 */
export function profileHeadroom(profile) {
  return (
    magnifyWeightFor(profile) + profile.broadWeight + profile.rimWeight
  );
}

const smoothstep = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

/**
 * Iterate an inscribed disc, handing each pixel its index, its unit radius and
 * its outward unit direction. Shared by all three maps so they can never
 * disagree about where the rim is.
 *
 * @param {number} size
 * @param {(index: number, unitRadius: number, dirX: number, dirY: number) => void} visit
 */
function forEachDiscPixel(size, visit) {
  const centre = size / 2;
  const radius = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - centre + 0.5;
      const dy = y - centre + 0.5;
      const distance = Math.hypot(dx, dy);
      const unitRadius = distance / radius;
      const safeDistance = distance > 0.0001 ? distance : 1;
      visit((y * size + x) * 4, unitRadius, dx / safeDistance, dy / safeDistance);
    }
  }
}

/**
 * The liquid-glass DISPLACEMENT MAP, written into an existing RGBA buffer.
 *
 * Neutral grey (128) means "don't move"; the red and green channels carry the
 * signed x and y offsets that `feDisplacementMap` reads. Blue is held at 128 and
 * alpha at 255 so the map composites over the neutral flood cleanly — the alpha
 * channel is NOT free here, which is why the specular height field needs its own
 * image rather than riding along in this one.
 *
 * @param {Uint8Array|Uint8ClampedArray} pixels RGBA, size*size*4 bytes.
 * @param {number} size
 * @param {GlassProfile} profile
 */
export function writeGlassMapPixels(pixels, size, profile) {
  forEachDiscPixel(size, (i, unitRadius, dirX, dirY) => {
    const magnitude = displacementMagnitude(unitRadius, profile);
    pixels[i] = clampByte(128 + dirX * magnitude * 127);
    pixels[i + 1] = clampByte(128 + dirY * magnitude * 127);
    pixels[i + 2] = 128;
    pixels[i + 3] = 255;
  });
}

/**
 * The RIM ALPHA MASK: transparent through the sharp interior, ramping to opaque
 * at the rim. It is the `in2` of the frost composite, so the blurred copy of the
 * refracted page survives only where the glass is actually folding.
 *
 * @param {Uint8Array|Uint8ClampedArray} pixels
 * @param {number} size
 * @param {GlassProfile} profile
 */
export function writeBlurMaskPixels(pixels, size, profile) {
  const span = Math.max(1e-4, 1 - profile.blurInner);
  forEachDiscPixel(size, (i, unitRadius) => {
    const alpha =
      unitRadius < 1 ? smoothstep((unitRadius - profile.blurInner) / span) : 0;
    pixels[i] = 255;
    pixels[i + 1] = 255;
    pixels[i + 2] = 255;
    pixels[i + 3] = clampByte(alpha * 255);
  });
}

/**
 * The MENISCUS HEIGHT FIELD, for `feSpecularLighting`.
 *
 * The displacement map encodes the surface's GRADIENT — how far to bend a pixel
 * — which says nothing about which way the surface FACES. `feSpecularLighting`
 * builds normals by differencing neighbouring ALPHA values as a height field, so
 * the shape has to be baked as alpha, in its own image.
 *
 * NOT a hemisphere. A true `sqrt(1 - r^2)` sphere holds its surface near 45deg
 * across most of the disc, and since `feSpecularLighting` is pure Phong with NO
 * Fresnel term, that lights the whole interior into a white wash instead of
 * ringing the edge. Real glass is bright at the rim because reflectance rises at
 * grazing angles, which Phong cannot express — so the shape has to put the steep
 * part where the highlight belongs: a rounded EDGE over the same bezel the
 * refraction uses, flat across the clear interior and vertical at the rim.
 *
 * @param {Uint8Array|Uint8ClampedArray} pixels
 * @param {number} size
 * @param {GlassProfile} profile
 */
export function writeHeightPixels(pixels, size, profile) {
  forEachDiscPixel(size, (i, unitRadius) => {
    let height = 0;
    if (unitRadius < 1) {
      const bezelCoord = 1 - Math.min(1, (1 - unitRadius) / profile.bezel);
      height = Math.sqrt(Math.max(0, 1 - bezelCoord * bezelCoord));
    }
    pixels[i] = 255;
    pixels[i + 1] = 255;
    pixels[i + 2] = 255;
    pixels[i + 3] = clampByte(height * 255);
  });
}

/** @param {number} value */
function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
