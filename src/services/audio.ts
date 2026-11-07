/**
 * ============================================================================
 *  Color Hop! Kids — procedural WebAudio sound service
 * ============================================================================
 *
 *  Everything is synthesized live (oscillators, noise buffers, biquad
 *  filters). NO audio files, NO external dependencies.
 *
 *  SOUND PACKS — three fully distinct audio characters (SFX timbre AND
 *  background music style), switchable live in the settings:
 *
 *    toys      — warm wooden toy shop: oak dice on a table, felt mallets on
 *                marimba bars, soft paper, gentle kid-game UI ticks.
 *    christmas — the toy shop dressed for the holidays: glassy bell/glocken-
 *                spiel voices, sleigh-bell shimmers, a dreamy bell carillon.
 *    arcade    — pocket game console: square-wave chip plucks, blips and a
 *                bouncy staccato chip-loop with a triangle bass.
 *
 *  Signal flow:
 *
 *    sfx voices  ──►  sfxBus   (gain = settings.sfx)   ──► master ─┐
 *    music voices ─► musicBus  (gain = settings.music)              ├─► limiter ─► destination
 *                          └─► musicDuck (fade on stop/start) ──► master ─┘
 *
 *    master gain = settings.master, forced to 0 while muted, so the
 *    effective level of each bus is:  master × (muted ? 0 : 1) × <bus volume>.
 *
 *  Public contract (fixed — the rest of the game depends on these names):
 *    initAudio()                 — call after the first user gesture
 *    setAudioSettings(settings)  — live volume routing
 *    setSoundPack(id)            — switch the SFX timbre + music style
 *    playSfx(name, opts?)        — fire a sound effect
 *    startMusic() / stopMusic()  — gentle generative background loop
 */

import type { SoundPackId } from '@/store/settingsStore';

// ---------------------------------------------------------------------------
// Public contract (unchanged — consumed by gameStore / settingsStore)
// ---------------------------------------------------------------------------

export type SfxName =
  | 'uiClick'
  | 'uiHover'
  | 'modal'
  | 'star'
  | 'dicePickup'
  | 'diceRoll'
  | 'diceBounce'
  | 'diceSettle'
  | 'pawnSelect'
  | 'pawnHop'
  | 'pawnLand'
  | 'capture'
  | 'pawnReturn'
  | 'finish'
  | 'turnChange'
  | 'victory'
  | 'noMoves'
  | 'reroll';

