import { RULES } from '@/config/gameConfig';
import { START_INDEX, loopIndexFromPath } from '../board';
import { FIELD_COLORS } from '../boardTrackConfig';
import type { GameState, PlayerColorId, TrackColorId } from '../types';
import { pawnsOnTrack } from './occupancy';

/**
 * ============================================================================
 * PATH VALIDATION — the journey color model with the golden arrow gateway.
 * ============================================================================
 * A pawn's journey has 43 positions: 0..39 are the track fields relative to
 * the player's start; 40..42 are the home slots (slot 0 = the outer cell fed
 * straight from the arm tip, slot 2 = the golden winning cell). The COLOR of
 * every journey position follows the board's paint, so the rule a child can
 * see ("walk to the next field of the rolled color") is exactly the rule the
 * engine applies:
 *   • positions 0..39  — the woven track pattern FIELD_COLORS[(start + J)];
 *   • positions 40..42 — the player's OWN color (the home row is painted in
 *     it): the own color steps a pawn from the gateway into the row and then
 *     slot by slot onto the winning cell;
 *   • positions 43+    — the "virtual next lap": the woven pattern resumes past
 *     the goal. No pawn ever stands there — a roll whose next matching field
 *     lies past position 42 is recognized as carrying the pawn PAST the goal
 *     (the finish-rule boundary: 'exact' rejects it, 'flexible' completes).
 *
 * THE GOLDEN ARROW GATEWAY (kids-v6 — journey position 39, the arm tip with
 * the golden arrow inlay, = FINISH_TIP_INDEX in loop terms) is a MANDATORY
 * STOP on the way home, enforced inside matchingFieldAhead:
 *   1. NO SKIPPING — a pawn still on the track (positions 0..38) may only
 *      match fields up to and INCLUDING the gateway. A roll whose next
 *      matching field would lie beyond it (inside the home stretch or on the
 *      virtual lap) yields NO move for that pawn — even the player's OWN
 *      color cannot jump over the arrow straight into the row.
 *   2. STEP 1 — to move ONTO the gateway a pawn must roll the exact color of
 *      that arrow cell (every tip is a white or black platform: blue/red
 *      gates on BLACK, yellow/green on WHITE — the normal color-match rule).
 *   3. STEP 2 — a pawn STANDING on the gateway may only step onto the first
 *      cell of the home stretch (position 40, painted its own color) by
 *      rolling its OWN color (a resolved star may become it).
 *   4. NO LOOPING — from the gateway the search never reaches the virtual
 *      lap: foreign faces (colors, white, black) find no field at all, so a
 *      gateway pawn can never continue around the main board loop.
 *
 * Strict blocking (the default Classic rule): a pawn may never jump over
 * another pawn. The complete ordered path — track fields AND home slots — is
 * inspected step by step; only after every intermediate position is
 * confirmed empty may the move be considered (the destination itself is
 * validated separately, by validateDestination / the home-slot checks).
 */

/**
 * The last journey position — home slot 2, the golden winning cell.
 */
export const WINNING_POSITION = RULES.trackFields + RULES.homeSlots - 1; // 42

/**
 * The GOLDEN ARROW GATEWAY: the last track position of every circuit
 * (journey 39 = the arm tip with the golden arrow inlay, the loop cell
 * directly before the home row). A mandatory stop: no move may cross it
 * except stepping from it onto the first home cell with the own color.
 */
export const GATEWAY_POSITION = RULES.trackFields - 1; // 39

/**
 * The color of any journey position: the woven track pattern (player colors
 * AND the white/black platforms) for positions 0..39, the player's OWN color
 * for the home row 40..42 (the paint a child sees), and the resumed "virtual
 * next lap" pattern past the winning cell — how a roll is recognized as
 * carrying a pawn past the goal.
 */
