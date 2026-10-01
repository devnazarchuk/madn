import { describe, expect, test } from 'bun:test';
import {
  FIELD_COLORS,
  HOME_COLORS,
  SEGMENT_TEMPLATES,
  TRACK_FIELDS,
  distanceToNextColor,
  trackField,
} from '../src/engine/boardTrackConfig';
import { journeyColor, matchingFieldAhead, WINNING_POSITION } from '../src/engine/rules/validatePath';
import {
  BASE_BLOCK,
  BASE_SLOTS,
  FINISH_TIP_INDEX,
  HOME_MOUTH,
  HOME_ROW,
  LOOP,
  START_INDEX,
  TURN_ORDER,
} from '../src/engine/board';
import { PLAYER_COLORS, PLATFORM_COLORS, RULES, TRACK_COLORS } from '../src/config/gameConfig';

/**
 * BOARD TRACK CONFIG (kids-v5) — the deliberate color distribution with the
 * white & black PLATFORMS, the tip-fed own-colored home rows and the triangle
 * bases of the kids-v5 board generation.
 */

describe('track topology', () => {
  test('40 fields with stable unique ids and loop indices', () => {
    expect(TRACK_FIELDS.length).toBe(40);
    expect(new Set(TRACK_FIELDS.map((f) => f.id)).size).toBe(40);
    for (let i = 0; i < 40; i++) {
      expect(TRACK_FIELDS[i]!.loopIndex).toBe(i);
    }
  });

  test('world coordinates are finite and unique', () => {
    for (const f of TRACK_FIELDS) {
      expect(Number.isFinite(f.world.x)).toBe(true);
      expect(Number.isFinite(f.world.z)).toBe(true);
    }
    const keys = TRACK_FIELDS.map((f) => `${f.world.x.toFixed(3)}:${f.world.z.toFixed(3)}`);
    expect(new Set(keys).size).toBe(40);
  });

  test('grid cells match the loop cells', () => {
    TRACK_FIELDS.forEach((f) => {
      expect(f.col).toBe(LOOP[f.loopIndex]!.col);
      expect(f.row).toBe(LOOP[f.loopIndex]!.row);
    });
  });
});

