/**
 * The orb's WebGL optics — the half of the look that only exists when the page
 * is available as a TEXTURE.
 *
 * Split from `orbTuning` on purpose. That file holds what the orb asks of the
 * SVG `feDisplacementMap` graph, which works by pushing pixels around a
 * pre-baked height map; these are uniforms for a shader that traces a ray
 * through a surface normal. The two describe the same object but share almost
 * no vocabulary, and folding them together would have produced a struct where
 * half the fields are inert depending on which path took the frame.
 *
 * Every number here was arrived at on the `/webgl-page` spike against the real
 * home page, not invented — see `components/spike/orbDialKit.ts` for the panel
 * that produced them.
 */

/** Uniform values the shader takes directly, with no size dependence. */
export interface OrbGlassOptics {
  /** Index of refraction. Higher bends harder at the rim. */
  ior: number;
  /** Magnification, like a crystal ball held above the page. */
  magnify: number;
  /** Chromatic aberration strength. 0 disables the spectral split. */
  aberration: number;
  /** Painted rim highlight, so the lens is legible over flat backgrounds. */
  shine: number;
  /** Fresnel reflection strength on the rim. */
  reflect: number;
  /** Fraction of the face that stays optically flat before the rim bends. */
  edge: number;
  /** How sharply the rim turns away, at full size. */
  bevel: number;
  /**
   * The same, once the orb has shrunk to nothing.
   *
   * A big droplet and a small one are not the same shape. Gravity flattens a
   * large one — a flat top with all the curvature crushed into the rim, which
   * is a HIGH bevel — while surface tension holds a small one near-spherical,
   * curving gently from the middle out, which is a LOW one. (Formally the Bond
   * number goes with the square of the size, so this is a strong effect over
   * the range the orb travels, not a subtlety.) Holding one bevel across the
   * whole flight makes the chip-sized orb read as a flat disc with a hard
   * outline rather than a bead.
   */
  bevelSmall: number;
  /**
   * A floor on the refracting shoulder, in CSS pixels.
   *
   * `edge` is a FRACTION of the radius, so a fixed value shrinks the shoulder
   * in lockstep with the orb and the bending band goes to nothing well before
   * the orb does. A real water droplet does not do that: the band where surface
   * tension curves the surface has a roughly fixed physical width, so as the
   * droplet shrinks that band takes up MORE of it, not less. This converts the
   * floor into whatever `edge` has to be to keep at least this many pixels of
   * shoulder, and hands over to the plain `edge` above the crossover radius.
   */
  edgeFloorPx: number;
  /**
   * Optical depth as a fraction of the radius.
   *
   * This is the number that decides whether the orb reads as a magnifier or a
   * smear, and it is easy to get catastrophically wrong because the failure
   * looks like "not enough effect". At depth much past half a radius the
   * refracted taps land entirely OUTSIDE the orb's own footprint, sampling
   * blank page, and the orb goes milky and empty — which invites turning the
   * bend up, which makes it worse. Magnification, not depth, is what makes the
   * content inside look bent.
   */
  depthRatio: number;
}

export const ORB_GLASS_OPTICS: OrbGlassOptics = {
  ior: 2.5,
  magnify: 1.3,
  aberration: 3,
  shine: 0.065,
  reflect: 0.3,
  edge: 0.37,
  bevel: 6,
  bevelSmall: 2,
  edgeFloorPx: 195,
  depthRatio: 0.5,
};

/** The shader's own clamps on `uBevel`, mirrored so the caller cannot exceed them. */
const MIN_BEVEL = 0.5;
const MAX_BEVEL = 10;

/**
 * The lowest index any single wavelength may be given.
 *
 * Not a taste limit — a physical one. `iorForWavelength` spreads the index
 * around `ior`, and once the low tap drops under 1.0 its `eta` exceeds 1, the
 * ray total-internal-reflects, GLSL's `refract` returns the zero vector, and
 * that wavelength stops displacing at all. The visible result is a colour
 * FRINGE THAT STOPS GROWING while the dial keeps turning.
 */
const MIN_SPECTRAL_IOR = 1.05;

/** Everything the shader needs for one frame, derived from the orb's size. */
export interface ResolvedOrbOptics {
  edge: number;
  bevel: number;
  aberration: number;
  /** Optical depth in DEVICE pixels, which is the unit the shader works in. */
  depth: number;
  /** How far the orb has shrunk toward nothing, 0..1. */
  smallness: number;
}

/**
 * Resolve the size-dependent optics for one frame.
 *
 * @param radiusCss   the orb's radius in CSS pixels this frame
 * @param sizeUnit    what the orb's radii are fractions of (see `orbSizeUnit`)
 * @param refraction  the orb's overall bend strength, from `OrbTuning`
 * @param smallBoost  how much of that bend survives the shrink, from `OrbTuning`
 * @param pixelRatio  device pixels per CSS pixel
 */
export function resolveOrbOptics(
  radiusCss: number,
  sizeUnit: number,
  refraction: number,
  smallBoost: number,
  pixelRatio: number,
  optics: OrbGlassOptics = ORB_GLASS_OPTICS
): ResolvedOrbOptics {
  // The same curve `OrbWarp` uses for `milk`, so the two stay in step: fully
  // small once the orb is under about a third of a screen.
  const smallness =
    1 - Math.min(1, radiusCss / Math.max(1, sizeUnit * 0.35));

  const radiusDevice = radiusCss * pixelRatio;
  const edgeFloorDevice = optics.edgeFloorPx * pixelRatio;
  // Below the crossover the floor wins and the shoulder eats the whole face;
  // 0.98 is the shader's own ceiling on `uEdge`.
  const edge = Math.min(
    Math.max(
      Math.min(optics.edge, 1 - edgeFloorDevice / Math.max(radiusDevice, 1)),
      0
    ),
    0.98
  );

  const bevel = Math.min(
    Math.max(
      optics.bevel + (optics.bevelSmall - optics.bevel) * smallness,
      MIN_BEVEL
    ),
    MAX_BEVEL
  );

  const depth =
    radiusDevice * refraction * (1 + smallBoost * smallness) * optics.depthRatio;

  // Ask for no more spread than the spectrum can actually carry. Silently
  // clamping is right here: the alternative is a dial that appears dead.
  const aberration =
    Math.min(optics.aberration * 0.1, Math.max(0, optics.ior - MIN_SPECTRAL_IOR)) *
    10;

  return { edge, bevel, aberration, depth, smallness };
}