export interface AudioSettings {
  master: number;
  sfx: number;
  music: number;
  muted: boolean;
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

const DEFAULT_INTENSITY = 0.7;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Clamp a frequency into a WebAudio-safe range (exponential ramps need > 0). */
function clampF(f: number): number {
  if (!Number.isFinite(f) || f <= 0) return 1000;
  return Math.min(18000, Math.max(20, f));
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** MIDI note number → frequency in Hz. */
const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let musicDuck: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

/** Active sound pack — shapes every SFX voice and the background music. */
let currentPack: SoundPackId = 'toys';

/** Last-applied settings (defaults are sensible until the store overrides). */
let currentSettings: AudioSettings = {
  master: 1,
  sfx: 1,
  music: 0.55,
  muted: false,
};

// Music scheduler state
let musicTimer: ReturnType<typeof setInterval> | null = null;
let nextNoteTime = 0;

// ---------------------------------------------------------------------------
// Graph lifecycle — lazy creation, resume, volume routing
// ---------------------------------------------------------------------------

/**
 * Build (once) the AudioContext + gain graph. Safe to call anywhere, any
 * number of times, on the server (returns false) or before a user gesture
 * (context will simply start suspended and be resumed by initAudio/play).
 */
function ensureGraph(): boolean {
  if (typeof window === 'undefined') return false; // SSR guard
  try {
    if (!ctx) {
      const w = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const AC = w.AudioContext ?? w.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      noiseBuffer = null; // buffer belongs to the previous context, if any
    }
    if (!ctx || ctx.state === 'closed') {
      ctx = null;
      return false;
    }
    if (!masterGain || !sfxBus || !musicBus || !musicDuck) {
      const c = ctx;
      const master = c.createGain();
      const sfx = c.createGain();
      const music = c.createGain();
      const duck = c.createGain();
      // Gentle safety limiter so overlapping effects can never hurt little ears.
      const limiter = c.createDynamicsCompressor();
      try {
        limiter.threshold.value = -4;
        limiter.knee.value = 8;
        limiter.ratio.value = 6;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.2;
      } catch {
        /* defaults are fine */
      }
      sfx.connect(master);
      music.connect(duck);
      duck.connect(master);
      master.connect(limiter);
      limiter.connect(c.destination);
      masterGain = master;
      sfxBus = sfx;
      musicBus = music;
      musicDuck = duck;
      applyVolumes();
    }
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
    }
    return true;
  } catch {
    return false;
  }
}

/** Click-free live gain update (setTargetAtTime ~20 ms time constant). */
function setGain(g: GainNode, value: number, t: number, tau = 0.02): void {
  try {
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(value, t, tau);
  } catch {
    try {
      g.gain.value = value;
    } catch {
      /* ignore */
    }
  }
}

/** Route currentSettings onto the bus gains: effective = master × mute × bus. */
function applyVolumes(): void {
  if (!ctx || !masterGain || !sfxBus || !musicBus) return;
  const t = ctx.currentTime;
  const m = currentSettings.muted ? 0 : clamp01(currentSettings.master);
  setGain(masterGain, m, t);
  setGain(sfxBus, clamp01(currentSettings.sfx), t);
  setGain(musicBus, clamp01(currentSettings.music), t);
}

/**
 * Create/resume the AudioContext. Call after the first user gesture.
 * Idempotent — repeated calls only resume a suspended context.
 */
export function initAudio(): void {
  try {
    ensureGraph();
  } catch {
    /* never throw */
  }
}

/** Live volume routing. Stores settings and applies them to the bus gains. */
export function setAudioSettings(settings: AudioSettings): void {
  try {
    currentSettings = {
      master: clamp01(settings.master),
      sfx: clamp01(settings.sfx),
      music: clamp01(settings.music),
      muted: !!settings.muted,
    };
    if (ctx && masterGain) applyVolumes();
  } catch {
    /* never throw */
  }
}

/**
 * Switch the active sound pack (SFX timbre + music style). If the background
 * music is playing it restarts seamlessly so the new style takes over at once.
 */
export function setSoundPack(id: SoundPackId): void {
  try {
    if (id !== 'toys' && id !== 'christmas' && id !== 'arcade') return;
    if (id === currentPack) return;
    currentPack = id;
    if (musicTimer !== null) {
      stopMusic();
      startMusic();
    }
  } catch {
    /* never throw */
  }
}

// ---------------------------------------------------------------------------
// Voice primitives — every voice is fully self-cleaning
// ---------------------------------------------------------------------------

/** Cached white-noise buffer (1 s, mono) reused by every noise voice. */
function getNoiseBuffer(): AudioBuffer | null {
  if (!ctx) return null;
  if (noiseBuffer) return noiseBuffer;
  try {
    const len = Math.floor(ctx.sampleRate); // 1 second
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffer = buf;
    return buf;
  } catch {
    return null;
  }
}

/**
 * Disconnect a voice's nodes once its main source has finished playing.
 * Called from `onended` so nothing leaks, even for long tails.
 */
function attachCleanup(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
  try {
    source.onended = () => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* already disconnected */
        }
      }
    };
  } catch {
    /* ignore */
  }
}

interface ToneOpts {
  type?: OscillatorType;
  f0: number; // start frequency (Hz)
  f1?: number; // optional glide target over ~90 % of dur
  glide?: 'exp' | 'lin';
  dur: number; // total voice length in seconds
  peak: number; // peak gain (linear)
  attack?: number; // attack time (s), default 3 ms
  tau?: number; // decay time constant (s), default dur / 3
  lowpass?: number; // optional dulling lowpass (Hz)
  vibrato?: { rate: number; depth: number }; // gentle pitch wobble
}

