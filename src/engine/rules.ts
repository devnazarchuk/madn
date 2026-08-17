import { RULES, type DiceFaceId, type PlayerColorId } from '@/config/gameConfig';
import {
  FIELD_COLORS,
  loopIndexFromPath,
  pathIndex,
  START_INDEX,
  LOOP,
} from './board';
import type {
  GameEvent,
  GameState,
  LegalMove,
  MoveRejectionReason,
  MoveValidation,
  PawnState,
  PlayerRuntime,
  Position,
} from './types';

/**
 * ============================================================================
 * LEGAL MOVES & MOVE RESOLUTION — the single authoritative validation system.
 * ============================================================================
 * Every option is read from `state.rulesConfig` (see rulesConfig.ts):
 *   entryRule / entryAssist · passingRule · captureEnabled · protectedStarts
 *   friendlyStacking · extraTurnOnCapture / extraTurnOnOwnColor · pawnsPerPlayer
 * Humans, the AI and the animations all consume this module — nothing else
 * ever decides whether a move is legal.
 */

// ---------------------------------------------------------------------------
// Occupancy
// ---------------------------------------------------------------------------

/** ALL pawns occupying a track field (any color — stacks included). */
export function pawnsOnTrack(state: GameState, loopIdx: number): PawnState[] {
  const found: PawnState[] = [];
  for (const p of state.players) {
    for (const pawn of p.pawns) {
      if (pawn.pos.area === 'track' && pawn.pos.index === loopIdx) found.push(pawn);
    }
  }
  return found;
}

function firstFreeSlot(pawns: PawnState[], area: 'base' | 'home'): number | null {
  for (let i = 0; i < RULES[area === 'base' ? 'baseSlots' : 'homeSlots']; i++) {
    if (!pawns.some((pawn) => pawn.pos.area === area && pawn.pos.index === i)) return i;
  }
  return null;
}

export function pawnById(state: GameState, id: string): PawnState | null {
  for (const p of state.players) {
    const found = p.pawns.find((pawn) => pawn.id === id);
    if (found) return found;
  }
  return null;
}

export function playerOf(state: GameState, color: PlayerColorId): PlayerRuntime {
  return state.players.find((p) => p.color === color)!;
}

// ---------------------------------------------------------------------------
// Single-pawn evaluation (shared by getLegalMoves and validateMove)
// ---------------------------------------------------------------------------

/** True when ANY pawn stands on one of the pawn's own path fields [from..to]. */
function pathRangeOccupied(
  state: GameState,
  color: PlayerColorId,
  pathFrom: number,
  pathTo: number,
): boolean {
  for (let p = pathFrom; p <= pathTo; p++) {
    if (pawnsOnTrack(state, loopIndexFromPath(color, p)).length > 0) return true;
  }
  return false;
}

interface PawnEvaluation {
  move?: LegalMove;
  reason?: MoveRejectionReason;
}

/**
 * Resolves what the given pawn may do with `face` under the active rules.
 * Pure; never mutates state.
 */
