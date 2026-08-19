'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Bot, Crown, Dices, Focus, Pause, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { playSfx } from '@/services/audio';
import { COLORS, COLORS_DEEP } from '@/config/theme';
import { CHARACTERS } from '@/engine/game';
import { pawnCounts } from '@/engine/rules';
import type { DiceFaceId, PlayerColorId } from '@/engine/types';
import { AnimalIcon, CHAR_ICON, ColorDot, PawnDots } from './shared';
import { HudIconButton } from './SettingsPanel';
import { RulesDialog } from './Dialogs';

interface StatusInfo {
  text: string;
  tone: 'info' | 'action' | 'wait' | 'success' | 'alert';
}

/** Stable empty fallback (never return a fresh array from a zustand selector). */
const EMPTY_PLAYERS: never[] = [];

const TONE_STYLES: Record<StatusInfo['tone'], string> = {
  action: 'bg-[#E8503A] text-white',
  wait: 'bg-[#241B14]/80 text-[#F6EBD9]',
  info: 'bg-[#5B3A24]/90 text-[#F6EBD9]',
  success: 'bg-[#43B57E] text-white',
  alert: 'bg-[#F2C14E] text-[#3E2A18]',
};

const PRESET_LABEL: Record<string, string> = {
  classic: 'Classic rules',
  quick: 'Quick game',
  family: 'Family mode',
  custom: 'Custom rules',
};

function faceLabel(face: DiceFaceId): string {
  return face.charAt(0).toUpperCase() + face.slice(1);
}

function PlayerChip({
  color,
  name,
  kind,
  active,
  isWinner,
  totalPawns,
}: {
  color: PlayerColorId;
  name: string;
  kind: 'human' | 'ai';
  active: boolean;
  isWinner: boolean;
  totalPawns: number;
}) {
  const game = useGameStore((s) => s.game);
  const player = game?.players.find((p) => p.color === color);
  const counts = player
    ? pawnCounts(player)
    : { base: totalPawns, track: 0, home: 0 };

  return (
    <div
      className={`flex items-center gap-2 rounded-xl bg-white/90 px-3 py-1.5 backdrop-blur-md transition-all ${
        active ? 'scale-105 shadow-lg' : 'opacity-75 shadow-sm'
      }`}
      style={active ? { boxShadow: `0 0 0 2.5px ${COLORS[color]}, 0 6px 18px rgba(0,0,0,0.28)` } : undefined}
    >
      <span
        className="flex size-7 items-center justify-center rounded-lg text-white"
        style={{ backgroundColor: COLORS[color] }}
      >
        {isWinner ? <Crown size={14} /> : <AnimalIcon color={color} size={15} />}
      </span>
      <span className="max-w-28 truncate text-xs font-semibold text-[#3E2A18]">{name}</span>
      <PawnDots color={color} home={counts.home} track={counts.track} total={totalPawns} />
      {kind === 'ai' && <Bot size={12} className="text-[#8A6B4F]" />}
    </div>
  );
}

