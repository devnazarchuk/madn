'use client';

import { create } from 'zustand';
import {
  RULES,
  TIMING,
  type PlayerColorId,
} from '@/config/gameConfig';
import {
  advanceTurn,
  createGame,
  defaultName,
  noteReroll,
  passTurn,
  resolveStarFace,
  rollForTurn,
  suggestedColors,
} from '@/engine/game';
import {
  applyMove,
  getLegalMoves,
  pawnById,
  starOptions as computeStarOptions,
  validateMove,
} from '@/engine/rules';
import { chooseAiMove, chooseAiStarColor } from '@/engine/ai';
import {
  CLASSIC_CONFIG,
  FAMILY_CONFIG,
  QUICK_CONFIG,
  diffFromClassic,
  normalizeRulesConfig,
  type DiffKey,
  type RulesConfig,
  type RulesPresetId,
} from '@/engine/rulesConfig';
import {
  clearAutosave,
  loadAutosave,
  loadLastSetup,
  saveAutosave,
  saveLastSetup,
  type AutosavePayload,
} from '@/engine/persistence';
import type {
  AiLevel,
  GameState,
  LegalMove,
  MoveRejectionReason,
  PlayerKind,
  PlayerSetup,
  Position,
} from '@/engine/types';
import {
  initAudio,
  playSfx,
  setAudioSettings,
  startMusic,
} from '@/services/audio';
import { saveMatch } from '@/services/matchesApi';
import { useSettingsStore } from './settingsStore';

export type Screen = 'menu' | 'setup' | 'rules' | 'game';

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
  /** Every captured pawn flying home (multi-victim stacks included). */
  victims: Array<{
    pawnId: string;
    color: PlayerColorId;
    from: Position;
    to: Position;
  }>;
  startedAt: number;
}

export interface Notice {
  token: number;
  text: string;
  tone: 'info' | 'action' | 'alert' | 'success';
}

interface GameStore {
  // ---- screens & lifecycle -------------------------------------------------
  screen: Screen;
  paused: boolean;
  introPlaying: boolean;
  matchSaved: boolean;
  /** Autosaved match available for "Continue game" (menu). */
  autosave: AutosavePayload | null;

  // ---- setup ---------------------------------------------------------------
  playerCount: number;
  seats: SeatDraft[];

  // ---- rules configuration -------------------------------------------------
  rulesConfig: RulesConfig;
  rulesReturnTo: 'setup' | 'menu';

  // ---- engine state --------------------------------------------------------
  game: GameState | null;
  legalMoves: LegalMove[];
  selectedPawnId: string | null;
  /** Productive colors for a pending star roll (empty when none). */
  starOptions: PlayerColorId[];
  diceRolling: boolean;
  diceAnimToken: number;
  moveAnim: MoveAnim | null;
  winner: PlayerColorId | null;
  totalMoves: number;

  // ---- feedback ------------------------------------------------------------
  notice: Notice | null;
  shakePawnId: string | null;
  shakeToken: number;
  cameraResetToken: number;

  // ---- derived helpers -----------------------------------------------------
  activeColor(): PlayerColorId | null;
  activeIsAi(): boolean;
  moveForPawn(pawnId: string): LegalMove | undefined;

  // ---- actions -------------------------------------------------------------
  goScreen(screen: Screen): void;
  goRules(returnTo: 'setup' | 'menu'): void;
  setPlayerCount(count: number): void;
  updateSeat(index: number, patch: Partial<SeatDraft>): void;
  swapSeatColor(index: number, color: PlayerColorId): void;
  selectRulesPreset(preset: RulesPresetId): void;
  customizeFromPreset(): void;
  updateRulesOption(key: DiffKey, value: boolean | string): void;
  resetRulesToClassic(): void;
  startGame(): void;
  continueGame(): void;
  refreshAutosave(): void;
  finishIntro(): void;
  rollDice(): void;
  confirmDiceAnimation(token: number): void;
  /** Resolve a pending star (wild) roll to a concrete color. */
  chooseStarColor(color: PlayerColorId): void;
  tapPawn(pawnId: string): void;
  choosePawn(pawnId: string): void;
  confirmMoveAnimation(token: number): void;
  skipTurn(): void;
  resetCamera(): void;
  togglePause(): void;
  setPaused(v: boolean): void;
  restart(): void;
  quitToMenu(): void;
}