function evaluatePawn(state: GameState, face: DiceFaceId, pawn: PawnState): PawnEvaluation {
  const cfg = state.rulesConfig;
  const player = state.players[state.activeIndex]!;
  const color = player.color;

  if (pawn.color !== color) return { reason: 'pawn-finished' }; // not offered by the UI anyway
  if (pawn.pos.area === 'home') return { reason: 'pawn-finished' };

  // --- Leaving the base ----------------------------------------------------
  if (pawn.pos.area === 'base') {
    const allInBase = player.pawns.every((p) => p.pos.area === 'base');
    const canEnter =
      cfg.entryRule === 'any-color' ||
      face === color ||
      (cfg.entryAssist && allInBase);
    if (!canEnter) return { reason: 'entry-color' };

    const targetLoop = START_INDEX[color];
    const occupants = pawnsOnTrack(state, targetLoop);
    const own = occupants.filter((o) => o.color === color);
    const enemies = occupants.filter((o) => o.color !== color);
    if (own.length > 0 && !cfg.friendlyStacking) return { reason: 'own-pawn-blocks' };
    if (enemies.length > 0 && !cfg.captureEnabled) return { reason: 'no-capture-allowed' };
    // Enemies on MY start field are not protected: protection belongs to a
    // pawn standing on ITS OWN start field.
    return {
      move: {
        pawnId: pawn.id,
        from: { ...pawn.pos },
        to: { area: 'track', index: targetLoop },
        isEntry: true,
        isFinish: false,
        capturedPawnIds: enemies.map((e) => e.id),
        distance: 1,
      },
    };
  }

  // --- Moving on the track -------------------------------------------------
  const fromIdx = pathIndex(color, pawn.pos);

  // First matching field ahead (only that one counts).
  let matched = -1;
  for (let ahead = 1; fromIdx + ahead < RULES.trackFields; ahead++) {
    if (FIELD_COLORS[loopIndexFromPath(color, fromIdx + ahead)] === face) {
      matched = ahead;
      break;
    }
  }

  // --- Going home (assumption A8: home matches every color) ----------------
  if (matched === -1) {
    if (RULES.homeMatchesAnyColor) {
      // The pawn passes over its remaining track fields on the way in.
      if (
        cfg.passingRule === 'strict-blocking' &&
        pathRangeOccupied(state, color, fromIdx + 1, RULES.trackFields - 1)
      ) {
        return { reason: 'blocked-path' };
      }
      return {
        move: {
          pawnId: pawn.id,
          from: { ...pawn.pos },
          to: { area: 'home', index: 0 }, // slot resolved on apply
          isEntry: false,
          isFinish: true,
          capturedPawnIds: [],
          distance: RULES.trackFields - fromIdx,
        },
      };
    }
    return { reason: 'blocked-path' };
  }

  const destLoop = loopIndexFromPath(color, fromIdx + matched);

  // --- Strict blocking: intermediates must be empty ------------------------
  if (
    cfg.passingRule === 'strict-blocking' &&
    matched > 1 &&
    pathRangeOccupied(state, color, fromIdx + 1, fromIdx + matched - 1)
  ) {
    return { reason: 'blocked-path' };
  }

  // --- Destination occupancy -----------------------------------------------
  const occupants = pawnsOnTrack(state, destLoop);
  const own = occupants.filter((o) => o.color === color);
  const enemies = occupants.filter((o) => o.color !== color);

  if (own.length > 0 && !cfg.friendlyStacking) return { reason: 'own-pawn-blocks' };
  if (enemies.length > 0) {
    if (!cfg.captureEnabled) return { reason: 'no-capture-allowed' };
    if (
      cfg.protectedStarts &&
      enemies.some((e) => START_INDEX[e.color] === destLoop)
    ) {
      return { reason: 'protected-field' };
    }
  }

  return {
    move: {
      pawnId: pawn.id,
      from: { ...pawn.pos },
      to: { area: 'track', index: destLoop },
      isEntry: false,
      isFinish: false,
      capturedPawnIds: enemies.map((e) => e.id),
      distance: matched,
    },
  };
}

/**
 * All legal moves for the active player after rolling `face`.
 * Pure function — never mutates state.
 */
export function getLegalMoves(state: GameState, face: DiceFaceId): LegalMove[] {
  const player = state.players[state.activeIndex]!;
  const moves: LegalMove[] = [];
  for (const pawn of player.pawns) {
    const evalResult = evaluatePawn(state, face, pawn);
    if (evalResult.move) moves.push(evalResult.move);
  }
  return moves;
}

/**
 * Authoritative validation for ONE pawn — used for child-friendly feedback.
 * Returns the move when legal, otherwise a machine-readable reason.
 */
