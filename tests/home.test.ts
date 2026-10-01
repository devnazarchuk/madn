import { describe, expect, test } from 'bun:test';
import { createGame } from '../src/engine/game';
import { getLegalMoves, validateMove, starOptions } from '../src/engine/rules';
import { applyMove } from '../src/engine/rules/applyMove';
import { GATEWAY_POSITION } from '../src/engine/rules/validatePath';
import { CLASSIC_CONFIG, QUICK_CONFIG, type RulesConfig } from '../src/engine/rulesConfig';
import type { GameState, PlayerSetup } from '../src/engine/types';

/**
 * HOME STRETCH & GOLDEN ARROW GATEWAY (kids-v6) — the strict finish-lane
 * mechanics, exactly as the product review mandates them:
 *  • MANDATORY STOP on the arrow/gateway cell (the arm tip, J39): a pawn can
 *    never SKIP over it straight into the home stretch — not even with its
 *    OWN color. Standing right before the gateway, only the arrow cell's
 *    exact color (Step 1) moves the pawn ONTO it; standing ON the gateway,
 *    only the OWN color (or a resolved star) steps onto the first home cell
 *    (Step 2). Once a pawn reaches its own gateway it may never continue
 *    around the main board loop (no looping — foreign faces find nothing).
 *  • EXCLUSIVE finish slots: strictly ONE pawn per home cell — including the
 *    golden winning cell (no "finish shelf"), even when friendly stacking is
 *    enabled for the main track. The row fills sequentially: the first
 *    finisher stands on the golden cell forever, later pawns park behind it.
 *  • VICTORY: all pawns home AND packed against the golden cell (slots
 *    {2,1,0} / {2,1} — every pawn blocked by a teammate ahead).
 *  • Inside the row the finish rule keeps its meaning: 'exact' rejects
 *    foreign rolls that would carry past the goal · 'flexible' completes.
 *
 * Yellow facts: start = loop 5, tip = loop 4 (J39, a WHITE platform — the
 * gateway). Journey colors at the end: J36 black · J37 red · J38 blue ·
 * J39 white (the arrow gateway) · J40–42 yellow (home) · virtual lap from
 * J43: blue, yellow, red, white(46), green, yellow, black(49) — so from the
 * gateway every foreign face's next field lies past the row.
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

/** Yellow pawn placed at a loop index near the end of its journey. */
function yellowAt(game: GameState, loop: number) {
  game.players[0]!.pawns[0]!.pos = { area: 'track', index: loop };
  return game.players[0]!.pawns[0]!;
}

