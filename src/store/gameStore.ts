'use client';

import { create } from 'zustand';
import {
  RULES,
  TIMING,
  type DiceFaceId,
  type PlayerColorId,
} from '@/config/gameConfig';
import {
  advanceTurn,
  CHARACTERS,
  createGame,
  defaultName,
  noteReroll,
  passTurn,
  rollForTurn,
  suggestedColors,
} from '@/engine/game';
import { applyMove, getLegalMoves, pawnById } from '@/engine/rules';
import { chooseAiMove } from '@/engine/ai';
import type {
  AiLevel,
  GameState,
  LegalMove,
  PlayerKind,
  PlayerSetup,
  Position,
} from '@/engine/types';
import {
  initAudio,
  playSfx,
  setAudioSettings,
  startMusic,
  type SfxName,
} from '@/services/audio';
import { saveMatch } from '@/services/matchesApi';
import { useSettingsStore } from './settingsStore';

export type Screen = 'menu' | 'setup' | 'game';

export interface SeatDraft {
  color: PlayerColorId;
  kind: PlayerKind;
  aiLevel: AiLevel;
  name: string;
}

/** Animation record consumed by the 3D layer (visual only, never authoritative). */
export interface MoveAnim {
  token: number;
  pawnId: string;
  color: PlayerColorId;
  from: Position;
  to: Position;
  kind: 'entry' | 'move' | 'finish';
  capture?: {
    pawnId: string;
    color: PlayerColorId;
    from: Position;
    to: Position;
  };
  startedAt: number;
}

interface StatusInfo {
  text: string;
  tone: 'info' | 'action' | 'wait' | 'success' | 'alert';
}

interface GameStore {
  // ---- screens & lifecycle -------------------------------------------------
  screen: Screen;
  paused: boolean;
  introPlaying: boolean;
  matchSaved: boolean;

  // ---- setup ---------------------------------------------------------------
  playerCount: number;
  seats: SeatDraft[];

  // ---- engine state --------------------------------------------------------
  game: GameState | null;
  legalMoves: LegalMove[];
  selectedPawnId: string | null;
  diceRolling: boolean;
  diceAnimToken: number;
  moveAnim: MoveAnim | null;
  winner: PlayerColorId | null;
  totalMoves: number;

  // ---- derived helpers -----------------------------------------------------
  activeColor(): PlayerColorId | null;
  activeIsAi(): boolean;
  statusLine(): StatusInfo;
  moveForPawn(pawnId: string): LegalMove | undefined;