export function validateMove(state: GameState, pawnId: string): MoveValidation {
  const player = state.players[state.activeIndex]!;
  const pawn = player.pawns.find((p) => p.id === pawnId);
  if (!pawn) {
    const elsewhere = pawnById(state, pawnId);
    if (elsewhere) return { legal: false, reason: 'pawn-finished' };
    return { legal: false };
  }
  const face = state.diceFace;
  if (!face) return { legal: false };
  const result = evaluatePawn(state, face, pawn);
  return result.move ? { legal: true, move: result.move } : { legal: false, reason: result.reason };
}

// ---------------------------------------------------------------------------
// Applying moves
// ---------------------------------------------------------------------------

interface ApplyResult {
  state: GameState;
  events: GameEvent[];
  /** True when the same player earned another roll. */
  extraTurn: 'capture' | 'own-color' | null;
}

/** Applies a legal move. Pure — returns a cloned state plus new events. */
export function applyMove(input: GameState, move: LegalMove): ApplyResult {
  const state: GameState = cloneState(input);
  const cfg = state.rulesConfig;
  const player = state.players[state.activeIndex];
  const color = player.color;
  const pawn = pawnById(state, move.pawnId)!;
  let seq = state.events.length;
  const events: GameEvent[] = [];

  // Captures first: every victim goes back to its base (first free slot).
  for (const victimId of move.capturedPawnIds) {
    const victim = pawnById(state, victimId)!;
    const victimPlayer = state.players.find((p) => p.color === victim.color)!;
    const slot = firstFreeSlot(victimPlayer.pawns, 'base') ?? 0;
    victim.pos = { area: 'base', index: slot };
    state.captures += 1;
    events.push({
      seq: seq++,
      turn: state.turn,
      kind: 'capture',
      player: color,
      pawnId: victim.id,
      capturedPawnId: victim.id,
      detail: `captured by ${pawn.id}`,
    });
  }

  // Move the pawn.
  pawn.pos = move.isFinish
    ? { area: 'home', index: firstFreeSlot(player.pawns, 'home') ?? 0 }
    : { ...move.to };

  events.push({
    seq: seq++,
    turn,
    kind: 'move',
    player: color,
    pawnId: pawn.id,
    from: move.from,
    to: pawn.pos,
    detail: move.isEntry ? 'entered the board' : move.isFinish ? 'went home' : 'moved',
  });

  if (move.isFinish) {
    events.push({
      seq: seq++,
      turn,
      kind: 'finish',
      player: color,
      pawnId: pawn.id,
      to: pawn.pos,
    });
  }

  // Win check: all pawns home.
  if (player.pawns.every((p) => p.pos.area === 'home')) {
    state.winner = color;
    state.phase = 'game-over';
    events.push({
      seq: seq++,
      turn,
      kind: 'game-over',
      player: color,
      detail: `${player.name} wins`,
    });
    state.events.push(...events);
    return { state, events };
  }

  state.phase = 'turn-end';
  state.events.push(...events);
  return { state, events };
}

export function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      pawns: p.pawns.map((pawn) => ({ ...pawn, pos: { ...pawn.pos } })),
    })),
    events: [...state.events],
  };
}

// ---------------------------------------------------------------------------
// Progress helpers (HUD & AI)
// ---------------------------------------------------------------------------

export interface PawnCounts {
  base: number;
  track: number;
  home: number;
}

export function pawnCounts(player: PlayerRuntime): PawnCounts {
  const counts: PawnCounts = { base: 0, track: 0, home: 0 };
  for (const pawn of player.pawns) counts[pawn.pos.area] += 1;
  return counts;
}

/** 0..1 progress of a pawn along its journey. */
export function pawnProgress(color: PlayerColorId, pos: Position): number {
  const idx = pathIndex(color, pos);
  return Math.max(0, Math.min(1, (idx + 1) / (RULES.trackFields + 1)));
}

/** How close a pawn is to finishing — used by the AI. */
export function pawnPathIndex(color: PlayerColorId, pos: Position): number {
  return pathIndex(color, pos);
}

export { LOOP, START_INDEX };
