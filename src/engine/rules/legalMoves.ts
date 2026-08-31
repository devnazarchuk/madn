import { PLAYER_COLORS, RULES, type PlayerColorId } from '@/config/gameConfig';
import { loopIndexFromPath, pathIndex, START_INDEX } from '../board';
import type {
  GameState,
  LegalMove,
  MoveRejectionReason,
  MoveValidation,
  PawnState,
  PlayerRuntime,
} from '../types';
import { homeSlotOccupied } from './occupancy';
import { intermediatePathClear, matchingFieldAhead, pathRangeOccupied } from './validatePath';
import { validateTrackDestination } from './validateDestination';

/**
 * ============================================================================
 * LEGAL-MOVE PIPELINE — the single authoritative evaluation of a pawn's
 * options for the CURRENT dice result (the engine's own diceFace — never a
 * value supplied by the presentation layer).
 * ============================================================================
 * Stages, in order:
 *   1. pawn belongs to the ACTIVE player          → PAWN_NOT_OWNED_BY_ACTIVE_PLAYER
 *   2. a dice result exists                       → NO_DICE_RESULT
 *   3. a star is resolved to a concrete color    → STAR_UNRESOLVED
 *   4. entry color match (base pawns)            → WRONG_DICE_COLOR
 *   5. every intermediate field free (strict)     → PATH_BLOCKED
 *   6. destination occupancy / capture           → DESTINATION_OCCUPIED /
 *      CAPTURE_DISABLED / PROTECTED_FIELD
 *   7. home-lane boundary / queue                → FINISH_LANE_BLOCKED /
 *      MOVE_EXCEEDS_FINISH / PAWN_FINISHED
 *
 * Pure functions throughout — no validation ever mutates the state. A move is
 * only offered (or applied) after the WHOLE path is confirmed legal.
 */

interface PawnEvaluation {
  move?: LegalMove;
  reason?: MoveRejectionReason;
}

/** Whether a base pawn may leave with the given (resolved) face. */
export function canEnterBoard(
  player: PlayerRuntime,
  face: PlayerColorId,
  rules: { entryRule: 'own-color' | 'any-color'; entryAssist: boolean },
): boolean {
  if (rules.entryRule === 'any-color') return true;
  if (face === player.color) return true; // own color (a resolved star may be it)
  if (rules.entryAssist) {
    // Variant: while ALL own pawns still wait in the base, any color lets the
    // first one out. OFF in the Classic default — a wrong color rejects entry.
    return player.pawns.every((p) => p.pos.area === 'base');
  }
  return false;
}

/**
 * Resolves what the given pawn may do with the ACTIVE dice result under the
 * ACTIVE rules. Pure; never mutates state.
 */