describe('the golden arrow gateway — a MANDATORY STOP before the home stretch', () => {
  test('the gateway is the last journey position (the arm tip with the arrow)', () => {
    expect(GATEWAY_POSITION).toBe(39);
  });

  test('NO SKIPPING: rolling the OWN color right before the gateway does NOT enter the row', () => {
    const game = mkGame();
    yellowAt(game, 3); // J38 — directly before the arrow cell
    game.diceFace = 'yellow';
    // The next yellow field would be home slot 0 — beyond the gateway: the
    // pawn has NO field it can reach with this roll.
    expect(validateMove(game, 'yellow-0').reason).toBe('NO_MATCH_AHEAD');
    expect(getLegalMoves(game).some((m) => m.pawnId === 'yellow-0')).toBe(false);
    // (The base pawns may still enter with the own color — the track pawn's
    // stride into the row is what must vanish.)
  });

  test('STEP 1: rolling the arrow cell\'s exact color (WHITE) moves ONTO the gateway', () => {
    const game = mkGame();
    yellowAt(game, 3); // J38
    game.diceFace = 'white'; // the arrow cell at loop 4 is a WHITE platform
    // Base pawns cannot use a platform face under the own-color entry rule,
    // so this is the only move on the table.
    const moves = getLegalMoves(game);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.pawnId).toBe('yellow-0');
    expect(moves[0]!.to).toEqual({ area: 'track', index: 4 }); // the gateway
    expect(moves[0]!.distance).toBe(1);
    expect(moves[0]!.isHomeAdvance).toBe(false);
  });

  test('STEP 2: from the gateway itself the OWN color steps onto the first home cell', () => {
    const game = mkGame();
    yellowAt(game, 4); // J39 — standing ON the arrow cell
    game.diceFace = 'yellow';
    const moves = getLegalMoves(game).filter((m) => m.pawnId === 'yellow-0');
    expect(moves).toHaveLength(1);
    expect(moves[0]!.to).toEqual({ area: 'home', index: 0 });
    expect(moves[0]!.distance).toBe(1);
    expect(moves[0]!.isHomeAdvance).toBe(true);
  });

  test('the full two-step dance: arrow color onto the gateway, own color into the row', () => {
    const game = mkGame();
    yellowAt(game, 3); // J38
    game.diceFace = 'white'; // Step 1 → onto the gateway
    let { state } = applyMove(game, getLegalMoves(game).find((m) => m.pawnId === 'yellow-0')!);
    expect(state.players[0]!.pawns[0]!.pos).toEqual({ area: 'track', index: 4 });
    state.phase = 'choose-pawn';
    state.diceFace = 'yellow'; // Step 2 → into the home stretch
    ({ state } = applyMove(state, getLegalMoves(state).find((m) => m.pawnId === 'yellow-0')!));
    expect(state.players[0]!.pawns[0]!.pos).toEqual({ area: 'home', index: 0 });
    expect(state.winner).toBeNull();
  });

  test('NO LOOPING: from the gateway a foreign face never moves the pawn at all', () => {
    const game = mkGame(); // finishRule 'exact'
    yellowAt(game, 4); // J39 — the arrow cell
    for (const face of ['red', 'blue', 'green', 'white', 'black'] as const) {
      expect(validateMove({ ...game, diceFace: face }, 'yellow-0').reason).toBe('NO_MATCH_AHEAD');
    }
    // Base pawns need the own color too — the whole turn has no move at all.
    for (const face of ['blue', 'white', 'black'] as const) {
      expect(getLegalMoves({ ...game, diceFace: face })).toHaveLength(0);
    }
  });

  test('NO SKIPPING even under the flexible finish rule — the gateway stops every stride', () => {
    const cfg: RulesConfig = { ...CLASSIC_CONFIG, preset: 'custom', finishRule: 'flexible' };
    const game = mkGame(cfg);
    yellowAt(game, 1); // J36 — standing on a black platform
    game.diceFace = 'green'; // next green = J47 on the virtual lap — past the goal
    // The mandatory stop overrides the flexible finish: no stride through
    // the tip, no completion — the pawn simply has no reachable green field.
    expect(validateMove(game, 'yellow-0').reason).toBe('NO_MATCH_AHEAD');
    expect(getLegalMoves(game).some((m) => m.pawnId === 'yellow-0')).toBe(false);
  });

  test('from further back the window still holds: matches land up to the gateway only', () => {
    const game = mkGame();
    yellowAt(game, 2); // J37 (a red field)
    game.diceFace = 'blue'; // the blue field at J38 — one ahead, inside the window
    const moves = getLegalMoves(game).filter((m) => m.pawnId === 'yellow-0');
    expect(moves).toHaveLength(1);
    expect(moves[0]!.to).toEqual({ area: 'track', index: 3 });
    // The white ARROW CELL two ahead is equally reachable (Step 1 …):
    const gate = getLegalMoves({ ...game, diceFace: 'white' }).filter(
      (m) => m.pawnId === 'yellow-0',
    );
    expect(gate).toHaveLength(1);
    expect(gate[0]!.to).toEqual({ area: 'track', index: 4 });
    expect(gate[0]!.distance).toBe(2);
    // …but the next RED field lies beyond the gateway (virtual lap) → nothing.
    expect(validateMove({ ...game, diceFace: 'red' }, 'yellow-0').reason).toBe('NO_MATCH_AHEAD');
  });

  test('strict blocking applies to the approach onto the gateway', () => {
    const game = mkGame();
    yellowAt(game, 1); // J36 → white gateway at J39 (d=3; intermediates J37, J38)
    game.players[1]!.pawns[0]!.pos = { area: 'track', index: 2 }; // blocker at J37
    game.diceFace = 'white';
    expect(validateMove(game, 'yellow-0').reason).toBe('PATH_BLOCKED');
  });

  test('a resolved STAR follows the same gateway rules (Step 2 via the own color)', () => {
    const cfg: RulesConfig = { ...CLASSIC_CONFIG, preset: 'custom', starMode: true };
    const game = mkGame(cfg);
    yellowAt(game, 4); // J39 — the arrow cell
    game.diceFace = 'star';
    // From the gateway only the OWN color is productive — the picker offers
    // exactly that resolution (platform and foreign colors find nothing).
    expect(starOptions(game)).toEqual(['yellow']);
  });

  test('an own pawn already ON the gateway blocks the landing (destination rules)', () => {
    const game = mkGame();
    yellowAt(game, 3); // J38
    game.players[0]!.pawns[1]!.pos = { area: 'track', index: 4 }; // on the gateway
    game.diceFace = 'white';
    expect(validateMove(game, 'yellow-0').reason).toBe('DESTINATION_OCCUPIED');
  });
});