/** One oscillator with pluck-ish envelope, optional glide/duller/vibrato. */
function playTone(bus: AudioNode, t: number, o: ToneOpts): void {
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const nodes: AudioNode[] = [osc, g];

    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(clampF(o.f0), t);
    if (o.f1 !== undefined) {
      const to = clampF(o.f1);
      const rampEnd = t + Math.max(0.01, o.dur * 0.9);
      if ((o.glide ?? 'exp') === 'exp') {
        osc.frequency.exponentialRampToValueAtTime(to, rampEnd);
      } else {
        osc.frequency.linearRampToValueAtTime(to, rampEnd);
      }
    }
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = o.vibrato.rate;
      lfoGain.gain.value = o.vibrato.depth;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      nodes.push(lfo, lfoGain);
      try {
        lfo.start(t);
        lfo.stop(t + o.dur);
      } catch {
        /* ignore */
      }
    }

    if (o.lowpass !== undefined) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = clampF(o.lowpass);
      lp.Q.value = 0.7;
      osc.connect(lp);
      lp.connect(g);
      nodes.push(lp);
    } else {
      osc.connect(g);
    }
    g.connect(bus);

    const attack = Math.max(0.001, o.attack ?? 0.003);
    const tau = o.tau ?? o.dur / 3;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.peak, t + attack);
    g.gain.setTargetAtTime(0, t + attack, tau);

    try {
      osc.start(t);
      osc.stop(t + o.dur);
    } catch {
      /* ignore */
    }
    attachCleanup(osc, nodes);
  } catch {
    /* never throw */
  }
}

interface NoiseOpts {
  dur: number;
  peak: number;
  attack?: number;
  tau?: number;
  filter?: BiquadFilterType;
  f0?: number; // filter frequency at start
  f1?: number; // optional exponential sweep target
  q?: number;
}

/** Filtered white-noise burst (wood ticks, paper slides, whooshes). */
function playNoise(bus: AudioNode, t: number, o: NoiseOpts): void {
  if (!ctx) return;
  try {
    const buf = getNoiseBuffer();
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const nodes: AudioNode[] = [src];
    let head: AudioNode = src;

    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter;
      if (o.f0 !== undefined) {
        f.frequency.setValueAtTime(clampF(o.f0), t);
        if (o.f1 !== undefined) {
          f.frequency.exponentialRampToValueAtTime(clampF(o.f1), t + Math.max(0.01, o.dur));
        }
      } else if (o.f1 !== undefined) {
        f.frequency.setValueAtTime(clampF(o.f1), t);
      }
      f.Q.value = o.q ?? 1;
      src.connect(f);
      head = f;
      nodes.push(f);
    }

    const g = ctx.createGain();
    const attack = Math.max(0.001, o.attack ?? 0.002);
    const tau = o.tau ?? o.dur / 3;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.peak, t + attack);
    g.gain.setTargetAtTime(0, t + attack, tau);
    head.connect(g);
    g.connect(bus);

    // Random read offset keeps repeated bursts from sounding identical.
    try {
      src.start(t, Math.random() * 0.5);
      src.stop(t + o.dur);
    } catch {
      /* ignore */
    }
    attachCleanup(src, nodes);
  } catch {
    /* never throw */
  }
}

/**
 * Marimba pluck: sine fundamental + fast-dying 4th partial (the classic
 * marimba bar overtone) + a tiny felt-mallet touch of noise.
 */
function playMarimba(bus: AudioNode, t: number, freq: number, dur: number, peak: number, soft = false): void {
  playTone(bus, t, { f0: freq, dur, peak, attack: 0.002, tau: dur / 3 });
  playTone(bus, t, {
    f0: freq * 4,
    dur: Math.min(dur, 0.32),
    peak: peak * (soft ? 0.13 : 0.16),
    attack: 0.001,
    tau: 0.045,
  });
  playNoise(bus, t, {
    dur: 0.015,
    peak: peak * (soft ? 0.12 : 0.22),
    attack: 0.001,
    tau: 0.005,
    filter: 'lowpass',
    f0: 3200,
  });
}

/** Hollow woodblock hit: resonant band-passed noise + tuned body. */
function playWoodBlock(bus: AudioNode, t: number, f: number, peak: number): void {
  playNoise(bus, t, { dur: 0.11, peak: peak * 0.7, attack: 0.001, tau: 0.03, filter: 'bandpass', f0: f, f1: f * 0.9, q: 6 });
  playTone(bus, t, { f0: f * 0.5, f1: f * 0.42, dur: 0.12, peak: peak * 0.55, attack: 0.001, tau: 0.035 });
}

// ---------------------------------------------------------------------------
// Pack voices — the christmas & arcade timbres
// ---------------------------------------------------------------------------

