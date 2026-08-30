/**
 * SPIKE — the tunable surface of the WebGL orb.
 *
 * Kept apart from the component for one reason: this file is the only place a
 * knob is DEFINED. Its default, its range and the line it prints when you copy
 * the kit all live in one row, so adding a dial cannot leave the panel and the
 * paste-back block disagreeing about what exists.
 *
 * Why this is not `OrbDials`: that component drives the shipping transition
 * through `publishOrbTuning`, and it renders through the `dialkit` package into
 * the root layout. The spike deliberately sits at `z-[10000]` to cover the
 * layout's dev furniture, so that panel would be underneath it. These dials also
 * reach things `OrbDials` has no concept of, because they only exist when the
 * page is a texture — magnification above all.
 *
 * Every knob whose name matches a field of `ORB_TUNING_DEFAULTS` means exactly
 * what it means there, so a value found here transfers by name. The rest are
 * spike-local: glass-shader uniforms, and the surface pass that stands in for
 * `OrbSurface`'s box-shadows.
 */

import { COMMIT_RATIO, GESTURE_THRESHOLD } from "@/lib/scrollchat/state";

export interface DialSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** What moving it does, shown on hover. */
  hint: string;
}

export interface DialGroup {
  title: string;
  blurb: string;
  dials: DialSpec[];
}

const dial = (
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  hint: string
): DialSpec => ({ key, label, value, min, max, step, hint });

/**
 * The groups, in the order they matter for the LOOK rather than for the code.
 *
 * Optics first because magnification and dispersion are what make this orb read
 * as glass at all; motion last because it is the part already signed off on the
 * real site and least likely to want changing here.
 */
