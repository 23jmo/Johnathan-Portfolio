"use client";

import { Fragment } from "react";

import { glassTuning, useGlassMaps } from "@/lib/scrollchat/glassTuning";

/**
 * The glass refraction filter, as a standalone SVG <filter> definition.
 *
 * Lifted out of the glass bench so the orb bench can drive the SAME graph with
 * different geometry. That sharing is the whole point: the two transitions
 * differ only in where the lens IS and how big it is over time — the optics, the
 * maps and the channel split are identical, and any drift between two copies
 * would show up as "the orb looks different from the porthole" with no obvious
 * cause.
 *
 * Renders a zero-sized <svg> carrying only the <filter>; the caller references
 * it with `filter: url(#id)` on whatever element should be seen through it.
 */

// Every number and image this filter needs comes from `glassTuning` /
// `useGlassMaps()`, the same pair PageWarp reads — so no consumer of this filter
// can describe a different lens, and `GlassDials` moves all of them at once.

/**
 * How many wavelengths the dispersion is sampled at.
 *
 * This used to be 3 — one tap per colour channel — which is the obvious choice
 * and is wrong for anything sharp. A prism spreads a CONTINUUM; three samples
 * approximate that continuum with three copies, and three copies only read as
 * "a fringe" while they land closer together than a glyph stroke. Push the
 * spread wide enough to actually see (which a large lens does automatically,
 * since the spread is linear in the radius) and the eye stops fusing them and
 * reports the page drawn three times in red, green and blue.
 *
 * Sampling the spectrum finely turns those copies back into a gradient. Text is
 * the hardest case precisely because it is sharp: every wavelength draws its own
 * hard-edged letter, so a coarse sampling shows up as banding exactly where
 * people are reading. Cost is one feDisplacementMap + feColorMatrix +
 * feComposite per tap over the filter region.
 */
const CHROMATIC_SAMPLES: number = 8;

/**
 * The wavelength taps, as {bend, weight} pairs.
 *
 * `bend` runs -1 (red, refracted least) to +1 (blue, refracted most) and scales
 * the dispersion offset. `weight` is how much each of R, G and B that wavelength
 * contributes, from overlapping triangular response curves centred on red,
 * green and blue — crude next to real colour-matching functions, but it puts the
 * hues in the right ORDER along the spread, which is the only thing the eye
 * reads as "prism" rather than "colour bug".
 *
 * The weights are normalised so each channel's column sums to exactly 1. That
 * is what makes the taps summable: anywhere the displacement is uniform, all
 * eight taps land on the same pixel and add back to precisely the original
 * colour, so the clear middle of the lens is not tinted and the page outside it
 * is untouched. Skip the normalisation and the whole frame shifts hue.
 */
const CHROMATIC_TAPS = (() => {
  const responseAt = (bend: number, centre: number) =>
    Math.max(0, 1 - Math.abs(bend - centre));

  const taps = Array.from({ length: CHROMATIC_SAMPLES }, (_, index) => {
    const bend =
      CHROMATIC_SAMPLES === 1
        ? 0
        : (index / (CHROMATIC_SAMPLES - 1)) * 2 - 1;
    return {
      bend,
      weight: [responseAt(bend, -1), responseAt(bend, 0), responseAt(bend, 1)],
    };
  });

  const columnSums = [0, 1, 2].map((channel) =>
    taps.reduce((total, tap) => total + tap.weight[channel], 0)
  );

  return taps.map(({ bend, weight }) => ({
    bend,
    matrix: [
      `${weight[0] / columnSums[0]} 0 0 0 0`,
      `0 ${weight[1] / columnSums[1]} 0 0 0`,
      `0 0 ${weight[2] / columnSums[2]} 0 0`,
      `0 0 0 1 0`,
    ].join("  "),
  }));
})();


/**
 * The refraction filter — the same graph PageWarp ships, not a simplified one.
 *
 * Three things here are what produce the hard edge, and dropping any of them
 * gives the mushy blob a single displacement pass produces:
 *
 *  - The baked map concentrates the whole bend into the outermost ring
 *    (GLASS_RIM_EXP = 2.6 in the generator). The inner half of the bezel
 *    magnifies as one clean image; the very rim is driven far past the caustic,
 *    so content folds multiple times and smears into bands that wrap the
 *    silhouette. That fold IS the "completely distorts at the very edge" look —
 *    it is not a blur, it is refraction pushed past the point where the mapping
 *    stays one-to-one.
 *  - Each colour channel is displaced at a slightly different strength and the
 *    three are screened back together, which fringes that fold prismatically.
 *    Blue bends most, red least.
 *  - A Gaussian blur of the finished chromatic result, kept only where the rim
 *    mask is opaque and laid back OVER the crisp centre. This is the "melds
 *    through the edge" half; without it the fold reads as a hard meniscus.
 *
 * The flood underneath the map is load-bearing. `feImage` only paints where the
 * lens is; everywhere else the result is transparent black, which
 * `feDisplacementMap` reads as channel 0 — a full negative swing — and the rest
 * of the panel slides sideways. Compositing over a neutral grey flood makes "no
 * map here" mean "no displacement here".
 */