/** Glassy bell/glockenspiel strike: sine fundamental + inharmonic partials. */
function playBell(bus: AudioNode, t: number, freq: number, dur: number, peak: number, soft = false): void {
  playTone(bus, t, { f0: freq, dur, peak, attack: 0.002, tau: dur / 2.4 });
  playTone(bus, t, { f0: freq * 2.42, dur: dur * 0.55, peak: peak * (soft ? 0.2 : 0.3), attack: 0.001, tau: dur / 5 });
  playTone(bus, t, { f0: freq * 4.13, dur: dur * 0.35, peak: peak * (soft ? 0.08 : 0.14), attack: 0.001, tau: dur / 7 });
  // faint detuned partner → the classic bell "shimmer"
  playTone(bus, t, { f0: freq * 1.004, dur, peak: peak * 0.5, attack: 0.002, tau: dur / 2.6 });
}

/** Small bell tick (UI / turn cue in the christmas pack). */
function playBellTick(bus: AudioNode, t: number, f: number, peak: number): void {
  playTone(bus, t, { f0: f, dur: 0.16, peak, attack: 0.001, tau: 0.045 });
  playTone(bus, t, { f0: f * 2.7, dur: 0.08, peak: peak * 0.3, attack: 0.001, tau: 0.02 });
  playNoise(bus, t, { dur: 0.05, peak: peak * 0.1, attack: 0.001, tau: 0.015, filter: 'highpass', f0: 6200 });
}

/** Staccato chip pluck (arcade lead voice). */
function playChipNote(bus: AudioNode, t: number, freq: number, dur: number, peak: number, soft = false): void {
  playTone(bus, t, {
    type: soft ? 'triangle' : 'square',
    f0: freq,
    f1: freq * 0.97,
    dur: Math.min(dur, 0.16),
    peak,
    attack: 0.002,
    tau: Math.min(dur, 0.16) / 4,
    lowpass: soft ? 2600 : 4200,
  });
}

/** Tiny chip blip (UI / turn cue in the arcade pack). */
function playChipBlip(bus: AudioNode, t: number, f: number, peak: number): void {
  playTone(bus, t, { type: 'square', f0: f, f1: f * 0.82, dur: 0.055, peak: peak * 0.8, attack: 0.001, tau: 0.016, lowpass: 3800 });
  playNoise(bus, t, { dur: 0.015, peak: peak * 0.2, attack: 0.0005, tau: 0.005, filter: 'highpass', f0: 1600 });
}

// ---------------------------------------------------------------------------
// Pack dispatchers — recipes call these; the timbre follows the active pack
// ---------------------------------------------------------------------------

/** The melodic pluck used across recipes & music (marimba / bell / chip). */
function playPluck(bus: AudioNode, t: number, freq: number, dur: number, peak: number, soft = false): void {
  switch (currentPack) {
    case 'christmas':
      playBell(bus, t, freq, dur * 1.15, peak, soft);
      break;
    case 'arcade':
      playChipNote(bus, t, freq, dur, peak, soft);
      break;
    default:
      playMarimba(bus, t, freq, dur, peak, soft);
  }
}

/** The short UI/turn cue tick (woodblock / bell tick / chip blip). */
function playTick(bus: AudioNode, t: number, f: number, peak: number): void {
  switch (currentPack) {
    case 'christmas':
      playBellTick(bus, t, f * 1.35, peak);
      break;
    case 'arcade':
      playChipBlip(bus, t, f * 1.6, peak);
      break;
    default:
      playWoodBlock(bus, t, f, peak);
  }
}

// ---------------------------------------------------------------------------
// SFX recipes — wooden toy shop character
// ---------------------------------------------------------------------------

/**
 * Intensity (0..1) scales loudness everywhere and additionally pitch/energy
 * where it is physically meaningful (dice bounces, pawn hops).
 */
