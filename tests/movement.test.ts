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

describe('destination computation (next field of the rolled color)', () => {
  test('roll red from yellow start (loop 10) → loop 12, distance 2', () => {
    const game = mkGame();
    yellowPawn(game, 10);
    game.diceFace = 'red';
    const moves = getLegalMoves(game);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.to).toEqual({ area: 'track', index: 12 });
    expect(moves[0]!.distance).toBe(2);
  });

  test('adjacent match (distance 1) — no intermediates to check', () => {
    const game = mkGame();
    yellowPawn(game, 10);
    game.diceFace = 'green'; // loop 11 is green
    const moves = getLegalMoves(game);
    expect(moves[0]!.to).toEqual({ area: 'track', index: 11 });
    expect(moves[0]!.distance).toBe(1);
  });

  test('distance 4 with three intermediate fields', () => {
    const game = mkGame();
    yellowPawn(game, 10);
    game.diceFace = 'yellow'; // next yellow at loop 14
    expect(getLegalMoves(game)[0]!.to).toEqual({ area: 'track', index: 14 });
    expect(getLegalMoves(game)[0]!.distance).toBe(4);
  });
});

describe('strict blocking (Classic default)', () => {
  test('a pawn DIRECTLY in front blocks (destination beyond)', () => {
    const game = mkGame();
    yellowPawn(game, 10);
    bluePawn(game, 11); // intermediate for the red roll (dest loop 12)
    game.diceFace = 'red';
    expect(getLegalMoves(game)).toHaveLength(0);
    const v = validateMove(game, game.players[0]!.pawns[0]!.id);
    expect(v.reason).toBe('PATH_BLOCKED');
  });

  test('a pawn SEVERAL positions ahead blocks', () => {
    const game = mkGame();
    yellowPawn(game, 10);
    bluePawn(game, 13); // intermediate for the yellow roll (dest loop 14)
    game.diceFace = 'yellow';
    expect(validateMove(game, game.players[0]!.pawns[0]!.id).reason).toBe('PATH_BLOCKED');
  });

  test('ANY intermediate blocker rejects — opponent AND own pawns alike', () => {
    const game = mkGame();
    yellowPawn(game, 10);
    game.players[0]!.pawns[1]!.pos = { area: 'track', index: 12 }; // own blocker
    game.diceFace = 'yellow'; // dest loop 14, intermediates 11,12,13
    expect(validateMove(game, game.players[0]!.pawns[0]!.id).reason).toBe('PATH_BLOCKED');
  });

  test('an OPPONENT on an intermediate field is NOT captured (blocking ≠ capturing)', () => {
    const game = mkGame();
    yellowPawn(game, 10);
    bluePawn(game, 12);
    game.diceFace = 'yellow'; // dest 14, intermediate 12
    const v = validateMove(game, game.players[0]!.pawns[0]!.id);
    expect(v.legal).toBe(false);
    expect(v.reason).toBe('PATH_BLOCKED');
    // Even when the destination itself is free:
    expect(game.players[1]!.pawns[0]!.pos).toEqual({ area: 'track', index: 12 });
  });

  test('free-passing variant allows hopping over the intermediate blocker', () => {
    const cfg: RulesConfig = { ...CLASSIC_CONFIG, preset: 'custom', passingRule: 'free' };
    const game = mkGame(cfg);
    yellowPawn(game, 10);
    bluePawn(game, 11);
    game.diceFace = 'red'; // dest loop 12
    const moves = getLegalMoves(game);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.to).toEqual({ area: 'track', index: 12 });
  });

  test('a blocker on the DESTINATION that is an own pawn → DESTINATION_OCCUPIED', () => {
    const game = mkGame();
    yellowPawn(game, 10);
    game.players[0]!.pawns[1]!.pos = { area: 'track', index: 12 };
    game.diceFace = 'red';
    expect(validateMove(game, game.players[0]!.pawns[0]!.id).reason).toBe('DESTINATION_OCCUPIED');
  });

  test('an opponent on the DESTINATION → capture (only on landing)', () => {
    const game = mkGame();
    yellowPawn(game, 10);
    bluePawn(game, 12);
    game.diceFace = 'red'; // dest loop 12
    const v = validateMove(game, game.players[0]!.pawns[0]!.id);
    expect(v.legal).toBe(true);
    expect(v.move!.capturedPawnIds).toEqual(['blue-0']);
  });

  test('capture disabled → CAPTURE_DISABLED for the landing', () => {
    const cfg: RulesConfig = { ...CLASSIC_CONFIG, preset: 'custom', captureEnabled: false };
    const game = mkGame(cfg);
    yellowPawn(game, 10);
    bluePawn(game, 12);
    game.diceFace = 'red';
    expect(validateMove(game, game.players[0]!.pawns[0]!.id).reason).toBe('CAPTURE_DISABLED');
  });

  test('protected starts: an opponent standing on ITS OWN start is safe', () => {
    const cfg: RulesConfig = { ...CLASSIC_CONFIG, preset: 'custom', protectedStarts: true };
    const game = mkGame(cfg);
    yellowPawn(game, 39); // yellow path 29 — the next blue field ahead is loop 0 (path 30)
    bluePawn(game, 0); // blue stands on its OWN start field
    game.diceFace = 'blue';
    const v = validateMove(game, game.players[0]!.pawns[0]!.id);
    expect(v.legal).toBe(false);
    expect(v.reason).toBe('PROTECTED_FIELD');
  });

  test('without protection the same landing captures the start-sitter', () => {
    const game = mkGame(); // protection off
    yellowPawn(game, 39);
    bluePawn(game, 0); // blue on its own start — not protected in Classic
    game.diceFace = 'blue';
    const v = validateMove(game, game.players[0]!.pawns[0]!.id);
    expect(v.legal).toBe(true);
    expect(v.move!.capturedPawnIds).toEqual(['blue-0']);
  });

  test('protection never guards a pawn standing on a FOREIGN start field', () => {
    const cfg: RulesConfig = { ...CLASSIC_CONFIG, preset: 'custom', protectedStarts: true };
    const game = mkGame(cfg);
    // Blue pawn squatting on YELLOW's start field (loop 10) — not its own.
    bluePawn(game, 10);
    // Yellow pawn in base rolls its own color → entry onto loop 10 captures.
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
    yellowPawn(game, 10);
    game.diceFace = 'red'; // dest loop 12
    const snapshot = JSON.stringify(game.players.map((p) => p.pawns.map((x) => x.pos)));
    const move = getLegalMoves(game)[0]!;
    const { state } = applyMove(game, move);
    expect(JSON.stringify(game.players.map((p) => p.pawns.map((x) => x.pos)))).toBe(snapshot);
    expect(state.players[0]!.pawns[0]!.pos).toEqual({ area: 'track', index: 12 });
    expect(state.phase).toBe('turn-end');
  });

  test('only the ACTIVE player\u2019s pawns can move', () => {
    const game = mkGame();
    yellowPawn(game, 10);
    bluePawn(game, 20);
    game.diceFace = 'red';
    const v = validateMove(game, game.players[1]!.pawns[0]!.id);
    expect(v.legal).toBe(false);
    expect(v.reason).toBe('PAWN_NOT_OWNED_BY_ACTIVE_PLAYER');
  });

  test('a stale/absent dice result authorizes nothing', () => {
    const game = mkGame();
    yellowPawn(game, 10);
    game.diceFace = null;
    expect(getLegalMoves(game)).toHaveLength(0);
    expect(validateMove(game, game.players[0]!.pawns[0]!.id).reason).toBe('NO_DICE_RESULT');
  });
});