export default function RefractionFilter({
  id,
  center,
  radius,
  box,
  envelope = 1,
  chromaticMaxPx = Infinity,
  frost = 1,
  chromaticRimOnly = 0,
}: {
  id: string;
  center: { x: number; y: number };
  radius: number;
  box: { width: number; height: number };
  /**
   * Multiplier on the displacement, 0..1. PageWarp calls the same quantity the
   * refraction envelope: it grows as the lens rounds out and is driven to zero
   * during the commit, so the filter string can be detached entirely and the
   * compositor can release the filter layer at the moment the animation is most
   * sensitive to a dropped frame. A lens flying to a 30px slot has no visible
   * refraction left to lose.
   */
  envelope?: number;
  /**
   * Hard ceiling, in filter-space pixels, on how far apart the red and blue
   * copies may land. `Infinity` (the default) leaves the spread purely
   * proportional, which is what PageWarp wants: it pins its whole filter to a
   * reference radius larger than the viewport diagonal and lets the compositor
   * scale the raster down, so a cap applied in ITS filter space would be scaled
   * by r/r0 into a moving target rather than a fixed one.
   *
   * A lens drawn at its true screen size — the orb — wants the cap. `chromatic`
   * is a fraction of the displacement scale, and that scale is linear in the
   * radius, so the absolute channel separation grows with the lens. The value
   * tuned on a 120px-radius lens puts roughly 3.6px between the red and blue
   * copies of body text, which reads as a fringe. The same number on a
   * 533px-radius orb puts 16px between them, and 16px is not a fringe: the eye
   * stops fusing the channels and reports three separate copies of the
   * sentence. Capping the spread keeps the fringe a fringe at any size.
   */
  chromaticMaxPx?: number;
  /**
   * Multiplier on the frosted rim band, 0..1. Defaults to 1 (PageWarp's look).
   *
   * The band is a Gaussian blur of the finished refraction, kept only where the
   * rim mask is opaque and laid back over the crisp centre — it is what makes
   * the porthole MELD into the page instead of ending at a hard meniscus. On a
   * free-standing orb there is nothing to meld into: the same band just reads as
   * a ring of haze eating the content near the edge. At 0 the blur, its mask and
   * the two composites are not emitted at all, so it costs nothing rather than
   * costing a full-region blur multiplied by zero.
   */
  frost?: number;
  /**
   * How far the dispersion is confined to the rim, 0..1. Default 0 = the whole
   * lens disperses, which is what PageWarp ships.
   *
   * Every wavelength tap reads the SAME displacement map and differs only in
   * `scale`, so the separation between two taps is (scaleA - scaleB) * mag(u) —
   * strictly linear in the bend magnitude. The rim therefore gets about five
   * times the interior's separation and no more, and since summing the taps
   * also averages the page across the spread, turning the rim violent
   * necessarily frosts the middle. One map cannot express "nothing here,
   * everything there".
   *
   * A mask can. At 1 the spectrum is kept only where the rim mask is opaque and
   * a single undispersed pass fills the rest, so the interior is optically
   * perfect while the fold can be driven as hard as it likes. The mask is the
   * same image the frost uses, so its ramp already starts at `blurInner`.
   */
  chromaticRimOnly?: number;
}) {
  // NEGATIVE is the magnify direction — edge content enlarged and wrapped
  // around the curve, rather than fisheye compression toward the middle.
  const glassMaps = useGlassMaps();
  const glassScale =
    -radius * glassTuning.bezel * glassTuning.refract * envelope;
  const spread =
    Math.sign(glassScale) *
    Math.min(Math.abs(glassScale * glassTuning.chromatic), chromaticMaxPx);

  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <filter
        id={id}
        filterUnits="userSpaceOnUse"
        x={0}
        y={0}
        width={box.width}
        height={box.height}
        colorInterpolationFilters="sRGB"
      >
        <feFlood floodColor="rgb(128,128,128)" result="neutral" />
        <feImage
          href={glassMaps.mapUrl}
          preserveAspectRatio="none"
          x={center.x - radius}
          y={center.y - radius}
          width={radius * 2}
          height={radius * 2}
          result="ring"
        />
        <feComposite in="ring" in2="neutral" operator="over" result="map" />

        {/*
          One displacement per wavelength, tinted to that wavelength's share of
          each channel, then ADDED. Addition rather than `feBlend mode="screen"`:
          screen is 1-(1-a)(1-b), which coincides with a merge only while the
          inputs hold disjoint channels — true of the old one-tap-per-channel
          split, false the moment wavelengths overlap in RGB. Screening
          overlapping taps compounds toward white and washes the whole lens out.
          `feComposite operator="arithmetic"` with k2 = k3 = 1 is a plain sum,
          which is what a normalised spectrum needs to reconstruct its input.
        */}
        {CHROMATIC_TAPS.map((tap, index) => (
          <Fragment key={tap.bend}>
            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={glassScale + tap.bend * spread}
              xChannelSelector="R"
              yChannelSelector="G"
              result={`bend${index}`}
            />
            <feColorMatrix
              in={`bend${index}`}
              type="matrix"
              values={tap.matrix}
              result={`tint${index}`}
            />
            {index > 0 && (
              <feComposite
                in={index === 1 ? "tint0" : `sum${index - 1}`}
                in2={`tint${index}`}
                operator="arithmetic"
                k1={0}
                k2={1}
                k3={1}
                k4={0}
                result={
                  index === CHROMATIC_TAPS.length - 1
                    ? "chroma"
                    : `sum${index}`
                }
              />
            )}
          </Fragment>
        ))}

        {chromaticRimOnly > 0 ? (
          <>
            {/*
              One undispersed pass. Every tap above samples a slightly different
              place, so their weighted sum is a directional blur the width of the
              spread as much as it is a colour split — that is the frosting. This
              pass is the same displacement with no spread at all, and it is what
              the clear middle is made of.
            */}
            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={glassScale}
              xChannelSelector="R"
              yChannelSelector="G"
              result="mono"
            />
            <feImage
              href={glassMaps.rimMaskUrl}
              preserveAspectRatio="none"
              x={center.x - radius}
              y={center.y - radius}
              width={radius * 2}
              height={radius * 2}
              result="chromaraw"
            />
            {/*
              Lift the mask's alpha toward 1 by however much confinement is
              dialled OFF: A' = rimOnly*A + (1 - rimOnly). At 0 the mask is
              opaque everywhere and the result is pure spectrum, i.e. exactly
              the old behaviour; at 1 it is the rim ramp untouched.
            */}
            <feColorMatrix
              in="chromaraw"
              type="matrix"
              values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${chromaticRimOnly} ${
                1 - chromaticRimOnly
              }`}
              result="chromamask"
            />
            <feComposite
              in="chroma"
              in2="chromamask"
              operator="in"
              result="chromakeep"
            />
            <feComposite
              in="mono"
              in2="chromamask"
              operator="out"
              result="monokeep"
            />
            {/*
              ADDED, not `over`. The two pieces carry complementary alphas (a and
              1-a), and `over` would evaluate to chroma*a + mono*(1-a)^2 — the
              body would darken toward the ramp. Arithmetic k2=k3=1 is the plain
              sum a cross-fade actually wants, and the alphas land back on 1.
            */}
            <feComposite
              in="chromakeep"
              in2="monokeep"
              operator="arithmetic"
              k1={0}
              k2={1}
              k3={1}
              k4={0}
              result="sharp"
            />
          </>
        ) : (
          <feComposite in="chroma" in2="chroma" operator="in" result="sharp" />
        )}

        {frost > 0 ? (
          <>
            <feImage
              href={glassMaps.rimMaskUrl}
              preserveAspectRatio="none"
              x={center.x - radius}
              y={center.y - radius}
              width={radius * 2}
              height={radius * 2}
              result="blurmask"
            />
            <feGaussianBlur
              in="sharp"
              stdDeviation={radius * glassMaps.blurFraction * frost}
              result="blurred"
            />
            <feComposite
              in="blurred"
              in2="blurmask"
              operator="in"
              result="blurrim"
            />
            <feComposite in="blurrim" in2="sharp" operator="over" />
          </>
        ) : (
          // The graph must still END on `sharp`. Stating it keeps the "no frost"
          // branch independent of which stage above happened to produce it.
          <feComposite in="sharp" in2="sharp" operator="in" />
        )}
      </filter>
    </svg>
  );
}

