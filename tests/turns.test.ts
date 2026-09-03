import { describe, expect, test } from 'bun:test';
import {
  advanceTurn,
  createGame,
  noteReroll,
  passTurn,
  resolveStarFace,
  rollForTurn,
} from '../src/engine/game';
import { applyMove, getLegalMoves, starOptions } from '../src/engine/rules';
import { CLASSIC_CONFIG, QUICK_CONFIG, FAMILY_CONFIG } from '../src/engine/rulesConfig';
import type { GameState, PlayerSetup } from '../src/engine/types';

/**
 * TURN MANAGEMENT — active-player authority, stale-result guards, stuck
 * rerolls, extra rolls, determinism and the star resolution flow.
 */

function mkGame(cfg = CLASSIC_CONFIG, players = 2): GameState {
  const setups: PlayerSetup[] = [
    { id: 'p0', color: 'yellow', name: 'Yel', kind: 'human', aiLevel: 'medium' },
    { id: 'p1', color: 'blue', name: 'Blu', kind: 'human', aiLevel: 'medium' },
    { id: 'p2', color: 'red', name: 'Red', kind: 'human', aiLevel: 'medium' },
    { id: 'p3', color: 'green', name: 'Gre', kind: 'human', aiLevel: 'medium' },
  ].slice(0, players);
  const game = createGame(setups, cfg, 4242);
  game.activeIndex = 0;
  game.phase = 'await-roll';
  return game;
}

describe('turn authority & stale results', () => {
  test('advanceTurn clears the dice result — stale faces authorize nothing', () => {
    const game = mkGame();
    const { state } = rollForTurn(game);
    expect(state.diceFace).not.toBeNull();
    const next = advanceTurn(state);
    expect(next.diceFace).toBeNull();
    expect(getLegalMoves(next)).toHaveLength(0);
  });

  test('the turn cycles clockwise among the seated players', () => {
    const game = mkGame(CLASSIC_CONFIG, 3);
    expect(game.players[game.activeIndex]!.color).toBe('yellow');
    const n1 = advanceTurn(game);
    expect(n1.players[n1.activeIndex]!.color).toBe('blue');
    const n2 = advanceTurn(n1);
    expect(n2.players[n2.activeIndex]!.color).toBe('red');
    const n3 = advanceTurn(n2);
    expect(n3.players[n3.activeIndex]!.color).toBe('yellow');
    expect(n3.turn).toBe(4);
  });

  test('rolls are deterministic for a given seed (replay guarantee)', () => {
    const a = mkGame();
    const b = mkGame();
    let sa = a;
    let sb = b;
    const facesA: string[] = [];
    const facesB: string[] = [];
    for (let i = 0; i < 12; i++) {
      const ra = rollForTurn(sa);
      const rb = rollForTurn(sb);
      facesA.push(ra.face);
      facesB.push(rb.face);
      sa = ra.state;
      sb = rb.state;
    }
    expect(facesA).toEqual(facesB);
    // The star appears in long sequences (2 of 6 faces) — sanity check.
    expect(facesA).toContain('star');
  });
});

describe('stuck turns (no legal move)', () => {
  test('rerolls are recorded and counted', () => {
    const game = mkGame();
    const rerolled = noteReroll(game);
    expect(rerolled.events.at(-1)!.kind).toBe('reroll');
    const rolled = rollForTurn(rerolled);
    expect(rolled.state.rollsThisTurn).toBe(1);
    const again = noteReroll(rolled.state);
    const rolled2 = rollForTurn(again);
    expect(rolled2.state.rollsThisTurn).toBe(2);
  });

  test('passing the turn hands control to the next player', () => {
    const game = mkGame();
    const next = passTurn(game, 'no legal move this turn');
    expect(next.activeIndex).toBe(1);
    expect(next.events.some((e) => e.kind === 'pass')).toBe(true);
    expect(next.diceFace).toBeNull();
  });
});

describe('star (wild) resolution flow', () => {
  test('a star roll keeps bookkeeping and resolves to a recorded color', () => {
    let game = mkGame();
    // Roll until a star appears (seeded sequence — deterministic).
    for (let i = 0; i < 30; i++) {
      const r = rollForTurn(game);
      game = r.state;
      if (r.face === 'star') {
        game.phase = 'choose-star';
        const options = starOptions(game);
        expect(options.length).toBeGreaterThan(0);
        const before = game.events.length;
        const resolved = resolveStarFace(game, options[0]!);
        expect(resolved.diceFace).toBe(options[0]);
        expect(resolved.phase).toBe('choose-pawn');
        expect(resolved.events.length).toBe(before + 1);
        expect(resolved.events.at(-1)!.kind).toBe('star-choice');
        expect(resolved.events.at(-1)!.detail).toBe(`star → ${options[0]}`);
        // The resolved state behaves exactly like a natural color roll.
        expect(getLegalMoves(resolved).length).toBeGreaterThan(0);
        return;
      }
    }
    throw new Error('no star face rolled in 30 tries — impossible with 2/6 faces');
  });

  test('resolveStarFace is a no-op when no star is pending', () => {
    const game = mkGame();
    game.diceFace = 'red';
    game.phase = 'choose-pawn';
    const resolved = resolveStarFace(game, 'blue');
    expect(resolved.diceFace).toBe('red'); // unchanged — no bypass
    expect(resolved.events.length).toBe(game.events.length);
  });
});

describe('extra-roll variants', () => {
  test('Quick preset: a capture grants an extra roll', () => {
    expect(QUICK_CONFIG.extraTurnOnCapture).toBe(true);
    const game = mkGame(QUICK_CONFIG);
    game.phase = 'choose-pawn';
    game.diceFace = 'red';
    // Yellow at its start (loop 10): the next red field is loop 12, where a
    // blue pawn stands (intermediates are clear).
    game.players[0]!.pawns[0]!.pos = { area: 'track', index: 10 };
    game.players[1]!.pawns[0]!.pos = { area: 'track', index: 12 };
    const moves = getLegalMoves(game);
    const capture = moves.find((m) => m.capturedPawnIds.length > 0);
    expect(capture).toBeDefined();
    expect(capture!.capturedPawnIds).toEqual(['blue-0']);
    const { state, extraTurn } = applyMove(game, capture!);
    expect(extraTurn).toBe('capture');
    expect(state.phase).toBe('await-roll');
    expect(state.extraRoll).toBe('capture');
    expect(state.captures).toBe(1);
    expect(state.events.some((e) => e.detail === 'extra roll after a capture')).toBe(true);
  });


  test('Family preset keeps free passing + safe starts + skipping', () => {
    expect(FAMILY_CONFIG.passingRule).toBe('free');
    expect(FAMILY_CONFIG.protectedStarts).toBe(true);
    expect(FAMILY_CONFIG.maySkipMove).toBe(true);
    expect(FAMILY_CONFIG.pawnsPerPlayer).toBe(3);
  });

  test('Classic preset: no extra rolls, strict blocking, strict entry', () => {
    expect(CLASSIC_CONFIG.passingRule).toBe('strict-blocking');
    expect(CLASSIC_CONFIG.entryAssist).toBe(false);
    expect(CLASSIC_CONFIG.extraTurnOnCapture).toBe(false);
    expect(CLASSIC_CONFIG.pawnsPerPlayer).toBe(3);
  });
});