// ---------------------------------------------------------------------------
// Child-friendly rejection messages (reflect the ACTIVE rules configuration)
// ---------------------------------------------------------------------------

function rejectionText(reason: MoveRejectionReason, cfg: RulesConfig): string {
  switch (reason) {
    case 'PAWN_NOT_OWNED_BY_ACTIVE_PLAYER':
      return 'That pawn belongs to another player!';
    case 'NO_DICE_RESULT':
    case 'STAR_UNRESOLVED':
      return 'Roll the die first!';
    case 'WRONG_DICE_COLOR':
      return cfg.entryAssist
        ? 'While all your pawns wait in the base, any color works — now you need your OWN color!'
        : 'You need your OWN color to leave the base!';
    case 'PATH_BLOCKED':
      return 'Another pawn is blocking the way!';
    case 'DESTINATION_OCCUPIED':
      return cfg.friendlyStacking
        ? 'Your pawns cannot stand there.'
        : 'Your own pawn is standing there!';
    case 'CAPTURE_DISABLED':
      return 'Bumping is switched off — you cannot land on another pawn!';
    case 'PROTECTED_FIELD':
      return 'That pawn is safe on its start field!';
    case 'FINISH_LANE_BLOCKED':
      return 'The home slot ahead is taken — walk your pawn inside deeper first!';
    case 'MOVE_EXCEEDS_FINISH':
    case 'PAWN_FINISHED':
      return 'This pawn is already home!';
    default:
      return 'That pawn cannot move right now.';
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

let timers: ReturnType<typeof setTimeout>[] = [];
let animTokenCounter = 1;
let noticeTokenCounter = 1;

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

function presetConfig(preset: RulesPresetId): RulesConfig {
  switch (preset) {
    case 'classic':
      return CLASSIC_CONFIG;
    case 'quick':
      return QUICK_CONFIG;
    case 'family':
      return FAMILY_CONFIG;
    default:
      return { ...CLASSIC_CONFIG, preset: 'custom' };
  }
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

    if (s.game.phase === 'choose-star') {
      if (player.kind === 'ai') {
        later(TIMING.aiThinkDelay, () => {
          const cur = get();
          if (!cur.game || cur.game.phase !== 'choose-star') return;
          const color = chooseAiStarColor(cur.game);
          if (color) cur.chooseStarColor(color);
        });
      } else if (s.starOptions.length === 1) {
        // Only one productive color — not a real choice: auto-resolve it.
        const only = s.starOptions[0]!;
        later(RULES.autoStarResolveDelay, () => {
          const cur = get();
          if (cur.game?.phase === 'choose-star' && cur.starOptions.includes(only)) {
            cur.chooseStarColor(only);
          }
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
      const canReroll = s.game.rollsThisTurn < RULES.stuckRollsPerTurn;
      later(TIMING.noMovesMs, () => {
        const cur = get();
        if (!cur.game || cur.game.phase !== 'no-moves') return;
        if (canReroll) {
          // Roll again automatically (kids don't want to click twice).
          set({ game: noteReroll(cur.game) });
          playSfx('reroll');
          get().rollDice();
        } else {
          const next = passTurn(cur.game);
          set({ game: next, legalMoves: [], selectedPawnId: null });
          saveAutosave(next, get().totalMoves);
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
        const next = advanceTurn(cur.game);
        set({ game: next, legalMoves: [], selectedPawnId: null });
        saveAutosave(next, get().totalMoves);
        playSfx('turnChange');
        tick();
      });
    }
  };

  const notify = (text: string, tone: Notice['tone'] = 'alert') => {
    set({ notice: { token: noticeTokenCounter++, text, tone } });
  };

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
      preset: state.rulesConfig.preset,
      rulesConfig: state.rulesConfig,
      eventLog: state.events.slice(-2000),
    }).catch(() => undefined);
  };

  // Restore the last player setup on first mount (client only).
  const hydrateLastSetup = () => {
    const last = loadLastSetup();
    if (!last || last.seats.length !== 4) return;
    const seats: SeatDraft[] = defaultSeats();
    let valid = true;
    for (let i = 0; i < 4; i++) {
      const raw = last.seats[i]!;
      const color = (['red', 'blue', 'green', 'yellow'] as const).includes(
        raw.color as PlayerColorId,
      )
        ? (raw.color as PlayerColorId)
        : null;
      if (!color) {
        valid = false;
        break;
      }
      seats[i] = {
        color,
        kind: raw.kind === 'human' ? 'human' : 'ai',
        aiLevel: (['easy', 'medium', 'hard'] as const).includes(raw.aiLevel as AiLevel)
          ? (raw.aiLevel as AiLevel)
          : 'medium',
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 24) : defaultName(color),
      };
    }
    if (!valid) return;
    const count = Math.min(4, Math.max(2, last.playerCount));
    const used = seats.slice(0, count).map((s) => s.color);
    if (new Set(used).size === count) set({ playerCount: count, seats });
  };
  if (typeof window !== 'undefined') hydrateLastSetup();

  return {
    screen: 'menu',
    paused: false,
    introPlaying: false,
    matchSaved: false,
    autosave: null,

    playerCount: 2,
    seats: defaultSeats(),

    rulesConfig: CLASSIC_CONFIG,
    rulesReturnTo: 'setup',

    game: null,
    legalMoves: [],
    selectedPawnId: null,
    starOptions: [],
    diceRolling: false,
    diceAnimToken: 0,
    moveAnim: null,
    winner: null,
    totalMoves: 0,

    notice: null,
    shakePawnId: null,
    shakeToken: 0,
    cameraResetToken: 0,

    // ---------------------------------------------------------------------
    activeColor: () => {
      const g = get().game;
      return g ? g.players[g.activeIndex]!.color : null;
    },

    activeIsAi: () => {
      const g = get().game;
      return g ? g.players[g.activeIndex]!.kind === 'ai' : false;
    },

    moveForPawn: (pawnId) => get().legalMoves.find((m) => m.pawnId === pawnId),

    // ---------------------------------------------------------------------
    goScreen: (screen) => {
      clearTimers();
      initAudio();
      set({ screen, paused: false, moveAnim: null, diceRolling: false, notice: null });
    },

    goRules: (returnTo) => {
      clearTimers();
      initAudio();
      set({ screen: 'rules', rulesReturnTo: returnTo, notice: null });
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

    // ---------------------------------------------------------------------
    // Rules configuration actions
    // ---------------------------------------------------------------------
    selectRulesPreset: (preset) => {
      playSfx('uiClick');
      set({ rulesConfig: presetConfig(preset) });
    },

    customizeFromPreset: () => {
      const cfg = get().rulesConfig;
      if (cfg.preset === 'custom') return;
      playSfx('uiClick');
      set({ rulesConfig: normalizeRulesConfig({ ...cfg, preset: 'custom' }) });
    },

    updateRulesOption: (key, value) => {
      const cfg = get().rulesConfig;
      // Presets are locked — edits only apply in custom mode (the UI offers a
      // "customize" step that copies the preset first).
      if (cfg.preset !== 'custom') return;
      const next: RulesConfig = { ...cfg, [key]: value } as RulesConfig;
      set({ rulesConfig: normalizeRulesConfig(next) });
    },

    resetRulesToClassic: () => {
      playSfx('uiClick');
      set({ rulesConfig: CLASSIC_CONFIG });
    },

    // ---------------------------------------------------------------------
    startGame: () => {
      clearTimers();
      initAudio();
      const setups = seatsToSetups(get().seats.slice(0, get().playerCount));
      const rulesConfig = normalizeRulesConfig(get().rulesConfig);
      const game = createGame(setups, rulesConfig);
      saveLastSetup({
        playerCount: get().playerCount,
        seats: get().seats.map((s) => ({
          color: s.color,
          kind: s.kind,
          aiLevel: s.aiLevel,
          name: s.name,
        })),
      });
      saveAutosave(game, 0);
      set({
        game,
        screen: 'game',
        paused: false,
        introPlaying: true,
        legalMoves: [],
        selectedPawnId: null,
        starOptions: [],
        diceRolling: false,
        moveAnim: null,
        winner: null,
        totalMoves: 0,
        matchSaved: false,
        notice: null,
        rulesConfig,
      });
      startMusic();
      const preset = rulesConfig.preset;
      const diffs = diffFromClassic(rulesConfig).length;
      notify(
        preset === 'classic'
          ? 'Classic Kids rules — good luck!'
          : `${preset === 'custom' ? 'Custom' : preset === 'quick' ? 'Quick game' : 'Family mode'} rules active (${diffs} change${diffs === 1 ? '' : 's'} from Classic).`,
        'info',
      );
      // Failsafe: if the 3D intro never reports, unlock the game anyway.
      later(TIMING.introDuration + 2600, () => get().finishIntro());
    },

    continueGame: () => {
      const a = loadAutosave();
      if (!a) {
        notify('No saved game found — start a new one!', 'alert');
        return;
      }
      clearTimers();
      initAudio();
      // Normalize the restored phase: transient animation phases cannot be
      // resumed, a pending star re-derives its productive colors.
      const game = { ...a.game };
      let starChoices: PlayerColorId[] = [];
      if (game.phase === 'choose-star') {
        starChoices = computeStarOptions(game);
        if (starChoices.length === 0) {
          game.phase = 'no-moves';
        }
      } else if (game.phase !== 'await-roll' && game.phase !== 'game-over') {
        game.phase = 'await-roll';
        game.diceFace = null;
      }
      set({
        game,
        screen: 'game',
        paused: false,
        introPlaying: false,
        legalMoves: [],
        selectedPawnId: null,
        starOptions: starChoices,
        diceRolling: false,
        moveAnim: null,
        winner: null,
        totalMoves: a.totalMoves,
        matchSaved: false,
        notice: null,
        rulesConfig: game.rulesConfig,
      });
      startMusic();
      notify('Welcome back — the match continues!', 'success');
      tick();
    },

    refreshAutosave: () => {
      set({ autosave: loadAutosave() });
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
      set({ diceRolling: false });

      // A star must be resolved to a concrete color before anything moves.
      if (game.diceFace === 'star') {
        const options = computeStarOptions(game);
        if (options.length === 0) {
          set({ game: { ...game, phase: 'no-moves' }, legalMoves: [], starOptions: [] });
          playSfx('noMoves');
          tick();
          return;
        }
        set({ game: { ...game, phase: 'choose-star' }, legalMoves: [], starOptions: options });
        tick();
        return;
      }

      const moves = getLegalMoves(game);
      if (moves.length === 0) {
        set({ game: { ...game, phase: 'no-moves' }, legalMoves: [], starOptions: [] });
        playSfx('noMoves');
        tick();
        return;
      }

      set({ game: { ...game, phase: 'choose-pawn' }, legalMoves: moves, starOptions: [] });
      tick();
    },

    // ---------------------------------------------------------------------
    chooseStarColor: (color) => {
      const s = get();
      if (!s.game || s.game.phase !== 'choose-star' || s.game.diceFace !== 'star') return;
      const state = resolveStarFace(s.game, color);
      const moves = getLegalMoves(state);
      if (moves.length === 0) {
        // Defensive: the chosen color yields nothing (the picker only offers
        // productive colors, but a blockade may have changed since).
        set({ game: { ...state, phase: 'no-moves' }, legalMoves: [], starOptions: [] });
        playSfx('noMoves');
        tick();
        return;
      }
      const player = state.players[state.activeIndex]!;
      if (player.kind === 'ai') {
        notify(`${player.name} picked ${color} for the star!`, 'info');
      }
      set({ game: state, legalMoves: moves, starOptions: [] });
      playSfx('star');
      tick();
    },

    // ---------------------------------------------------------------------
    // Tap routing: movable pawns move, illegal taps get child-friendly feedback.
    // ---------------------------------------------------------------------
    tapPawn: (pawnId) => {
      const s = get();
      if (!s.game || s.screen !== 'game' || s.paused) return;
      const g = s.game;
      const player = g.players[g.activeIndex]!;

      // Wrong turn or wrong owner → gentle reminder.
      const pawn = pawnById(g, pawnId);
      if (!pawn) return;
      if (g.phase !== 'choose-pawn' || player.kind !== 'human') {
        if (pawn.color !== player.color && g.phase !== 'game-over') {
          notify(`Not yet — it's ${player.name}'s turn!`, 'info');
        }
        return;
      }
      if (pawn.color !== player.color) {
        notify(`That's not your pawn — you play the ${player.color} one!`, 'info');
        return;
      }

      const move = s.legalMoves.find((m) => m.pawnId === pawnId);
      if (move) {
        playSfx('pawnSelect');
        get().choosePawn(pawnId);
        return;
      }

      // Illegal for a reason → explain it like a friendly grown-up.
      const validation = validateMove(g, pawnId);
      const text = validation.reason
        ? rejectionText(validation.reason, g.rulesConfig)
        : 'That pawn cannot use this roll.';
      playSfx('noMoves');
      set({ shakePawnId: pawnId, shakeToken: get().shakeToken + 1 });
      notify(text, 'alert');
    },

    choosePawn: (pawnId) => {
      const s = get();
      if (!s.game || s.game.phase !== 'choose-pawn') return;
      const move = s.legalMoves.find((m) => m.pawnId === pawnId);
      if (!move) return;

      // Snapshot the victims' pre-move positions for the return animation.
      const victims = move.capturedPawnIds.flatMap((victimId) => {
        const victim = pawnById(s.game!, victimId);
        if (!victim) return [];
        return [
          {
            pawnId: victim.id,
            color: victim.color,
            from: { ...victim.pos },
            to: { area: 'base' as const, index: 0 },
          },
        ];
      });

      const { state } = applyMove(s.game, move);
      const animToken = animTokenCounter++;

      // Resolve each victim's actual destination from post-move state.
      const victimsResolved = victims.map((v) => {
        const victimAfter = pawnById(state, v.pawnId);
        return victimAfter ? { ...v, to: { ...victimAfter.pos } } : v;
      });

      const anim: MoveAnim = {
        token: animToken,
        pawnId: move.pawnId,
        color: state.players[state.activeIndex]!.color,
        from: { ...move.from },
        to: move.isFinish
          ? { ...(pawnById(state, move.pawnId)?.pos ?? move.to) }
          : { ...move.to },
        kind: move.isEntry ? 'entry' : move.isFinish ? 'finish' : 'move',
        victims: victimsResolved,
        startedAt: Date.now(),
      };

      playSfx(move.isFinish ? 'finish' : move.capturedPawnIds.length > 0 ? 'capture' : 'pawnHop');

      set({
        game: state,
        legalMoves: [],
        selectedPawnId: null,
        moveAnim: anim,
        totalMoves: s.totalMoves + 1,
      });

      later(260, () => {
        if (victimsResolved.length > 0) playSfx('pawnReturn');
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
        clearAutosave();
        set({ autosave: null });
        persistMatch(game);
        return;
      }

      if (game.phase === 'await-roll' && game.extraRoll) {
        notify(
          game.extraRoll === 'capture'
            ? 'Bumped someone — roll again!'
            : 'Your own color — roll again!',
          'success',
        );
        playSfx('star');
        saveAutosave(game, get().totalMoves);
      }

      tick();
    },

    skipTurn: () => {
      const s = get();
      if (!s.game || s.game.phase !== 'choose-pawn') return;
      if (!s.game.rulesConfig.maySkipMove) return;
      const player = s.game.players[s.game.activeIndex]!;
      if (player.kind !== 'human') return;
      const next = passTurn(s.game, 'skipped the move voluntarily');
      set({ game: next, legalMoves: [], selectedPawnId: null });
      saveAutosave(next, get().totalMoves);
      playSfx('noMoves');
      notify(`${player.name} skips this move.`, 'info');
      tick();
    },

    resetCamera: () => {
      set({ cameraResetToken: get().cameraResetToken + 1 });
      playSfx('uiClick');
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
      const rulesConfig = normalizeRulesConfig(s.game?.rulesConfig ?? s.rulesConfig);
      const game = createGame(setups, rulesConfig);
      saveAutosave(game, 0);
      set({
        game,
        paused: false,
        legalMoves: [],
        selectedPawnId: null,
        starOptions: [],
        diceRolling: false,
        moveAnim: null,
        winner: null,
        totalMoves: 0,
        matchSaved: false,
        notice: null,
        rulesConfig,
      });
      later(200, () => tick());
    },

    quitToMenu: () => {
      clearTimers();
      // An abandoned match keeps its autosave so it can be continued later.
      const current = get().game;
      if (current && current.phase !== 'game-over') {
        saveAutosave(current, get().totalMoves);
        set({ autosave: loadAutosave() });
      } else {
        clearAutosave();
        set({ autosave: null });
      }
      set({
        screen: 'menu',
        game: null,
        paused: false,
        legalMoves: [],
        selectedPawnId: null,
        starOptions: [],
        diceRolling: false,
        moveAnim: null,
        winner: null,
        introPlaying: false,
        notice: null,
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
