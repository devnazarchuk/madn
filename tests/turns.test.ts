import { describe, expect, test } from 'bun:test';
import {
  advanceTurn,
  createGame,
  passTurn,
  resolveStarFace,
  rollForTurn,
} from '../src/engine/game';
import { applyMove, getLegalMoves, starOptions } from '../src/engine/rules';
import {
  CLASSIC_CONFIG,
  FAMILY_CONFIG,
  normalizeRulesConfig,
  QUICK_CONFIG,
  type RulesConfig,
} from '../src/engine/rulesConfig';
import type { GameState, PlayerSetup } from '../src/engine/types';

/**
 * TURN MANAGEMENT — active-player authority, stale-result guards, SKIPPED
 * stuck turns (no re-rolling — kids-v5), the star-origin bookkeeping
 * (diceFromStar, Star Mode only) and the extra-roll variants.
 */

function mkGame(cfg: RulesConfig = CLASSIC_CONFIG, players = 2): GameState {
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

const STAR_MODE_CONFIG: RulesConfig = {
  ...CLASSIC_CONFIG,
  preset: 'custom',
  starMode: true,
};

describe('the die faces (kids-v5: standard white/black vs optional Star Mode)', () => {
  test('standard mode (default): 4 colors + white + black — no star faces at all', () => {
    expect(CLASSIC_CONFIG.starMode).toBe(false);
    let game = mkGame();
    const faces = new Set<string>();
    for (let i = 0; i < 120; i++) {
      const r = rollForTurn(game);
      game = r.state;
      faces.add(r.face);
    }
    expect(faces.has('star')).toBe(false);
    expect(faces.has('white')).toBe(true);
    expect(faces.has('black')).toBe(true);
    for (const c of ['red', 'blue', 'green', 'yellow']) {
      expect(faces.has(c)).toBe(true);
    }
  });

  test('Star Mode (opt-in toggle): the two platform faces become golden stars', () => {
    let game = mkGame(STAR_MODE_CONFIG);
    const faces = new Set<string>();
    for (let i = 0; i < 120; i++) {
      const r = rollForTurn(game);
      game = r.state;
      faces.add(r.face);
    }
    expect(faces.has('star')).toBe(true);
    expect(faces.has('white')).toBe(false);
    expect(faces.has('black')).toBe(false);
    for (const c of ['red', 'blue', 'green', 'yellow']) {
      expect(faces.has(c)).toBe(true);
    }
  });

  test('the presets use the standard die — Star Mode is custom-only', () => {
    expect(CLASSIC_CONFIG.starMode).toBe(false);
    expect(QUICK_CONFIG.starMode).toBe(false);
    expect(FAMILY_CONFIG.starMode).toBe(false);
  });

  test('kids-v6 normalization: the own-color variant is dropped without Star Mode', () => {
    // The golden arrow gateway is a mandatory stop — reaching it needs its
    // white/black platform face. Without a wild star that face can never be
    // rolled under the own-color-only variant, so a standard-die config with
    // the variant on would strand every pawn before the home stretch. The
    // normalization drops the variant instead.
    const bad = {
      ...CLASSIC_CONFIG,
      preset: 'custom' as const,
      starMode: false,
      ownColorToMove: true,
    };
    const fixed = normalizeRulesConfig(bad);
    expect(fixed.ownColorToMove).toBe(false);
    expect(fixed.starMode).toBe(false);
    // …while a Star Mode config keeps the variant untouched.
    const good = normalizeRulesConfig({ ...bad, starMode: true });
    expect(good.ownColorToMove).toBe(true);
    expect(good.starMode).toBe(true);
  });
});

describe('turn authority & stale results', () => {
  test('advanceTurn clears the dice result — stale faces authorize nothing', () => {
    const game = mkGame();
    const { state } = rollForTurn(game);
    expect(state.diceFace).not.toBeNull();
    const next = advanceTurn(state);
    expect(next.diceFace).toBeNull();
    expect(next.diceFromStar).toBe(false);
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
    // The two platform faces appear in long sequences (2 of 6 faces).
    expect(facesA).toContain('white');
    expect(facesA).toContain('black');
  });
});

describe('stuck turns are SKIPPED, never re-rolled (kids-v5)', () => {
  test('passing the turn hands control to the next player cleanly', () => {
    const game = mkGame();
    const next = passTurn(game, 'no legal move this turn');
    expect(next.activeIndex).toBe(1);
    expect(next.events.some((e) => e.kind === 'pass')).toBe(true);
    expect(next.diceFace).toBeNull();
    expect(next.diceFromStar).toBe(false);
    expect(next.phase).toBe('await-roll');
  });

  test('a roll that yields no legal move leads to a pass (no reroll machinery)', () => {
    // All pawns in the base + a foreign face (color, white or black) →
    // nothing legal. The engine itself offers no move; the turn flow passes
    // immediately.
    let game = mkGame();
    game = rollForTurn(game).state;
    expect(game.diceFace).not.toBe('star'); // the standard die never rolls stars
    if (game.diceFace !== 'yellow') {
      expect(getLegalMoves(game)).toHaveLength(0);
      const passed = passTurn(game);
      expect(passed.activeIndex).toBe(1);
    } else {
      expect(getLegalMoves(game).length).toBeGreaterThan(0);
    }
  });
});

describe('star-origin bookkeeping (diceFromStar — Star Mode)', () => {
  test('rolling a star marks the pending roll as star-origin', () => {
    let game = mkGame(STAR_MODE_CONFIG);
    for (let i = 0; i < 30; i++) {
      const r = rollForTurn(game);
      game = r.state;
      expect(game.diceFromStar).toBe(r.face === 'star');
      if (r.face === 'star') return;
    }
  });

  test('resolveStarFace keeps the star origin — foreign colors stay usable', () => {
    let game = mkGame(STAR_MODE_CONFIG);
    for (let i = 0; i < 30; i++) {
      const r = rollForTurn(game);
      game = r.state;
      if (r.face !== 'star') continue;
      game.phase = 'choose-star';
      const options = starOptions(game);
      expect(options.length).toBeGreaterThan(0);
      const before = game.events.length;
      const resolved = resolveStarFace(game, options[0]!);
      expect(resolved.diceFace).toBe(options[0]);
      expect(resolved.diceFromStar).toBe(true);
      expect(resolved.phase).toBe('choose-pawn');
      expect(resolved.events.length).toBe(before + 1);
      expect(resolved.events.at(-1)!.kind).toBe('star-choice');
      expect(resolved.events.at(-1)!.detail).toBe(`star → ${options[0]}`);
      // The resolved state behaves exactly like a natural color roll.
      expect(getLegalMoves(resolved).length).toBeGreaterThan(0);
      return;
    }
    throw new Error('no star face rolled in 30 tries — impossible with 2/6 faces');
  });

  test('a star may resolve to a PLATFORM color (a long white/black stride)', () => {
    let game = mkGame(STAR_MODE_CONFIG);
    for (let i = 0; i < 30; i++) {
      const r = rollForTurn(game);
      game = r.state;
      if (r.face !== 'star') continue;
      // A track pawn can always use the next white platform → a productive
      // option for the star picker.
      game.players[0]!.pawns[0]!.pos = { area: 'track', index: 5 };
      game.phase = 'choose-star';
      const options = starOptions(game);
      expect(options).toContain('white');
      expect(options).toContain('black');
      const resolved = resolveStarFace(game, 'white');
      expect(resolved.diceFace).toBe('white');
      expect(resolved.diceFromStar).toBe(true);
      const moves = getLegalMoves(resolved).filter((m) => m.pawnId === 'yellow-0');
      expect(moves).toHaveLength(1); // the platform stride
      expect(moves[0]!.to).toEqual({ area: 'track', index: 11 });
      return;
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
    // Yellow at its start (loop 5): the next red field is loop 10, where a
    // blue pawn stands (intermediates are clear).
    game.players[0]!.pawns[0]!.pos = { area: 'track', index: 5 };
    game.players[1]!.pawns[0]!.pos = { area: 'track', index: 10 };
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

  test('Family preset: free passing, safe starts, skipping AND flexible finish', () => {
    expect(FAMILY_CONFIG.passingRule).toBe('free');
    expect(FAMILY_CONFIG.protectedStarts).toBe(true);
    expect(FAMILY_CONFIG.maySkipMove).toBe(true);
    expect(FAMILY_CONFIG.finishRule).toBe('flexible');
    expect(FAMILY_CONFIG.pawnsPerPlayer).toBe(3);
  });

  test('Classic preset: no extra rolls, strict blocking, strict entry, EXACT finish', () => {
    expect(CLASSIC_CONFIG.passingRule).toBe('strict-blocking');
    expect(CLASSIC_CONFIG.entryAssist).toBe(false);
    expect(CLASSIC_CONFIG.extraTurnOnCapture).toBe(false);
    expect(CLASSIC_CONFIG.ownColorToMove).toBe(false);
    expect(CLASSIC_CONFIG.finishRule).toBe('exact');
    expect(CLASSIC_CONFIG.pawnsPerPlayer).toBe(3);
  });
});