describe('walking inside the own-colored home stretch', () => {
  test('an own roll advances slot by slot (the next own field is the next slot)', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 0 };
    game.diceFace = 'yellow'; // (base pawns may also enter with the own color)
    const moves = getLegalMoves(game).filter((m) => m.pawnId === 'yellow-0');
    expect(moves).toHaveLength(1);
    expect(moves[0]!.isHomeAdvance).toBe(true);
    expect(moves[0]!.to).toEqual({ area: 'home', index: 1 });
    expect(moves[0]!.distance).toBe(1);
  });

  test('the own roll from slot 1 lands on the golden winning cell', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 1 };
    game.diceFace = 'yellow'; // the whole row shows yellow — slot 2 wins
    const moves = getLegalMoves(game).filter((m) => m.pawnId === 'yellow-0');
    expect(moves).toHaveLength(1);
    expect(moves[0]!.isFinish).toBe(true);
    expect(moves[0]!.to).toEqual({ area: 'home', index: 2 });
    expect(moves[0]!.distance).toBe(1);
  });

  test('a foreign roll inside the row carries past the goal (exact rejects it)', () => {
    const game = mkGame(); // finishRule 'exact'
    for (const slot of [0, 1]) {
      game.players[0]!.pawns[0]!.pos = { area: 'home', index: slot };
      for (const face of ['red', 'blue', 'green', 'white', 'black'] as const) {
        expect(validateMove({ ...game, diceFace: face }, 'yellow-0').reason).toBe(
          'MOVE_EXCEEDS_FINISH',
        );
      }
    }
  });

  test('an own pawn on the next slot blocks the advance', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 0 };
    game.players[0]!.pawns[1]!.pos = { area: 'home', index: 1 };
    game.diceFace = 'yellow';
    expect(validateMove(game, 'yellow-0').reason).toBe('FINISH_LANE_BLOCKED');
  });

  test('the queue enabler: walking the blocking pawn deeper is the only move', () => {
    const game = mkGame();
    yellowAt(game, 4); // tip pawn (J39)
    game.players[0]!.pawns[1]!.pos = { area: 'home', index: 0 };
    game.players[0]!.pawns[2]!.pos = { area: 'home', index: 2 }; // finished — no base entries
    game.diceFace = 'yellow';
    // Tip pawn: dest slot 0 but it is occupied → FINISH_LANE_BLOCKED.
    // Slot-0 pawn: the own color advances it to slot 1.
    const moves = getLegalMoves(game);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.isHomeAdvance).toBe(true);
    expect(moves[0]!.pawnId).toBe('yellow-1');
    expect(moves[0]!.to).toEqual({ area: 'home', index: 1 });
  });

  test('a pawn at the very last slot may never move again', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 2 };
    game.diceFace = 'yellow';
    expect(validateMove(game, 'yellow-0').reason).toBe('PAWN_FINISHED');
  });
});

