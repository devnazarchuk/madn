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
import { CLASSIC_CONFIG, QUICK_CONFIG, type RulesConfig } from '../src/engine/rulesConfig';
import type { GameState, PlayerSetup } from '../src/engine/types';

/**
 * AI OPPONENTS — they face the exact same rule validation as humans.
 * The AI can only ever pick from the engine's legal moves; a star is resolved
 * through the same productive-color enumeration. Kids-v4: stuck turns are
 * passed (never re-rolled).
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
    game.players[0]!.pawns[0]!.pos = { area: 'track', index: 5 };
    game.diceFace = 'red'; // dest loop 10
    const moves = getLegalMoves(game);
    const pick = chooseAiMove(game, moves);
    expect(pick).not.toBeNull();
    expect(moves).toContain(pick);
  });

  test('the AI plays PLATFORM rolls like any other (white/black stride)', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'track', index: 5 };
    game.diceFace = 'white'; // the white platform at loop 11, 6 ahead
    const moves = getLegalMoves(game);
    expect(moves).toHaveLength(1);
    const pick = chooseAiMove(game, moves);
    expect(pick).not.toBeNull();
    expect(pick!.to).toEqual({ area: 'track', index: 11 });
    expect(pick!.distance).toBe(6);
  });

  test('no legal moves → the AI returns null (it cannot bypass the rules)', () => {
    const game = mkGame();
    game.diceFace = 'red'; // all yellow pawns in base — wrong color
    expect(getLegalMoves(game)).toHaveLength(0);
    expect(chooseAiMove(game, [])).toBeNull();
  });

  test('the AI respects strict blocking (blocked scenario yields nothing)', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'track', index: 5 };
    game.players[1]!.pawns[0]!.pos = { area: 'track', index: 6 }; // intermediate blocker
    game.diceFace = 'red'; // dest loop 10 — path blocked
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

  test('AI star enumeration equals the human picker options (6 track colors)', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'track', index: 5 };
    game.diceFace = 'star';
    const options = starOptions(game);
    // A track pawn at its start can use every color AND both platforms.
    expect(options.length).toBeGreaterThan(1);
    for (const color of options) {
      expect(getLegalMoves({ ...game, diceFace: color }).length).toBeGreaterThan(0);
    }
    const picked = chooseAiStarColor(game);
    expect(options).toContain(picked);
  });

  test('the AI honours the gateway: from the arrow cell a foreign face yields nothing', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'track', index: 4 }; // the tip (J39)
    game.diceFace = 'blue'; // foreign face — no looping, no move at all
    expect(getLegalMoves(game)).toHaveLength(0);
    expect(chooseAiMove(game, [])).toBeNull();
  });
});

/** Head-less driver mirroring the store's turn machine (kids-v5 flow). */
function playAiMatch(cfg: RulesConfig, seed: number): GameState {
  const setups: PlayerSetup[] = [
    { id: 'p0', color: 'yellow', name: 'Yel', kind: 'ai', aiLevel: 'medium' },
    { id: 'p1', color: 'blue', name: 'Blu', kind: 'ai', aiLevel: 'hard' },
  ];
  let game = createGame(setups, cfg, seed);
  let guard = 0;
  // kids-v6 note: with the mandatory arrow stop pawns WAIT near their gateway
  // (prime capture targets), and in Star Mode the hard AI resolves wilds into
  // denial captures — legitimate matches can run into thousands of turns.
  // The guard only exists to catch true deadlocks.
  while (game.phase !== 'game-over' && guard < 40000) {
    guard += 1;
    if (game.phase === 'await-roll' || game.phase === 'no-moves') {
      // No re-rolling: a turn without a legal move is SKIPPED immediately.
      if (game.phase === 'no-moves') {
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
  expect(guard).toBeLessThan(40000);
  return game;
}

describe('full AI-vs-AI matches (kids-v5 mechanics)', () => {
  test('Quick preset plays to completion without rule violations', () => {
    const game = playAiMatch(QUICK_CONFIG, 20250114);
    expect(game.phase).toBe('game-over');
    expect(game.winner).not.toBeNull();
    expect(game.events.at(-1)!.kind).toBe('game-over');
    // The standard die: no star faces ever rolled, white & black appear.
    expect(game.events.some((e) => e.kind === 'roll' && e.face === 'star')).toBe(false);
    expect(game.events.some((e) => e.kind === 'roll' && e.face === 'white')).toBe(true);
    expect(game.events.some((e) => e.kind === 'roll' && e.face === 'black')).toBe(true);
  });

  test('Classic preset (exact finish, strict blocking) completes too', () => {
    const game = playAiMatch(CLASSIC_CONFIG, 777);
    expect(game.phase).toBe('game-over');
    expect(game.winner).not.toBeNull();
    // The winner's pawns ALL stand inside the home stretch, strictly ONE PER
    // FINISH CELL, packed against the golden winning cell: slots {2, 1, 0}.
    const winner = game.players.find((p) => p.color === game.winner)!;
    const slots = winner.pawns.map((p) => p.pos.index).sort((a, b) => b - a);
    expect(new Set(slots).size).toBe(winner.pawns.length);
    slots.forEach((s, i) => expect(s).toBe(2 - i));
    for (const pawn of winner.pawns) {
      expect(pawn.pos.area).toBe('home');
    }
  });

  test('Family preset (flexible finish) completes too', () => {
    const game = playAiMatch(
      { ...CLASSIC_CONFIG, preset: 'family', passingRule: 'free', protectedStarts: true, finishRule: 'flexible' },
      31337,
    );
    expect(game.phase).toBe('game-over');
    expect(game.winner).not.toBeNull();
  });

  test('Star Mode (opt-in wild die) completes with star resolutions recorded', () => {
    const game = playAiMatch(
      { ...CLASSIC_CONFIG, preset: 'custom', starMode: true },
      4242,
    );
    expect(game.phase).toBe('game-over');
    expect(game.winner).not.toBeNull();
    // The star-mode die rolls stars and the AI resolves them through the
    // engine's own resolveStarFace (star-choice events in the log).
    expect(game.events.some((e) => e.kind === 'roll' && e.face === 'star')).toBe(true);
    expect(game.events.some((e) => e.kind === 'star-choice')).toBe(true);
    expect(game.events.some((e) => e.kind === 'roll' && e.face === 'white')).toBe(false);
    const winner = game.players.find((p) => p.color === game.winner)!;
    // The packed home row: one pawn per finish cell, golden cell taken.
    const slots = winner.pawns.map((p) => p.pos.index).sort((a, b) => b - a);
    expect(new Set(slots).size).toBe(winner.pawns.length);
    slots.forEach((s, i) => expect(s).toBe(2 - i));
  });

  test('Own-color-only turns (with exact finish) complete without deadlocks', () => {
    // kids-v6: the own-color variant REQUIRES Star Mode — the mandatory arrow
    // gateway can only be crossed via its white/black platform face, which
    // plain own-color turns can never roll. The star wild is the relief valve.
    const game = playAiMatch(
      {
        ...CLASSIC_CONFIG,
        preset: 'custom',
        starMode: true,
        entryRule: 'any-color',
        ownColorToMove: true,
      },
      2024,
    );
    expect(game.phase).toBe('game-over');
    expect(game.winner).not.toBeNull();
    // Foreign-face turns (plain colors, white, black) were skipped, never
    // re-rolled: the event log holds passes with the color-match reason.
    expect(game.events.some((e) => e.kind === 'pass')).toBe(true);
    expect(game.events.some((e) => e.kind === 'roll')).toBe(true);
    const winner = game.players.find((p) => p.color === game.winner)!;
    // The packed home row: one pawn per finish cell, golden cell taken.
    const slots = winner.pawns.map((p) => p.pos.index).sort((a, b) => b - a);
    expect(new Set(slots).size).toBe(winner.pawns.length);
    slots.forEach((s, i) => expect(s).toBe(2 - i));
  });
});
