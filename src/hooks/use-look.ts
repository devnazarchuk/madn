'use client';

import { useMemo } from 'react';
import { resolveLook, type ResolvedLook } from '@/config/theme';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * The resolved Look of the game: every value set to 'auto' follows the
 * curated preset of the active seasonal theme (which itself defaults to the
 * real calendar season). Recomputed whenever any look choice changes.
 */
export function useLook(): ResolvedLook {
  const theme = useSettingsStore((s) => s.theme);
  const boardSkin = useSettingsStore((s) => s.boardSkin);
  const tileSkin = useSettingsStore((s) => s.tileSkin);
  const diceSkin = useSettingsStore((s) => s.diceSkin);
  const pawnSkin = useSettingsStore((s) => s.pawnSkin);
  const pawnAccessory = useSettingsStore((s) => s.pawnAccessory);
  const uiTheme = useSettingsStore((s) => s.uiTheme);

  return useMemo(
    () => resolveLook({ theme, boardSkin, tileSkin, diceSkin, pawnSkin, pawnAccessory, uiTheme }),
    [theme, boardSkin, tileSkin, diceSkin, pawnSkin, pawnAccessory, uiTheme],
  );
}
