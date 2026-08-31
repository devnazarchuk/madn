import { LOOP, START_INDEX, pathIndex } from './board';
import { FIELD_COLORS } from './boardTrackConfig';
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
 *   rules/validatePath.ts        — intermediate path checks + movement paths
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
  matchingFieldAhead,
  intermediatePathClear,
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

/** 0..1 progress of a pawn along its journey. */
export function pawnProgress(color: PlayerColorId, pos: Position): number {
  const idx = pathIndex(color, pos);
  return Math.max(0, Math.min(1, (idx + 1) / (RULES.trackFields + 1)));
}

/** How close a pawn is to finishing — used by the AI. */
export function pawnPathIndex(color: PlayerColorId, pos: Position): number {
  return pathIndex(color, pos);
}

/** Slot index of a pawn among the pawns sharing its field (for stack offsets). */
export function stackIndex(state: GameState, pawn: PawnState): number {
  if (pawn.pos.area !== 'track') return 0;
  const sharing = pawnsOnTrack(state, pawn.pos.index)
    .filter((p) => p.color === pawn.color)
    .sort((a, b) => a.id.localeCompare(b.id));
  return Math.max(0, sharing.findIndex((p) => p.id === pawn.id));
}

export { LOOP, START_INDEX };
