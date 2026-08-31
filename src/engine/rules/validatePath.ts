import { RULES } from '@/config/gameConfig';
import { loopIndexFromPath } from '../board';
import { FIELD_COLORS } from '../boardTrackConfig';
import type { GameState, PlayerColorId } from '../types';
import { pawnsOnTrack } from './occupancy';

/**
 * ============================================================================
 * PATH VALIDATION — every intermediate field between A and B must be free.
 * ============================================================================
 * Strict blocking (the default Classic rule): a pawn may never jump over
 * another pawn. The complete ordered path is inspected field by field —
 * only after every intermediate position is confirmed empty may the move be
 * considered (the destination itself is validated separately, by
 * validateDestination / validateHome).
 */

/** True when ANY pawn (own or opponent) stands on one of the path fields [from..to]. */
export function pathRangeOccupied(
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

/**
 * The complete movement path (loop indices) for a pawn of `color` moving from
 * path index `fromIdx` to path index `toIdx` — the engine's authoritative,
 * step-by-step route. Used by the validation pipeline AND by the 3D layer so
 * animations follow the exact engine path.
 */
export function calculateMovementPath(
  color: PlayerColorId,
  fromIdx: number,
  toIdx: number,
): number[] {
  const path: number[] = [];
  for (let p = fromIdx + 1; p <= toIdx; p++) {
    path.push(loopIndexFromPath(color, p));
  }
  return path;
}

/**
 * Intermediate-field check for strict blocking: every field BETWEEN the pawn
 * and its destination must be empty of pawns (own or opponent). The
 * destination is NOT part of this check.
 */
export function intermediatePathClear(
  state: GameState,
  color: PlayerColorId,
  fromIdx: number,
  destIdx: number,
): boolean {
  if (destIdx <= fromIdx + 1) return true; // adjacent hop — no intermediates
  return !pathRangeOccupied(state, color, fromIdx + 1, destIdx - 1);
}

/**
 * Distance (1..5) to the FIRST field ahead matching the rolled face, along
 * the pawn's remaining track — or -1 when no match remains (the pawn may then
 * enter its home row).
 */
export function matchingFieldAhead(
  color: PlayerColorId,
  fromIdx: number,
  face: PlayerColorId,
): number {
  for (let ahead = 1; fromIdx + ahead < RULES.trackFields; ahead++) {
    if (FIELD_COLORS[loopIndexFromPath(color, fromIdx + ahead)] === face) {
      return ahead;
    }
  }
  return -1;
}