describe('track color distribution (kids-v5 weave)', () => {
  test('only the six track colors appear — 4 player colors + white + black', () => {
    for (const color of FIELD_COLORS) {
      expect(TRACK_COLORS).toContain(color);
    }
  });

  test('every PLAYER color appears exactly 7 times; WHITE and BLACK exactly 6', () => {
    for (const color of PLAYER_COLORS) {
      expect(FIELD_COLORS.filter((c) => c === color).length).toBe(7);
    }
    for (const platform of PLATFORM_COLORS) {
      expect(FIELD_COLORS.filter((c) => c === platform).length).toBe(6);
    }
  });

  test('no two adjacent fields share a color (no clusters, incl. wrap)', () => {
    for (let i = 0; i < 40; i++) {
      expect(FIELD_COLORS[i]).not.toBe(FIELD_COLORS[(i + 1) % 40]!);
    }
  });

  test('each 10-field window follows its full 10-slot template', () => {
    for (const owner of TURN_ORDER) {
      const start = START_INDEX[owner];
      for (let slot = 0; slot < 10; slot++) {
        expect(FIELD_COLORS[(start + slot) % 40]!).toBe(SEGMENT_TEMPLATES[owner]![slot]!);
      }
      // Owner color at window slots 0, 4 and 8 (slot 0 is the start field).
      expect(FIELD_COLORS[start]!).toBe(owner);
      expect(FIELD_COLORS[(start + 4) % 40]!).toBe(owner);
      expect(FIELD_COLORS[(start + 8) % 40]!).toBe(owner);
      expect(trackField(start).isStart).toBe(true);
      expect(trackField(start).segmentOwner).toBe(owner);
      expect(trackField(start).section).toBe('start');
    }
  });

  test('the white & black platforms alternate perfectly around the loop', () => {
    // The 12 platform fields in loop order alternate W, K, W, K, … with
    // 3–4 field spacing — no platform runs, no clusters.
    const platformLoops = FIELD_COLORS
      .map((c, i) => (c === 'white' || c === 'black' ? { i, c } : null))
      .filter((x): x is { i: number; c: string } => x !== null);
    expect(platformLoops).toHaveLength(12);
    for (let k = 0; k < platformLoops.length; k++) {
      const cur = platformLoops[k]!;
      const next = platformLoops[(k + 1) % platformLoops.length]!;
      expect(cur.c).not.toBe(next.c); // perfect alternation
      const gap = (next.i - cur.i + 40) % 40;
      expect(gap).toBeGreaterThanOrEqual(3);
      expect(gap).toBeLessThanOrEqual(4);
    }
    // The exact platform positions (loop indices, deterministic).
    expect(FIELD_COLORS.map((c, i) => (c === 'white' ? i : -1)).filter((i) => i >= 0)).toEqual([
      4, 11, 17, 24, 31, 37,
    ]);
    expect(FIELD_COLORS.map((c, i) => (c === 'black' ? i : -1)).filter((i) => i >= 0)).toEqual([
      1, 7, 14, 21, 27, 34,
    ]);
  });

  test('every next-field-of-color lies 1..8 fields ahead (tight pacing for all 6 faces)', () => {
    for (let i = 0; i < 40; i++) {
      for (const color of TRACK_COLORS) {
        expect(distanceToNextColor(i, color)).toBeGreaterThanOrEqual(1);
        expect(distanceToNextColor(i, color)).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe('home rows painted in the player\'s own color (the classic look)', () => {
  test('all THREE cells of every home row show the player\'s own color', () => {
    for (const p of TURN_ORDER) {
      expect(HOME_COLORS[p]).toEqual([p, p, p]);
    }
  });

  test('the journey color model follows the paint (own row) and resumes the woven pattern past the goal', () => {
    for (const p of TURN_ORDER) {
      const start = START_INDEX[p];
      // Inside the home stretch the journey shows the player's own color …
      for (let s = 0; s < RULES.homeSlots; s++) {
        expect(journeyColor(p, RULES.trackFields + s)).toBe(p);
      }
      // … past the winning cell the virtual lap resumes the woven pattern
      // (how a roll is recognized as carrying a pawn past the goal).
      for (let j = WINNING_POSITION + 1; j <= WINNING_POSITION + 15; j++) {
        expect(journeyColor(p, j)).toBe(FIELD_COLORS[(start + j) % FIELD_COLORS.length]!);
      }
    }
  });

  test('own color from inside the row: the very next slot, always', () => {
    for (const p of TURN_ORDER) {
      expect(matchingFieldAhead(p, RULES.trackFields, p)).toBe(1); // slot 0 → slot 1
      expect(matchingFieldAhead(p, RULES.trackFields + 1, p)).toBe(1); // slot 1 → the winning cell
    }
  });

  test('the gateway cap: from ANY track position a match never lies beyond the arrow', () => {
    // The golden arrow gateway (journey 39) is a mandatory stop — a track
    // pawn's next matching field always lies at or before the gateway.
    for (const p of TURN_ORDER) {
      for (let j = 0; j <= RULES.trackFields - 2; j++) {
        for (const face of TRACK_COLORS) {
          const d = matchingFieldAhead(p, j, face);
          if (d !== -1) {
            expect(j + d).toBeLessThanOrEqual(RULES.trackFields - 1);
            expect(d).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  });

  test('every arrow gateway cell is a white/black platform (the Step 1 roll)', () => {
    // blue/red gateways are BLACK platforms, yellow/green are WHITE.
    expect(journeyColor('blue', 39)).toBe('black');
    expect(journeyColor('red', 39)).toBe('black');
    expect(journeyColor('yellow', 39)).toBe('white');
    expect(journeyColor('green', 39)).toBe('white');
    // Standing right before the gateway, rolling the arrow's platform color
    // is the ONLY way to step onto it (d=1).
    for (const p of TURN_ORDER) {
      expect(matchingFieldAhead(p, 38, journeyColor(p, 39))).toBe(1);
    }
  });

  test('the OWN color right before the gateway: NO match (no skipping into the row)', () => {
    // The home row lies beyond the gateway — the mandatory stop voids the
    // own-color stride that would previously jump straight into slot 0.
    for (const p of TURN_ORDER) {
      expect(matchingFieldAhead(p, 38, p)).toBe(-1);
    }
    // Other faces whose next occurrence lies past the arrow are equally void.
    expect(matchingFieldAhead('yellow', 36, 'green')).toBe(-1); // next green = J47
    expect(matchingFieldAhead('yellow', 37, 'red')).toBe(-1); // next red on the virtual lap
  });

  test('from the gateway ONLY the own color steps into the row (no looping)', () => {
    for (const p of TURN_ORDER) {
      expect(matchingFieldAhead(p, 39, p)).toBe(1); // → home slot 0
      for (const face of TRACK_COLORS) {
        if (face !== p) expect(matchingFieldAhead(p, 39, face)).toBe(-1);
      }
    }
  });

  test('inside the row every face finds its next field (past-goal detection) — never -1', () => {
    // The exhaustive bound behind MATCH_SEARCH_AHEAD: from a home slot the
    // own color matches the very next slot; every foreign face re-appears on
    // the virtual next lap (worst case 12 — the constant keeps a margin).
    for (const p of TURN_ORDER) {
      for (let j = RULES.trackFields; j <= WINNING_POSITION - 1; j++) {
        for (const face of TRACK_COLORS) {
          const d = matchingFieldAhead(p, j, face);
          expect(d).toBeGreaterThanOrEqual(1);
          expect(d).toBeLessThanOrEqual(12);
        }
      }
    }
  });
});

describe('the straight-line home feed (req: entry opposite the color row)', () => {
  test("every player's circuit ends at the arm tip directly opposite their row", () => {
    for (const p of TURN_ORDER) {
      const tip = LOOP[FINISH_TIP_INDEX[p]]!;
      const slot0 = HOME_ROW[p]![0]!;
      // The tip is COLINEAR with the row (same row or column) and directly
      // adjacent to the outer cell — the pawn feeds straight into the row.
      const sameLine = tip.col === slot0.col || tip.row === slot0.row;
      expect(sameLine).toBe(true);
      expect(Math.abs(tip.col - slot0.col) + Math.abs(tip.row - slot0.row)).toBe(1);
      expect(trackField(FINISH_TIP_INDEX[p]).homeFeedOf).toBe(p);
    }
  });

  test('the row itself is a straight line feeding inward toward the goal mouth', () => {
    for (const p of TURN_ORDER) {
      const cells = HOME_ROW[p]!;
      // Straight line: colinear cells.
      const colinear =
        cells.every((c) => c.col === cells[0]!.col) || cells.every((c) => c.row === cells[0]!.row);
      expect(colinear).toBe(true);
      // The winning cell (slot 2) sits directly beside the goal mouth.
      const goal = cells[2]!;
      const mouth = HOME_MOUTH[p]!;
      expect(Math.abs(goal.col - mouth.col) + Math.abs(goal.row - mouth.row)).toBe(1);
    }
    expect(HOME_ROW.blue![2]!.row).toBe(HOME_ROW.red![2]!.row); // row 5 both
    expect(HOME_ROW.yellow![2]!.col).toBe(HOME_ROW.green![2]!.col); // col 5 both
  });

  test("every start field sits directly beside its player's base corner block", () => {
    for (const p of TURN_ORDER) {
      const start = LOOP[START_INDEX[p]]!;
      const block = BASE_BLOCK[p];
      const touchesVertically =
        start.row === block.row - 1 || start.row === block.row + 4 ||
        (start.row >= block.row && start.row < block.row + 4 &&
          (start.col === block.col - 1 || start.col === block.col + 4));
      expect(touchesVertically).toBe(true);
    }
  });
});

describe('triangle base formations (req: pawns wait in a triangle)', () => {
  test('each base has exactly 3 slots forming a genuine (non-colinear) triangle', () => {
    for (const p of TURN_ORDER) {
      const slots = BASE_SLOTS[p]!;
      expect(slots).toHaveLength(3);
      const [a, b, c] = slots;
      // Non-colinear: the triangle area (cross product) is non-zero.
      const area =
        (b!.col - a!.col) * (c!.row - a!.row) - (b!.row - a!.row) * (c!.col - a!.col);
      expect(Math.abs(area)).toBeGreaterThan(0.1); // a real triangle, not a line
      // Comfortable spacing between every pair of slots.
      const pairs = [
        [a!, b!],
        [a!, c!],
        [b!, c!],
      ];
      for (const [u, v] of pairs) {
        const d = Math.hypot(u.col - v.col, u.row - v.row);
        expect(d).toBeGreaterThan(0.9); // pawns never touch
      }
    }
  });

  test('the triangle is compact — it fits inside the corner block', () => {
    for (const p of TURN_ORDER) {
      const block = BASE_BLOCK[p];
      const slots = BASE_SLOTS[p]!;
      const margin = 0.45; // slot radius in cell units (0.44 world / 1.18)
      for (const s of slots) {
        expect(s.col).toBeGreaterThan(block.col - margin);
        expect(s.col).toBeLessThan(block.col + 4 + margin);
        expect(s.row).toBeGreaterThan(block.row - margin);
        expect(s.row).toBeLessThan(block.row + 4 + margin);
      }
      // Compact footprint: the triangle extent stays well inside the block.
      const cols = slots.map((s) => s.col);
      const rows = slots.map((s) => s.row);
      const extent = Math.max(
        Math.max(...cols) - Math.min(...cols),
        Math.max(...rows) - Math.min(...rows),
      );
      expect(extent).toBeLessThan(1.4); // far smaller than the old straight line (2.2+)
    }
  });
});
