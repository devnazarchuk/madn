'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Dices, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RULES_VERSION } from '@/config/gameConfig';
import { COLORS } from '@/config/theme';
import type { PlayerColorId } from '@/engine/types';
import { useGameStore } from '@/store/gameStore';
import { playSfx } from '@/services/audio';
import { HistoryDialog, RulesDialog } from './Dialogs';

const LETTER_COLORS: Array<{ ch: string; color: string }> = [
  { ch: 'H', color: COLORS.red },
  { ch: 'o', color: COLORS.green },
  { ch: 'p', color: COLORS.yellow },
  { ch: '!', color: COLORS.red },
];

/** Hero card floating over the slowly rotating 3D board. */
export function MenuScreen() {
  const goScreen = useGameStore((s) => s.goScreen);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-auto w-full max-w-md"
      >
        <Card className="rounded-[2rem] border-[#5B3A24]/20 bg-[#FBF3E0]/95 shadow-2xl shadow-black/50 backdrop-blur-md">
          <CardHeader className="items-center pb-2 text-center">
            {/* colorful logo mark */}
            <div className="mb-1 flex items-center gap-2" aria-hidden>
              {(['red', 'green', 'yellow', 'blue'] as PlayerColorId[]).map((c) => (
                <span
                  key={c}
                  className="size-4 rounded-full ring-2 ring-white/70"
                  style={{ backgroundColor: COLORS[c] }}
                />
              ))}
            </div>
            <CardTitle className="font-[family-name:var(--font-baloo)] text-5xl font-extrabold tracking-tight text-[#3E2A18]">
              Color{' '}
              <span className="inline-flex">
                {LETTER_COLORS.map((l) => (
                  <span key={l.ch} style={{ color: l.color }}>
                    {l.ch}
                  </span>
                ))}
              </span>
            </CardTitle>
            <CardDescription className="text-base text-[#8A6B4F]">
              The wooden color-dice race for 2–4 players
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-sm leading-relaxed text-[#6B4E35]">
              Roll the color die, hop from field to field, bump your rivals back
              home and guide all three pawns to safety first.
            </p>
            <Button
              onClick={() => {
                playSfx('modal');
                goScreen('setup');
              }}
              className="h-14 w-full rounded-2xl bg-[#E8503A] text-lg font-bold text-white shadow-lg shadow-[#E8503A]/30 hover:bg-[#C23A28]"
            >
              <Dices size={22} /> New game
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-11 rounded-2xl border-[#5B3A24]/25 bg-white/50 text-[#3E2A18] hover:bg-white/80"
                onClick={() => {
                  playSfx('modal');
                  setRulesOpen(true);
                }}
              >
                <BookOpen size={17} /> How to play
              </Button>
              <Button
                variant="outline"
                className="h-11 rounded-2xl border-[#5B3A24]/25 bg-white/50 text-[#3E2A18] hover:bg-white/80"
                onClick={() => {
                  playSfx('modal');
                  setHistoryOpen(true);
                }}
              >
                <Trophy size={17} /> History
              </Button>
            </div>
            <p className="text-center text-[11px] uppercase tracking-[0.18em] text-[#B08A5E]">
              ruleset {RULES_VERSION} · family edition
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <HistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