const SFX_RECIPES: Record<SfxName, (bus: AudioNode, t: number, i: number) => void> = {
  // Short dry wooden tick — filtered noise burst + tiny sine blip (~40 ms).
  uiClick: (bus, t, i) => {
    const a = 0.55 + 0.45 * i;
    const f = 1180 + Math.random() * 140;
    playNoise(bus, t, { dur: 0.04, peak: 0.42 * a, attack: 0.001, tau: 0.012, filter: 'bandpass', f0: 2100, f1: 1800, q: 3 });
    playTone(bus, t, { f0: f, f1: f * 0.86, dur: 0.045, peak: 0.1 * a, attack: 0.001, tau: 0.014 });
  },

  // Extremely soft quiet tick (~20 ms, ≈ −20 dB vs uiClick).
  uiHover: (bus, t) => {
    playNoise(bus, t, { dur: 0.02, peak: 0.045, attack: 0.001, tau: 0.007, filter: 'bandpass', f0: 2600, f1: 2300, q: 4 });
  },

  // Soft paper slide — short band-passed noise sweep (~120 ms).
  modal: (bus, t, i) => {
    const a = 0.6 + 0.4 * i;
    playNoise(bus, t, { dur: 0.12, peak: 0.16 * a, attack: 0.015, tau: 0.05, filter: 'bandpass', f0: 700, f1: 1750, q: 0.9 });
  },

  // Bright sparkle chime — two detuned sines, fast decay (~250 ms).
  star: (bus, t, i) => {
    const a = 0.6 + 0.4 * i;
    playTone(bus, t, { f0: 1567.98, dur: 0.25, peak: 0.13 * a, attack: 0.002, tau: 0.07 });
    playTone(bus, t, { f0: 1575.5, dur: 0.25, peak: 0.11 * a, attack: 0.002, tau: 0.065 }); // detuned partner
    playTone(bus, t + 0.015, { f0: 2349.3, dur: 0.18, peak: 0.05 * a, attack: 0.002, tau: 0.05 }); // upper sparkle
  },

  // Wood pickup knock — resonant lowpass thump + click transient (~85 ms).
  dicePickup: (bus, t, i) => {
    const a = 0.55 + 0.45 * i;
    playTone(bus, t, { f0: 170, f1: 72, dur: 0.085, peak: 0.5 * a, attack: 0.001, tau: 0.026 });
    playNoise(bus, t, { dur: 0.05, peak: 0.28 * a, attack: 0.001, tau: 0.018, filter: 'lowpass', f0: 420 });
    playNoise(bus, t, { dur: 0.018, peak: 0.22 * a, attack: 0.0005, tau: 0.006, filter: 'highpass', f0: 1400 });
  },

  // Tumble rattle — 3-4 quick irregular wooden clacks over ~400 ms.
  diceRoll: (bus, t, i) => {
    const a = 0.55 + 0.45 * i;
    const count = 3 + (Math.random() < 0.5 ? 1 : 0);
    let ct = t;
    for (let k = 0; k < count; k++) {
      const f = rand(950, 2200);
      const energy = (1 - (k / count) * 0.4) * rand(0.8, 1.1); // fades as it settles
      playNoise(bus, ct, {
        dur: 0.055,
        peak: 0.34 * a * energy,
        attack: 0.001,
        tau: 0.016,
        filter: 'bandpass',
        f0: f,
        f1: f * 0.8,
        q: rand(3.5, 6.5),
      });
      playTone(bus, ct, { f0: f * 0.62, f1: f * 0.4, dur: 0.05, peak: 0.12 * a * energy, attack: 0.001, tau: 0.012 });
      ct += rand(0.075, 0.145); // irregular spacing = tumbling
    }
  },

  // Single wooden clack — intensity scales pitch AND energy (~60 ms).
  diceBounce: (bus, t, i) => {
    const f = 750 + 850 * i;
    const peak = 0.28 + 0.28 * i;
    playNoise(bus, t, { dur: 0.06, peak, attack: 0.001, tau: 0.02, filter: 'bandpass', f0: f, f1: f * 0.78, q: 4.5 });
    playTone(bus, t, { f0: f * 0.55, f1: f * 0.35, dur: 0.055, peak: peak * 0.35, attack: 0.001, tau: 0.016 });
  },

  // Soft final thud as the die comes to rest (~90 ms).
  diceSettle: (bus, t, i) => {
    const a = 0.55 + 0.45 * i;
    playTone(bus, t, { f0: 115, f1: 55, dur: 0.09, peak: 0.42 * a, attack: 0.001, tau: 0.03 });
    playNoise(bus, t, { dur: 0.07, peak: 0.2 * a, attack: 0.001, tau: 0.022, filter: 'lowpass', f0: 320 });
  },

  // Bubbly pop — sine pitch slide up (~80 ms).
  pawnSelect: (bus, t, i) => {
    const a = 0.6 + 0.4 * i;
    playTone(bus, t, { f0: 330, f1: 840, dur: 0.08, peak: 0.32 * a, attack: 0.002, tau: 0.03 });
  },

  // Playful boing/pop — triangle slide; intensity widens the pitch range.
  pawnHop: (bus, t, i) => {
    const a = 0.6 + 0.4 * i;
    const top = 380 + 340 * i;
    playTone(bus, t, { type: 'triangle', f0: 250, f1: top, dur: 0.09, peak: 0.3 * a, attack: 0.002, tau: 0.032 });
    playTone(bus, t, { f0: 500, f1: top * 2, dur: 0.06, peak: 0.07 * a, attack: 0.001, tau: 0.02 });
  },

  // Soft landing thump (~70 ms).
  pawnLand: (bus, t, i) => {
    const a = 0.6 + 0.4 * i;
    playTone(bus, t, { f0: 95, f1: 52, dur: 0.07, peak: 0.36 * a, attack: 0.001, tau: 0.022 });
    playNoise(bus, t, { dur: 0.05, peak: 0.14 * a, attack: 0.001, tau: 0.016, filter: 'lowpass', f0: 260 });
  },

  // Quick swipe (noise sweep) into impact boing (~200 ms total).
  capture: (bus, t, i) => {
    const a = 0.6 + 0.4 * i;
    playNoise(bus, t, { dur: 0.085, peak: 0.26 * a, attack: 0.006, tau: 0.03, filter: 'bandpass', f0: 600, f1: 2600, q: 1.2 });
    const ti = t + 0.085;
    playTone(bus, ti, { type: 'triangle', f0: 430, f1: 165, dur: 0.115, peak: 0.4 * a, attack: 0.001, tau: 0.045 });
    playNoise(bus, ti, { dur: 0.03, peak: 0.16 * a, attack: 0.001, tau: 0.01, filter: 'bandpass', f0: 1400, q: 4 });
  },

  // Descending slide whistle — sine gliding down with a breath of air.
  pawnReturn: (bus, t, i) => {
    const a = 0.6 + 0.4 * i;
    playTone(bus, t, {
      f0: 1350,
      f1: 480,
      dur: 0.45,
      peak: 0.2 * a,
      attack: 0.02,
      tau: 0.16,
      vibrato: { rate: 5.5, depth: 22 },
    });
    playNoise(bus, t, { dur: 0.06, peak: 0.05 * a, attack: 0.01, tau: 0.02, filter: 'bandpass', f0: 1250, q: 1.5 });
  },

  // Bright ascending 3-note arpeggio (~600 ms).
  finish: (bus, t, i) => {
    const a = 0.6 + 0.4 * i;
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
    notes.forEach((f, k) => {
      playPluck(bus, t + k * 0.18, f, k === notes.length - 1 ? 0.72 : 0.55, 0.3 * a * (1 + k * 0.08));
    });
  },

  // Gentle two-tone cue, low → high (~300 ms).
  turnChange: (bus, t, i) => {
    const a = 0.6 + 0.4 * i;
    playTick(bus, t, 640, 0.4 * a);
    playTick(bus, t + 0.15, 900, 0.36 * a);
  },

  // Warm fanfare — ascending 5-note arpeggio + sparkle tail (~2 s).
  victory: (bus, t, i) => {
    const a = 0.6 + 0.4 * i;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51]; // C5 E5 G5 C6 E6
    notes.forEach((f, k) => {
      playPluck(bus, t + k * 0.14, f, k === notes.length - 1 ? 1.3 : 0.95, (0.28 + k * 0.03) * a);
    });
    const ts = t + 0.75; // soft sparkle tail
    playTone(bus, ts, { f0: 1567.98, dur: 1.0, peak: 0.08 * a, attack: 0.002, tau: 0.3 });
    playTone(bus, ts + 0.02, { f0: 2349.32, dur: 0.8, peak: 0.05 * a, attack: 0.002, tau: 0.25 });
  },

  // Dull two-tone "nope" — low square-ish blips, dulled by a lowpass.
  noMoves: (bus, t, i) => {
    const a = 0.6 + 0.4 * i;
    playTone(bus, t, { type: 'square', f0: 175, f1: 168, dur: 0.11, peak: 0.16 * a, attack: 0.004, tau: 0.045, lowpass: 620 });
    playTone(bus, t + 0.13, { type: 'square', f0: 147, f1: 139, dur: 0.12, peak: 0.15 * a, attack: 0.004, tau: 0.05, lowpass: 580 });
  },

  // Soft whoosh — band-passed noise sweep up + a tiny "extra turn" glint.
  reroll: (bus, t, i) => {
    const a = 0.6 + 0.4 * i;
    playNoise(bus, t, { dur: 0.28, peak: 0.15 * a, attack: 0.05, tau: 0.09, filter: 'bandpass', f0: 450, f1: 1750, q: 1.1 });
    playTone(bus, t + 0.22, { f0: 660, f1: 880, dur: 0.08, peak: 0.06 * a, attack: 0.002, tau: 0.03 });
  },
};

