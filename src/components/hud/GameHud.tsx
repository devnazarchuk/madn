'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Bot, Crown, Dices, Focus, Pause, SkipForward, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { playSfx } from '@/services/audio';
import { COLORS, COLORS_DEEP } from '@/config/theme';
import { CHARACTERS } from '@/engine/game';
import { pawnCounts } from '@/engine/rules';
import type { DiceFaceId, PlayerColorId, TrackColorId } from '@/engine/types';
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
  return face === 'star' ? 'Star' : face.charAt(0).toUpperCase() + face.slice(1);
}

/**
 * Star picker — shown after a human rolls a golden star (Star Mode). Offers
 * only the productive colors (each yields at least one legal move for the
 * roll) — any of the six track colors: the four player colors plus white and
 * black (a long platform stride).
 */
function StarPicker({
  options,
  activeColor,
}: {
  options: TrackColorId[];
  activeColor: PlayerColorId | null;
}) {
  const chooseStarColor = useGameStore((s) => s.chooseStarColor);
  if (options.length === 0) return null;
  const isPlayerColor = (c: TrackColorId): c is PlayerColorId =>
    c === 'red' || c === 'blue' || c === 'green' || c === 'yellow';
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.96 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      role="dialog"
      aria-label="Pick a color for your star"
      className="pointer-events-auto mx-auto w-full max-w-[calc(100vw-1.5rem)] rounded-3xl border-2 border-[#D9A441]/60 bg-[#FBF3E0]/97 p-3 shadow-2xl shadow-black/40 backdrop-blur-md sm:max-w-md sm:p-4"
    >
      <p className="mb-3 flex items-center justify-center gap-2 text-center text-base font-extrabold text-[#3E2A18]">
        <Sparkles size={19} className="text-[#B6842B]" aria-hidden />
        You rolled a STAR — pick any color!
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
        {options.map((color) => {
          const own = color === activeColor;
          const light = color === 'white';
          return (
            <button
              key={color}
              type="button"
              aria-label={own ? `Choose your own color ${color}` : `Choose ${color}`}
              onClick={() => {
                playSfx('uiClick');
                chooseStarColor(color);
              }}
              className={`flex min-h-11 flex-col items-center gap-1 rounded-2xl px-3 py-2 font-bold shadow-lg transition hover:scale-105 active:scale-95 sm:px-4 sm:py-2.5 ${
                light ? 'text-[#3E2A18]' : 'text-white'
              }`}
              style={{ backgroundColor: COLORS[color] }}
            >
              {isPlayerColor(color) ? (
                <AnimalIcon color={color} size={22} />
              ) : (
                <span
                  aria-hidden
                  className="inline-block size-[22px] rounded-full"
                  style={{
                    backgroundColor: color === 'white' ? '#FFFFFF' : '#37332D',
                    boxShadow: `0 0 0 2px ${color === 'white' ? '#97917F' : '#B9B4A8'}`,
                  }}
                />
              )}
              <span className="text-xs">
                {own ? `${faceLabel(color)} · yours!` : faceLabel(color)}
              </span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
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
      className={`flex min-w-0 flex-1 items-center justify-center gap-0.5 rounded-xl bg-white/90 px-1 py-1 backdrop-blur-md transition-all sm:flex-none sm:justify-start sm:gap-2 sm:px-3 sm:py-1.5 ${
        active ? 'scale-[1.03] shadow-lg' : 'opacity-75 shadow-sm'
      }`}
      style={active ? { boxShadow: `0 0 0 2.5px ${COLORS[color]}, 0 6px 18px rgba(0,0,0,0.28)` } : undefined}
    >
      <span
        className="relative flex size-6 shrink-0 items-center justify-center rounded-lg text-white sm:size-7"
        style={{ backgroundColor: COLORS[color] }}
      >
        {isWinner ? <Crown size={14} /> : <AnimalIcon color={color} size={15} />}
        {/* compact bot badge pinned to the avatar corner (mobile-only) */}
        {kind === 'ai' && (
          <span
            aria-hidden
            title="Bot"
            className="absolute -right-1 -top-1 flex size-[13px] items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/10 sm:hidden"
          >
            <Bot size={9} className="text-[#8A6B4F]" />
          </span>
        )}
      </span>
      {/* On phones the name text is dropped (kept for screen readers) so all
          four badges fit a single row; sm+ restores the full labelled pill. */}
      <span className="sr-only text-xs font-semibold text-[#3E2A18] sm:not-sr-only sm:max-w-28 sm:truncate">
        {name}
      </span>
      <PawnDots color={color} home={counts.home} track={counts.track} total={totalPawns} />
      {kind === 'ai' && <Bot size={12} className="hidden shrink-0 text-[#8A6B4F] sm:block" />}
    </div>
  );
}

/** Transient feedback notice (invalid moves, extra rolls, etc.). */
function NoticeToast({ suppressText }: { suppressText?: string }) {
  const notice = useGameStore((s) => s.notice);
  const [dismissedToken, setDismissedToken] = useState(0);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setDismissedToken(notice.token), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  // When the notice repeats the status pill word-for-word (e.g. a skipped
  // turn), showing both would stack the same sentence twice — keep the pill.
  const visible =
    !!notice && notice.token !== dismissedToken && notice.text !== suppressText;

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
  const starOptions = useGameStore((s) => s.starOptions);
  const activeName = useGameStore((s) => s.game?.players[s.game.activeIndex]?.name ?? '');
  const activeKind = useGameStore((s) => s.game?.players[s.game.activeIndex]?.kind ?? 'ai');
  const activeColor = useGameStore((s) => s.game?.players[s.game.activeIndex]?.color ?? null);
  const activePlayer = useGameStore((s) => s.game?.players[s.game.activeIndex] ?? null);
  const ownColorToMove = useGameStore((s) => s.game?.rulesConfig.ownColorToMove ?? false);
  const players = useGameStore((s) => s.game?.players) ?? EMPTY_PLAYERS;
  const turn = useGameStore((s) => s.game?.turn ?? 0);
  const totalMoves = useGameStore((s) => s.totalMoves);
  const captures = useGameStore((s) => s.game?.captures ?? 0);
  const introPlaying = useGameStore((s) => s.introPlaying);
  const muted = useSettingsStore((s) => s.audio.muted);
  const toggleMuted = useSettingsStore((s) => s.toggleMuted);
  const [rulesOpen, setRulesOpen] = useState(false);

  // DYNAMIC TURN COLOR — the banner wears the ACTIVE player's color (the
  // winner's once the match is decided); readable text color per background.
  const bannerColorId = winner ?? activeColor;
  const bannerColor = bannerColorId ? COLORS[bannerColorId] : null;
  const bannerTextColor =
    bannerColorId === 'yellow' || bannerColorId === null ? '#3E2A18' : '#FFFFFF';

  const humanAwaitRoll =
    phase === 'await-roll' && activeKind === 'human' && !diceRolling && !paused && !winner;
  const humanChoosing = phase === 'choose-pawn' && activeKind === 'human' && !paused && !winner;
  const humanStarPick =
    phase === 'choose-star' && activeKind === 'human' && !paused && !winner && starOptions.length > 0;

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
      case 'choose-star':
        return activeKind === 'ai'
          ? { text: `${activeName} rolled a star and is thinking…`, tone: 'wait' }
          : { text: 'A golden star! Pick any color you like.', tone: 'action' };
      case 'no-moves':
        return {
          text:
            ownColorToMove && diceFace && diceFace !== 'star' && diceFace !== activeColor
            ? `${activeName} rolled ${faceLabel(diceFace)} — not their color. Turn skipped!`
            : `${activeName} rolled ${faceLabel(diceFace ?? 'red')} — no pawn can use it. Turn skipped.`,
          tone: 'alert',
        };
      case 'choose-pawn':
        return activeKind === 'ai'
          ? { text: `${activeName} rolled ${faceLabel(diceFace ?? 'red')} and is thinking…`, tone: 'wait' }
          : { text: `Rolled ${faceLabel(diceFace ?? 'red')} — tap a glowing animal or its golden target!`, tone: 'action' };
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

  // MOBILE top indicator — color + name only (the pill background carries
  // the active player's color; the desktop variant keeps the full detail).
  const statusShort = winner
    ? `${players.find((p) => p.color === winner)?.name ?? 'Player'} wins!`
    : `${activeName}'s turn`;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      {/* ---- top bar ---------------------------------------------------- */}
      <div className="flex items-start justify-between gap-2 px-2 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-3 sm:pt-3">
        <div className="pointer-events-auto flex gap-2">
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

        {/* Status pill — DYNAMIC TURN COLOR: the pill's background always
            follows the ACTIVE player's color (or the winner's).
            MOBILE: shows ONLY the active player's name on their color — one
            truncated line in a fixed-height pill so the header never shifts.
            DESKTOP (sm+): keeps the detailed status message, capped at two
            lines with a reserved minimum height. Both variants are keyed per
            text (a plain animate-in avoids the AnimatePresence exit queue,
            which can stall a fast sequence of AI turns). */}
        <div className="flex min-w-0 max-w-[52%] items-center justify-center sm:max-w-[58%]">
          <motion.div
            key={`m-${winner ? 'win' : 'turn'}-${statusShort}`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            role="status"
            aria-live="polite"
            style={bannerColor ? { backgroundColor: bannerColor, color: bannerTextColor, boxShadow: `0 8px 28px -8px ${bannerColor}` } : undefined}
            className={`pointer-events-none flex h-9 min-w-0 items-center justify-center truncate rounded-2xl border border-white/10 px-3 text-[13px] font-semibold leading-none shadow-lg backdrop-blur-md sm:hidden ${TONE_STYLES[status.tone]}`}
          >
            <span className="truncate">{statusShort}</span>
          </motion.div>
          <motion.div
            key={status.text}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            role="status"
            aria-live="polite"
            style={bannerColor ? { backgroundColor: bannerColor, color: bannerTextColor, boxShadow: `0 8px 28px -8px ${bannerColor}` } : undefined}
            className={`pointer-events-none hidden min-h-10 items-center justify-center rounded-2xl border border-white/10 px-4 py-1.5 text-center text-sm font-semibold leading-snug shadow-lg backdrop-blur-md sm:flex ${TONE_STYLES[status.tone]}`}
          >
            <span className="line-clamp-2">{status.text}</span>
          </motion.div>
        </div>

        <div className="pointer-events-auto flex gap-2">
          {/* Pause lives on the RIGHT side of the game screen, next to the
              rules reference — mute & camera stay on the left. */}
          <HudIconButton label="Pause" onClick={() => togglePause()}>
            <Pause size={18} />
          </HudIconButton>
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
      {/* flex-1 chips share the row equally on phones (no name text, no
          clipping); sm+ keeps the natural-width labelled pills. overflow-x-auto
          remains as a graceful fallback for narrow desktop windows. */}
      <div className="pointer-events-auto flex gap-1 overflow-x-auto px-1.5 pb-1 no-scrollbar sm:gap-2 sm:px-3">
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
          <NoticeToast suppressText={status.text} />
        </div>
        {/* star picker — a star roll is resolved by picking a color */}
        <div className="pointer-events-none absolute inset-x-0 top-[38%] z-20 flex justify-center px-3">
          <AnimatePresence>{humanStarPick && <StarPicker options={starOptions} activeColor={activeColor} />}</AnimatePresence>
        </div>
      </div>

      {/* ---- bottom bar (docked flush to the screen edge on phones) -------
          STABLE BY CONSTRUCTION: one row, no wrapping, a fixed-height center
          zone and truncated dynamic text — status messages can never change
          the panel's height or width. The rules chip & stats live on the
          left on sm+ (mobile reaches the rules via the top-right book
          button, keeping the bar roomy for pawn pickers). */}
      <div className="mt-auto sm:p-3">
        <div className="pointer-events-auto mx-auto flex w-full min-w-0 max-w-3xl flex-nowrap items-center justify-between gap-2 rounded-t-2xl bg-[#241B14]/90 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-[#F6EBD9] shadow-2xl backdrop-blur-md sm:rounded-2xl sm:bg-[#241B14]/75 sm:gap-x-4 sm:px-4 sm:py-2.5">
          {/* left zone — preset chip + stats (desktop only) */}
          <div className="hidden min-w-0 items-center gap-3 text-xs font-medium text-[#D9C3A0] sm:flex">
            <button
              type="button"
              onClick={() => {
                playSfx('modal');
                setRulesOpen(true);
              }}
              className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#F6EBD9] transition hover:bg-white/20"
              title="Show the active rules"
            >
              {PRESET_LABEL[preset] ?? 'Rules'}
            </button>
            <span title="Turn number" className="hidden shrink-0 md:inline">
              Turn {turn}
            </span>
            <span aria-hidden className="hidden opacity-40 md:inline">
              ·
            </span>
            <span title="Moves played" className="hidden shrink-0 md:inline">
              {totalMoves} moves
            </span>
            <span aria-hidden className="hidden opacity-40 md:inline">
              ·
            </span>
            <span title="Captures" className="shrink-0">
              {captures} captures
            </span>
          </div>

          {/* center zone — the dynamic dice status; fixed height + truncation
              so "Rolled Yellow" never resizes the panel */}
          <div className="flex h-11 min-w-0 flex-1 items-center justify-center sm:flex-none">
            {/* No mode="wait" here: the exit queue can stall on a fast sequence
                of AI turns and leave a stale chip on screen (same lesson as the
                status pill) — plain cross-fade instead. */}
            <AnimatePresence>
              {humanAwaitRoll ? (
                <motion.div
                  key="roll"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex max-w-full"
                >
                  <Button
                    onClick={() => rollDice()}
                    className="animate-pulse-soft h-11 max-w-full rounded-full bg-[#E8503A] px-4 text-sm font-bold text-white shadow-lg shadow-[#E8503A]/25 hover:bg-[#C23A28] sm:px-6 sm:text-base"
                  >
                    <Dices size={18} className="shrink-0" />
                    <span className="truncate">Roll the die</span>
                    <kbd className="ml-1 hidden shrink-0 rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold md:inline">
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
                  className="flex min-w-0 max-w-full items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 sm:px-4"
                >
                  <ColorDot color={diceFace} size={13} />
                  <span className="truncate text-sm font-semibold">
                    Rolled {faceLabel(diceFace)}
                  </span>
                </motion.div>
              ) : (
                <motion.span
                  key="watch"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="min-w-0 truncate text-sm text-[#B99B72]"
                >
                  {activeKind === 'ai' ? 'Robots at play…' : 'Watch the die…'}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            {/* pawn-picker buttons — accessible alternative to 3D tapping */}
            {humanChoosing && activePlayer && (
              <div
                className="flex shrink-0 items-center gap-1.5"
                role="group"
                aria-label="Choose a pawn"
              >
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
                      className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition sm:size-9 ${
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
                className="h-9 shrink-0 rounded-full border-white/25 bg-white/10 px-3 text-xs font-semibold text-[#F6EBD9] hover:bg-white/20 sm:px-4"
              >
                <SkipForward size={14} className="shrink-0" /> Skip
              </Button>
            )}

            <p className="hidden shrink-0 items-center gap-1.5 text-xs text-[#B99B72] md:flex">
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
