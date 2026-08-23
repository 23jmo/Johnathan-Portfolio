"use client";

import { useEffect, useRef } from "react";
import { useDialKit } from "dialkit";

import {
  GLASS_MAP_SIZE,
  magnifyWeightFor,
  profileHeadroom,
  writeBlurMaskPixels,
  writeGlassMapPixels,
  writeHeightPixels,
} from "@/lib/scrollchat/glassProfile.mjs";
import type { GlassProfile } from "@/lib/scrollchat/glassProfile.mjs";
import { publishGlassTuning } from "@/lib/scrollchat/glassTuning";
import glassMapManifest from "@/lib/scrollchat/glassMapManifest.json";

/**
 * Dev-only tuning panel for the glass LENS optics.
 *
 * The sibling of `ScrollChatDials`, which tunes the gesture. This one tunes what
 * the porthole does to the page behind it.
 *
 * WHY THIS IS NOT JUST A SET OF SLIDERS OVER SOME CSS: most of these knobs are
 * normally BAKED. `scripts/generate-glass-maps.mjs` runs the profile once at
 * build time and writes three PNGs into `public/`, because their pixels depend
 * on nothing about the visitor — so paying for a 256x256 per-pixel loop on every
 * visit would be paying a runtime cost for a constant. That is right for
 * production and useless for tuning, since it means a knob change costs a
 * terminal command, a file write and a reload.
 *
 * So this panel runs the SAME profile module in the browser, writes the pixels
 * into a canvas, and hands PageWarp `data:` URLs instead of the baked paths. The
 * math is imported, never re-implemented — a second copy of a lens profile is a
 * second lens, and the only symptom is "the dials lie".
 *
 * Every dial's default is read from `glassMapManifest.json` rather than from the
 * profile's own defaults, so the panel opens showing the images that are
 * ACTUALLY in `public/` right now. If the profile has been edited without
 * re-running the generator, the dials tell you the truth about what you are
 * looking at instead of the intention.
 *
 * Once a set of numbers feels right: copy them into `GLASS_PROFILE_DEFAULTS` in
 * `lib/scrollchat/glassProfile.mjs` and run `npm run generate:glass-maps`.
 */

type Dial = [value: number, min: number, max: number, step: number];

/** Re-bake and re-encode at most once per frame, however fast a drag fires. */
function useRafDebounce() {
  const frameRef = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);
  return (run: () => void) => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(run);
  };
}

/**
 * Bake one of the profile's pixel writers into a `data:` URL.
 *
 * A single canvas is reused across all three maps and every drag. `toDataURL`
 * re-encodes a PNG each call, which is a few milliseconds at 256x256 — fine for
 * a dev panel at one bake per frame, and the reason this is rAF-debounced rather
 * than run per input event.
 */