/** Transient feedback notice (invalid moves, extra rolls, etc.). */
function NoticeToast() {
  const notice = useGameStore((s) => s.notice);
  const [dismissedToken, setDismissedToken] = useState(0);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setDismissedToken(notice.token), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  const visible = !!notice && notice.token !== dismissedToken;

  return (
    <AnimatePresence>
      {notice && visible && (
        <motion.div
          key={notice.token}
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.95 }}
          role="status"
          aria-live="polite"
          className={`pointer-events-none mx-auto max-w-[80%] rounded-2xl px-4 py-2 text-center text-sm font-semibold shadow-lg backdrop-blur-md ${
            notice.tone === 'success'
              ? 'bg-[#43B57E] text-white'
              : notice.tone === 'alert'
                ? 'bg-[#F2C14E] text-[#3E2A18]'
                : 'bg-[#5B3A24]/95 text-[#F6EBD9]'
          }`}
        >
          {notice.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** HUD overlay: status, player chips, dice face, roll button, stats. */
export function GameHud() {
  const rollDice = useGameStore((s) => s.rollDice);
  const togglePause = useGameStore((s) => s.togglePause);
  const resetCamera = useGameStore((s) => s.resetCamera);
  const skipTurn = useGameStore((s) => s.skipTurn);
  const tapPawn = useGameStore((s) => s.tapPawn);
  const phase = useGameStore((s) => s.game?.phase ?? null);
  const diceFace = useGameStore((s) => s.game?.diceFace ?? null);
  const extraRoll = useGameStore((s) => s.game?.extraRoll ?? null);
  const preset = useGameStore((s) => s.game?.rulesConfig.preset ?? 'classic');
  const maySkipMove = useGameStore((s) => s.game?.rulesConfig.maySkipMove ?? false);
  const totalPawns = useGameStore((s) => s.game?.rulesConfig.pawnsPerPlayer ?? 3);
  const diceRolling = useGameStore((s) => s.diceRolling);
  const winner = useGameStore((s) => s.winner);
  const paused = useGameStore((s) => s.paused);
  const legalMoves = useGameStore((s) => s.legalMoves);
  const activeName = useGameStore((s) => s.game?.players[s.game.activeIndex]?.name ?? '');
  const activeKind = useGameStore((s) => s.game?.players[s.game.activeIndex]?.kind ?? 'ai');
  const activeColor = useGameStore((s) => s.game?.players[s.game.activeIndex]?.color ?? null);
  const activePlayer = useGameStore((s) => s.game?.players[s.game.activeIndex] ?? null);
  const players = useGameStore((s) => s.game?.players) ?? EMPTY_PLAYERS;
  const turn = useGameStore((s) => s.game?.turn ?? 0);
  const totalMoves = useGameStore((s) => s.totalMoves);
  const captures = useGameStore((s) => s.game?.captures ?? 0);
  const introPlaying = useGameStore((s) => s.introPlaying);
  const muted = useSettingsStore((s) => s.audio.muted);
  const toggleMuted = useSettingsStore((s) => s.toggleMuted);
  const [rulesOpen, setRulesOpen] = useState(false);

  const humanAwaitRoll =
    phase === 'await-roll' && activeKind === 'human' && !diceRolling && !paused && !winner;
  const humanChoosing = phase === 'choose-pawn' && activeKind === 'human' && !paused && !winner;

  const status: StatusInfo = (() => {
    if (winner) {
      const w = players.find((p) => p.color === winner);
      return { text: `${w?.name ?? 'Player'} wins the game!`, tone: 'success' };
    }
    switch (phase) {
      case 'await-roll':
        if (extraRoll) {
          return activeKind === 'ai'
            ? { text: `${activeName} rolls again!`, tone: 'wait' }
            : { text: `Extra roll — tap the die again!`, tone: 'action' };
        }
        return activeKind === 'ai'
          ? { text: `${activeName} is about to roll…`, tone: 'wait' }
          : { text: `${activeName} — tap the die to roll!`, tone: 'action' };
      case 'rolling':
        return { text: 'Rolling the die…', tone: 'wait' };
      case 'no-moves':
        return {
          text: `${activeName} rolled ${faceLabel(diceFace ?? 'red')} — no pawn can use it.`,
          tone: 'alert',
        };
      case 'choose-pawn':
        return activeKind === 'ai'
          ? { text: `${activeName} rolled ${faceLabel(diceFace ?? 'red')} and is thinking…`, tone: 'wait' }
          : { text: `Rolled ${faceLabel(diceFace ?? 'red')} — tap a glowing animal!`, tone: 'action' };
      case 'animating':
        return { text: 'Hop hop hop…', tone: 'wait' };
      case 'turn-end':
        return { text: "Next player's turn…", tone: 'info' };
      case 'game-over':
        return { text: 'Game over', tone: 'success' };
      default:
        return { text: introPlaying ? 'Setting up the board…' : '', tone: 'wait' };
    }
  })();

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      {/* ---- top bar ---------------------------------------------------- */}
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto flex gap-2">
          <HudIconButton label="Pause" onClick={() => togglePause()}>
            <Pause size={18} />
          </HudIconButton>
          <HudIconButton
            label={muted ? 'Unmute' : 'Mute'}
            onClick={() => {
              toggleMuted();
              playSfx('uiClick', { intensity: muted ? 0.9 : 0.4 });
            }}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </HudIconButton>
          <HudIconButton label="Reset camera view" onClick={() => resetCamera()}>
            <Focus size={18} />
          </HudIconButton>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={status.text}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            role="status"
            aria-live="polite"
            className={`pointer-events-none max-w-[58%] rounded-2xl px-4 py-2 text-center text-sm font-semibold shadow-lg backdrop-blur-md ${TONE_STYLES[status.tone]}`}
          >
            {status.text}
          </motion.div>
        </AnimatePresence>

        <div className="pointer-events-auto">
          <HudIconButton
            label={`Rules reference (${PRESET_LABEL[preset] ?? 'Rules'})`}
            onClick={() => {
              playSfx('modal');
              setRulesOpen(true);
            }}
          >
            <BookOpen size={18} />
          </HudIconButton>
        </div>
      </div>

      {/* ---- player chips ------------------------------------------------ */}
      <div className="pointer-events-auto flex gap-2 overflow-x-auto px-3 pb-1 no-scrollbar">
        {players.map((p) => (
          <PlayerChip
            key={p.id}
            color={p.color}
            name={p.name}
            kind={p.kind}
            active={p.color === activeColor && !winner}
            isWinner={winner === p.color}
            totalPawns={totalPawns}
          />
        ))}
      </div>

      {/* ---- notice toast (mid-screen, non-blocking) ---------------------- */}
      <div className="relative flex-1">
        <div className="sticky top-4 z-10">
          <NoticeToast />
        </div>
      </div>

      {/* ---- bottom bar (sticky footer of the game) ---------------------- */}
      <div className="mt-auto p-3">
        <div className="pointer-events-auto mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl bg-[#241B14]/75 px-4 py-2.5 text-[#F6EBD9] shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-3 text-xs font-medium text-[#D9C3A0]">
            <button
              type="button"
              onClick={() => {
                playSfx('modal');
                setRulesOpen(true);
              }}
              className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#F6EBD9] transition hover:bg-white/20"
              title="Show the active rules"
            >
              {PRESET_LABEL[preset] ?? 'Rules'}
            </button>
            <span title="Turn number" className="hidden sm:inline">
              Turn {turn}
            </span>
            <span aria-hidden className="hidden opacity-40 sm:inline">
              ·
            </span>
            <span title="Moves played" className="hidden sm:inline">
              {totalMoves} moves
            </span>
            <span aria-hidden className="hidden opacity-40 sm:inline">
              ·
            </span>
            <span title="Captures">{captures} captures</span>
          </div>

          <AnimatePresence mode="wait">
            {humanAwaitRoll ? (
              <motion.div
                key="roll"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <Button
                  onClick={() => rollDice()}
                  className="animate-pulse-soft h-11 rounded-full bg-[#E8503A] px-6 text-base font-bold text-white shadow-lg shadow-[#E8503A]/25 hover:bg-[#C23A28]"
                >
                  <Dices size={18} /> Roll the die
                  <kbd className="ml-1 hidden rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold md:inline">
                    Space
                  </kbd>
                </Button>
              </motion.div>
            ) : diceFace ? (
              <motion.div
                key={`face-${diceFace}`}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5"
              >
                <ColorDot color={diceFace} size={13} />
                <span className="text-sm font-semibold">Rolled {faceLabel(diceFace)}</span>
              </motion.div>
            ) : (
              <motion.span
                key="watch"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm text-[#B99B72]"
              >
                {activeKind === 'ai' ? 'Robots at play…' : 'Watch the die…'}
              </motion.span>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2">
            {/* pawn-picker buttons — accessible alternative to 3D tapping */}
            {humanChoosing && activePlayer && (
              <div className="flex items-center gap-1.5" role="group" aria-label="Choose a pawn">
                {activePlayer.pawns.map((pawn) => {
                  const movable = legalMoves.some((m) => m.pawnId === pawn.id);
                  const Icon = CHAR_ICON[activePlayer.color];
                  return (
                    <button
                      key={pawn.id}
                      type="button"
                      disabled={!movable}
                      aria-label={`${pawn.id} ${movable ? 'can move' : 'cannot move'}`}
                      onClick={() => tapPawn(pawn.id)}
                      className={`flex size-9 items-center justify-center rounded-xl transition ${
                        movable
                          ? 'bg-white/90 text-[#5B3A24] shadow hover:scale-105 active:scale-95'
                          : 'bg-white/10 text-white/25'
                      }`}
                      style={movable ? { boxShadow: `0 0 0 2px ${COLORS_DEEP[activePlayer.color]}` } : undefined}
                    >
                      <Icon size={17} />
                    </button>
                  );
                })}
              </div>
            )}

            {humanChoosing && maySkipMove && (
              <Button
                onClick={() => skipTurn()}
                variant="outline"
                className="h-9 rounded-full border-white/25 bg-white/10 px-4 text-xs font-semibold text-[#F6EBD9] hover:bg-white/20"
              >
                <SkipForward size={14} /> Skip
              </Button>
            )}

            <p className="hidden items-center gap-1.5 text-xs text-[#B99B72] md:flex">
              {phase === 'choose-pawn' && activeKind === 'human' ? (
                <>
                  <span
                    className="inline-block size-2.5 rounded-full"
                    style={{ backgroundColor: COLORS_DEEP[activeColor ?? 'red'] }}
                  />
                  Tap a glowing {CHARACTERS[activeColor ?? 'red'].animal} to hop
                </>
              ) : (
                <>
                  <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: '#D9A441' }} />
                  {CHARACTERS[activeColor ?? 'red'].name}&apos;s turn
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
