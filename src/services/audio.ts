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
 *  BACKGROUND MUSIC — composed multi-layer arrangements (not random walks):
 *  each pack cycles a hand-written 8-bar tune (arcade: 4 bars) built from
 *  five scheduled layers — a soft chord pad, a bass line, a lead melody, a
 *  quiet counter-arp and light percussion — so the menu and matches carry a
 *  real, recognizable tune instead of scattered plinks.
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

/**
 * True once the app asked for background music (menu / match). Because of
 * the browser autoplay policy the tune can only actually begin after the
 * first user gesture — every later playSfx call re-checks this flag and
 * (re)starts the scheduler, so the music "follows" the player across the
 * menu, setup, rules and match screens without ever needing a mute dance.
 */
let musicDesired = false;

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
    // The gesture that plays this effect may have just unlocked the audio
    // context — if background music was requested, let it begin now.
    if (musicDesired && musicTimer === null && ctx.state === 'running') {
      startMusic();
    }
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
// Generative background music — COMPOSED MULTI-LAYER ARRANGEMENTS
// ---------------------------------------------------------------------------
// Each sound pack plays a hand-written 8-bar (arcade: 4-bar) loop arranged
// from five layers, all scheduled on one step grid with lookahead:
//
//   pad / chord bed — soft sustained voicing at every bar start
//   bass            — roots & fifths anchoring the progression
//   lead melody     — a composed phrase (per-bar note tables, 0 = rest)
//   counterline     — quiet arpeggio / sparkle voice filling the gaps
//   percussion      — shaker, sleigh shimmer or chip hats & thumps
//
// The loops cycle forever with a warm, breathing mix that sits well under
// the SFX — never a random walk, always the same recognizable tune.
// ---------------------------------------------------------------------------

interface Arrangement {
  bpm: number;
  /** Steps per bar: 8 = eighth-note grid, 16 = sixteenth-note grid. */
  stepsPerBar: number;
  /** Bars per loop. */
  bars: number;
  /** Chord voicing (MIDI) per bar — the pad layer + bass/arp source. */
  chords: number[][];
  /** Lead melody per bar: one MIDI note per step, 0 = rest. */
  melody: number[][];
}

/** TOYS — a gentle marimba lullaby in C: I–vi–IV–V, 88 BPM, 8 bars. */
const TOYS_ARR: Arrangement = {
  bpm: 88,
  stepsPerBar: 8,
  bars: 8,
  chords: [
    [48, 52, 55], // C
    [45, 48, 52], // Am
    [41, 45, 48], // F
    [43, 47, 50], // G
    [48, 52, 55], // C
    [45, 48, 52], // Am
    [41, 45, 48], // F
    [43, 47, 50], // G
  ],
  melody: [
    [67, 0, 72, 0, 76, 0, 72, 0],
    [69, 0, 72, 0, 76, 0, 0, 0],
    [77, 0, 81, 0, 84, 0, 81, 0],
    [79, 0, 74, 0, 79, 0, 0, 0],
    [76, 0, 72, 0, 67, 0, 64, 0],
    [72, 0, 69, 0, 64, 0, 0, 0],
    [84, 0, 81, 0, 77, 0, 0, 0],
    [79, 0, 74, 0, 71, 0, 67, 0],
  ],
};

/** CHRISTMAS — a dreamy bell carillon in F: I–V–vi–IV, 78 BPM, 8 bars. */
const XMAS_ARR: Arrangement = {
  bpm: 78,
  stepsPerBar: 8,
  bars: 8,
  chords: [
    [53, 57, 60], // F
    [55, 60, 64], // C
    [50, 53, 57], // Dm
    [58, 62, 65], // Bb
    [53, 57, 60], // F
    [55, 60, 64], // C
    [50, 53, 57], // Dm
    [58, 62, 65], // Bb
  ],
  melody: [
    [77, 0, 81, 0, 84, 0, 81, 77],
    [84, 0, 79, 0, 76, 0, 72, 0],
    [74, 0, 77, 0, 81, 0, 77, 74],
    [82, 0, 77, 0, 74, 0, 0, 0],
    [84, 0, 86, 0, 84, 0, 81, 0],
    [79, 0, 76, 0, 79, 0, 84, 0],
    [86, 0, 81, 0, 77, 0, 74, 0],
    [82, 0, 79, 0, 77, 0, 79, 0],
  ],
};

