import { RULES, TRACK_COLORS } from '@/config/gameConfig';
import { loopIndexFromPath, pathIndex, START_INDEX } from '../board';
import type {
  GameState,
  LegalMove,
  MoveRejectionReason,
  MoveValidation,
  PawnState,
  PlayerColorId,
  PlayerRuntime,
  TrackColorId,
} from '../types';
import { homeSlotOccupied } from './occupancy';
import {
  GATEWAY_POSITION,
  intermediatePathClear,
  matchingFieldAhead,
  WINNING_POSITION,
} from './validatePath';
import { validateTrackDestination } from './validateDestination';

/**
 * ============================================================================
 * LEGAL-MOVE PIPELINE — the single authoritative evaluation of a pawn's
 * options for the CURRENT dice result (the engine's own diceFace — never a
 * value supplied by the presentation layer).
 * ============================================================================
 * One rule drives everything: "walk to the next field showing the rolled
 * face", measured along the pawn's 43-position journey (40 track fields,
 * woven from the four player colors AND the white/black platforms, plus the
 * 3 home slots painted in the player's own color) — WITH the golden arrow
 * gateway as a MANDATORY STOP before the home stretch (kids-v6):
 *   • a track pawn may only land up to and INCLUDING the gateway (J39);
 *     reaching the gateway requires rolling that arrow cell's exact color;
 *   • from the gateway only the OWN color (or a resolved star) steps onto
 *     the first home cell — there is never a loop back onto the track;
 *   • a roll whose match lies beyond the pawn's reach yields NO_MATCH_AHEAD.
 * Inside the home stretch every finish slot holds strictly ONE pawn (even
 * with friendly stacking enabled for the main track); the golden winning
 * cell keeps its first finisher forever, later pawns park behind it.
 * Stages, in order:
 *   1. pawn belongs to the ACTIVE player          → PAWN_NOT_OWNED_BY_ACTIVE_PLAYER
 *   2. a dice result exists                       → NO_DICE_RESULT
 *   3. a star is resolved to a concrete color     → STAR_UNRESOLVED
 *   3b. plain foreign color (own-color rule on)   → WRONG_DICE_COLOR
 *   4. entry color match (base pawns)             → WRONG_DICE_COLOR
 *   5. every intermediate position free (strict) → PATH_BLOCKED
 *   6. destination occupancy / capture            → DESTINATION_OCCUPIED /
 *      CAPTURE_DISABLED / PROTECTED_FIELD / FINISH_LANE_BLOCKED
 *   7. finish boundary: a roll carrying a pawn    → MOVE_EXCEEDS_FINISH ('exact')
 *      PAST the golden winning cell is only legal
 *      with the flexible finish rule              / PAWN_FINISHED
 *
 * Pure functions throughout — no validation ever mutates the state. A move is
 * only offered (or applied) after the WHOLE path is confirmed legal.
 */

interface PawnEvaluation {
  move?: LegalMove;
  reason?: MoveRejectionReason;
}

/**
 * Whether a base pawn may leave with the given (resolved) face. White and
 * black are PLATFORM faces, not player colors: under the own-color rule they
 * never authorize an entry (any-color entry and the first-pawn assist accept
 * them like any other face).
 */
