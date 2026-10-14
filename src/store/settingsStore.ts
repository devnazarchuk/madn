'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AccessoryChoice,
  BoardSkinId,
  PawnSkinId,
  ThemeId,
} from '@/config/theme';

export type QualityLevel = 'high' | 'medium' | 'low';

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
  showMoveHints: boolean;
  autoSingleMove: boolean;
  // --- appearance ---
  theme: ThemeId;
  boardSkin: BoardSkinId;
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
  setShowMoveHints: (v: boolean) => void;
  setAutoSingleMove: (v: boolean) => void;
  setTheme: (t: ThemeId) => void;
  setBoardSkin: (s: BoardSkinId) => void;
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
      showMoveHints: true,
      autoSingleMove: true,
      theme: 'classic',
      boardSkin: 'walnut',
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
      setShowMoveHints: (v) => set({ showMoveHints: v }),
      setAutoSingleMove: (v) => set({ autoSingleMove: v }),
      setTheme: (t) => set({ theme: t }),
      setBoardSkin: (s) => set({ boardSkin: s }),
      setPawnSkin: (s) => set({ pawnSkin: s }),
      setPawnAccessory: (a) => set({ pawnAccessory: a }),
      setShadows: (v) => set({ shadows: v }),
      setWeather: (v) => set({ weather: v }),
      setScenery: (v) => set({ scenery: v }),
      setSharpTextures: (v) => set({ sharpTextures: v }),
      setAntialias: (v) => set({ antialias: v }),
    }),
    { name: 'colorhop-settings-v1' },
  ),
);