// ---------------------------------------------------------------------------
// Sound effect entry point
// ---------------------------------------------------------------------------

/** Fire-and-forget sound effect. Never throws, safe on the server. */
export function playSfx(name: SfxName, opts?: { intensity?: number }): void {
  try {
    if (typeof window === 'undefined') return; // SSR guard
    if (!ensureGraph()) return;
    if (!ctx || !sfxBus) return;
    if (currentSettings.muted) return; // master bus is at 0 — skip for perf
    const bus = sfxBus;
    const i = clamp01(opts?.intensity ?? DEFAULT_INTENSITY);
    const t = ctx.currentTime + 0.002; // stay strictly in the future
    const recipe = SFX_RECIPES[name];
    if (recipe) recipe(bus, t, i);
  } catch {
    /* sound must never break the game */
  }
}

// ---------------------------------------------------------------------------
// Generative background music — one style per sound pack
// ---------------------------------------------------------------------------

/** C-major pentatonic across three octaves: C3 … A5 (MIDI 48 … 81). */
const TOYS_SCALE: number[] = [];
{
  const degrees = [0, 2, 4, 7, 9];
  for (let oct = 0; oct < 3; oct++) {
    for (const d of degrees) TOYS_SCALE.push(48 + oct * 12 + d);
  }
}