describe('EXCLUSIVE finish slots — strictly one pawn per home cell', () => {
  test('the golden winning cell holds ONE pawn: a finished teammate blocks the landing', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 1 };
    game.players[0]!.pawns[1]!.pos = { area: 'home', index: 2 }; // finished first
    game.diceFace = 'yellow'; // own roll → dest slot 2 … occupied
    expect(validateMove(game, 'yellow-0').reason).toBe('FINISH_LANE_BLOCKED');
  });

  test('the exclusivity applies even with friendly stacking enabled for the main track', () => {
    const cfg: RulesConfig = { ...CLASSIC_CONFIG, preset: 'custom', friendlyStacking: true };
    const game = mkGame(cfg);
    // Entry into the row: slot 0 occupied by a teammate → still blocked.
    yellowAt(game, 4); // the tip
    game.players[0]!.pawns[1]!.pos = { area: 'home', index: 0 };
    game.diceFace = 'yellow';
    expect(validateMove(game, 'yellow-0').reason).toBe('FINISH_LANE_BLOCKED');
    // …and the golden cell equally:
    game.players[0]!.pawns[1]!.pos = { area: 'home', index: 2 }; // finished first
    game.players[0]!.pawns[2]!.pos = { area: 'home', index: 1 };
    expect(validateMove(game, 'yellow-2').reason).toBe('FINISH_LANE_BLOCKED');
  });

  test('flexible: a foreign completion needs a FREE golden cell (no squeezing onto it)', () => {
    const cfg: RulesConfig = { ...CLASSIC_CONFIG, preset: 'custom', finishRule: 'flexible' };
    const game = mkGame(cfg);
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 0 };
    game.players[0]!.pawns[1]!.pos = { area: 'home', index: 2 }; // finished first
    game.diceFace = 'blue'; // foreign color — would complete onto the goal…
    expect(validateMove(game, 'yellow-0').reason).toBe('FINISH_LANE_BLOCKED');
  });
});

describe('the finish boundary — exact (Classic default) vs flexible (inside the row)', () => {
  test('exact: three own rolls carry a pawn from the gateway onto the goal', () => {
    const game = mkGame(); // finishRule 'exact'
    yellowAt(game, 4); // J39 — the arrow cell
    game.diceFace = 'yellow'; // 1st own roll → slot 0
    let { state } = applyMove(game, getLegalMoves(game).find((m) => m.pawnId === 'yellow-0')!);
    expect(state.players[0]!.pawns[0]!.pos).toEqual({ area: 'home', index: 0 });
    state.phase = 'choose-pawn';
    state.diceFace = 'yellow'; // 2nd own roll → slot 1
    ({ state } = applyMove(state, getLegalMoves(state).find((m) => m.pawnId === 'yellow-0')!));
    expect(state.players[0]!.pawns[0]!.pos).toEqual({ area: 'home', index: 1 });
    state.phase = 'choose-pawn';
    state.diceFace = 'yellow'; // 3rd own roll → the golden winning cell
    const moves = getLegalMoves(state).filter((m) => m.pawnId === 'yellow-0');
    expect(moves).toHaveLength(1);
    expect(moves[0]!.isFinish).toBe(true);
    expect(moves[0]!.distance).toBe(1);
  });

  test('flexible: a foreign roll INSIDE the row completes the pawn onto the goal', () => {
    const cfg: RulesConfig = { ...CLASSIC_CONFIG, preset: 'custom', finishRule: 'flexible' };
    const game = mkGame(cfg);
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 0 };
    game.diceFace = 'blue'; // foreign color carries past the goal from slot 0
    const moves = getLegalMoves(game).filter((m) => m.pawnId === 'yellow-0');
    expect(moves).toHaveLength(1);
    expect(moves[0]!.isFinish).toBe(true);
    expect(moves[0]!.to).toEqual({ area: 'home', index: 2 });
  });

  test('flexible: a white/black platform roll finishes a home pawn too', () => {
    const cfg: RulesConfig = { ...CLASSIC_CONFIG, preset: 'custom', finishRule: 'flexible' };
    const game = mkGame(cfg);
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 1 };
    game.diceFace = 'black'; // next black = J49 — carries past the goal
    const moves = getLegalMoves(game).filter((m) => m.pawnId === 'yellow-0');
    expect(moves).toHaveLength(1);
    expect(moves[0]!.isFinish).toBe(true);
    expect(moves[0]!.to).toEqual({ area: 'home', index: 2 });
  });

  test('flexible: the run-through home slots must still be clear (strict blocking)', () => {
    const cfg: RulesConfig = { ...CLASSIC_CONFIG, preset: 'custom', finishRule: 'flexible' };
    const game = mkGame(cfg);
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 0 };
    game.players[0]!.pawns[1]!.pos = { area: 'home', index: 1 }; // blocks the run
    game.diceFace = 'blue'; // foreign roll → completion clamps onto the goal
    expect(validateMove(game, 'yellow-0').reason).toBe('PATH_BLOCKED');
  });
});

