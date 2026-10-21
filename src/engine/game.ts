import { RULES, diceFacesFor, type DiceFaceId, type PlayerColorId, type TrackColorId } from '@/config/gameConfig';
import { DEFAULT_COLORS, TURN_ORDER } from './board';
import { CLASSIC_LAYOUT, generateRandomLayout } from './boardTrackConfig';
import { cloneState } from './rules';
import { nextRandom, pickFromProbs, planCeramicRoll, randomSeed, rollDieFace } from './dice';
import { CLASSIC_CONFIG, type RulesConfig } from './rulesConfig';
import type { GameEvent, GameState, PlayerSetup } from './types';
/**
 * Character identity of each color — the four animal friends of the Kids
 * edition: Fox (red), Bear (blue), Frog (green) and Chick (yellow).
 */
export const CHARACTERS: Record<
  PlayerColorId,
  { name: string; animal: string; blurb: string }
> = {
  red: { name: 'Rusty', animal: 'fox', blurb: 'clever & quick' },
  blue: { name: 'Bruno', animal: 'bear', blurb: 'strong & cozy' },
  green: { name: 'Frida', animal: 'frog', blurb: 'jumpy & happy' },
  yellow: { name: 'Pip', animal: 'chick', blurb: 'brave & chirpy' },
};

export function defaultName(color: PlayerColorId): string {
  return `${CHARACTERS[color].name} ${CHARACTERS[color].animal}`;
}

/**
 * Creates a fresh game. All pawns start in their bases; the first player is
 * drawn randomly (documented assumption — physical editions usually let the
 * youngest player start; a random pick keeps local play fair).
 */
export function createGame(
  setups: PlayerSetup[],
  rulesConfig: RulesConfig = CLASSIC_CONFIG,
  seed: number = randomSeed(),
): GameState {
  const players = setups.map((setup) => ({
    ...setup,
    exitFailStreak: 0,
    pawns: Array.from({ length: rulesConfig.pawnsPerPlayer }, (_, i) => ({
      id: `${setup.color}-${i}`,
      color: setup.color,
      pos: { area: 'base' as const, index: i },
    })),
  }));

  const firstIndex = Math.floor(nextRandom(seed).value * players.length);
  // The color map this match is played on: the official weave, or a freshly
  // generated FULL RANDOM map (seeded — the same seed repaints the same
  // board, so autosaves and replays stay faithful).
  const layout = rulesConfig.boardLayout === 'random' ? generateRandomLayout(seed) : CLASSIC_LAYOUT;

  const state: GameState = {
    players,
    activeIndex: firstIndex,
    turn: 1,
    phase: 'await-roll',
    diceFace: null,
    diceFromStar: false,
    rollsThisTurn: 0,
    extraRoll: null,
    rulesConfig,
    layout,
    winner: null,
    rngState: seed,
    events: [],
    startedAt: Date.now(),
    captures: 0,
  };

  state.events.push({
    seq: 0,
    turn: 1,
    kind: 'game-started',
    detail: `${players.length} players · ${rulesConfig.preset} rules · seed ${seed}`,
  });
  state.events.push({
    seq: 1,
    turn: 1,
    kind: 'turn',
    player: players[firstIndex]!.color,
  });
  return state;
}

/** Rolls the die for the current turn. Pure — returns cloned state.
 * The face list comes from the match's Star Mode toggle: the standard die
 * carries the four colors + WHITE + BLACK; the Star Mode die carries two
 * golden STAR wilds instead. */
export function rollForTurn(input: GameState): { state: GameState; face: DiceFaceId } {
  const state = cloneState(input);
  const { face, next } = rollDieFace(state.rngState, state.rulesConfig.starMode);
  state.rngState = next;
  state.diceFace = face;
  state.diceFromStar = face === 'star';
  state.rollsThisTurn += 1;
  state.extraRoll = null;
  const player = state.players[state.activeIndex]!;
  const event: GameEvent = {
    seq: state.events.length,
    turn: state.turn,
    kind: 'roll',
    player: player.color,
    face,
  };
  state.events.push(event);
  return { state, face };
}

/**
 * Resolves a star (wild) roll to a concrete track color — the engine's single
 * authoritative record of what the star became. Only legal while the star
 * is actually pending; otherwise a no-op returning the input unchanged.
 * The roll keeps its star origin (`diceFromStar`) — a resolved star may
 * become ANY of the six track colors (four player colors, white or black:
 * a platform stride), even when only the player's own color would normally
 * move them.
 */
export function resolveStarFace(input: GameState, chosen: TrackColorId): GameState {
  const state = cloneState(input);
  if (state.phase !== 'choose-star' || state.diceFace !== 'star') return state;
  const player = state.players[state.activeIndex]!;
  state.diceFace = chosen;
  state.diceFromStar = true;
  state.phase = 'choose-pawn';
  state.events.push({
    seq: state.events.length,
    turn: state.turn,
    kind: 'star-choice',
    player: player.color,
    detail: `star → ${chosen}`,
  });
  return state;
}

/** Passes the turn to the next player (clockwise among seated players). */
export function passTurn(
  input: GameState,
  reason = 'no legal move this turn',
): GameState {
  const state = cloneState(input);
  const player = state.players[state.activeIndex]!;
  state.events.push({
    seq: state.events.length,
    turn: state.turn,
    kind: 'pass',
    player: player.color,
    detail: reason,
  });
  return advanceTurn(state);
}

/** Advances to the next player and resets per-turn counters. */
export function advanceTurn(input: GameState): GameState {
  const state = cloneState(input);
  state.activeIndex = (state.activeIndex + 1) % state.players.length;
  state.turn += 1;
  state.diceFace = null;
  state.diceFromStar = false;
  state.rollsThisTurn = 0;
  state.extraRoll = null;
  state.phase = 'await-roll';
  const player = state.players[state.activeIndex]!;
  state.events.push({
    seq: state.events.length,
    turn: state.turn,
    kind: 'turn',
    player: player.color,
  });
  return state;
}

/** Suggested color assignment for a given player count. */
export function suggestedColors(count: number): PlayerColorId[] {
  return DEFAULT_COLORS[Math.min(4, Math.max(2, count))] ?? DEFAULT_COLORS[4]!;
}

export { TURN_ORDER };