function bakeToDataUrl(
  canvas: HTMLCanvasElement,
  write: (
    pixels: Uint8ClampedArray,
    size: number,
    profile: GlassProfile
  ) => void,
  profile: GlassProfile
): string {
  const context = canvas.getContext("2d");
  if (!context) return "";
  const image = context.createImageData(GLASS_MAP_SIZE, GLASS_MAP_SIZE);
  write(image.data, GLASS_MAP_SIZE, profile);
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

export default function GlassDials() {
  /**
   * THE lobe the lens never had.
   *
   * Every earlier version of this map was a sum of bezel lobes, and a bezel lobe
   * is `1 - min(1, (1 - r) / width)` — identically zero across the clear
   * interior. A displacement field that is zero somewhere does not magnify
   * there, it does nothing there, which is why the middle of the porthole has
   * always shown the page at exactly 1:1 no matter how the bezel was tuned.
   *
   * A uniform magnification by Z means sampling `centre + (p - centre) / Z`,
   * i.e. a displacement LINEAR in radius and non-zero everywhere. That is what
   * `zoom` adds, and at `shape = 1` it is exactly a magnifying glass.
   */
  const magnify = useDialKit("Glass · magnify", {
    // The real zoom factor of the interior. 1 restores the historical dead-flat
    // middle; the manifest's default is deliberately above it.
    zoom: [glassMapManifest.magnifyZoom, 1, 1.6, 0.005] as Dial,
    // 1 = a true uniform scale. Above 1 the magnification swells toward the rim
    // (barrel); below 1 it crowds into the centre (pincushion-ish).
    shape: [glassMapManifest.magnifyExp, 0.4, 3, 0.05] as Dial,
  });

  /**
   * The wide, gentle lobe. Bends the outer band as one clean image — its
   * gradient stays under the caustic threshold of 1, so it never doubles
   * readable text.
   */
  const broad = useDialKit("Glass · broad lobe", {
    // Band width as a fraction of the radius. ALSO the per-frame displacement
    // scale (`r * bezel * refract`), so this one number does double duty.
    bezel: [glassMapManifest.bezel, 0.05, 1, 0.01] as Dial,
    exponent: [glassMapManifest.broadExp, 0.5, 4, 0.05] as Dial,
    weight: [glassMapManifest.broadWeight, 0, 1, 0.01] as Dial,
  });

  /**
   * The narrow, steep lobe. Same idea over a much shorter distance, so its
   * gradient lands far past the caustic and the outermost ring folds onto itself
   * — content smears into concentric bands that wrap the silhouette.
   */
  const rim = useDialKit("Glass · rim fold", {
    bezel: [glassMapManifest.rimBezel, 0.02, 0.6, 0.01] as Dial,
    // The fold-violence knob. It is an exponent, so small moves travel far.
    exponent: [glassMapManifest.rimExp, 1, 8, 0.1] as Dial,
    weight: [glassMapManifest.rimWeight, 0, 1, 0.01] as Dial,
  });

  /**
   * Filter-side scales — no re-bake needed, but `refract` still changes the map,
   * because the magnify lobe's weight is derived against it (the map stores a
   * SHAPE; refract stores how hard to drive it, and a given zoom factor needs
   * one to compensate for the other).
   */
  const lens = useDialKit("Glass · lens drive", {
    refract: [glassMapManifest.refract, 0.1, 2.5, 0.01] as Dial,
    // Per-channel spread of the displacement scale: the prismatic fringing.
    chromatic: [glassMapManifest.chromatic, 0, 0.6, 0.01] as Dial,
  });

  /** The frost that melds the fold through the edge instead of ending it in a
   *  hard meniscus. `inner` is where it starts; `amount` is how strong. */
  const frost = useDialKit("Glass · frost", {
    inner: [glassMapManifest.blurInner, 0.3, 0.99, 0.01] as Dial,
    amount: [glassMapManifest.blurFraction, 0, 0.25, 0.005] as Dial,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scheduleBake = useRafDebounce();

  useEffect(() => {
    const profile: GlassProfile = {
      magnifyZoom: magnify.zoom,
      magnifyExp: magnify.shape,
      bezel: broad.bezel,
      broadExp: broad.exponent,
      broadWeight: broad.weight,
      rimBezel: rim.bezel,
      rimExp: rim.exponent,
      rimWeight: rim.weight,
      blurInner: frost.inner,
      refract: lens.refract,
      chromatic: lens.chromatic,
      blurFraction: frost.amount,
    };

    scheduleBake(() => {
      let canvas = canvasRef.current;
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.width = GLASS_MAP_SIZE;
        canvas.height = GLASS_MAP_SIZE;
        canvasRef.current = canvas;
      }

      publishGlassTuning(profile, {
        mapUrl: bakeToDataUrl(canvas, writeGlassMapPixels, profile),
        rimMaskUrl: bakeToDataUrl(canvas, writeBlurMaskPixels, profile),
        heightUrl: bakeToDataUrl(canvas, writeHeightPixels, profile),
      });

      /**
       * All three lobes peak at the rim and are summed into ONE 8-bit channel,
       * so their weights have a hard ceiling of 1. Past it the outer ring clips
       * flat — which looks like a deliberate hard band, not like a bug, and is
       * therefore exactly the kind of thing to say out loud rather than let
       * someone chase for an hour.
       */
      const headroom = profileHeadroom(profile);
      if (headroom > 1) {
        console.warn(
          `[glass] peak magnitude ${headroom.toFixed(3)} > 1 — the rim is ` +
            `clipping flat. magnify costs ${magnifyWeightFor(profile).toFixed(2)}, ` +
            `broad ${profile.broadWeight.toFixed(2)}, rim ${profile.rimWeight.toFixed(2)}.`
        );
      }
    });
  }, [magnify, broad, rim, lens, frost, scheduleBake]);

  return null;
}
