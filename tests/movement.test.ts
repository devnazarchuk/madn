import { describe, expect, test } from 'bun:test';
import { createGame } from '../src/engine/game';
import { getLegalMoves, validateMove } from '../src/engine/rules';
import { applyMove } from '../src/engine/rules/applyMove';
import { CLASSIC_CONFIG, type RulesConfig } from '../src/engine/rulesConfig';
import type { GameState, PlayerSetup } from '../src/engine/types';

/**
 * MOVEMENT & STRICT BLOCKING — §3 of the mandate.
 * No pawn may pass through an occupied position; the whole ordered path is
 * validated BEFORE any state changes. Passing is never confused with capture.
 *
 * Yellow's start field is loop 5 (kids-v5). Its journey colors:
 *   J0 yellow(5) · J1 green(6) · J2 black(7) · J3 blue(8) · J4 yellow(9) ·
 *   J5 red(10) · J6 white(11) · J7 green(12) · J8 yellow(13) · J9 black(14) …
 */

function mkGame(cfg: RulesConfig = CLASSIC_CONFIG): GameState {
  const setups: PlayerSetup[] = [
    { id: 'p0', color: 'yellow', name: 'Yel', kind: 'human', aiLevel: 'medium' },
    { id: 'p1', color: 'blue', name: 'Blu', kind: 'ai', aiLevel: 'medium' },
  ];
  const game = createGame(setups, cfg, 99);
  game.activeIndex = 0;
  game.phase = 'choose-pawn';
  return game;
}

/** Yellow player, first pawn placed on a track loop index; others parked in base. */
function yellowPawn(game: GameState, loop: number) {
  const pawn = game.players[0]!.pawns[0]!;
  pawn.pos = { area: 'track', index: loop };
  return pawn;
}

/** Blue player (opponent) pawn placed on a loop index. */
function bluePawn(game: GameState, loop: number) {
  const pawn = game.players[1]!.pawns[0]!;
  pawn.pos = { area: 'track', index: loop };
  return pawn;
}

describe('destination computation (next field of the rolled face)', () => {
  test('roll green from yellow start (loop 5) → loop 6, distance 1', () => {
    const game = mkGame();
    yellowPawn(game, 5);
    game.diceFace = 'green'; // loop 6 is green
    const moves = getLegalMoves(game);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.to).toEqual({ area: 'track', index: 6 });
    expect(moves[0]!.distance).toBe(1);
  });

  test('roll red from yellow start → loop 10, distance 5', () => {
    const game = mkGame();
    yellowPawn(game, 5);
    game.diceFace = 'red'; // loop 10 is the next red field
    const moves = getLegalMoves(game);
    expect(moves[0]!.to).toEqual({ area: 'track', index: 10 });
    expect(moves[0]!.distance).toBe(5);
  });

  test('roll black from yellow start → the black platform at loop 7, distance 2', () => {
    const game = mkGame();
    yellowPawn(game, 5);
    game.diceFace = 'black';
    const moves = getLegalMoves(game);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.to).toEqual({ area: 'track', index: 7 });
    expect(moves[0]!.distance).toBe(2);
  });

  test('roll white from yellow start → the white platform at loop 11, distance 6', () => {
    const game = mkGame();
    yellowPawn(game, 5);
    game.diceFace = 'white';
    const moves = getLegalMoves(game);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.to).toEqual({ area: 'track', index: 11 });
    expect(moves[0]!.distance).toBe(6);
  });

  test('distance 4 with three intermediate fields (own color)', () => {
    const game = mkGame();
    yellowPawn(game, 5);
    game.diceFace = 'yellow'; // next yellow at loop 9
    expect(getLegalMoves(game)[0]!.to).toEqual({ area: 'track', index: 9 });
    expect(getLegalMoves(game)[0]!.distance).toBe(4);
  });
});