/** ARCADE — chip-funk in A minor: i–VI–III–VII, 116 BPM, 16th grid, 4 bars. */
const ARCADE_ARR: Arrangement = {
  bpm: 116,
  stepsPerBar: 16,
  bars: 4,
  chords: [
    [45, 52, 57], // Am
    [41, 48, 53], // F
    [48, 55, 60], // C
    [43, 50, 55], // G
  ],
  melody: [
    [76, 0, 79, 0, 81, 0, 84, 0, 81, 0, 79, 76, 0, 79, 0, 0],
    [77, 0, 81, 0, 84, 0, 81, 77, 0, 76, 0, 77, 0, 0, 0, 0],
    [76, 0, 72, 0, 76, 0, 79, 0, 84, 0, 79, 0, 76, 0, 79, 0],
    [74, 0, 79, 0, 83, 0, 86, 0, 83, 79, 74, 0, 79, 0, 0, 0],
  ],
};

const ARRANGEMENTS: Record<SoundPackId, Arrangement> = {
  toys: TOYS_ARR,
  christmas: XMAS_ARR,
  arcade: ARCADE_ARR,
};

// Per-engine scheduler state (one shared step counter; reset on start/pack switch)
let musicStep = 0;

/** Eighth-note bass figure: root … fifth … root (mirrors the pad voicing). */
function toysBass(chord: number[], pos: number, t: number): void {
  if (pos !== 0 && pos !== 4) return;
  const note = pos === 0 ? chord[0]! : chord[0]! + 7;
  playPluck(musicBus!, t, mtof(note), 1.1, 0.085, true);
}

/** toys step — pad, bass, melody, counter-arp, felt shaker. */
function musicToysStep(arr: Arrangement, step: number, t: number, stepDur: number): void {
  if (!musicBus) return;
  const bar = Math.floor(step / arr.stepsPerBar) % arr.bars;
  const pos = step % arr.stepsPerBar;
  const chord = arr.chords[bar]!;
  const barLen = stepDur * arr.stepsPerBar;

  // pad — soft sine triad at the bar start
  if (pos === 0) {
    for (const n of chord) {
      playTone(musicBus, t, { f0: mtof(n), dur: barLen * 1.02, peak: 0.02, attack: 0.3, tau: barLen / 2 });
    }
  }
  toysBass(chord, pos, t);

  // lead melody
  const note = arr.melody[bar]![pos]!;
  if (note > 0) {
    playPluck(musicBus, t, mtof(note), stepDur * 2.6, 0.06, true);
    // soft octave duet on long, high notes
    if (note >= 76) playPluck(musicBus, t + 0.02, mtof(note - 12), stepDur * 2.2, 0.02, true);
  }

  // counter-arp — chord tones an octave up on the off-beats
  if (pos % 2 === 1) {
    const tones = [chord[1]! + 12, chord[2]! + 12, chord[1]! + 24];
    const n = tones[(bar + pos) % tones.length]!;
    playPluck(musicBus, t, mtof(n), stepDur * 1.4, 0.016, true);
  }

  // felt shaker on the off-beats
  if (pos % 2 === 1) {
    playNoise(musicBus, t, { dur: 0.03, peak: 0.007, attack: 0.004, tau: 0.01, filter: 'highpass', f0: 6200 });
  }

  // a tiny ascending sparkle at the end of bars 4 & 8
  if (pos === 6 && (bar === 3 || bar === 7)) {
    playPluck(musicBus, t, mtof(chord[2]! + 12), 0.5, 0.03, true);
    playPluck(musicBus, t + stepDur, mtof(chord[2]! + 19), 0.5, 0.028, true);
  }
}

/** christmas step — bell pad, bass bells, carillon melody, sleigh shimmer. */
function musicChristmasStep(arr: Arrangement, step: number, t: number, stepDur: number): void {
  if (!musicBus) return;
  const bar = Math.floor(step / arr.stepsPerBar) % arr.bars;
  const pos = step % arr.stepsPerBar;
  const chord = arr.chords[bar]!;
  const barLen = stepDur * arr.stepsPerBar;

  // bell pad — a gentle triad strike every bar
  if (pos === 0) {
    for (let i = 0; i < chord.length; i++) {
      playBell(musicBus, t + i * 0.012, mtof(chord[i]!), barLen * 0.9, 0.018, true);
    }
  }
  // bass bells
  if (pos === 0 || pos === 4) {
    playBell(musicBus, t, mtof(chord[0]! - 12), 1.4, 0.05, true);
  }

  // carillon melody
  const note = arr.melody[bar]![pos]!;
  if (note > 0) {
    playBell(musicBus, t, mtof(note), stepDur * 2.4, 0.05, true);
    if (pos % 4 === 0) playBell(musicBus, t + 0.015, mtof(note + 12), stepDur * 1.6, 0.016, true);
  }

  // sleigh-bell shimmer — a soft jingle every second step
  if (pos % 2 === 0) {
    playNoise(musicBus, t, { dur: 0.05, peak: 0.009, attack: 0.004, tau: 0.02, filter: 'highpass', f0: 6800 });
  }
}

