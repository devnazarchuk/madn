import type { GameState, PawnState } from '../types';
import { pawnsOnTrack } from './occupancy';

/**
 * ============================================================================
 * DESTINATION VALIDATION — the landing-field rules (separate from passing).
 * ============================================================================
 * Blocking (intermediate fields) is never confused with capturing: a capture
 * happens ONLY on the destination, and only when the rules permit it.
 *
 * Outcome codes:
 *   'OK'                    — destination usable (empty, or capturable foes)
 *   'DESTINATION_OCCUPIED'  — an own pawn stands there (stacking disabled)
 *   'CAPTURE_DISABLED'      — an opponent stands there but bumping is off
 *   'PROTECTED_FIELD'       — an opponent stands on ITS OWN start field
 */

export type DestinationCheck =
  | 'OK'
  | 'DESTINATION_OCCUPIED'
  | 'CAPTURE_DISABLED'
  | 'PROTECTED_FIELD';

export interface DestinationResult {
  check: DestinationCheck;
  /** Opponent pawns standing on the destination (capturable when OK). */
  enemies: PawnState[];
}

/**
 * Validates a TRACK landing (regular move or entry onto a start field).
 * `protectedStarts` guards pawns standing on their OWN start field — an
 * opponent on MY start field is never protected.
 */
export function validateTrackDestination(
  state: GameState,
  destLoop: number,
  activeColor: string,
  opts: {
    captureEnabled: boolean;
    protectedStarts: boolean;
    friendlyStacking: boolean;
    startIndexOf: (color: string) => number;
  },
): DestinationResult {
  const occupants = pawnsOnTrack(state, destLoop);
  const own = occupants.filter((o) => o.color === activeColor);
  const enemies = occupants.filter((o) => o.color !== activeColor);

  if (own.length > 0 && !opts.friendlyStacking) {
    return { check: 'DESTINATION_OCCUPIED', enemies };
  }
  if (enemies.length > 0) {
    if (!opts.captureEnabled) return { check: 'CAPTURE_DISABLED', enemies };
    if (opts.protectedStarts && enemies.some((e) => opts.startIndexOf(e.color) === destLoop)) {
      return { check: 'PROTECTED_FIELD', enemies };
    }
  }
  return { check: 'OK', enemies };
}
