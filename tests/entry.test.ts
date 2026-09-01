import { describe, expect, test } from 'bun:test';
import { createGame } from '../src/engine/game';
import { getLegalMoves, validateMove, starOptions } from '../src/engine/rules';
import { applyMove } from '../src/engine/rules/applyMove';
import { CLASSIC_CONFIG, type RulesConfig } from '../src/engine/rulesConfig';
import type { GameState, PlayerSetup } from '../src/engine/types';

/**
 * ENTRY VALIDATION — the strict dice-color rule (§4.3 of the mandate).
 * A pawn may leave its base ONLY with the player's OWN color (a resolved star
 * included) unless an explicitly configured variant says otherwise.
 */

function mkGame(cfg: RulesConfig = CLASSIC_CONFIG): GameState {
  const setups: PlayerSetup[] = [
    { id: 'p0', color: 'yellow', name: 'Yel', kind: 'human', aiLevel: 'medium' },
    { id: 'p1', color: 'blue', name: 'Blu', kind: 'ai', aiLevel: 'medium' },
  ];
  const game = createGame(setups, cfg, 12345);
  // Force yellow to be the active player for determinism.
  game.activeIndex = 0;
  game.phase = 'choose-pawn';
  return game;
}

function withFace(game: GameState, face: GameState['diceFace']): GameState {
  return { ...game, diceFace: face };
}

/** Entry check for the first base pawn of the active player. */
function entryResult(game: GameState): ReturnType<typeof validateMove> {
  const pawn = game.players[game.activeIndex]!.pawns.find((p) => p.pos.area === 'base')!;
  return validateMove(game, pawn.id);
}

describe('strict own-color entry (Classic default)', () => {
  test('Yellow + Yellow → allowed', () => {
    const v = entryResult(withFace(mkGame(), 'yellow'));
    expect(v.legal).toBe(true);
    expect(v.move?.isEntry).toBe(true);
    expect(v.move?.to).toEqual({ area: 'track', index: 10 });
  });

  test('Yellow + Red → REJECTED (wrong dice color)', () => {
    const v = entryResult(withFace(mkGame(), 'red'));
    expect(v.legal).toBe(false);
    expect(v.reason).toBe('WRONG_DICE_COLOR');
  });

  test('Yellow + Blue → REJECTED', () => {
    expect(entryResult(withFace(mkGame(), 'blue')).reason).toBe('WRONG_DICE_COLOR');
  });

  test('Yellow + Green → REJECTED', () => {
    expect(entryResult(withFace(mkGame(), 'green')).reason).toBe('WRONG_DICE_COLOR');
  });

  test('Red + Yellow → REJECTED', () => {
    const setups: PlayerSetup[] = [
      { id: 'p0', color: 'red', name: 'Red', kind: 'human', aiLevel: 'medium' },
      { id: 'p1', color: 'blue', name: 'Blu', kind: 'ai', aiLevel: 'medium' },
    ];
    const game = createGame(setups, CLASSIC_CONFIG, 7);
    game.activeIndex = 0;
    game.phase = 'choose-pawn';
    expect(entryResult(withFace(game, 'yellow')).reason).toBe('WRONG_DICE_COLOR');
  });

  test('Blue + Red → REJECTED', () => {
    const setups: PlayerSetup[] = [
      { id: 'p0', color: 'blue', name: 'Blu', kind: 'human', aiLevel: 'medium' },
      { id: 'p1', color: 'red', name: 'Red', kind: 'ai', aiLevel: 'medium' },
    ];
    const game = createGame(setups, CLASSIC_CONFIG, 7);
    game.activeIndex = 0;
    game.phase = 'choose-pawn';
    expect(entryResult(withFace(game, 'red')).reason).toBe('WRONG_DICE_COLOR');
  });

  test('Green + Green → allowed', () => {
    const setups: PlayerSetup[] = [
      { id: 'p0', color: 'green', name: 'Gre', kind: 'human', aiLevel: 'medium' },
      { id: 'p1', color: 'red', name: 'Red', kind: 'ai', aiLevel: 'medium' },
    ];
    const game = createGame(setups, CLASSIC_CONFIG, 7);
    game.activeIndex = 0;
    game.phase = 'choose-pawn';
    const v = entryResult(withFace(game, 'green'));
    expect(v.legal).toBe(true);
    expect(v.move?.to).toEqual({ area: 'track', index: 30 });
  });

  test('no legal move at all for a wrong color (all pawns in base)', () => {
    const game = withFace(mkGame(), 'red');
    expect(getLegalMoves(game)).toHaveLength(0);
  });

  test('the rejection leaves the state untouched (immutability)', () => {
    const game = withFace(mkGame(), 'red');
    const before = JSON.stringify(game.players.map((p) => p.pawns.map((x) => x.pos)));
    validateMove(game, game.players[0]!.pawns[0]!.id);
    getLegalMoves(game);
    const after = JSON.stringify(game.players.map((p) => p.pawns.map((x) => x.pos)));
    expect(after).toBe(before);
  });
});

