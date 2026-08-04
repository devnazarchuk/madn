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
  PawnState,
  PlayerRuntime,
  Position,
} from './types';

// ---------------------------------------------------------------------------
// Occupancy
// ---------------------------------------------------------------------------

/** Finds the pawn occupying a track field (any color) or null. */
export function pawnOnTrack(state: GameState, loopIdx: number): PawnState | null {
  for (const p of state.players) {
    for (const pawn of p.pawns) {
      if (pawn.pos.area === 'track' && pawn.pos.index === loopIdx) return pawn;
    }
  }
  return null;
}

function pawnAt(state: GameState, color: PlayerColorId, pos: Position): PawnState | null {
  const player = state.players.find((p) => p.color === color)!;
  return player.pawns.find((pawn) => pawn.pos.area === pos.area && pawn.pos.index === pos.index) ?? null;
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
// Legal move computation
// ---------------------------------------------------------------------------

/**
 * All legal moves for the active player after rolling `face`.
 * Pure function — never mutates state.
 */
export function getLegalMoves(state: GameState, face: DiceFaceId): LegalMove[] {
  const player = state.players[state.activeIndex];
  const color = player.color;
  const moves: LegalMove[] = [];

  const allInBase = player.pawns.every((pawn) => pawn.pos.area === 'base');
  const canEnterWithAny = RULES.fastStart && allInBase;

  for (const pawn of player.pawns) {
    if (pawn.pos.area === 'home') continue; // finished pawns never move

    if (pawn.pos.area === 'base') {
      // --- Entering the board -------------------------------------------
      if (face !== color && !canEnterWithAny) continue;
      const targetLoop = START_INDEX[color];
      const occupant = pawnOnTrack(state, targetLoop);
      if (occupant) {
        if (occupant.color === color) continue; // own pawn blocks entry
      }
      moves.push({
        pawnId: pawn.id,
        from: pawn.pos,
        to: { area: 'track', index: targetLoop },
        isEntry: true,
        isFinish: false,
        capturedPawnId: occupant && occupant.color !== color ? occupant.id : undefined,
        distance: 1,
      });
      continue;
    }

    // --- Moving on the track ---------------------------------------------
    const fromIdx = pathIndex(color, pawn.pos);
    // Scan forward along this pawn's remaining path for the rolled color.
    for (let ahead = 1; fromIdx + ahead < RULES.trackFields; ahead++) {
      const loopIdx = loopIndexFromPath(color, fromIdx + ahead);
      if (FIELD_COLORS[loopIdx] !== face) continue;
      // First matching field ahead.
      const occupant = pawnOnTrack(state, loopIdx);
      if (occupant && occupant.color === color) {
        // Own pawn blocks this pawn for this roll.
      } else {
        moves.push({
          pawnId: pawn.id,
          from: pawn.pos,
          to: { area: 'track', index: loopIdx },
          isEntry: false,
          isFinish: false,
          capturedPawnId: occupant ? occupant.id : undefined,
          distance: ahead,
        });
      }
      break; // only the FIRST matching field counts
    }

    // --- Going home --------------------------------------------------------
    // No matching color ahead → the pawn may enter its home row.
    const hasMatchAhead = (() => {
      for (let ahead = 1; fromIdx + ahead < RULES.trackFields; ahead++) {
        if (FIELD_COLORS[loopIndexFromPath(color, fromIdx + ahead)] === face) return true;
      }
      return false;
    })();
    if (!hasMatchAhead && RULES.homeMatchesAnyColor) {
      moves.push({
        pawnId: pawn.id,
        from: pawn.pos,
        to: { area: 'home', index: 0 }, // slot resolved on apply
        isEntry: false,
        isFinish: true,
        distance: RULES.trackFields - fromIdx,
      });
    }
  }

  return moves;
}

// ---------------------------------------------------------------------------
// Applying moves
// ---------------------------------------------------------------------------

interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

/** Applies a legal move. Pure — returns a cloned state plus new events. */
export function applyMove(input: GameState, move: LegalMove): ApplyResult {
  const state: GameState = cloneState(input);
  const player = state.players[state.activeIndex];
  const color = player.color;
  const pawn = pawnById(state, move.pawnId)!;
  let seq = state.events.length;
  let turn = state.turn;
  const events: GameEvent[] = [];

  // Capture first: the victim goes back to its base (first free slot).
  if (move.capturedPawnId) {
    const victim = pawnById(state, move.capturedPawnId)!;
    const victimPlayer = state.players.find((p) => p.color === victim.color)!;
    const slot = firstFreeSlot(victimPlayer.pawns, 'base') ?? 0;
    victim.pos = { area: 'base', index: slot };
    state.captures += 1;
    events.push({
      seq: seq++,
      turn,
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
