import { describe, expect, test } from 'bun:test';
import { createGame } from '../src/engine/game';
import { getLegalMoves, validateMove } from '../src/engine/rules';
import { applyMove } from '../src/engine/rules/applyMove';
import { CLASSIC_CONFIG } from '../src/engine/rulesConfig';
import type { GameState, PlayerSetup } from '../src/engine/types';

/**
 * HOME ROW — the finish-lane queue (assumption A8):
 * enter at the mouth slot when no matching color remains ahead; every later
 * roll walks a pawn one slot deeper; the last slot finishes a pawn forever.
 */

function mkGame(): GameState {
  const setups: PlayerSetup[] = [
    { id: 'p0', color: 'yellow', name: 'Yel', kind: 'human', aiLevel: 'medium' },
    { id: 'p1', color: 'blue', name: 'Blu', kind: 'ai', aiLevel: 'medium' },
  ];
  const game = createGame(setups, CLASSIC_CONFIG, 99);
  game.activeIndex = 0;
  game.phase = 'choose-pawn';
  return game;
}

/**
 * Yellow pawn on loop 38 (yellow path 28). The next yellow field lies at
 * path 33 (loop 3), so rolling GREEN (no green ahead: path 29..32 are
 * red/blue/green… wait — we need a color with NO match ahead. Path 29..39
 * colors: 29=red(loop39), 30=blue(0), 31=red(1), 32=green(2), 33=yellow(3),
 * 34=blue(4), 35=red(5), 36=green(6), 37=yellow(7), 38=blue(8), 39=red(9).
 * From loop 38 (path 28) EVERY color still has a match ahead. From path 36
 * (loop 6, green): paths 37,38,39 = yellow, blue, red → rolling GREEN has no
 * match → home entry. Use yellow pawn at loop 6.
 */
function yellowNearHome(game: GameState) {
  const pawn = game.players[0]!.pawns[0]!;
  pawn.pos = { area: 'track', index: 6 };
  return pawn;
}

describe('entering the home row', () => {
  test('a rolled color with no match ahead steps into the mouth slot', () => {
    const game = mkGame();
    yellowNearHome(game);
    game.diceFace = 'green'; // no green field ahead on paths 37..39
    const moves = getLegalMoves(game);
    expect(moves).toHaveLength(1);
    const move = moves[0]!;
    expect(move.isFinish).toBe(true);
    expect(move.to).toEqual({ area: 'home', index: 0 });
    expect(validateMove(game, game.players[0]!.pawns[0]!.id).legal).toBe(true);
  });

  test('a pawn that still has a match ahead does NOT enter home', () => {
    const game = mkGame();
    yellowNearHome(game);
    game.diceFace = 'yellow'; // yellow at path 37 (loop 7)
    const moves = getLegalMoves(game);
    expect(moves[0]!.to).toEqual({ area: 'track', index: 7 });
    expect(moves[0]!.isFinish).toBe(false);
  });

  test('the mouth slot occupied → FINISH_LANE_BLOCKED', () => {
    const game = mkGame();
    yellowNearHome(game);
    game.players[0]!.pawns[1]!.pos = { area: 'home', index: 0 };
    game.diceFace = 'green';
    expect(validateMove(game, game.players[0]!.pawns[0]!.id).reason).toBe('FINISH_LANE_BLOCKED');
    // No entry into the row is offered — the ONLY productive move is walking
    // the blocking home pawn deeper (the queue enabler).
    const moves = getLegalMoves(game);
    expect(moves.filter((m) => m.isFinish)).toHaveLength(0);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.isHomeAdvance).toBe(true);
  });

  test('strict blocking applies to the remaining track on the way in', () => {
    const game = mkGame();
    yellowNearHome(game); // path 36 (loop 6); remaining fields: 37, 38, 39
    game.players[1]!.pawns[0]!.pos = { area: 'track', index: 8 }; // yellow path 38
    game.diceFace = 'green'; // would enter home
    expect(validateMove(game, game.players[0]!.pawns[0]!.id).reason).toBe('PATH_BLOCKED');
  });
});

describe('walking deeper inside the home row', () => {
  test('every roll advances a home pawn by exactly one slot', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 0 };
    game.diceFace = 'red';
    const moves = getLegalMoves(game);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.isHomeAdvance).toBe(true);
    expect(moves[0]!.to).toEqual({ area: 'home', index: 1 });
  });

  test('an own pawn on the next slot blocks the advance', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 0 };
    game.players[0]!.pawns[1]!.pos = { area: 'home', index: 1 };
    game.diceFace = 'red';
    expect(validateMove(game, game.players[0]!.pawns[0]!.id).reason).toBe('FINISH_LANE_BLOCKED');
  });

  test('a pawn at the very last slot may never move again', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 2 };
    game.diceFace = 'red';
    expect(validateMove(game, game.players[0]!.pawns[0]!.id).reason).toBe('MOVE_EXCEEDS_FINISH');
  });

  test('the queue must be walked to fit all pawns (blocking enabler)', () => {
    const game = mkGame();
    // A at slot 0, B still on track near the end, C in base.
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 0 };
    yellowNearHome2(game);
    game.diceFace = 'green'; // B wants home but the mouth is taken
    const movesForB = getLegalMoves(game).filter((m) => m.isFinish);
    expect(movesForB).toHaveLength(0);
    // The ONLY productive move is walking A deeper.
    const moves = getLegalMoves(game);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.isHomeAdvance).toBe(true);
  });

  test('applying a home advance moves the pawn exactly one slot', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 0 };
    game.diceFace = 'red';
    const move = getLegalMoves(game)[0]!;
    const { state } = applyMove(game, move);
    expect(state.players[0]!.pawns[0]!.pos).toEqual({ area: 'home', index: 1 });
    expect(state.winner).toBeNull();
  });
});

function yellowNearHome2(game: GameState) {
  game.players[0]!.pawns[1]!.pos = { area: 'track', index: 6 };
}

describe('winning', () => {
  test('all pawns home ends the game immediately', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 2 };
    game.players[0]!.pawns[1]!.pos = { area: 'home', index: 1 };
    // Third pawn one move from home: on track with no match ahead.
    game.players[0]!.pawns[2]!.pos = { area: 'track', index: 6 };
    game.diceFace = 'green';
    const moves = getLegalMoves(game);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.isFinish).toBe(true);
    const { state } = applyMove(game, moves[0]!);
    expect(state.players[0]!.pawns[2]!.pos).toEqual({ area: 'home', index: 0 });
    expect(state.winner).toBe('yellow');
    expect(state.phase).toBe('game-over');
  });

  test('home pawns are immune to capture', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 0 };
    // Blue active, adjacent to yellow's home mouth — whatever it rolls, its
    // destinations can only be track fields or its OWN home lane; capture
    // victims always originate from the shared track, never from a home row.
    game.activeIndex = 1;
    game.players[1]!.pawns[0]!.pos = { area: 'track', index: 38 };
    for (const face of ['red', 'blue', 'green', 'yellow'] as const) {
      game.diceFace = face;
      for (const m of getLegalMoves(game)) {
        for (const victimId of m.capturedPawnIds) {
          const victim = game.players[0]!.pawns.find((p) => p.id === victimId)!;
          expect(victim.pos.area).toBe('track');
        }
      }
    }
  });
});
