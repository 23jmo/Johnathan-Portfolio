/**
 * Whether the dev scrubber currently owns the transition's motion values.
 *
 * Deliberately a bare module flag rather than a store: the only consumer is
 * `OverscrollController`, which reads it from inside `wheel`/`touchmove`
 * handlers. Those need the value at event time, not at render time, so a React
 * subscription would buy nothing and cost a re-render on every toggle.
 *
 * In production nothing ever calls `setScrubHold`, so this stays `false` and
 * the read compiles down to a single load in the gesture's hot path.
 */
let scrubHeld = false;

export function setScrubHold(next: boolean) {
  scrubHeld = next;
}

export function isScrubHeld() {
  return scrubHeld;
}