/** F-major pentatonic ladder for the christmas carillon (warm, low start). */
const XMAS_SCALE: number[] = [];
{
  const degrees = [0, 2, 5, 7, 9]; // F G A C D
  for (let oct = 0; oct < 3; oct++) {
    for (const d of degrees) XMAS_SCALE.push(53 + oct * 12 + d);
  }
}

/** A-minor pentatonic (chip arp register) + a low bass anchor set. */
const ARCADE_SCALE: number[] = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
const ARCADE_BASS: number[] = [33, 33, 40, 45]; // A1, A1, E2, A2

/** Weighted random walk: mostly neighbouring scale steps, rare wider leaps. */
const MUSIC_WALK: readonly number[] = [-4, -3, -2, -2, -1, -1, -1, 0, 0, 1, 1, 1, 2, 2, 3, 4];

function nextWalkIndex(idx: number, len: number): number {
  const next = idx + pick(MUSIC_WALK);
  return Math.min(len - 1, Math.max(0, next));
}

// Per-engine state
let toysIdx = 7;
let xmasIdx = 4;
let xmasCount = 0;
let arcadeStep = 0;

/** toys — sparse pentatonic marimba walk (≈55-75 BPM heartbeat). */
function musicToys(t: number): void {
  if (!musicBus) return;
  toysIdx = nextWalkIndex(toysIdx, TOYS_SCALE.length);
  const roll = Math.random();
  if (roll < 0.24) return; // silence — the texture needs room to breathe
  const vel = rand(0.55, 0.95);
  const freq = mtof(TOYS_SCALE[toysIdx]!);
  const dur = rand(1.3, 2.0);
  playPluck(musicBus, t, freq, dur, 0.075 * vel, true);
  if (roll > 0.84 && toysIdx + 2 < TOYS_SCALE.length) {
    playPluck(musicBus, t + 0.014, mtof(TOYS_SCALE[toysIdx + 2]!), dur * 0.8, 0.045 * vel, true);
  }
}