export function canEnterBoard(
  player: PlayerRuntime,
  face: TrackColorId,
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

  // --- Stage 3b: color-match turns -------------------------------------------
  // A PLAIN roll of a foreign color voids the whole turn — but a golden star
  // is wild and may become any color, stars are exempt even here.
  if (cfg.ownColorToMove && !state.diceFromStar && face !== color) {
    return { reason: 'WRONG_DICE_COLOR' };
  }

  const strictBlocking = cfg.passingRule === 'strict-blocking';
  const flexibleFinish = cfg.finishRule === 'flexible';
  const lastSlot = RULES.homeSlots - 1;

  // --- Home pawns: walk the home stretch by the same rule. NOTE: inside the
  //     finishing zone NOBODY may ever be passed — the intermediate check is
  //     UNCONDITIONAL here (it never depends on the strict-blocking rule):
  //     every finish slot holds one pawn and no pawn jumps over another,
  //     not even with free passing on the main track or a flexible finish. --
  if (pawn.pos.area === 'home') {
    if (pawn.pos.index >= lastSlot) return { reason: 'PAWN_FINISHED' };
    const fromJourney = RULES.trackFields + pawn.pos.index;
    const d = matchingFieldAhead(color, fromJourney, face, state.layout);
    if (d === -1) return { reason: 'PATH_BLOCKED' }; // unreachable (tests verify)
    const target = fromJourney + d;
    if (target > WINNING_POSITION) {
      // The roll carries the pawn PAST the golden winning cell.
      if (!flexibleFinish) return { reason: 'MOVE_EXCEEDS_FINISH' };
      // Flexible finish: the pawn completes — clamped onto the winning cell.
      // Home-stretch blocking is ABSOLUTE: a teammate between the pawn and
      // the golden cell is never jumped over (under ANY passing rule).
      if (!intermediatePathClear(state, color, fromJourney, WINNING_POSITION)) {
        return { reason: 'PATH_BLOCKED' };
      }
      // One pawn per finish cell: the golden winning cell must be FREE —
      // its first finisher stands on it forever.
      if (homeSlotOccupied(player, lastSlot)) {
        return { reason: 'FINISH_LANE_BLOCKED' };
      }
      return {
        move: {
          pawnId: pawn.id,
          from: { ...pawn.pos },
          to: { area: 'home', index: lastSlot },
          isEntry: false,
          isFinish: true,
          isHomeAdvance: false,
          capturedPawnIds: [],
          distance: WINNING_POSITION - fromJourney,
        },
      };
    }
    const destSlot = target - RULES.trackFields;
    // ABSOLUTE home-stretch no-passing: every slot between the pawn and its
    // destination must be empty regardless of the active passing rule.
    if (!intermediatePathClear(state, color, fromJourney, target)) {
      return { reason: 'PATH_BLOCKED' };
    }
    // STRICT one pawn per finish cell — the golden winning cell included
    // (no "finish shelf": later pawns park behind the first finisher).
    if (homeSlotOccupied(player, destSlot)) {
      return { reason: 'FINISH_LANE_BLOCKED' };
    }
    return {
      move: {
        pawnId: pawn.id,
        from: { ...pawn.pos },
        to: { area: 'home', index: destSlot },
        isEntry: false,
        isFinish: destSlot === lastSlot,
        isHomeAdvance: destSlot < lastSlot,
        capturedPawnIds: [],
        distance: d,
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

  // --- Moving on the track: the next matching field within the gateway cap ----
  const fromJourney = pathIndex(color, pawn.pos); // 0..39
  const d = matchingFieldAhead(color, fromJourney, face, state.layout);
  if (d === -1) {
    // The golden arrow gateway is a MANDATORY STOP: the next field showing
    // this face lies beyond the pawn's legal reach — past the arrow cell
    // (inside the home stretch or on the virtual lap). Even the player's
    // OWN color cannot jump over the gateway into the row; the pawn must
    // wait for a roll it can use (Step 1: the arrow cell's exact color).
    return { reason: 'NO_MATCH_AHEAD' };
  }
  const target = fromJourney + d; // ≤ 40: a track field or the first home cell

  // --- A landing still on the shared track (the arrow gateway included) ------
  if (target <= GATEWAY_POSITION) {
    const destLoop = loopIndexFromPath(color, target);
    // Stage 5 (strict blocking): every intermediate field must be EMPTY.
    if (strictBlocking && !intermediatePathClear(state, color, fromJourney, target)) {
      return { reason: 'PATH_BLOCKED' };
    }
    // Stage 6: destination occupancy.
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
        distance: d,
      },
    };
  }

  // --- The ONLY crossing: standing ON the gateway (J39) and stepping onto the
  //     first cell of the home stretch (slot 0) — reachable solely with the
  //     color painted on slot 0 (the own color in the classic layout, that
  //     cell's random paint in the Full Random map): the gateway cap inside
  //     matchingFieldAhead guarantees the face matches slot 0's paint, and a
  //     foreign roll can never loop back onto the track. The stretch is
  //     entered ONLY onto an EMPTY slot 0 — the absolute one-pawn rule. ------
  const destSlot = target - RULES.trackFields;
  // Home-stretch blocking is ABSOLUTE (under any passing rule).
  if (!intermediatePathClear(state, color, fromJourney, target)) {
    return { reason: 'PATH_BLOCKED' };
  }
  // STRICT one pawn per finish cell (even with friendlyStacking enabled for
  // the main track) — slot 0 must be free to step in.
  if (homeSlotOccupied(player, destSlot)) {
    return { reason: 'FINISH_LANE_BLOCKED' };
  }
  return {
    move: {
      pawnId: pawn.id,
      from: { ...pawn.pos },
      to: { area: 'home', index: destSlot },
      isEntry: false,
      isFinish: false,
      isHomeAdvance: true,
      capturedPawnIds: [],
      distance: d,
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

/**
 * Which of the six track colors (four player colors + white + black) the
 * active player may resolve a star to — only the productive ones. Star Mode
 * is the only ruleset whose die carries stars; the enumeration is generic
 * and works in both modes.
 */
export function starOptions(state: GameState): TrackColorId[] {
  if (state.diceFace !== 'star') return [];
  const options: TrackColorId[] = [];
  for (const candidate of TRACK_COLORS) {
    if (getLegalMoves({ ...state, diceFace: candidate }).length > 0) options.push(candidate);
  }
  return options;
}

/** Legal moves for every star resolution (color) that yields any. */
export function starLegalMoves(
  state: GameState,
): Array<{ color: TrackColorId; moves: LegalMove[] }> {
  return starOptions(state).map((color) => ({
    color,
    moves: getLegalMoves({ ...state, diceFace: color }),
  }));
}