describe('star (wild) resolution', () => {
  test('an unresolved star authorizes NOTHING', () => {
    const game = withFace(mkGame(), 'star');
    expect(getLegalMoves(game)).toHaveLength(0);
    const v = entryResult(game);
    expect(v.legal).toBe(false);
    expect(v.reason).toBe('STAR_UNRESOLVED');
  });

  test('star options = every color that would move a pawn (own color for entry)', () => {
    const game = withFace(mkGame(), 'star');
    // All yellow pawns sit in the base under strict entry → only yellow works.
    expect(starOptions(game)).toEqual(['yellow']);
  });

  test('a star resolved to the OWN color lets a pawn out', () => {
    const game = withFace(mkGame(), 'yellow');
    const v = entryResult(game);
    expect(v.legal).toBe(true);
  });

  test('a star resolved to a foreign color still rejects entry (like rolling it)', () => {
    const game = withFace(mkGame(), 'red');
    expect(entryResult(game).reason).toBe('WRONG_DICE_COLOR');
  });
});

describe('entry variants (explicitly configured)', () => {
  test('entryAssist: any color works ONLY while ALL pawns are in the base', () => {
    const cfg: RulesConfig = { ...CLASSIC_CONFIG, preset: 'custom', entryAssist: true };
    const game = withFace(mkGame(cfg), 'red');
    expect(entryResult(game).legal).toBe(true);
    // One pawn on the track → the assist no longer applies.
    game.players[0]!.pawns[0]!.pos = { area: 'track', index: 12 };
    expect(entryResult(game).reason).toBe('WRONG_DICE_COLOR');
  });

  test('any-color entry: every color works', () => {
    const cfg: RulesConfig = { ...CLASSIC_CONFIG, preset: 'custom', entryRule: 'any-color' };
    for (const face of ['red', 'blue', 'green', 'yellow'] as const) {
      const v = entryResult(withFace(mkGame(cfg), face));
      expect(v.legal).toBe(true);
    }
  });
});

describe('entry landing rules', () => {
  test('own pawn on the start field blocks the entry', () => {
    const game = withFace(mkGame(), 'yellow');
    game.players[0]!.pawns[0]!.pos = { area: 'track', index: 10 };
    const v = entryResult(game); // tries pawn[1] (also in base)
    expect(v.legal).toBe(false);
    expect(v.reason).toBe('DESTINATION_OCCUPIED');
    // No ENTRY is offered — the track pawn's own move may still exist.
    expect(getLegalMoves(game).filter((m) => m.isEntry)).toHaveLength(0);
  });

  test('entering onto an opponent CAPTURES it', () => {
    const game = withFace(mkGame(), 'yellow');
    game.players[1]!.pawns[0]!.pos = { area: 'track', index: 10 };
    const v = entryResult(game);
    expect(v.legal).toBe(true);
    expect(v.move?.capturedPawnIds).toHaveLength(1);
    const { state } = applyMove(game, v.move!);
    const victim = state.players[1]!.pawns[0]!;
    expect(victim.pos.area).toBe('base');
    expect(state.players[0]!.pawns[0]!.pos).toEqual({ area: 'track', index: 10 });
    expect(state.captures).toBe(1);
  });

  test('capture disabled → entering onto an opponent is rejected', () => {
    const cfg: RulesConfig = { ...CLASSIC_CONFIG, preset: 'custom', captureEnabled: false };
    const game = withFace(mkGame(cfg), 'yellow');
    game.players[1]!.pawns[0]!.pos = { area: 'track', index: 10 };
    expect(entryResult(game).reason).toBe('CAPTURE_DISABLED');
  });
});