export const ORB_DIAL_GROUPS: DialGroup[] = [
  {
    title: "Optics",
    blurb: "The glass itself. Uniforms of the real LiquidGlassCanvas shader.",
    dials: [
      dial("magnify", "magnify", 1.3, 1, 3, 0.05,
        "Samples closer to the centre. Above 1 the orb reads as a solid crystal ball rather than a window. Only possible because the page is a texture."),
      dial("ior", "ior", 2.5, 1, 2.5, 0.01,
        "Index of refraction. How hard the surface bends what is behind it."),
      dial("aberration", "aberration", 3, 0, 3, 0.05,
        "Spectral spread. Each wavelength lands somewhere slightly different, widening toward the rim on its own."),
      dial("chromaticHold", "chromatic hold", 0, 0, 1, 0.05,
        "How much of the shrink is cancelled out of the SPECTRAL separation. Colour separation is proportional to optical depth, which is proportional to radius, so the fringe collapses in absolute pixels as the orb lands — and a rainbow needs pixels, not ratios, to be seen at all. 0 leaves that untouched; 1 holds the separation at a constant pixel width all the way down. 0.5 halves the falloff, so a 4x collapse becomes 2x."),
      dial("edge", "edge flatness", 0.37, 0, 0.98, 0.01,
        "THE dial for this look. Fraction of the face that stays flat — the rest is the refracting shoulder. High values leave a flat window that ignores refraction entirely and smears content into a thick band at the top; low values give the thin rainbow ring around the whole circumference."),
      dial("bevel", "bevel", 6, 0.5, 10, 0.1,
        "How sharply the rim turns away from the viewer."),
      dial("bevelSmall", "bevel (small)", 2, 0.5, 10, 0.1,
        "The bevel the orb approaches as it shrinks, blended in on the same `smallness` ramp `small boost` uses. A big droplet is flattened by gravity — flat top, curvature crushed into the rim, which is a HIGH bevel. A small one is held near-spherical by surface tension, so it curves across its whole face: a LOW bevel. Set it equal to `bevel` to switch the effect off."),
      dial("shine", "shine", 0.065, 0, 0.3, 0.005,
        "Specular highlight strength on the rim."),
      dial("reflect", "reflection", 0.3, 0, 1, 0.01,
        "Weight of the procedural environment reflected in the rim."),
    ],
  },
  {
    title: "Lens drive",
    blurb: "How hard the orb ASKS the lens to bend. Matches ORB_TUNING_DEFAULTS.",
    dials: [
      dial("refraction", "refraction", 0.9, 0, 4, 0.05,
        "Optical depth, scaled by the orb's own radius so the bend stays proportional as it shrinks."),
      dial("edgeFloorPx", "edge floor", 195, 0, 300, 5,
        "MINIMUM shoulder width, in CSS pixels, however small the orb gets. Surface tension gives a real droplet a shoulder of roughly fixed physical width, so shrinking it does not thin the rim — it just leaves less flat top, until a small enough droplet is nothing but rim. `edge flatness` alone is a pure fraction of the radius, so the shoulder shrinks with the orb and the glass reads flatter the smaller it gets. This floors it. 0 restores the pure-fraction behaviour."),
      dial("smallBoost", "small boost", 0.25, 0, 3, 0.05,
        "Lifts refraction as the orb shrinks. 0 at full size, so this only ever touches the small end — without it the small orb goes flat."),
    ],
  },
  {
    title: "Surface",
    blurb:
      "Stands in for OrbSurface's box-shadows, which no shader can supply. " +
      "Dialled well below the DOM version's values: at this magnification the " +
      "rim reads as a bezel, and the look wanted here is edge-free glass " +
      "carried by dispersion and a drop shadow.",
    dials: [
      dial("meniscusScale", "meniscus width", 0.006, 0, 0.05, 0.001,
        "Ring width as a fraction of the radius. The hairline just inside the silhouette."),
      dial("meniscusFloorPx", "meniscus floor", 0.3, 0, 4, 0.1,
        "Minimum ring width in CSS px. This is what keeps a SMALL orb's edge alive once the fraction falls below a pixel."),
      dial("meniscusAlpha", "meniscus alpha", 0.12, 0, 1, 0.01,
        "Translucent grey rather than near-opaque white: white reads as a drawn outline, the one bright thing in frame."),
      dial("rimAlpha", "outer rim alpha", 0.06, 0, 1, 0.01,
        "The soft dark rim just OUTSIDE the silhouette — this separates the sphere from the page more convincingly than any highlight."),
      dial("rimBlur", "outer rim blur", 0.1, 0, 0.3, 0.005,
        "Blur radius as a fraction of the orb radius."),
      dial("shadow", "shadow alpha", 0.34, 0, 0.8, 0.01,
        "Contact shadow strength. This is what sits the orb ON the page instead of over it."),
      dial("shadowDrop", "shadow drop", 0.06, 0, 0.5, 0.01,
        "Downward offset as a fraction of the radius. Raises the apparent light."),
      dial("shadowBlur", "shadow blur", 0.3, 0, 0.8, 0.01,
        "Blur as a fraction of the radius. Wider reads as further off the page."),
      dial("milk", "milk", 0, 0, 1, 0.01,
        "Body wash over the whole face. 0 on the real site — the refracted content carries the body on its own."),
      dial("milkSmall", "milk (small)", 0, 0, 1, 0.01,
        "Body wash at the small end, interpolated by the same smallness curve as the boost."),
    ],
  },
  {
    title: "Gesture",
    blurb:
      "The overscroll pull and its timings. Thresholds come from " +
      "lib/scrollchat/state.ts; the durations are spike-local.",
    dials: [
      dial("scrollSpeed", "scroll speed", 0.35, 0.2, 4, 0.05,
        "Multiplier on wheel delta for scrolling the PAGE. Does not affect the pull — arming is measured in real wheel pixels so the threshold keeps meaning the same thing at any scroll speed."),
      dial("threshold", "pull threshold", GESTURE_THRESHOLD, 100, 3000, 25,
        "Wheel pixels of overscroll needed to fully arm the gesture. Lower is more sensitive: the orb reaches full height on a shorter pull."),
      dial("commitRatio", "commit ratio", COMMIT_RATIO, 0.1, 1, 0.01,
        "How far the pull must have gone when you let go for it to commit rather than rewind. Above this it flies to the chip; below it snaps back."),
      dial("releaseMs", "release", 260, 60, 1200, 10,
        "Wheel silence that counts as letting go. Too low and a stuttering trackpad commits mid-pull; too high and the orb hangs after you have stopped."),
      dial("hold", "hold", 420, 0, 1500, 10,
        "After letting go below the commit ratio, how long the orb RESTS at the height it reached before falling back. A pull that resumes inside this window continues from the same budget instead of restarting the climb. The page stays scroll-locked throughout, so too long reads as the page having seized up rather than as patience."),
      dial("flyMs", "commit duration", 1375, 200, 2500, 25,
        "How long the flight to the chip takes once committed."),
      dial("rewindMs", "reset duration", 550, 100, 2000, 25,
        "How long the orb takes to fall back when a pull is abandoned, or when you scroll up out of the chat."),
    ],
  },
  {
    title: "Reveal",
    blurb:
      "How the page gives way to the chat. The porthole is a per-pixel " +
      "crossfade rather than a global one.",
    dials: [
      dial("porthole", "porthole", 1, 0, 1, 0.01,
        "1 = the disc keeps showing the page while the chat fills in AROUND it, so the orb reads as a window onto what you are leaving. 0 = one global crossfade, the way OrbWarp does it. Anything between mixes the two."),
    ],
  },
  {
    title: "Motion",
    blurb: "The trajectory. Every one of these is an ORB_TUNING_DEFAULTS field.",
    dials: [
      dial("startRadius", "start radius", 0.7, 0.6, 3, 0.05,
        "Radius at the start of the pull, as a fraction of the viewport DIAGONAL unit."),
      dial("endRadius", "end radius", 0.07, 0.03, 0.5, 0.005,
        "Radius once the pull completes. Interpolated geometrically, so this reads as a sphere receding."),
      dial("startBelow", "start below", 0.95, 0, 2, 0.05,
        "How far below the fold the orb waits, in start radii."),
      dial("settleY", "settle Y", 0.28, 0, 1, 0.01,
        "Where the settled centre sits, as a fraction of viewport height."),
      dial("riseBias", "rise bias", 1.5, 1, 4, 0.05,
        "Front-loads the rise against the shrink. The orb must cover the content BEFORE it is small enough to see past."),
      dial("swapFrom", "swap from", 0.26, 0, 1, 0.01,
        "Progress at which the page begins crossfading to the chat. Early enough that the chat is already there when the orb clears the fold."),
      dial("swapTo", "swap to", 0.35, 0, 1, 0.01,
        "Progress at which the crossfade completes."),
      dial("lob", "lob", 0.08, 0, 0.4, 0.01,
        "Height of the arc on the flight to the chip, as a fraction of viewport height. A straight line reads as falling."),
      dial("dissolveFrom", "dissolve from", 0.62, 0, 1, 0.01,
        "Point in the flight where the orb starts handing off to the chip."),
      dial("dissolveTo", "dissolve to", 0.9, 0, 1, 0.01,
        "Point at which it is fully gone. The last pixels of travel are too small for refraction to read."),
    ],
  },
];

