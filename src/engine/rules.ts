import { LOOP, START_INDEX, journeyIndex } from './board';
import { FIELD_COLORS, HOME_COLORS } from './boardTrackConfig';
import { RULES } from '@/config/gameConfig';
import { pawnsOnTrack as pawnsOnTrackSrc } from './rules/occupancy';
import type { GameState, PawnState, PlayerColorId, PlayerRuntime, Position } from './types';

/**
 * ============================================================================
 * RULES — the public facade of the authoritative validation system.
 * ============================================================================
 * The implementation lives in focused modules under engine/rules/ (mirroring
 * the validation pipeline):
 *   rules/occupancy.ts           — logical board occupancy (pawns per position)
 *   rules/validatePath.ts        — the journey color model + path checks
 *   rules/validateDestination.ts — landing-field rules (capture eligibility)
 *   rules/legalMoves.ts          — the per-pawn pipeline: getLegalMoves,
 *                                  validateMove, star resolution options
 *   rules/applyMove.ts           — the atomic state transition + events
 *
 * Humans, the AI and the animations all consume THIS module — nothing else
 * ever decides whether a move is legal.
 */

export {
  pawnsOnTrack,
  pawnsOfColorOnTrack,
  pawnById,
  playerOf,
  cloneState,
  homeRowPacked,
} from './rules/occupancy';
export {
  getLegalMoves,
  validateMove,
  canEnterBoard,
  starOptions,
  starLegalMoves,
} from './rules/legalMoves';
export { applyMove } from './rules/applyMove';
export {
  calculateMovementPath,
  journeyColor,
  matchingFieldAhead,
  intermediatePathClear,
  pathRangeOccupied,
  GATEWAY_POSITION,
  WINNING_POSITION,
} from './rules/validatePath';

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

/** 0..1 progress of a pawn along its full 43-position journey (goal = 1). */
export function pawnProgress(color: PlayerColorId, pos: Position): number {
  const idx = journeyIndex(color, pos);
  const length = RULES.trackFields + RULES.homeSlots; // 43
  return Math.max(0, Math.min(1, (idx + 1) / length));
}

/** How close a pawn is to finishing — used by the AI. */
export function pawnPathIndex(color: PlayerColorId, pos: Position): number {
  return journeyIndex(color, pos);
}

/** True when the pawn stands finished on the golden winning cell — the row's
 * first finisher, which stands there forever (later pawns park behind it). */
export function isPawnFinished(pawn: PawnState): boolean {
  return pawn.pos.area === 'home' && pawn.pos.index === RULES.homeSlots - 1;
}

/**
 * Slot index of a pawn among the pawns sharing its position (for stack
 * offsets) — track towers ("pawn towers") only: since kids-v6 every finish
 * cell inside the home stretch holds strictly ONE pawn, so home pawns never
 * stack (the finish-shelf branch merely keeps legacy saves readable).
 */
export function stackIndex(state: GameState, pawn: PawnState): number {
  const finished = isPawnFinished(pawn);
  if (pawn.pos.area !== 'track' && !finished) return 0;
  const sameArea = (p: PawnState) =>
    finished ? isPawnFinished(p) : p.pos.area === 'track' && p.pos.index === pawn.pos.index;
  const sharing = state.players
    .flatMap((p) => p.pawns)
    .filter((p) => p.color === pawn.color && sameArea(p))
    .sort((a, b) => a.id.localeCompare(b.id));
  return Math.max(0, sharing.findIndex((p) => p.id === pawn.id));
}

export {
  LOOP,
  START_INDEX,
  FIELD_COLORS,
  HOME_COLORS,
  journeyIndex,
};
