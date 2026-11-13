'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Dices,
  Info,
  PlayCircle,
  Settings,
  Sliders,
  Trash2,
  Trophy,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { COLORS } from '@/config/theme';
import type { PlayerColorId } from '@/engine/types';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { clearAutosave } from '@/engine/persistence';
import { playSfx } from '@/services/audio';
import { AboutDialog, HistoryDialog } from './Dialogs';
import { HowToPlayDialog, TutorialIntroDialog, TutorialOverlay, type TutorialMode } from './HowToPlay';
import { AnimalIcon, hoverSfx } from './shared';
import { SettingsDialog } from './SettingsPanel';

/** Colorful KIDS lettering under the title. */
const KIDS_LETTERS: Array<{ ch: string; color: string }> = [
  { ch: 'K', color: COLORS.red },
  { ch: 'I', color: COLORS.green },
  { ch: 'D', color: COLORS.yellow },
  { ch: 'S', color: COLORS.blue },
];

/** Hero card floating over the slowly rotating 3D board. */
export function MenuScreen() {
  const goScreen = useGameStore((s) => s.goScreen);
  const goRules = useGameStore((s) => s.goRules);
  const continueGame = useGameStore((s) => s.continueGame);
  const refreshAutosave = useGameStore((s) => s.refreshAutosave);
  const autosave = useGameStore((s) => s.autosave);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // How-to-play flow: first visit offers the interactive tutorial, later
  // visits open the visual manual directly ("Don't show again" persists).
  const [howOpen, setHowOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialMode, setTutorialMode] = useState<TutorialMode>('short');
  const [introOpen, setIntroOpen] = useState(false);
  const tutorialIntroSeen = useSettingsStore((s) => s.tutorialIntroSeen);
  const setTutorialIntroSeen = useSettingsStore((s) => s.setTutorialIntroSeen);

  useEffect(() => {
    refreshAutosave();
  }, [refreshAutosave]);

  const savedTurn = autosave?.game.turn ?? 0;
  const savedPlayers = autosave?.game.players ?? [];

  return (
    <div className="pointer-events-none absolute inset-0 flex justify-center overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-auto my-auto w-full max-w-md"
      >
        <Card className="rounded-[2rem] border-[#5B3A24]/20 bg-[#FBF3E0]/95 shadow-2xl shadow-black/50 backdrop-blur-md">
          <CardHeader className="items-center pb-2 text-center">
            {/* the four animal friends */}
            <div className="mb-1 flex items-center gap-3" aria-hidden>
              {(['red', 'blue', 'green', 'yellow'] as PlayerColorId[]).map((c) => (
                <span
                  key={c}
                  className="flex size-9 items-center justify-center rounded-2xl text-white shadow-md"
                  style={{ backgroundColor: COLORS[c] }}
                >
                  <AnimalIcon color={c} size={20} />
                </span>
              ))}
            </div>
            <CardTitle className="font-[family-name:var(--font-baloo)] text-3xl font-extrabold leading-tight tracking-tight text-[#3E2A18] sm:text-4xl">
              Mensch ärgere
              <br />
              Dich nicht{' '}
              <span className="inline-flex translate-y-1">
                {KIDS_LETTERS.map((l) => (
                  <span key={l.ch} style={{ color: l.color }}>
                    {l.ch}
                  </span>
                ))}
              </span>
            </CardTitle>
            <CardDescription className="text-base text-[#8A6B4F]">
              The colorful race for 2–4 players, ages 4 and up
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* continue saved match */}
            {autosave && (
              <div className="rounded-2xl border border-[#43B57E]/40 bg-[#DFF2E8] p-3">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[#2E8F63]">
                  <Undo2 size={15} /> Unfinished match — turn {savedTurn}
                </p>
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {savedPlayers.map((p) => (
                    <span
                      key={p.id}
                      className="flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold text-[#3E2A18]"
                    >
                      <span className="text-[#5B3A24]">
                        <AnimalIcon color={p.color} size={12} />
                      </span>
                      {p.name}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    onMouseEnter={hoverSfx}
                    onClick={() => {
                      playSfx('star');
                      continueGame();
                    }}
                    className="h-11 flex-1 rounded-xl bg-[#43B57E] font-bold text-white hover:bg-[#2E8F63]"
                  >
                    <PlayCircle size={17} /> Continue playing
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Discard saved match"
                    title="Discard saved match"
                    className="size-11 rounded-xl border-[#5B3A24]/25 bg-white/60 text-[#C23A28] hover:bg-[#FBE3DE]"
                    onClick={() => {
                      clearAutosave();
                      refreshAutosave();
                      playSfx('uiClick');
                    }}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            )}

            <Button
              onMouseEnter={hoverSfx}
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
                onMouseEnter={hoverSfx}
                className="h-11 rounded-2xl border-[#5B3A24]/25 bg-white/50 text-[#3E2A18] hover:bg-white/80"
                onClick={() => {
                  playSfx('modal');
                  if (tutorialIntroSeen) {
                    setHowOpen(true);
                  } else {
                    setIntroOpen(true);
                  }
                }}
              >
                <BookOpen size={17} /> How to play
              </Button>
              <Button
                variant="outline"
                onMouseEnter={hoverSfx}
                className="h-11 rounded-2xl border-[#5B3A24]/25 bg-white/50 text-[#3E2A18] hover:bg-white/80"
                onClick={() => {
                  playSfx('modal');
                  goRules('menu');
                }}
              >
                <Sliders size={17} /> Custom rules
              </Button>
              <Button
                variant="outline"
                onMouseEnter={hoverSfx}
                className="h-11 rounded-2xl border-[#5B3A24]/25 bg-white/50 text-[#3E2A18] hover:bg-white/80"
                onClick={() => {
                  playSfx('modal');
                  setSettingsOpen(true);
                }}
              >
                <Settings size={17} /> Settings
              </Button>
              <Button
                variant="outline"
                onMouseEnter={hoverSfx}
                className="h-11 rounded-2xl border-[#5B3A24]/25 bg-white/50 text-[#3E2A18] hover:bg-white/80"
                onClick={() => {
                  playSfx('modal');
                  setAboutOpen(true);
                }}
              >
                <Info size={17} /> About
              </Button>
            </div>

            <Button
              variant="outline"
              onMouseEnter={hoverSfx}
              className="h-11 w-full rounded-2xl border-[#5B3A24]/25 bg-white/50 text-[#3E2A18] hover:bg-white/80"
              onClick={() => {
                playSfx('modal');
                setHistoryOpen(true);
              }}
            >
              <Trophy size={17} /> Match history
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      <HistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <TutorialIntroDialog
        open={introOpen}
        onClose={() => setIntroOpen(false)}
        onStart={() => {
          setTutorialIntroSeen(true);
          setIntroOpen(false);
          setTutorialMode('short');
          setTutorialOpen(true);
        }}
        onManual={() => {
          setIntroOpen(false);
          setHowOpen(true);
        }}
        onDontShow={() => {
          setTutorialIntroSeen(true);
          setIntroOpen(false);
          setHowOpen(true);
        }}
      />
      <HowToPlayDialog
        open={howOpen}
        onClose={() => setHowOpen(false)}
        onTutorial={(mode) => {
          setHowOpen(false);
          setTutorialMode(mode);
          setTutorialOpen(true);
        }}
      />
      <TutorialOverlay
        open={tutorialOpen}
        mode={tutorialMode}
        onClose={() => setTutorialOpen(false)}
      />
    </div>
  );
}