/** christmas — dreamy bell carillon + a sprinkle of sleigh-bell shimmer. */
function musicChristmas(t: number): void {
  if (!musicBus) return;
  xmasIdx = nextWalkIndex(xmasIdx, XMAS_SCALE.length);
  xmasCount += 1;
  const roll = Math.random();
  if (roll < 0.3) {
    // a silent step may still carry the sleigh shimmer
    if (xmasCount % 4 === 0) {
      playNoise(musicBus, t, { dur: 0.09, peak: 0.012, attack: 0.004, tau: 0.03, filter: 'highpass', f0: 5600 });
    }
    return;
  }
  const vel = rand(0.5, 0.9);
  const freq = mtof(XMAS_SCALE[xmasIdx]!);
  playBell(musicBus, t, freq, rand(1.8, 2.6), 0.055 * vel, true);
  // occasional soft two-bell chord (a third/fourth above)
  if (roll > 0.82 && xmasIdx + 2 < XMAS_SCALE.length) {
    playBell(musicBus, t + 0.02, mtof(XMAS_SCALE[xmasIdx + 2]!), 1.6, 0.035 * vel, true);
  }
  if (xmasCount % 4 === 0) {
    playNoise(musicBus, t + 0.06, { dur: 0.09, peak: 0.014, attack: 0.004, tau: 0.03, filter: 'highpass', f0: 5600 });
  }
}

/** arcade — bouncy staccato chip arp with a triangle bass anchor. */
function musicArcade(t: number): void {
  if (!musicBus) return;
  arcadeStep += 1;
  // bass every 4th step
  if (arcadeStep % 4 === 0) {
    const bassIdx = Math.floor(arcadeStep / 4) % ARCADE_BASS.length;
    playTone(musicBus, t, { type: 'triangle', f0: mtof(ARCADE_BASS[bassIdx]!), dur: 0.34, peak: 0.11, attack: 0.004, tau: 0.09, lowpass: 900 });
  }
  const roll = Math.random();
  if (roll < 0.16) return; // breathing room
  let idx = nextWalkIndex(arcadeStep % ARCADE_SCALE.length, ARCADE_SCALE.length);
  // gentle pull toward the upper register (chip leads like it there)
  if (roll > 0.72) idx = Math.min(ARCADE_SCALE.length - 1, idx + 2);
  const vel = rand(0.6, 0.95);
  playChipNote(musicBus, t, mtof(ARCADE_SCALE[idx]!), 0.14, 0.05 * vel);
  if (roll > 0.9) {
    // quick 16th echo an octave up
    playChipNote(musicBus, t + 0.12, mtof(Math.min(96, ARCADE_SCALE[idx]! + 12)), 0.09, 0.03 * vel);
  }
}

const MUSIC_ENGINES: Record<SoundPackId, (t: number) => void> = {
  toys: musicToys,
  christmas: musicChristmas,
  arcade: musicArcade,
};

/** Note spacing pools per pack. */
const MUSIC_STEPS: Record<SoundPackId, readonly number[]> = {
  toys: [0.42, 0.42, 0.56, 0.56, 0.56, 0.84, 0.84, 0.84, 1.12],
  christmas: [0.5, 0.5, 0.62, 0.62, 0.75, 0.94, 1.12],
  arcade: [0.24, 0.24, 0.24, 0.3, 0.36, 0.48],
};

/** Lookahead scheduler tick — schedule everything ~0.35 s ahead. */
function musicTick(): void {
  try {
    if (!ctx || musicTimer === null) return;
    const now = ctx.currentTime;
    if (nextNoteTime < now + 0.05) nextNoteTime = now + 0.05; // recover from tab throttling
    const horizon = now + 0.35;
    const engine = MUSIC_ENGINES[currentPack];
    const steps = MUSIC_STEPS[currentPack];
    let guard = 0;
    while (nextNoteTime < horizon && guard++ < 16) {
      engine(nextNoteTime);
      nextNoteTime += pick(steps);
    }
  } catch {
    /* ignore */
  }
}

/** Start the generative loop. Idempotent — never double-starts. */
export function startMusic(): void {
  try {
    if (typeof window === 'undefined') return; // SSR guard
    if (musicTimer !== null) return; // already playing
    if (!ensureGraph()) return;
    if (!ctx || !musicDuck) return;
    const t = ctx.currentTime;
    setGain(musicDuck, 1, t, 0.1); // undo the stop-fade, gently
    nextNoteTime = t + 0.15;
    musicTimer = setInterval(() => musicTick(), 250);
    musicTick(); // prime the first notes immediately
  } catch {
    musicTimer = null;
  }
}

/** Stop the loop cleanly: kill the scheduler and briefly fade the music bus. */
export function stopMusic(): void {
  try {
    if (musicTimer !== null) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
    if (ctx && musicDuck) {
      setGain(musicDuck, 0, ctx.currentTime, 0.12);
    }
  } catch {
    /* ignore */
  }
}