describe('winning — the packed home row (one pawn per finish cell)', () => {
  test('the row fills sequentially: golden → middle → outer; the last entry WINS', () => {
    const game = mkGame();
    // Pawn 0 finished first (stands on the golden cell forever), pawn 1
    // parked behind it on the middle slot, pawn 2 still on the arrow cell.
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 2 };
    game.players[0]!.pawns[1]!.pos = { area: 'home', index: 1 };
    game.players[0]!.pawns[2]!.pos = { area: 'track', index: 4 }; // the gateway
    game.diceFace = 'yellow'; // steps onto the last free finish slot (slot 0)
    const moves = getLegalMoves(game);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.pawnId).toBe('yellow-2');
    expect(moves[0]!.isHomeAdvance).toBe(true); // parking, not a finish
    const { state } = applyMove(game, moves[0]!);
    expect(state.players[0]!.pawns[2]!.pos).toEqual({ area: 'home', index: 0 });
    // All three pawns home, ONE PER CELL, packed against the golden cell.
    expect(state.winner).toBe('yellow');
    expect(state.phase).toBe('game-over');
    expect(state.events.at(-1)!.kind).toBe('game-over');
  });

  test('all pawns home but NOT packed → no win yet (the row must squeeze to the goal)', () => {
    // Two pawns (Quick config): {slot 0, slot 1} is not packed — slot 2 is
    // still free, so the slot-1 pawn has work to do.
    const game = mkGame(QUICK_CONFIG);
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 0 };
    game.players[0]!.pawns[1]!.pos = { area: 'home', index: 1 };
    game.diceFace = 'yellow'; // slot-1 pawn reaches the golden cell
    const moves = getLegalMoves(game);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.pawnId).toBe('yellow-1');
    expect(moves[0]!.isFinish).toBe(true);
    const { state } = applyMove(game, moves[0]!);
    expect(state.players[0]!.pawns[1]!.pos).toEqual({ area: 'home', index: 2 });
    expect(state.winner).toBeNull(); // {slot 0, golden} — a gap at slot 1!
    expect(state.phase).not.toBe('game-over');
    // The last pawn closes the gap: {middle, golden} — packed, WINS.
    state.phase = 'choose-pawn';
    state.diceFace = 'yellow';
    const final = getLegalMoves(state);
    expect(final).toHaveLength(1);
    expect(final[0]!.pawnId).toBe('yellow-0');
    const { state: won } = applyMove(state, final[0]!);
    expect(won.players[0]!.pawns[0]!.pos).toEqual({ area: 'home', index: 1 });
    expect(won.winner).toBe('yellow');
    expect(won.phase).toBe('game-over');
  });

  test('a pawn still on the track keeps the game open (not all pawns home)', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 2 }; // finished
    game.players[0]!.pawns[1]!.pos = { area: 'home', index: 1 };
    game.players[0]!.pawns[2]!.pos = { area: 'track', index: 3 }; // J38
    game.diceFace = 'white'; // lands ON the gateway — still outside the row
    const moves = getLegalMoves(game);
    expect(moves).toHaveLength(1);
    const { state } = applyMove(game, moves[0]!);
    expect(state.players[0]!.pawns[2]!.pos).toEqual({ area: 'track', index: 4 });
    expect(state.winner).toBeNull();
    expect(state.phase).not.toBe('game-over');
  });

  test('home pawns are immune to capture', () => {
    const game = mkGame();
    game.players[0]!.pawns[0]!.pos = { area: 'home', index: 0 };
    // Blue active near its own finish: whatever it rolls, its destinations are
    // track fields or its OWN home lane — capture victims always originate
    // from the shared track, never from a home row.
    game.activeIndex = 1;
    game.players[1]!.pawns[0]!.pos = { area: 'track', index: 33 };
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
