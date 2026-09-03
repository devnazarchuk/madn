import { describe, expect, test } from 'bun:test';
import {
  FIELD_COLORS,
  TRACK_FIELDS,
  distanceToNextColor,
  trackField,
} from '../src/engine/boardTrackConfig';
import { LOOP, START_INDEX, TURN_ORDER } from '../src/engine/board';
import { PLAYER_COLORS } from '../src/config/gameConfig';

/**
 * BOARD TRACK CONFIG — the deliberate color distribution & topology.
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

describe('track color distribution (deliberate design)', () => {
  test('only the four player colors appear — no black or unrelated colors', () => {
    for (const color of FIELD_COLORS) {
      expect(PLAYER_COLORS).toContain(color);
    }
    expect(FIELD_COLORS).not.toContain('purple');
    expect(FIELD_COLORS).not.toContain('black');
  });

  test('every color appears EXACTLY 10 times (perfect balance)', () => {
    for (const color of PLAYER_COLORS) {
      expect(FIELD_COLORS.filter((c) => c === color).length).toBe(10);
    }
  });

  test('no two adjacent fields share a color (no clusters, incl. wrap)', () => {
    for (let i = 0; i < 40; i++) {
      expect(FIELD_COLORS[i]).not.toBe(FIELD_COLORS[(i + 1) % 40]!);
    }
  });

  test('each segment starts with its owner color (start fields)', () => {
    for (const owner of TURN_ORDER) {
      const start = START_INDEX[owner];
      expect(FIELD_COLORS[start]).toBe(owner);
      expect(trackField(start).isStart).toBe(true);
      expect(trackField(start).segmentOwner).toBe(owner);
      expect(trackField(start).section).toBe('start');
    }
  });

  test('the pattern is symmetric across the four arms (per-arm 4-color cycles)', () => {
    const seg = (i: number) => FIELD_COLORS.slice(i * 10, i * 10 + 10);
    const templates = [seg(0), seg(1), seg(2), seg(3)].map((s) => s.slice(0, 4));
    // Each arm repeats its own [owner, c1, c2, c3] cycle over its 10 slots.
    for (const s of [seg(0), seg(1), seg(2), seg(3)]) {
      expect(s[1]).toBe(s[5]);
      expect(s[1]).toBe(s[9]);
      expect(s[2]).toBe(s[6]);
      expect(s[3]).toBe(s[7]);
      expect(s[0]).toBe(s[4]);
      expect(s[0]).toBe(s[8]);
    }
    // The four templates each start with their owner…
    expect(templates[0]![0]).toBe('blue');
    expect(templates[1]![0]).toBe('yellow');
    expect(templates[2]![0]).toBe('red');
    expect(templates[3]![0]).toBe('green');
    // …and their second colors form a permutation of all four colors
    // (the structural property behind the perfect balance).
    const secondColors = templates.map((t) => t![1]);
    expect(new Set(secondColors).size).toBe(4);
    for (const color of PLAYER_COLORS) {
      expect(secondColors).toContain(color);
    }
  });

  test('every next-field-of-color lies 1..5 fields ahead (tight pacing)', () => {
    for (let i = 0; i < 40; i++) {
      for (const color of PLAYER_COLORS) {
        expect(distanceToNextColor(i, color)).toBeGreaterThanOrEqual(1);
        expect(distanceToNextColor(i, color)).toBeLessThanOrEqual(5);
      }
    }
  });
});
