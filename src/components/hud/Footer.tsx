'use client';

import { Dices } from 'lucide-react';
import { RULES_VERSION } from '@/config/gameConfig';

/** Slim sticky footer at the very bottom of every screen. */
export function Footer() {
  return (
    <footer className="mt-auto border-t border-[#3A2A1B] bg-[#1B140D] text-[#B99B72]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-xs">
        <span className="flex items-center gap-1.5">
          <Dices size={13} aria-hidden />
          Color Hop! Kids — the wooden color-dice race
        </span>
        <span className="opacity-75">
          ruleset {RULES_VERSION} · 2–4 players · 3 pawns each
        </span>
      </div>
    </footer>
  );
}
