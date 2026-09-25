import { RULES, type TrackColorId } from '@/config/gameConfig';
import { loopIndexFromPath, pathIndex, START_INDEX } from './board';
import { FIELD_COLORS } from './boardTrackConfig';
import { pawnsOnTrack } from './rules';
import { getLegalMoves, starOptions } from './rules/legalMoves';
import type { AiLevel, GameState, LegalMove } from './types';

/**
 * ============================================================================
 * AI OPPONENTS — use the exact same legal-move validation as humans.
 * ============================================================================
 * easy   → random legal move
 * medium → heuristic: finish > home-advance > capture > progress > enter
 * hard   → medium + risk analysis (how likely is my pawn to be captured?) +
 *          denial value of captures (victim's progress)
 *
 * The AI can never bypass the rules engine: it only ever receives moves from
 * getLegalMoves(), which honours the active rules configuration (blocking,
 * protection, stacking, capturing, extra rolls) automatically. A star roll
 * (Star Mode only) is resolved through the same enumeration the UI offers:
 * every legal color is considered, and the resolution is recorded through the
 * engine's resolveStarFace like any human choice.
 */

interface ScoredMove {
  move: LegalMove;
  score: number;
}

/**
 * How many die faces (colors + platforms + star, whichever the mode's die
 * carries) would let ANY opponent pawn land on the given loop field next
 * turn (approximation used by the hard level).
 */
function threatOn(state: GameState, loopIdx: number, myColor: string): number {
  const cfg = state.rulesConfig;
  // Without captures nobody can land on us at all.
  if (!cfg.captureEnabled) return 0;
  // A pawn on its OWN start field is safe when protection is on.
  if (cfg.protectedStarts && START_INDEX[myColor as keyof typeof START_INDEX] === loopIdx) {
    return 0;
  }
  const capturingFaces = new Set<string>();
  for (const player of state.players) {
    if (player.color === myColor) continue;
    for (const pawn of player.pawns) {
      if (pawn.pos.area !== 'track') continue;
      const fromIdx = pathIndex(player.color, pawn.pos);
      // The woven track guarantees every face re-occurs within 8 fields
      // (7 fields per player color, 6 white + 6 black platforms) — and the
      // < trackFields bound mirrors the golden arrow gateway cap: no
      // opponent can ever land beyond their own arrow in ONE move.
      for (let ahead = 1; ahead <= 8 && fromIdx + ahead < RULES.trackFields; ahead++) {
        const target = loopIndexFromPath(player.color, fromIdx + ahead);
        if (target === loopIdx) {
          capturingFaces.add(FIELD_COLORS[target]!);
          break; // a given target is exactly one distance from this pawn
        }
      }
    }
  }
  // Only a STAR-mode die carries the wild face that can imitate any color
  // that reaches us — the standard die has no stars.
  if (cfg.starMode && capturingFaces.size > 0) capturingFaces.add('star');
  return capturingFaces.size;
}

function victimProgress(state: GameState, move: LegalMove): number {
  let total = 0;
  for (const player of state.players) {
    for (const pawn of player.pawns) {
      if (move.capturedPawnIds.includes(pawn.id)) {
        total += pathIndex(player.color, pawn.pos);
      }
    }
  }
  return total;
}

function scoreMove(state: GameState, move: LegalMove, level: AiLevel): number {
  let score = 0;

  // Finishing a pawn (stepping into the home row) is almost always best.
  if (move.isFinish) score += 120;
  // Walking home pawns deeper is necessary work — it frees the mouth slot
  // for the pawns still waiting behind.
  if (move.isHomeAdvance) score += 38;
  // Capturing feels great and removes an enemy from the board.
  if (move.capturedPawnIds.length > 0) score += 70;
  // The further the victims had traveled, the sweeter the capture.
  score += victimProgress(state, move) * 1.2;
  // General progress.
  score += move.distance * 3;
  // Getting another pawn onto the board keeps options open.
  if (move.isEntry) score += 34;
  // Extra-roll rewards make capturing even better.
  if (state.rulesConfig.extraTurnOnCapture && move.capturedPawnIds.length > 0) score += 30;

  if (level === 'hard') {
    const color = state.players[state.activeIndex]!.color;
    // Risk: landing where opponents can reach us next turn.
    if (move.to.area === 'track') {
      const threat = threatOn(state, move.to.index, color);
      score -= threat * 16;
      // Stacked towers are juicy targets — an opponent bumps ALL of them.
      const stackMates = pawnsOnTrack(state, move.to.index).filter(
        (p) => p.color === color,
      ).length;
      if (state.rulesConfig.friendlyStacking && stackMates > 0) {
        score -= 10 * stackMates;
      }
      // Keep a small preference for advancing the rear-most pawn
      // (keeps the team together and defends the leader).
      const fromIdx = move.from.area === 'base' ? -1 : pathIndex(color, move.from);
      score += (39 - fromIdx) * 0.15;
    }
    // Denial: entering the board can block an opponent's capture lane.
    if (move.isEntry && move.capturedPawnIds.length > 0) score += 25;
  }

  return score;
}

function bestOf(state: GameState, moves: LegalMove[], level: AiLevel): LegalMove | null {
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0]!;
  if (level === 'easy') {
    return moves[Math.floor(Math.random() * moves.length)]!;
  }
  const scored: ScoredMove[] = moves.map((move) => ({
    move,
    score: scoreMove(state, move, level) + Math.random() * 4,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.move;
}

/** Pick the best move for the active player from the given legal moves. */
export function chooseAiMove(state: GameState, moves: LegalMove[]): LegalMove | null {
  if (moves.length === 0) return null;
  const level = state.players[state.activeIndex]!.aiLevel;
  return bestOf(state, moves, level);
}

/** The AI's chosen color for a pending star roll (null = no productive color). */
export function chooseAiStarColor(state: GameState): TrackColorId | null {
  if (state.diceFace !== 'star') return null;
  const level = state.players[state.activeIndex]!.aiLevel;
  const options = starOptions(state);
  if (options.length === 0) return null;
  if (options.length === 1) return options[0]!;
  if (level === 'easy') {
    return options[Math.floor(Math.random() * options.length)]!;
  }
  // Score every (color × move) combination exactly as a human could pick.
  let bestColor: TrackColorId | null = null;
  let bestScore = -Infinity;
  for (const color of options) {
    const probe: GameState = { ...state, diceFace: color };
    for (const move of getLegalMoves(probe)) {
      const s = scoreMove(probe, move, level) + Math.random() * 4;
      if (s > bestScore) {
        bestScore = s;
        bestColor = color;
      }
    }
  }
  return bestColor ?? options[0]!;
}