/** arcade step — chip bass, lead, 8th-note arp, hats & thump. */
function musicArcadeStep(arr: Arrangement, step: number, t: number, stepDur: number): void {
  if (!musicBus) return;
  const bar = Math.floor(step / arr.stepsPerBar) % arr.bars;
  const pos = step % arr.stepsPerBar;
  const chord = arr.chords[bar]!;
  const root = chord[0]!;

  // bass: driving 8th-note pulses (root / octave), fifth push at the bar end
  if (pos % 2 === 0) {
    const k = pos / 2;
    const note = k === 6 ? root + 7 : k % 2 === 1 ? root + 12 : root;
    playTone(musicBus, t, { type: 'triangle', f0: mtof(note), dur: stepDur * 1.6, peak: 0.085, attack: 0.004, tau: 0.06, lowpass: 900 });
  }

  // lead melody
  const note = arr.melody[bar]![pos]!;
  if (note > 0) {
    playChipNote(musicBus, t, mtof(note), stepDur * 2.2, 0.048);
    if (pos % 8 === 0) playChipNote(musicBus, t + stepDur * 0.5, mtof(note + 12), stepDur, 0.02, true);
  }

  // quiet 8th-note arp (chord tones an octave up)
  if (pos % 2 === 0) {
    const tones = [chord[0]! + 12, chord[1]! + 12, chord[2]! + 12, chord[1]! + 12];
    playChipNote(musicBus, t, mtof(tones[(pos / 2) % tones.length]!), stepDur * 1.1, 0.013, true);
  }

  // hats on the off-16ths + a soft kick thump on beats 1 & 3
  if (pos % 2 === 1) {
    playNoise(musicBus, t, { dur: 0.02, peak: 0.007, attack: 0.001, tau: 0.006, filter: 'highpass', f0: 7000 });
  }
  if (pos === 0 || pos === 8) {
    playTone(musicBus, t, { f0: 110, f1: 55, dur: 0.1, peak: 0.1, attack: 0.002, tau: 0.03 });
  }
}

const STEP_ENGINES: Record<SoundPackId, (arr: Arrangement, step: number, t: number, stepDur: number) => void> = {
  toys: musicToysStep,
  christmas: musicChristmasStep,
  arcade: musicArcadeStep,
};

/** Lookahead scheduler tick — schedule everything ~0.55 s ahead. */
function musicTick(): void {
  try {
    if (!ctx || musicTimer === null) return;
    const now = ctx.currentTime;
    if (nextNoteTime < now + 0.05) nextNoteTime = now + 0.05; // recover from tab throttling
    const horizon = now + 0.55;
    const arr = ARRANGEMENTS[currentPack];
    const stepDur = 60 / arr.bpm / (arr.stepsPerBar / 4);
    const engine = STEP_ENGINES[currentPack];
    let guard = 0;
    while (nextNoteTime < horizon && guard++ < 48) {
      engine(arr, musicStep, nextNoteTime, stepDur);
      musicStep += 1;
      nextNoteTime += stepDur;
    }
  } catch {
    /* ignore */
  }
}

/** Start the generative loop. Idempotent — never double-starts. */
export function startMusic(): void {
  try {
    if (typeof window === 'undefined') return; // SSR guard
    musicDesired = true; // every gesture from now on may (re)start it
    if (musicTimer !== null) return; // already playing
    if (!ensureGraph()) return;
    if (!ctx || !musicDuck) return;
    const t = ctx.currentTime;
    setGain(musicDuck, 1, t, 0.1); // undo the stop-fade, gently
    musicStep = 0; // always begin at the top of the tune
    nextNoteTime = t + 0.15;
    musicTimer = setInterval(() => musicTick(), 200);
    musicTick(); // prime the first notes immediately
  } catch {
    musicTimer = null;
  }
}

/**
 * Mark the background music as wanted and start it if the audio context is
 * already unlocked by a gesture. Called from the menu/setup/rules flows —
 * the first user interaction (any click with its UI sound) unlocks the
 * context, after which the tune keeps playing across every screen.
 */
export function ensureMusicFollowing(): void {
  try {
    musicDesired = true;
    if (typeof window === 'undefined') return;
    if (ctx && ctx.state === 'running' && musicTimer === null) {
      startMusic();
    }
  } catch {
    /* never throw */
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