describe('strict blocking (Classic default)', () => {
  test('a pawn DIRECTLY in front blocks (destination beyond)', () => {
    const game = mkGame();
    yellowPawn(game, 5);
    bluePawn(game, 6); // intermediate for the red roll (dest loop 10)
    game.diceFace = 'red';
    expect(getLegalMoves(game)).toHaveLength(0);
    const v = validateMove(game, game.players[0]!.pawns[0]!.id);
    expect(v.reason).toBe('PATH_BLOCKED');
  });

  test('a pawn SEVERAL positions ahead blocks', () => {
    const game = mkGame();
    yellowPawn(game, 5);
    bluePawn(game, 8); // intermediate for the yellow roll (dest loop 9)
    game.diceFace = 'yellow';
    expect(validateMove(game, game.players[0]!.pawns[0]!.id).reason).toBe('PATH_BLOCKED');
  });

  test('ANY intermediate blocker rejects — opponent AND own pawns alike', () => {
    const game = mkGame();
    yellowPawn(game, 5);
    game.players[0]!.pawns[1]!.pos = { area: 'track', index: 7 }; // own blocker
    game.diceFace = 'yellow'; // dest loop 9, intermediates 6,7,8
    expect(validateMove(game, game.players[0]!.pawns[0]!.id).reason).toBe('PATH_BLOCKED');
  });

  test('a platform stride is blocked like any other (black roll, intermediate occupied)', () => {
    const game = mkGame();
    yellowPawn(game, 5); // roll black → dest loop 7, intermediate loop 6
    bluePawn(game, 6);
    game.diceFace = 'black';
    expect(validateMove(game, game.players[0]!.pawns[0]!.id).reason).toBe('PATH_BLOCKED');
  });

  test('an OPPONENT on an intermediate field is NOT captured (blocking ≠ capturing)', () => {
    const game = mkGame();
    yellowPawn(game, 5);
    bluePawn(game, 7);
    game.diceFace = 'yellow'; // dest 9, intermediate 7
    const v = validateMove(game, game.players[0]!.pawns[0]!.id);
    expect(v.legal).toBe(false);
    expect(v.reason).toBe('PATH_BLOCKED');
    // Even when the destination itself is free:
    expect(game.players[1]!.pawns[0]!.pos).toEqual({ area: 'track', index: 7 });
  });

  test('free-passing variant allows hopping over the intermediate blocker', () => {
    const cfg: RulesConfig = { ...CLASSIC_CONFIG, preset: 'custom', passingRule: 'free' };
    const game = mkGame(cfg);
    yellowPawn(game, 5);
    bluePawn(game, 6);
    game.diceFace = 'red'; // dest loop 10
    const moves = getLegalMoves(game);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.to).toEqual({ area: 'track', index: 10 });
  });

  test('a blocker on the DESTINATION that is an own pawn → DESTINATION_OCCUPIED', () => {
    const game = mkGame();
    yellowPawn(game, 5);
    game.players[0]!.pawns[1]!.pos = { area: 'track', index: 10 };
    game.diceFace = 'red'; // dest loop 10
    expect(validateMove(game, game.players[0]!.pawns[0]!.id).reason).toBe('DESTINATION_OCCUPIED');
  });

  test('an opponent on the DESTINATION → capture (only on landing)', () => {
    const game = mkGame();
    yellowPawn(game, 5);
    bluePawn(game, 10);
    game.diceFace = 'red'; // dest loop 10
    const v = validateMove(game, game.players[0]!.pawns[0]!.id);
    expect(v.legal).toBe(true);
    expect(v.move!.capturedPawnIds).toEqual(['blue-0']);
  });

  test('landing on a black PLATFORM captures like any other field', () => {
    const game = mkGame();
    yellowPawn(game, 5);
    bluePawn(game, 7); // the black platform at loop 7
    game.diceFace = 'black';
    const v = validateMove(game, game.players[0]!.pawns[0]!.id);
    expect(v.legal).toBe(true);
    expect(v.move!.to).toEqual({ area: 'track', index: 7 });
    expect(v.move!.capturedPawnIds).toEqual(['blue-0']);
  });

  test('capture disabled → CAPTURE_DISABLED for the landing', () => {
    const cfg: RulesConfig = { ...CLASSIC_CONFIG, preset: 'custom', captureEnabled: false };
    const game = mkGame(cfg);
    yellowPawn(game, 5);
    bluePawn(game, 10);
    game.diceFace = 'red';
    expect(validateMove(game, game.players[0]!.pawns[0]!.id).reason).toBe('CAPTURE_DISABLED');
  });

  test('protected starts: an opponent standing on ITS OWN start is safe', () => {
    const cfg: RulesConfig = { ...CLASSIC_CONFIG, preset: 'custom', protectedStarts: true };
    const game = mkGame(cfg);
    yellowPawn(game, 34); // yellow J29 — the next blue field ahead is loop 35 (blue's start)
    bluePawn(game, 35); // blue stands on its OWN start field
    game.diceFace = 'blue';
    const v = validateMove(game, game.players[0]!.pawns[0]!.id);
    expect(v.legal).toBe(false);
    expect(v.reason).toBe('PROTECTED_FIELD');
  });

  test('without protection the same landing captures the start-sitter', () => {
    const game = mkGame(); // protection off
    yellowPawn(game, 34);
    bluePawn(game, 35); // blue on its own start — not protected in Classic
    game.diceFace = 'blue';
    const v = validateMove(game, game.players[0]!.pawns[0]!.id);
    expect(v.legal).toBe(true);
    expect(v.move!.capturedPawnIds).toEqual(['blue-0']);
  });

  test('protection never guards a pawn standing on a FOREIGN start field', () => {
    const cfg: RulesConfig = { ...CLASSIC_CONFIG, preset: 'custom', protectedStarts: true };
    const game = mkGame(cfg);
    // Blue pawn squatting on YELLOW's start field (loop 5) — not its own.
    bluePawn(game, 5);
    // Yellow pawn in base rolls its own color → entry onto loop 5 captures.
    game.diceFace = 'yellow';
    const v = validateMove(game, game.players[0]!.pawns[1]!.id);
    expect(v.legal).toBe(true);
    expect(v.move!.capturedPawnIds).toEqual(['blue-0']);
    expect(v.move!.isEntry).toBe(true);
  });
});

