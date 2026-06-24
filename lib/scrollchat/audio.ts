/**
 * Web Audio "radial dial" synth for the scroll-to-chat gesture.
 *
 * Everything is generated on the fly from oscillators so the dial pitch can
 * track scroll progress in real time, and so we ship no audio assets. The
 * AudioContext is created lazily on the first user gesture to satisfy browser
 * autoplay policy (a context made earlier would start suspended).
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

/** Create/resume the AudioContext. Safe to call repeatedly. Returns null if unsupported. */
export function ensureAudio(): AudioContext | null {
  if (typeof window === "undefined" || !enabled) return null;

  if (!ctx) {
    const Ctor =
      window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.18; // keep the whole effect gentle
    master.connect(ctx.destination);
  }

  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

/** Allow the UI / reduced-motion preference to mute all synth output. */
export function setAudioEnabled(value: boolean) {
  enabled = value;
}

/**
 * A short "tick" whose pitch rises with `progress` (0..1). Called repeatedly as
 * the user pulls past the bottom — together the ticks read as a dial turning.
 * `step` quantizes ticks so we don't fire on every wheel event.
 */
export function playDialTick(progress: number) {
  const audio = ensureAudio();
  if (!audio || !master) return;

  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();

  // Map progress to a pentatonic-ish rising pitch for a pleasing climb.
  const base = 440;
  const semitones = Math.round(progress * 16);
  osc.frequency.value = base * Math.pow(2, semitones / 12);
  osc.type = "triangle";

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.6, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + 0.09);
}

/** Confirming upward two-note sweep when the gesture commits into the chat. */
export function playCommit() {
  const audio = ensureAudio();
  if (!audio || !master) return;

  const now = audio.currentTime;
  [660, 990].forEach((freq, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const t = now + i * 0.07;
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain);
    gain.connect(master!);
    osc.start(t);
    osc.stop(t + 0.24);
  });
}

/** Soft descending tone when the chat closes / the warp reverses. */
export function playReverse() {
  const audio = ensureAudio();
  if (!audio || !master) return;

  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(720, now);
  osc.frequency.exponentialRampToValueAtTime(360, now + 0.25);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.5, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + 0.3);
}
