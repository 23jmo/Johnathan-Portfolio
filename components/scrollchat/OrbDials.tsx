"use client";

import { useEffect } from "react";
import { useDialKit } from "dialkit";

import {
  ORB_TUNING_DEFAULTS as D,
  publishOrbTuning,
} from "@/lib/scrollchat/orbTuning";

/**
 * Live dials for the ORB TRANSITION, the third panel alongside
 * `ScrollChatDials` (the gesture) and `GlassDials` (the optics).
 *
 * The split matters while tuning. `GlassDials` re-bakes the shared displacement
 * maps, so every knob there also moves the `/glass-demo` bench and anything else
 * reading the profile. Nothing here touches the lens — these only change what
 * the orb ASKS of it, so a drag can never make the glass itself look different
 * from what the demo pages show.
 *
 * The groups and ranges mirror `app/orb-demo/page.tsx` one-for-one, so a value
 * found on the bench transfers here by name, and vice versa. The bench keeps its
 * own DialKit state (DialKit persists per group to localStorage), so the two
 * pages can hold different values at once — which is the point of having both.
 *
 * Rendered only under `NODE_ENV === "development"` from `app/layout.tsx`. In
 * production nothing writes to the store and the orb runs on
 * `ORB_TUNING_DEFAULTS`.
 */

type Dial = [value: number, min: number, max: number, step: number];

export default function OrbDials() {
  const motion = useDialKit("Orb · motion", {
    startRadius: [D.startRadius, 0.6, 3, 0.05] as Dial,
    endRadius: [D.endRadius, 0.03, 0.5, 0.005] as Dial,
    startBelow: [D.startBelow, 0, 2, 0.05] as Dial,
    settleY: [D.settleY, 0, 1, 0.01] as Dial,
    riseBias: [D.riseBias, 1, 4, 0.05] as Dial,
  });

  const reveal = useDialKit("Orb · reveal", {
    swapFrom: [D.swapFrom, 0, 1, 0.01] as Dial,
    swapTo: [D.swapTo, 0, 1, 0.01] as Dial,
  });

  const caustic = useDialKit("Orb · caustic", {
    fadeBy: [D.causticFadeBy, 0.05, 1, 0.01] as Dial,
    strength: [D.causticStrength, 0, 1, 0.01] as Dial,
    band: [D.causticBand, 0.4, 1.1, 0.01] as Dial,
    width: [D.causticWidth, 0.02, 0.4, 0.01] as Dial,
    drop: [D.causticDrop, 0, 0.6, 0.01] as Dial,
    softness: [D.causticSoftness, 0.01, 0.3, 0.005] as Dial,
    hue: [D.causticHue, 0, 360, 1] as Dial,
  });

  const land = useDialKit("Orb · land", {
    lob: [D.lob, 0, 0.4, 0.01] as Dial,
    dissolveFrom: [D.dissolveFrom, 0, 1, 0.01] as Dial,
    dissolveTo: [D.dissolveTo, 0, 1, 0.01] as Dial,
  });

  const surface = useDialKit("Orb · surface", {
    milk: [D.milk, 0, 1, 0.01] as Dial,
    milkSmall: [D.milkSmall, 0, 1, 0.01] as Dial,
    shadow: [D.shadow, 0, 0.6, 0.01] as Dial,
    chromaticMaxPx: [D.chromaticMaxPx, 0, 60, 0.5] as Dial,
    frost: [D.frost, 0, 1, 0.05] as Dial,
    chromaticRimOnly: [D.chromaticRimOnly, 0, 1, 0.05] as Dial,
  });

  const lens = useDialKit("Orb · lens", {
    refraction: [D.refraction, 0, 2.5, 0.05] as Dial,
    smallBoost: [D.smallBoost, 0, 3, 0.05] as Dial,
  });

  // Published in an effect rather than during render: `publishOrbTuning`
  // notifies every `useOrbTuning` subscriber, and doing that from a render body
  // is a setState-during-render on another component.
  useEffect(() => {
    publishOrbTuning({
      startRadius: motion.startRadius,
      endRadius: motion.endRadius,
      startBelow: motion.startBelow,
      settleY: motion.settleY,
      riseBias: motion.riseBias,

      swapFrom: reveal.swapFrom,
      swapTo: reveal.swapTo,

      causticFadeBy: caustic.fadeBy,
      causticStrength: caustic.strength,
      causticBand: caustic.band,
      causticWidth: caustic.width,
      causticDrop: caustic.drop,
      causticSoftness: caustic.softness,
      causticHue: caustic.hue,

      lob: land.lob,
      dissolveFrom: land.dissolveFrom,
      dissolveTo: land.dissolveTo,

      milk: surface.milk,
      milkSmall: surface.milkSmall,
      shadow: surface.shadow,
      chromaticMaxPx: surface.chromaticMaxPx,
      frost: surface.frost,
      chromaticRimOnly: surface.chromaticRimOnly,

      refraction: lens.refraction,
      smallBoost: lens.smallBoost,
    });
  }, [
    motion.startRadius,
    motion.endRadius,
    motion.startBelow,
    motion.settleY,
    motion.riseBias,
    reveal.swapFrom,
    reveal.swapTo,
    caustic.fadeBy,
    caustic.strength,
    caustic.band,
    caustic.width,
    caustic.drop,
    caustic.softness,
    caustic.hue,
    land.lob,
    land.dissolveFrom,
    land.dissolveTo,
    surface.milk,
    surface.milkSmall,
    surface.shadow,
    surface.chromaticMaxPx,
    surface.frost,
    surface.chromaticRimOnly,
    lens.refraction,
    lens.smallBoost,
  ]);

  return null;
}