describe('atomic execution', () => {
  test('applyMove never mutates its input', () => {
    const game = mkGame();
    yellowPawn(game, 5);
    game.diceFace = 'red'; // dest loop 10
    const snapshot = JSON.stringify(game.players.map((p) => p.pawns.map((x) => x.pos)));
    const move = getLegalMoves(game)[0]!;
    const { state } = applyMove(game, move);
    expect(JSON.stringify(game.players.map((p) => p.pawns.map((x) => x.pos)))).toBe(snapshot);
    expect(state.players[0]!.pawns[0]!.pos).toEqual({ area: 'track', index: 10 });
    expect(state.phase).toBe('turn-end');
  });

  test('only the ACTIVE player\u2019s pawns can move', () => {
    const game = mkGame();
    yellowPawn(game, 5);
    bluePawn(game, 20);
    game.diceFace = 'red';
    const v = validateMove(game, game.players[1]!.pawns[0]!.id);
    expect(v.legal).toBe(false);
    expect(v.reason).toBe('PAWN_NOT_OWNED_BY_ACTIVE_PLAYER');
  });

  test('a stale/absent dice result authorizes nothing', () => {
    const game = mkGame();
    yellowPawn(game, 5);
    game.diceFace = null;
    expect(getLegalMoves(game)).toHaveLength(0);
    expect(validateMove(game, game.players[0]!.pawns[0]!.id).reason).toBe('NO_DICE_RESULT');
  });
});