function evaluatePawn(state: GameState, pawn: PawnState): PawnEvaluation {
  const cfg = state.rulesConfig;
  const player = state.players[state.activeIndex]!;
  const color = player.color;

  // --- Stage 1: ownership ----------------------------------------------------
  if (pawn.color !== color) return { reason: 'PAWN_NOT_OWNED_BY_ACTIVE_PLAYER' };

  // --- Stages 2–3: dice result & star resolution -----------------------------
  const face = state.diceFace;
  if (!face) return { reason: 'NO_DICE_RESULT' };
  if (face === 'star') return { reason: 'STAR_UNRESOLVED' };

  // --- Home pawns: walk one slot deeper (home matches every color) ----------
  if (pawn.pos.area === 'home') {
    const lastSlot = RULES.homeSlots - 1;
    if (pawn.pos.index >= lastSlot) return { reason: 'MOVE_EXCEEDS_FINISH' };
    const next = pawn.pos.index + 1;
    if (homeSlotOccupied(player, next)) return { reason: 'FINISH_LANE_BLOCKED' };
    return {
      move: {
        pawnId: pawn.id,
        from: { ...pawn.pos },
        to: { area: 'home', index: next },
        isEntry: false,
        isFinish: false,
        isHomeAdvance: true,
        capturedPawnIds: [],
        distance: 1,
      },
    };
  }

  // --- Leaving the base (entry) ----------------------------------------------
  if (pawn.pos.area === 'base') {
    // Stage 4: the dice result must AUTHORIZE the entry.
    if (!canEnterBoard(player, face, cfg)) return { reason: 'WRONG_DICE_COLOR' };

    const targetLoop = START_INDEX[color];
    // Stages 5–6 for the entry landing (leaving the base steps directly onto
    // the start field — there are no intermediate track fields).
    const dest = validateTrackDestination(state, targetLoop, color, {
      captureEnabled: cfg.captureEnabled,
      protectedStarts: cfg.protectedStarts,
      friendlyStacking: cfg.friendlyStacking,
      startIndexOf: (c) => START_INDEX[c as PlayerColorId],
    });
    if (dest.check === 'DESTINATION_OCCUPIED') return { reason: 'DESTINATION_OCCUPIED' };
    if (dest.check === 'CAPTURE_DISABLED') return { reason: 'CAPTURE_DISABLED' };
    if (dest.check === 'PROTECTED_FIELD') return { reason: 'PROTECTED_FIELD' };

    return {
      move: {
        pawnId: pawn.id,
        from: { ...pawn.pos },
        to: { area: 'track', index: targetLoop },
        isEntry: true,
        isFinish: false,
        isHomeAdvance: false,
        capturedPawnIds: dest.enemies.map((e) => e.id),
        distance: 1,
      },
    };
  }

  // --- Moving on the track ---------------------------------------------------
  const fromIdx = pathIndex(color, pawn.pos);
  const matched = matchingFieldAhead(color, fromIdx, face);

  // --- Going home: no matching color remains ahead (assumption A8) ---------
  if (matched === -1) {
    if (!RULES.homeMatchesAnyColor) return { reason: 'PATH_BLOCKED' };
    // Stage 5 (strict): the remaining track fields must be clear on the way in.
    if (
      cfg.passingRule === 'strict-blocking' &&
      pathRangeOccupied(state, color, fromIdx + 1, RULES.trackFields - 1)
    ) {
      return { reason: 'PATH_BLOCKED' };
    }
    // Stage 7: the mouth slot (home slot 0) must be free.
    if (homeSlotOccupied(player, 0)) return { reason: 'FINISH_LANE_BLOCKED' };
    return {
      move: {
        pawnId: pawn.id,
        from: { ...pawn.pos },
        to: { area: 'home', index: 0 },
        isEntry: false,
        isFinish: true,
        isHomeAdvance: false,
        capturedPawnIds: [],
        distance: RULES.trackFields - fromIdx,
      },
    };
  }

  const destIdx = fromIdx + matched;
  const destLoop = loopIndexFromPath(color, destIdx);

  // --- Stage 5 (strict blocking): every intermediate field must be EMPTY ---
  if (
    cfg.passingRule === 'strict-blocking' &&
    !intermediatePathClear(state, color, fromIdx, destIdx)
  ) {
    return { reason: 'PATH_BLOCKED' };
  }

  // --- Stage 6: destination occupancy ----------------------------------------
  const dest = validateTrackDestination(state, destLoop, color, {
    captureEnabled: cfg.captureEnabled,
    protectedStarts: cfg.protectedStarts,
    friendlyStacking: cfg.friendlyStacking,
    startIndexOf: (c) => START_INDEX[c as PlayerColorId],
  });
  if (dest.check === 'DESTINATION_OCCUPIED') return { reason: 'DESTINATION_OCCUPIED' };
  if (dest.check === 'CAPTURE_DISABLED') return { reason: 'CAPTURE_DISABLED' };
  if (dest.check === 'PROTECTED_FIELD') return { reason: 'PROTECTED_FIELD' };

  return {
    move: {
      pawnId: pawn.id,
      from: { ...pawn.pos },
      to: { area: 'track', index: destLoop },
      isEntry: false,
      isFinish: false,
      isHomeAdvance: false,
      capturedPawnIds: dest.enemies.map((e) => e.id),
      distance: matched,
    },
  };
}

/**
 * All legal moves for the ACTIVE player for the ACTIVE dice result.
 * Pure function — never mutates state. Reads the result from the engine's own
 * `state.diceFace` (the single authoritative dice result).
 */
export function getLegalMoves(state: GameState): LegalMove[] {
  const player = state.players[state.activeIndex]!;
  const moves: LegalMove[] = [];
  for (const pawn of player.pawns) {
    const result = evaluatePawn(state, pawn);
    if (result.move) moves.push(result.move);
  }
  return moves;
}

/**
 * Authoritative validation for ONE pawn — used for child-friendly feedback.
 * Returns the move when legal, otherwise a structured rejection reason.
 * Only meaningful while a dice result is pending (choose-pawn); stale or
 * absent results can never validate a move.
 */
export function validateMove(state: GameState, pawnId: string): MoveValidation {
  if (state.phase !== 'choose-pawn') return { legal: false };
  const player = state.players[state.activeIndex]!;
  const pawn = player.pawns.find((p) => p.id === pawnId);
  if (!pawn) return { legal: false, reason: 'PAWN_NOT_OWNED_BY_ACTIVE_PLAYER' };
  const result = evaluatePawn(state, pawn);
  return result.move ? { legal: true, move: result.move } : { legal: false, reason: result.reason };
}

// ---------------------------------------------------------------------------
// Star (wild) resolution — the enumeration helpers for the picker & the AI
// ---------------------------------------------------------------------------

/** Which of the four colors the active player may resolve a star to. */
export function starOptions(state: GameState): PlayerColorId[] {
  if (state.diceFace !== 'star') return [];
  const options: PlayerColorId[] = [];
  for (const candidate of PLAYER_COLORS) {
    if (getLegalMoves({ ...state, diceFace: candidate }).length > 0) options.push(candidate);
  }
  return options;
}

/** Legal moves for every star resolution (color) that yields any. */
export function starLegalMoves(state: GameState): Array<{ color: PlayerColorId; moves: LegalMove[] }> {
  return starOptions(state).map((color) => ({
    color,
    moves: getLegalMoves({ ...state, diceFace: color }),
  }));
}
