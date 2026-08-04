import { RULES, type DiceFaceId, type PlayerColorId } from '@/config/gameConfig';
import { DEFAULT_COLORS, TURN_ORDER } from './board';
import { cloneState } from './rules';
import { randomSeed, rollDieFace, nextRandom } from './dice';
import type { GameEvent, GameState, PlayerSetup } from './types';

/** Character identity of each color (matches the physical Kids edition). */
export const CHARACTERS: Record<
  PlayerColorId,
  { name: string; animal: string; blurb: string }
> = {
  blue: { name: 'Benny', animal: 'rabbit', blurb: 'quick & curious' },
  yellow: { name: 'Millie', animal: 'mouse', blurb: 'brave & bright' },
  red: { name: 'Ginger', animal: 'cat', blurb: 'clever & cozy' },
  green: { name: 'Dougie', animal: 'dog', blurb: 'loyal & bouncy' },
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
  seed: number = randomSeed(),
): GameState {
  const players = setups.map((setup) => ({
    ...setup,
    pawns: Array.from({ length: RULES.pawnsPerPlayer }, (_, i) => ({
      id: `${setup.color}-${i}`,
      color: setup.color,
      pos: { area: 'base' as const, index: i },
    })),
  }));

  const firstIndex = Math.floor(nextRandom(seed).value * players.length);

  const state: GameState = {
    players,
    activeIndex: firstIndex,
    turn: 1,
    phase: 'await-roll',
    diceFace: null,
    rollsThisTurn: 0,
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
    detail: `${players.length} players · seed ${seed}`,
  });
  state.events.push({
    seq: 1,
    turn: 1,
    kind: 'turn',
    player: players[firstIndex]!.color,
  });
  return state;
}

/** Rolls the die for the current turn. Pure — returns cloned state. */
export function rollForTurn(input: GameState): { state: GameState; face: DiceFaceId } {
  const state = cloneState(input);
  const { face, next } = rollDieFace(state.rngState);
  state.rngState = next;
  state.diceFace = face;
  state.rollsThisTurn += 1;
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

/** Registers a "no legal move" reroll (same face bookkeeping is re-rolled). */
export function noteReroll(input: GameState): GameState {
  const state = cloneState(input);
  const player = state.players[state.activeIndex]!;
  state.events.push({
    seq: state.events.length,
    turn: state.turn,
    kind: 'reroll',
    player: player.color,
    detail: `no legal move — roll ${state.rollsThisTurn}/${RULES.maxRollsPerTurn}`,
  });
  return state;
}

/** Passes the turn to the next player (clockwise among seated players). */
export function passTurn(input: GameState): GameState {
  const state = cloneState(input);
  const player = state.players[state.activeIndex]!;
  state.events.push({
    seq: state.events.length,
    turn: state.turn,
    kind: 'pass',
    player: player.color,
    detail: 'no legal move this turn',
  });
  return advanceTurn(state);
}

/** Advances to the next player and resets per-turn counters. */
export function advanceTurn(input: GameState): GameState {
  const state = cloneState(input);
  state.activeIndex = (state.activeIndex + 1) % state.players.length;
  state.turn += 1;
  state.diceFace = null;
  state.rollsThisTurn = 0;
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
