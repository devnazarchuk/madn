import { describe, expect, test } from 'bun:test';
import {
  advanceTurn,
  createGame,
  passTurn,
  resolveStarFace,
  rollForTurn,
} from '../src/engine/game';
import { applyMove, getLegalMoves, starOptions } from '../src/engine/rules';
import { chooseAiMove, chooseAiStarColor } from '../src/engine/ai';
import { CLASSIC_CONFIG, QUICK_CONFIG } from '../src/engine/rulesConfig';
import type { GameState, PlayerSetup } from '../src/engine/types';

/**
 * AI OPPONENTS — they face the exact same rule validation as humans.
 * The AI can only ever pick from the engine's legal moves; a star is resolved
 * through the same productive-color enumeration.
 */

function mkGame(activeKind: 'human' | 'ai' = 'ai'): GameState {
  const setups: PlayerSetup[] = [
    { id: 'p0', color: 'yellow', name: 'Yel', kind: activeKind, aiLevel: 'medium' },
    { id: 'p1', color: 'blue', name: 'Blu', kind: 'ai', aiLevel: 'medium' },
  ];
  const game = createGame(setups, CLASSIC_CONFIG, 99);
  game.activeIndex = 0;
  game.phase = 'choose-pawn';
  return game;
}

describe('AI obeys the engine', () => {
  test('the AI only ever returns moves from the legal set', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'track', index: 10 };
    game.diceFace = 'red'; // dest loop 12
    const moves = getLegalMoves(game);
    const pick = chooseAiMove(game, moves);
    expect(pick).not.toBeNull();
    expect(moves).toContain(pick);
  });

  test('no legal moves → the AI returns null (it cannot bypass the rules)', () => {
    const game = mkGame();
    game.diceFace = 'red'; // all yellow pawns in base — wrong color
    expect(getLegalMoves(game)).toHaveLength(0);
    expect(chooseAiMove(game, [])).toBeNull();
  });

  test('the AI respects strict blocking (blocked scenario yields nothing)', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'track', index: 10 };
    game.players[1]!.pawns[0]!.pos = { area: 'track', index: 11 }; // intermediate blocker
    game.diceFace = 'red'; // dest loop 12 — path blocked
    expect(getLegalMoves(game)).toHaveLength(0);
    expect(chooseAiMove(game, [])).toBeNull();
  });

  test('AI star resolution only picks productive colors', () => {
    const game = mkGame();
    game.diceFace = 'star';
    const options = starOptions(game);
    // All pawns in base → only the own color is productive.
    expect(options).toEqual(['yellow']);
    const picked = chooseAiStarColor(game);
    expect(picked).not.toBeNull();
    expect(options).toContain(picked);
  });

  test('AI star enumeration equals the human picker options', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'track', index: 10 };
    game.diceFace = 'star';
    const options = starOptions(game);
    expect(options.length).toBeGreaterThan(1); // track pawn can use several colors
    for (const color of options) {
      expect(getLegalMoves({ ...game, diceFace: color }).length).toBeGreaterThan(0);
    }
    const picked = chooseAiStarColor(game);
    expect(options).toContain(picked);
  });

  test('a full AI-vs-AI match plays to completion without rule violations', () => {
    // Head-less simulation: the engine alone drives a complete game through
    // the exact same API surface the UI uses.
    const setups: PlayerSetup[] = [
      { id: 'p0', color: 'yellow', name: 'Yel', kind: 'ai', aiLevel: 'medium' },
      { id: 'p1', color: 'blue', name: 'Blu', kind: 'ai', aiLevel: 'hard' },
    ];
    let game = createGame(setups, QUICK_CONFIG, 20250114);
    let guard = 0;
    while (game.phase !== 'game-over' && guard < 5000) {
      guard += 1;
      if (game.phase === 'await-roll' || game.phase === 'no-moves') {
        if (game.phase === 'no-moves' && game.rollsThisTurn >= 3) {
          game = passTurn(game);
          continue;
        }
        game = rollForTurn(game).state;
        if (game.diceFace === 'star') {
          game = { ...game, phase: 'choose-star' };
          const color = chooseAiStarColor(game);
          if (color) {
            game = resolveStarFace(game, color);
          } else {
            game = { ...game, phase: 'no-moves' };
          }
        } else {
          const moves = getLegalMoves(game);
          game = { ...game, phase: moves.length > 0 ? 'choose-pawn' : 'no-moves' };
        }
        continue;
      }
      if (game.phase === 'choose-pawn') {
        const moves = getLegalMoves(game);
        expect(moves.length).toBeGreaterThan(0);
        const pick = chooseAiMove(game, moves);
        expect(pick).not.toBeNull();
        game = applyMove(game, pick!).state;
        continue;
      }
      if (game.phase === 'turn-end') {
        game = advanceTurn(game);
      }
    }
    expect(guard).toBeLessThan(5000);
    expect(game.phase).toBe('game-over');
    expect(game.winner).not.toBeNull();
    expect(game.events.at(-1)!.kind).toBe('game-over');
    expect(game.events.some((e) => e.kind === 'star-choice')).toBe(true);
  });
});
