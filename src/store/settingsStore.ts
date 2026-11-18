'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AccessoryChoice,
  BoardSkinId,
  DiceSkinId,
  PawnSkinId,
  ThemeId,
  TileSkinId,
} from '@/config/theme';

export type QualityLevel = 'high' | 'medium' | 'low';

/** The two portrait board framings a phone can flip between. */
export type MobileViewId = 'diagonal' | 'topdown';

/** The three synthesized audio styles (SFX timbre + background music). */
export type SoundPackId = 'toys' | 'christmas' | 'arcade';

export interface AudioSettings {
  master: number;
  sfx: number;
  music: number;
  muted: boolean;
}

interface SettingsState {
  audio: AudioSettings;
  reducedMotion: boolean;
  quality: QualityLevel;
  autoSingleMove: boolean;
  /** Auto-Roll Dice — the die rolls itself at the start of a human turn
   * (OFF by default; toggled in the rules screen and the pause menu). */
  autoRoll: boolean;
  /** Portrait board view: angled diamond (default) or straight top-down.
   * Only applied while the viewport is taller than wide; landscape and
   * desktop always keep the classic three-quarter camera. */
  mobileView: MobileViewId;
  /** Which synthesized sound pack (SFX voices + music style) is active. */
  soundPack: SoundPackId;
  /** Play-by-play roll narration ("Frida Frog rolled Blue — no pawn can use
   *  it. Turn skipped.") — OFF by default so the HUD stays calm; toggle
   *  lives in the pause menu settings. */
  announcer: boolean;
  /** The "Would you like to take an interactive tutorial?" intro was shown
   * (and dismissed for good) — it never pops up on future visits. */
  tutorialIntroSeen: boolean;
  // --- appearance ---
  theme: ThemeId;
  boardSkin: BoardSkinId;
  /** Visual style of the track/finish platforms the pawns hop across. */
  tileSkin: TileSkinId;
  /** Visual style of the 3D color die. */
  diceSkin: DiceSkinId;
  pawnSkin: PawnSkinId;
  pawnAccessory: AccessoryChoice;
  // --- graphics effect toggles (overridable; presets reset them) ---
  shadows: boolean;
  weather: boolean;
  scenery: boolean;
  sharpTextures: boolean;
  antialias: boolean;
  // --- actions ---
  setAudio: (patch: Partial<AudioSettings>) => void;
  toggleMuted: () => void;
  setReducedMotion: (v: boolean) => void;
  setQuality: (q: QualityLevel) => void;
  setAutoSingleMove: (v: boolean) => void;
  setAutoRoll: (v: boolean) => void;
  setMobileView: (v: MobileViewId) => void;
  setSoundPack: (p: SoundPackId) => void;
  setAnnouncer: (v: boolean) => void;
  setTutorialIntroSeen: (v: boolean) => void;
  setTheme: (t: ThemeId) => void;
  setBoardSkin: (s: BoardSkinId) => void;
  setTileSkin: (s: TileSkinId) => void;
  setDiceSkin: (s: DiceSkinId) => void;
  setPawnSkin: (s: PawnSkinId) => void;
  setPawnAccessory: (a: AccessoryChoice) => void;
  setShadows: (v: boolean) => void;
  setWeather: (v: boolean) => void;
  setScenery: (v: boolean) => void;
  setSharpTextures: (v: boolean) => void;
  setAntialias: (v: boolean) => void;
}

/** Effect-toggle presets applied when the quality level is switched. */
const EFFECT_PRESET: Record<QualityLevel, Pick<SettingsState, 'shadows' | 'weather' | 'scenery' | 'sharpTextures' | 'antialias'>> = {
  high: { shadows: true, weather: true, scenery: true, sharpTextures: true, antialias: true },
  medium: { shadows: true, weather: true, scenery: true, sharpTextures: false, antialias: true },
  low: { shadows: false, weather: false, scenery: false, sharpTextures: false, antialias: false },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      audio: { master: 0.8, sfx: 0.9, music: 0.5, muted: false },
      reducedMotion: false,
      quality: 'high',
      autoSingleMove: true,
      autoRoll: false,
      mobileView: 'diagonal',
      soundPack: 'toys',
      announcer: false,
      tutorialIntroSeen: false,
      theme: 'classic',
      boardSkin: 'walnut',
      tileSkin: 'classic',
      diceSkin: 'classic',
      pawnSkin: 'classic',
      pawnAccessory: 'auto',
      shadows: true,
      weather: true,
      scenery: true,
      sharpTextures: true,
      antialias: true,
      setAudio: (patch) =>
        set((s) => ({ audio: { ...s.audio, ...patch } })),
      toggleMuted: () =>
        set((s) => ({ audio: { ...s.audio, muted: !s.audio.muted } })),
      setReducedMotion: (v) => set({ reducedMotion: v }),
      setQuality: (q) => set({ quality: q, ...EFFECT_PRESET[q] }),
      setAutoSingleMove: (v) => set({ autoSingleMove: v }),
      setAutoRoll: (v) => set({ autoRoll: v }),
      setMobileView: (v) => set({ mobileView: v }),
      setSoundPack: (p) => set({ soundPack: p }),
      setAnnouncer: (v) => set({ announcer: v }),
      setTutorialIntroSeen: (v) => set({ tutorialIntroSeen: v }),
      setTheme: (t) => set({ theme: t }),
      setBoardSkin: (s) => set({ boardSkin: s }),
      setTileSkin: (s) => set({ tileSkin: s }),
      setDiceSkin: (s) => set({ diceSkin: s }),
      setPawnSkin: (s) => set({ pawnSkin: s }),
      setPawnAccessory: (a) => set({ pawnAccessory: a }),
      setShadows: (v) => set({ shadows: v }),
      setWeather: (v) => set({ weather: v }),
      setScenery: (v) => set({ scenery: v }),
      setSharpTextures: (v) => set({ sharpTextures: v }),
      setAntialias: (v) => set({ antialias: v }),
    }),
    {
      name: 'colorhop-settings-v1',
      version: 1,
      // v0 allowed the removed 'scarf' accessory — map it to 'none'.
      migrate: (state) => {
        if (state && (state as Partial<SettingsState>).pawnAccessory === ('scarf' as AccessoryChoice)) {
          (state as Partial<SettingsState>).pawnAccessory = 'none';
        }
        return state as SettingsState;
      },
    },
  ),
);