  // ---- actions -------------------------------------------------------------
  goScreen(screen: Screen): void;
  setPlayerCount(count: number): void;
  updateSeat(index: number, patch: Partial<SeatDraft>): void;
  swapSeatColor(index: number, color: PlayerColorId): void;
  startGame(): void;
  finishIntro(): void;
  rollDice(): void;
  confirmDiceAnimation(token: number): void;
  choosePawn(pawnId: string): void;
  confirmMoveAnimation(token: number): void;
  togglePause(): void;
  setPaused(v: boolean): void;
  restart(): void;
  quitToMenu(): void;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

let timers: ReturnType<typeof setTimeout>[] = [];
let animTokenCounter = 1;

function clearTimers() {
  for (const t of timers) clearTimeout(t);
  timers = [];
}

function later(ms: number, fn: () => void) {
  const t = setTimeout(() => {
    timers = timers.filter((x) => x !== t);
    fn();
  }, ms);
  timers.push(t);
}

function defaultSeats(): SeatDraft[] {
  const colors = suggestedColors(4);
  return colors.map((color) => ({
    color,
    kind: 'ai' as const,
    aiLevel: 'medium' as const,
    name: defaultName(color),
  }));
}

function seatsToSetups(seats: SeatDraft[]): PlayerSetup[] {
  return seats.map((seat, i) => ({
    id: `player-${i}`,
    color: seat.color,
    name: seat.name.trim() || defaultName(seat.color),
    kind: seat.kind,
    aiLevel: seat.aiLevel,
  }));
}

function colorLabel(face: DiceFaceId | null): string {
  if (!face) return '';
  return face.charAt(0).toUpperCase() + face.slice(1);
}

export const useGameStore = create<GameStore>()((set, get) => {
  // -----------------------------------------------------------------------
  // Shared turn-machine driver: examines the phase and schedules the next
  // step (AI actions, auto-moves, rerolls, turn transitions). Always safe to
  // call again; all steps are idempotent per phase.
  // -----------------------------------------------------------------------
  const tick = () => {
    const s = get();
    if (s.paused || !s.game || s.game.phase === 'game-over') return;
    const player = s.game.players[s.game.activeIndex]!;

    if (s.game.phase === 'await-roll') {
      if (player.kind === 'ai') {
        later(TIMING.aiRollDelay, () => {
          if (get().game?.phase === 'await-roll') get().rollDice();
        });
      }
      return;
    }

    if (s.game.phase === 'choose-pawn') {
      if (player.kind === 'ai') {
        const move = chooseAiMove(s.game, s.legalMoves);
        later(TIMING.aiThinkDelay, () => {
          const cur = get();
          if (cur.game?.phase === 'choose-pawn' && move) {
            cur.choosePawn(move.pawnId);
          }
        });
      } else if (s.legalMoves.length === 1) {
        // Single legal move: auto-execute after a short highlight.
        if (useSettingsStore.getState().autoSingleMove) {
          later(RULES.autoSingleMoveDelay, () => {
            const cur = get();
            if (cur.game?.phase === 'choose-pawn' && cur.legalMoves.length === 1) {
              cur.choosePawn(cur.legalMoves[0]!.pawnId);
            }
          });
        }
      }
      return;
    }

    if (s.game.phase === 'no-moves') {
      const canReroll = s.game.rollsThisTurn < RULES.maxRollsPerTurn;
      later(TIMING.noMovesMs, () => {
        const cur = get();
        if (!cur.game || cur.game.phase !== 'no-moves') return;
        if (canReroll) {
          // Roll again automatically (kids don't want to click twice).
          set({ game: noteReroll(cur.game) });
          playSfx('reroll');
          get().rollDice();
        } else {
          set({ game: passTurn(cur.game), legalMoves: [], selectedPawnId: null });
          playSfx('noMoves');
          tick();
        }
      });
      return;
    }

    if (s.game.phase === 'turn-end') {
      later(TIMING.turnEndMs, () => {
        const cur = get();
        if (!cur.game || cur.game.phase !== 'turn-end') return;
        set({
          game: advanceTurn(cur.game),
          legalMoves: [],
          selectedPawnId: null,
        });
        playSfx('turnChange');
        tick();
      });
    }
  };

  const sfx = (name: SfxName) => playSfx(name);
  void sfx;

  const persistMatch = (state: GameState) => {
    if (get().matchSaved) return;
    set({ matchSaved: true });
    const winner = state.players.find((p) => p.color === state.winner)!;
    const moves = state.events.filter((e) => e.kind === 'move').length;
    const durationSec = Math.max(1, Math.round((Date.now() - state.startedAt) / 1000));
    void saveMatch({
      winnerName: winner.name,
      winnerColor: winner.color,
      playerCount: state.players.length,
      aiCount: state.players.filter((p) => p.kind === 'ai').length,
      moves,
      captures: state.captures,
      durationSec,
      players: state.players.map((p) => ({ name: p.name, color: p.color, kind: p.kind })),
    }).catch(() => undefined);
  };

  return {
    screen: 'menu',
    paused: false,
    introPlaying: false,
    matchSaved: false,

    playerCount: 2,
    seats: defaultSeats(),

    game: null,
    legalMoves: [],
    selectedPawnId: null,
    diceRolling: false,
    diceAnimToken: 0,
    moveAnim: null,
    winner: null,
    totalMoves: 0,

    // ---------------------------------------------------------------------
    activeColor: () => {
      const g = get().game;
      return g ? g.players[g.activeIndex]!.color : null;
    },

    activeIsAi: () => {
      const g = get().game;
      return g ? g.players[g.activeIndex]!.kind === 'ai' : false;
    },

    statusLine: (): StatusInfo => {
      const s = get();
      const g = s.game;
      if (!g) return { text: '', tone: 'info' };
      const player = g.players[g.activeIndex]!;
      const who = player.name;
      const face = colorLabel(g.diceFace);

      if (s.winner) {
        const w = g.players.find((p) => p.color === s.winner);
        return { text: `${w?.name ?? 'Player'} wins the game!`, tone: 'success' };
      }
      switch (g.phase) {
        case 'await-roll':
          return player.kind === 'ai'
            ? { text: `${who} is about to roll…`, tone: 'wait' }
            : { text: `${who} — tap the die to roll!`, tone: 'action' };
        case 'rolling':
          return { text: 'Rolling the die…', tone: 'wait' };
        case 'no-moves':
          return {
            text: `${who} rolled ${face} — no pawn can use it.`,
            tone: 'alert',
          };
        case 'choose-pawn':
          return player.kind === 'ai'
            ? { text: `${who} rolled ${face} and is thinking…`, tone: 'wait' }
            : { text: `Rolled ${face} — tap a glowing pawn!`, tone: 'action' };
        case 'animating':
          return { text: 'Hop hop hop…', tone: 'wait' };
        case 'turn-end':
          return { text: `Next player's turn…`, tone: 'info' };
        default:
          return { text: '', tone: 'info' };
      }
    },

    moveForPawn: (pawnId) => get().legalMoves.find((m) => m.pawnId === pawnId),

    // ---------------------------------------------------------------------
    goScreen: (screen) => {
      clearTimers();
      initAudio();
      set({ screen, paused: false, moveAnim: null, diceRolling: false });
    },

    setPlayerCount: (count) => {
      const clamped = Math.min(4, Math.max(2, count));
      const colors = suggestedColors(clamped);
      set((s) => {
        const seats = [...s.seats];
        // Reset colors for the active count to a well-spread default set.
        for (let i = 0; i < clamped; i++) {
          const seat = seats[i]!;
          if (seat.kind === 'ai' && seat.name === defaultName(seat.color)) {
            seat.name = defaultName(colors[i]!);
          }
          seats[i] = { ...seat, color: colors[i]! };
        }
        return { playerCount: clamped, seats: [...seats] };
      });
    },

    updateSeat: (index, patch) => {
      set((s) => {
        const seats = [...s.seats];
        if (index < 0 || index >= seats.length) return {};
        const seat = { ...seats[index]!, ...patch };
        if (patch.kind === 'ai' && !patch.name) {
          seat.name = defaultName(seat.color);
        }
        seats[index] = seat;
        return { seats };
      });
    },

    swapSeatColor: (index, color) => {
      set((s) => {
        const seats = [...s.seats];
        const other = seats.findIndex(
          (seat, i) => i <= s.playerCount - 1 && i !== index && seat.color === color,
        );
        const myOld = seats[index]!.color;
        const seat = { ...seats[index]!, color };
        if (seat.name === defaultName(myOld)) seat.name = defaultName(color);
        seats[index] = seat;
        if (other >= 0 && other < s.playerCount) {
          const oSeat = { ...seats[other]!, color: myOld };
          if (oSeat.name === defaultName(color)) oSeat.name = defaultName(myOld);
          seats[other] = oSeat;
        }
        return { seats };
      });
    },

    startGame: () => {
      clearTimers();
      initAudio();
      const setups = seatsToSetups(get().seats.slice(0, get().playerCount));
      const game = createGame(setups);
      set({
        game,
        screen: 'game',
        paused: false,
        introPlaying: true,
        legalMoves: [],
        selectedPawnId: null,
        diceRolling: false,
        moveAnim: null,
        winner: null,
        totalMoves: 0,
        matchSaved: false,
      });
      startMusic();
      // Failsafe: if the 3D intro never reports, unlock the game anyway.
      later(TIMING.introDuration + 2600, () => get().finishIntro());
    },

    finishIntro: () => {
      if (!get().introPlaying) return;
      set({ introPlaying: false });
      tick();
    },

    // ---------------------------------------------------------------------
    rollDice: () => {
      const s = get();
      // Accept fresh rolls AND the automatic reroll from the no-moves phase
      // (noteReroll keeps the phase until a usable face appears).
      if (!s.game || (s.game.phase !== 'await-roll' && s.game.phase !== 'no-moves')) return;
      if (s.introPlaying || s.paused) return;
      const player = s.game.players[s.game.activeIndex]!;
      if (player.kind === 'human') {
        // Humans roll by clicking; AI rolls arrive here too via tick().
      }

      const { state } = rollForTurn(s.game);
      const token = animTokenCounter++;
      playSfx('dicePickup');

      set({
        game: state,
        diceRolling: true,
        diceAnimToken: token,
        legalMoves: [],
        selectedPawnId: null,
        moveAnim: null,
      });

      // Failsafe: if the 3D layer never reports completion, continue anyway.
      later(TIMING.diceRollDuration + 900, () => {
        if (get().diceAnimToken === token) get().confirmDiceAnimation(token);
      });
    },

    confirmDiceAnimation: (token) => {
      const s = get();
      if (s.diceAnimToken !== token || !s.diceRolling) return;
      const game = s.game!;
      const face = game.diceFace!;
      const moves = getLegalMoves(game, face);

      set({ diceRolling: false });

      if (moves.length === 0) {
        set({
          game: { ...game, phase: 'no-moves' },
          legalMoves: [],
        });
        playSfx('noMoves');
        tick();
        return;
      }

      set({ game: { ...game, phase: 'choose-pawn' }, legalMoves: moves });
      tick();
    },

    choosePawn: (pawnId) => {
      const s = get();
      if (!s.game || s.game.phase !== 'choose-pawn') return;
      const move = s.legalMoves.find((m) => m.pawnId === pawnId);
      if (!move) {
        sfx('noMoves');
        return;
      }

      // Snapshot the victim's pre-move position for the return animation.
      const captureInfo: MoveAnim['capture'] =
        move.capturedPawnId
          ? (() => {
              const victim = pawnById(s.game, move.capturedPawnId);
              if (!victim) return undefined;
              const to: Position = { area: 'base', index: 0 };
              return {
                pawnId: victim.id,
                color: victim.color,
                from: { ...victim.pos },
                to,
              };
            })()
          : undefined;

      const { state } = applyMove(s.game, move);
      const animToken = animTokenCounter++;

      // Resolve the victim's actual destination from post-move state.
      let captureResolved = captureInfo;
      if (captureResolved) {
        const victimAfter = pawnById(state, captureResolved.pawnId);
        if (victimAfter) captureResolved = { ...captureResolved, to: { ...victimAfter.pos } };
      }

      const anim: MoveAnim = {
        token: animToken,
        pawnId: move.pawnId,
        color: state.players[state.activeIndex]!.color,
        from: { ...move.from },
        to: move.isFinish
          ? { ...(pawnById(state, move.pawnId)?.pos ?? move.to) }
          : { ...move.to },
        kind: move.isEntry ? 'entry' : move.isFinish ? 'finish' : 'move',
        capture: captureResolved,
        startedAt: Date.now(),
      };

      playSfx(move.isFinish ? 'finish' : move.capturedPawnId ? 'capture' : 'pawnHop');

      set({
        game: state,
        legalMoves: [],
        selectedPawnId: null,
        moveAnim: anim,
        totalMoves: s.totalMoves + 1,
      });

      later(260, () => {
        if (captureResolved) playSfx('pawnReturn');
      });

      // Failsafe for the 3D move animation.
      const budget =
        TIMING.captureReturnMs + TIMING.hopPerFieldMs * Math.max(1, move.distance) + 1200;
      later(budget, () => {
        if (get().moveAnim?.token === animToken) get().confirmMoveAnimation(animToken);
      });
    },

    confirmMoveAnimation: (token) => {
      const s = get();
      if (!s.moveAnim || s.moveAnim.token !== token) return;
      set({ moveAnim: null });

      const game = s.game!;
      if (game.phase === 'game-over') {
        set({ winner: game.winner });
        playSfx('victory');
        persistMatch(game);
        return;
      }
      tick();
    },

    // ---------------------------------------------------------------------
    togglePause: () => {
      const paused = !get().paused;
      set({ paused });
      if (!paused) tick();
    },

    setPaused: (v) => {
      set({ paused: v });
      if (!v) tick();
    },

    restart: () => {
      clearTimers();
      const s = get();
      const setups = seatsToSetups(s.seats.slice(0, s.playerCount));
      const game = createGame(setups);
      set({
        game,
        paused: false,
        legalMoves: [],
        selectedPawnId: null,
        diceRolling: false,
        moveAnim: null,
        winner: null,
        totalMoves: 0,
        matchSaved: false,
      });
      later(200, () => tick());
    },

    quitToMenu: () => {
      clearTimers();
      set({
        screen: 'menu',
        game: null,
        paused: false,
        legalMoves: [],
        selectedPawnId: null,
        diceRolling: false,
        moveAnim: null,
        winner: null,
        introPlaying: false,
      });
    },
  };
});

// Keep audio settings in sync with the settings store.
if (typeof window !== 'undefined') {
  useSettingsStore.subscribe((s) => {
    setAudioSettings(s.audio);
  });
}
