'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  setAudio: (patch: Partial<AudioSettings>) => void;
  toggleMuted: () => void;
  setReducedMotion: (v: boolean) => void;
  setQuality: (q: QualityLevel) => void;
  setShowMoveHints: (v: boolean) => void;
  setAutoSingleMove: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      audio: { master: 0.8, sfx: 0.9, music: 0.5, muted: false },
      reducedMotion: false,
      quality: 'high',
      showMoveHints: true,
      autoSingleMove: true,
      setAudio: (patch) =>
        set((s) => ({ audio: { ...s.audio, ...patch } })),
      toggleMuted: () =>
        set((s) => ({ audio: { ...s.audio, muted: !s.audio.muted } })),
      setReducedMotion: (v) => set({ reducedMotion: v }),
      setQuality: (q) => set({ quality: q }),
      setShowMoveHints: (v) => set({ showMoveHints: v }),
      setAutoSingleMove: (v) => set({ autoSingleMove: v }),
    }),
    { name: 'colorhop-settings-v1' },
  ),
);