/** Colours are dialled with a picker rather than a slider. */
export interface OrbColours {
  meniscus: string;
  rim: string;
  shadow: string;
}

export const ORB_COLOUR_DEFAULTS: OrbColours = {
  meniscus: "#808080",
  rim: "#5a3c32",
  shadow: "#785046",
};

export type OrbDialValues = Record<string, number>;

export const ORB_DIAL_DEFAULTS: OrbDialValues = Object.fromEntries(
  ORB_DIAL_GROUPS.flatMap((group) =>
    group.dials.map((spec) => [spec.key, spec.value])
  )
);

/** `#rrggbb` to the 0..1 triple the shader wants. */
export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

/**
 * Print the kit as something that can be pasted somewhere useful.
 *
 * Split by destination rather than by dial group, because that is the question
 * being answered at the point of copying: which of these numbers belong in
 * `ORB_TUNING_DEFAULTS`, and which are spike-local? Only what has actually moved
 * off its default is printed, so the block stays readable.
 */
export function formatDialKit(
  values: OrbDialValues,
  colours: OrbColours
): string {
  const tuningFields = new Set([
    "refraction", "smallBoost", "shadow", "milk", "milkSmall",
    "startRadius", "endRadius", "startBelow", "settleY", "riseBias",
    "swapFrom", "swapTo", "lob", "dissolveFrom", "dissolveTo",
  ]);
  // These two ARE shipping constants, under a different name in a different
  // file, so they get their own heading rather than being filed as spike-local.
  const stateFields = new Map([
    ["threshold", "GESTURE_THRESHOLD"],
    ["commitRatio", "COMMIT_RATIO"],
  ]);
  // Release timings are shipping constants too, but they live as bare module
  // constants in the controller rather than in state.ts, so they get a heading
  // of their own instead of being misfiled as spike-local.
  const controllerFields = new Map([
    ["releaseMs", "RELEASE_MS"],
    ["hold", "HOLD_MS"],
  ]);

  const changed = Object.keys(ORB_DIAL_DEFAULTS).filter(
    (key) => values[key] !== ORB_DIAL_DEFAULTS[key]
  );
  if (changed.length === 0 && sameColours(colours)) {
    return "// Every dial is at its default — nothing to carry over.";
  }

  const lines: string[] = [];
  const tuning = changed.filter((key) => tuningFields.has(key));

  if (tuning.length > 0) {
    lines.push("// lib/scrollchat/orbTuning.ts — ORB_TUNING_DEFAULTS");
    for (const key of tuning) lines.push(`  ${key}: ${values[key]},`);
  }

  const state = changed.filter((key) => stateFields.has(key));
  if (state.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("// lib/scrollchat/state.ts");
    for (const key of state) {
      lines.push(`export const ${stateFields.get(key)} = ${values[key]};`);
    }
  }

  const controller = changed.filter((key) => controllerFields.has(key));
  if (controller.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("// components/scrollchat/OverscrollController.tsx");
    for (const key of controller) {
      lines.push(`const ${controllerFields.get(key)} = ${values[key]};`);
    }
  }

  const local = changed.filter(
    (key) =>
      !tuningFields.has(key) &&
      !stateFields.has(key) &&
      !controllerFields.has(key)
  );
  if (local.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("// spike-local (WebGLPageSpike surface + glass uniforms)");
    for (const key of local) lines.push(`  ${key}: ${values[key]},`);
  }

  if (!sameColours(colours)) {
    if (lines.length > 0) lines.push("");
    lines.push("// colours");
    for (const [name, hex] of Object.entries(colours)) {
      if (hex !== ORB_COLOUR_DEFAULTS[name as keyof OrbColours]) {
        lines.push(`  ${name}: "${hex}",`);
      }
    }
  }
  return lines.join("\n");
}

function sameColours(colours: OrbColours) {
  return (Object.keys(ORB_COLOUR_DEFAULTS) as (keyof OrbColours)[]).every(
    (key) => colours[key] === ORB_COLOUR_DEFAULTS[key]
  );
}
