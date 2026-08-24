"use client";

import { useSyncExternalStore } from "react";

import glassMapManifest from "./glassMapManifest.json";
import type { GlassProfile } from "./glassProfile.mjs";

/**
 * Live tuning for the glass LENS, the sibling of `tuning.ts`.
 *
 * `tuning.ts` covers the gesture — how hard the pull is, how it springs. This
 * covers the optics — how the porthole bends, folds and frosts what is behind
 * it. They are split because they are baked at different times and read from
 * different places, and merging them would hide that:
 *
 *   - The MAP-side knobs (`magnifyZoom`, `bezel`, the lobe exponents and
 *     weights, `blurInner`) are normally baked into PNGs at build time by
 *     `scripts/generate-glass-maps.mjs`. Moving one at runtime means re-baking
 *     the images, which `GlassDials` does in a canvas and publishes here as data
 *     URLs.
 *   - The FILTER-side knobs (`refract`, `chromatic`, `blurFraction`) are read
 *     per frame by PageWarp's rAF loop and by its filter JSX. No re-bake needed.
 *
 * The mutable-object half exists for the same reason it does in `tuning.ts`: the
 * warp reads its numbers inside a `requestAnimationFrame` loop, which cannot
 * consume a hook's return value, and threading state in would restart the loop
 * on every dial drag. The `useSyncExternalStore` half exists because the image
 * `href`s and the blur radius live in JSX and genuinely do need a re-render.
 *
 * In production `GlassDials` never mounts, nothing ever writes here, and every
 * read returns the baked manifest value and the static `/scrollchat/*.png`
 * paths — so this module is inert outside development.
 */

/** The baked images the generator writes into `public/`. */
export const BAKED_GLASS_MAPS = {
  mapUrl: "/scrollchat/glass-map.png",
  rimMaskUrl: "/scrollchat/glass-rim-mask.png",
  heightUrl: "/scrollchat/glass-height.png",
} as const;

export interface GlassMapSources {
  mapUrl: string;
  rimMaskUrl: string;
  heightUrl: string;
}

/**
 * The live profile, read imperatively from hot paths.
 *
 * Seeded from the manifest rather than from `GLASS_PROFILE_DEFAULTS` so that the
 * numbers in play always match the PNGs actually sitting in `public/` — if
 * someone edits the profile and forgets to re-run the generator, this reads the
 * stale-but-true value instead of the aspirational one.
 */
export const glassTuning: GlassProfile = {
  magnifyZoom: glassMapManifest.magnifyZoom,
  magnifyExp: glassMapManifest.magnifyExp,
  bezel: glassMapManifest.bezel,
  broadExp: glassMapManifest.broadExp,
  broadWeight: glassMapManifest.broadWeight,
  rimBezel: glassMapManifest.rimBezel,
  rimExp: glassMapManifest.rimExp,
  rimWeight: glassMapManifest.rimWeight,
  blurInner: glassMapManifest.blurInner,
  refract: glassMapManifest.refract,
  chromatic: glassMapManifest.chromatic,
  blurFraction: glassMapManifest.blurFraction,
};

/**
 * The render-visible half. Held as one frozen object replaced wholesale on every
 * change, because `useSyncExternalStore` compares snapshots by identity and
 * would loop forever on a fresh object per call.
 */
interface GlassRenderSnapshot extends GlassMapSources {
  blurFraction: number;
}

let snapshot: GlassRenderSnapshot = {
  ...BAKED_GLASS_MAPS,
  blurFraction: glassTuning.blurFraction,
};

/** The server render has no dials and no canvas, so it always sees the bake. */
const serverSnapshot: GlassRenderSnapshot = snapshot;

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Push a dialled profile and its freshly re-baked images.
 *
 * Called from `GlassDials` only. Writing the profile field-by-field rather than
 * replacing the object keeps every imperative reader's reference valid — the rAF
 * loop captured `glassTuning` once at mount and must go on seeing the same
 * object.
 */
export function publishGlassTuning(
  profile: GlassProfile,
  maps: GlassMapSources
) {
  Object.assign(glassTuning, profile);
  snapshot = { ...maps, blurFraction: profile.blurFraction };
  for (const listener of listeners) listener();
}

/**
 * The image sources and blur radius the filter graph should render with right
 * now: the baked PNGs in production, or the dialled data URLs in development
 * once `GlassDials` has published a set.
 */
export function useGlassMaps(): GlassRenderSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => serverSnapshot
  );
}
