import { RULES, type DiceFaceId } from '@/config/gameConfig';
import {
  FIELD_COLORS,
  loopIndexFromPath,
  pathIndex,
  START_INDEX,
} from './board';
import { pawnsOnTrack } from './rules';
import type { AiLevel, GameState, LegalMove } from './types';

/**
 * ============================================================================
 * AI OPPONENTS — use the exact same legal-move validation as humans.
 * ============================================================================
 * easy   → random legal move
 * medium → heuristic: finish > capture > progress > enter
 * hard   → medium + risk analysis (how likely is my pawn to be captured?) +
 *          denial value of captures (victim's progress)
 *
 * The AI can never bypass the rules engine: it only ever receives moves from
 * getLegalMoves(), which honours the active rules configuration (blocking,
 * protection, stacking, capturing, extra rolls) automatically.
 */

interface ScoredMove {
  move: LegalMove;
  score: number;
}

/**
 * How many die faces would let ANY opponent pawn land on the given loop field
 * next turn (approximation used by the hard level)?
 */
function threatOn(state: GameState, loopIdx: number, myColor: string): number {
  const cfg = state.rulesConfig;
  // Without captures nobody can land on us at all.
  if (!cfg.captureEnabled) return 0;
  // A pawn on its OWN start field is safe when protection is on.
  if (cfg.protectedStarts && START_INDEX[myColor as keyof typeof START_INDEX] === loopIdx) {
    return 0;
  }
  const capturingColors = new Set<DiceFaceId>();
  for (const player of state.players) {
    if (player.color === myColor) continue;
    for (const pawn of player.pawns) {
      if (pawn.pos.area !== 'track') continue;
      const fromIdx = pathIndex(player.color, pawn.pos);
      for (let ahead = 1; ahead <= 6 && fromIdx + ahead < RULES.trackFields; ahead++) {
        const target = loopIndexFromPath(player.color, fromIdx + ahead);
        if (target === loopIdx) {
          capturingColors.add(FIELD_COLORS[target]!);
        }
      }
    }
  }
  // Every color is one face of six; no wildcards in this edition.
  return capturingColors.size;
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

export function chooseAiMove(state: GameState, moves: LegalMove[]): LegalMove | null {
  if (moves.length === 0) return null;
  const level = state.players[state.activeIndex]!.aiLevel;
  if (moves.length === 1) return moves[0]!;

  if (level === 'easy') {
    return moves[Math.floor(Math.random() * moves.length)]!;
  }

  const color = state.players[state.activeIndex]!.color;
  const scored: ScoredMove[] = moves.map((move) => {
    let score = 0;

    // Finishing a pawn is almost always best.
    if (move.isFinish) score += 120;
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

    return { move, score: score + Math.random() * 4 };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.move;
}
