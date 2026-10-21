import { diceFacesFor, type DiceFaceId, type PlayerColorId, type TrackColorId } from '@/config/gameConfig';
import type { GameState } from './types';
import { getLegalMoves } from './rules/legalMoves';
import { applyMove } from './rules/applyMove';

/** Deterministic, seedable RNG (mulberry32) so games are replayable. */
export function nextRandom(state: number): { value: number; next: number } {
  let t = (state + 0x6d2b79f5) | 0;
  let r = t;
  r = Math.imul(r ^ (r >>> 15), r | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return { value, next: t };
}

/**
 * Rolls one face of the match's die. Standard mode (starMode OFF): the four
 * player colors + WHITE + BLACK (the platform faces). Star Mode: the four
 * colors + two golden STAR wilds. `diceFacesFor` is the single source of the
 * face list — the engine and the 3D die agree on it by construction.
 */
export function rollDieFace(
  rngState: number,
  starMode: boolean,
): { face: DiceFaceId; next: number } {
  const { value, next } = nextRandom(rngState);
  const faces = diceFacesFor(starMode);
  const face = faces[Math.floor(value * faces.length)]!;
  return { face, next };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31) | 0;
}

// ---------------------------------------------------------------------------
// CERAMIC DICE — the optional pseudo-random / weighted "smart luck" layer
// ---------------------------------------------------------------------------

/** The pity ladder for base exits: 1st failed try → 50%, 2nd → 75%, later → 99%. */
export const EXIT_PITY_TIERS = [0.5, 0.75, 0.99] as const;

export interface CeramicPlan {
  /** Probability of each face, aligned with the match's face list. */
  probs: number[];
  /** True while the base-exit pity ladder drives this roll. */
  pityActive: boolean;
  /** True when this pity roll runs at the final 99% tier (a miss = rare bad luck). */
  pityTopTier: boolean;
}

/**
 * Builds the face probabilities for one Ceramic-Dice roll of the ACTIVE
 * player. Pure — never mutates the state. Priority:
 *   1. a roll that would immediately WIN the match  → boost that face by a
 *      random 15–25% (of the whole probability mass),
 *   2. ALL pawns stuck in the base (own-color entry, no assist) → the pity
 *      ladder sets the exit color's probability to 50% / 75% / 99%,
 *   3. fully blocked on the track (NO face yields a legal move) → gently
 *      favor faces that would allow a move; when none exists, the own color
 *      (the likeliest future help) gets the gentle nudge,
 *   4. normal play → completely standard, unbiased odds.
 */
export function planCeramicRoll(state: GameState, boostRoll: () => number): CeramicPlan {
  const faces = diceFacesFor(state.rulesConfig.starMode);
  const n = faces.length;
  const standard = () => faces.map(() => 1 / n);
  const player = state.players[state.activeIndex]!;
  const color: PlayerColorId = player.color;

  // Which faces currently allow at least one legal move — and which would
  // end the whole match right away?
  const faceCanMove: boolean[] = [];
  const faceWins: boolean[] = [];
  for (const face of faces) {
    const probe: GameState = { ...state, diceFace: face };
    const moves = getLegalMoves(probe);
    faceCanMove.push(moves.length > 0);
    let wins = false;
    if (moves.length > 0) {
      const result = applyMove(probe, moves[0]!);
      wins = result.state.winner === color;
      if (!wins && moves.length > 1) {
        // A later move might finish a different pawn — check them all only
        // when the first did not win (cheap: ≤3 pawns per player).
        wins = moves
          .slice(1)
          .some((m) => applyMove(probe, m).state.winner === color);
      }
    }
    faceWins.push(wins);
  }

  // 1. Final winning move boost — a random 15–25% probability mass shift.
  const winningIndex = faceWins.findIndex((w) => w);
  if (winningIndex >= 0) {
    const boost = 0.15 + boostRoll() * 0.1; // 0.15 .. 0.25
    const probs = standard();
    probs[winningIndex] = 1 / n + boost;
    const rest = (1 - probs[winningIndex]!) / (n - 1);
    for (let i = 0; i < n; i++) {
      if (i !== winningIndex) probs[i] = rest;
    }
    return { probs, pityActive: false, pityTopTier: false };
  }

  // 2. Base exit pity ladder — every pawn still waits in the base and the
  //    rules require the OWN color to come out (any-color entry or the
  //    first-pawn assist can never fail, so they never trigger it).
  const allInBase = player.pawns.every((p) => p.pos.area === 'base');
  const pityApplies =
    allInBase &&
    state.rulesConfig.entryRule === 'own-color' &&
    !state.rulesConfig.entryAssist &&
    faces.includes(color);
  if (pityApplies) {
    const streak = Math.max(0, Math.min(2, player.exitFailStreak ?? 0));
    const p = EXIT_PITY_TIERS[streak]!;
    const probs = standard();
    const exitIndex = faces.indexOf(color as DiceFaceId);
    if (exitIndex >= 0) {
      probs[exitIndex] = p;
      const rest = (1 - p) / (n - 1);
      for (let i = 0; i < n; i++) {
        if (i !== exitIndex) probs[i] = rest;
      }
      return { probs, pityActive: true, pityTopTier: streak >= 2 };
    }
  }

  // 3. Fully blocked — no face lets any pawn move: gently favor the faces
  //    that WOULD move a pawn (none) or, failing that, the own color.
  if (faceCanMove.every((can) => !can)) {
    const probs = standard();
    const ownIndex = faces.indexOf(color as DiceFaceId);
    if (ownIndex >= 0) {
      // "Slightly increase" — ×1.6 weight, redistributed from the others.
      const boosted = probs.map((p, i) => (i === ownIndex ? p * 1.6 : p));
      const total = boosted.reduce((sum, p) => sum + p, 0);
      return {
        probs: boosted.map((p) => p / total),
        pityActive: false,
        pityTopTier: false,
      };
    }
  }

  // 4. Normal play — standard unbiased odds.
  return { probs: standard(), pityActive: false, pityTopTier: false };
}

/** Draws a face from aligned probabilities using the given uniform sample. */
export function pickFromProbs(faces: readonly DiceFaceId[], probs: number[], sample: number): DiceFaceId {
  const roll = Math.max(0, Math.min(0.999999, sample));
  let acc = 0;
  for (let i = 0; i < faces.length; i++) {
    acc += probs[i] ?? 0;
    if (roll < acc) return faces[i]!;
  }
  return faces[faces.length - 1]!;
}