export function journeyColor(color: PlayerColorId, journey: number): TrackColorId {
  if (journey >= RULES.trackFields && journey <= WINNING_POSITION) {
    // Inside the home stretch — the row is painted in the player's own color.
    return color;
  }
  const start = START_INDEX[color];
  const wrapped = ((journey % RULES.trackFields) + RULES.trackFields) % RULES.trackFields;
  return FIELD_COLORS[(start + wrapped) % FIELD_COLORS.length]!;
}

/**
 * Distance (1..15) to the NEXT journey position ahead showing the rolled
 * face — WITH the golden arrow gateway cap (see module docs):
 *   • from positions 0..38 (on the track): only fields up to and INCLUDING
 *     the gateway (position 39) are searched — the pawn can never skip over
 *     the arrow cell into the home stretch or stride through it past the
 *     goal. When no matching field remains before the gateway the result is
 *     -1: that pawn has NO move with this roll (the turn may be skipped).
 *     Every tip is a white or black platform, so reaching the gateway means
 *     rolling exactly that platform face (Step 1).
 *   • from position 39 (standing ON the gateway): only the FIRST home cell
 *     (position 40) is searched — it matches only the player's OWN color
 *     (or a resolved star). Foreign faces find nothing: the pawn may never
 *     continue around the main board loop (no looping).
 *   • from positions 40..41 (inside the home stretch): the search crosses
 *     the winning-cell boundary onto the virtual next lap (up to 15 ahead —
 *     the worst case from a home slot is 12). That is how a roll is
 *     recognized as carrying a pawn PAST the goal — the finish-rule
 *     boundary ('exact' rejects it, 'flexible' completes); the CALLER checks
 *     whether the target lies beyond the winning cell.
 * On the shared track every face lies 1..8 ahead (the woven pattern carries
 * 7 fields per player color and 6 white + 6 black platforms). Verified
 * exhaustively by the engine tests.
 */
export const MATCH_SEARCH_AHEAD = 15;

export function matchingFieldAhead(
  color: PlayerColorId,
  fromJourney: number,
  face: TrackColorId,
): number {
  // The golden arrow gateway cap — the mandatory stop before the home row.
  let cap = MATCH_SEARCH_AHEAD;
  if (fromJourney < GATEWAY_POSITION) {
    // On the track: destinations up to and including the gateway only.
    cap = GATEWAY_POSITION - fromJourney;
  } else if (fromJourney === GATEWAY_POSITION) {
    // Standing ON the gateway: only the first home cell is reachable —
    // and only with the player's own color (its paint). No looping.
    cap = 1;
  }
  for (let ahead = 1; ahead <= cap; ahead++) {
    if (journeyColor(color, fromJourney + ahead) === face) return ahead;
  }
  return -1; // no matching field within the pawn's legal reach this roll
}

/** True when ANY pawn stands on one of the TRACK fields [from..to] (path indices). */
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
 * The complete movement path (loop indices) for a pawn of `color` moving
 * between two TRACK path indices — the engine's authoritative, step-by-step
 * route. Used by the validation pipeline AND by the 3D layer so animations
 * follow the exact engine path. (Home-bound moves are walked by the 3D layer
 * via journey waypoints instead.)
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
 * destination is NOT part of this check. Covers the mixed track + home-slot
 * path of a home-bound move: track fields are checked via occupancy, home
 * slots via the player's own pawns (the row is private).
 */
export function intermediatePathClear(
  state: GameState,
  color: PlayerColorId,
  fromJourney: number,
  destJourney: number,
): boolean {
  if (destJourney <= fromJourney + 1) return true; // adjacent hop — no intermediates
  const player = state.players.find((p) => p.color === color)!;
  for (let j = fromJourney + 1; j < destJourney; j++) {
    if (j < RULES.trackFields) {
      // Track field: ANY pawn blocks (own or opponent).
      if (pawnsOnTrack(state, loopIndexFromPath(color, j)).length > 0) return false;
    } else {
      // Home slot: only the player's own pawns can block.
      const slot = j - RULES.trackFields;
      if (player.pawns.some((p) => p.pos.area === 'home' && p.pos.index === slot)) return false;
    }
  }
  return true;
}
