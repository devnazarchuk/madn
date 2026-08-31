import type { PlayerColorId, TrackColorId } from '@/config/gameConfig';
import { LOOP, START_INDEX, TURN_ORDER } from './board';
import { BOARD, cellToWorld, type WorldPoint } from './layout';

/**
 * ============================================================================
 * BOARD TRACK CONFIG — the single authoritative track layout definition.
 * ============================================================================
 * Every one of the 40 loop fields is declared here ONCE, with:
 *   • a stable id ("f12"),
 *   • its logical loop index,
 *   • its grid cell and world coordinates (shared by engine & 3D layer),
 *   • its deliberately designed visual color,
 *   • whether it is a start field and which segment (player arm) it belongs to.
 *
 * The visual color pattern (ruleset kids-v3)
 * ------------------------------------------
 * Four 10-field segments, each woven from its own repeating 4-color template
 * [owner, c1, c2, c3] (slot s of a segment = template[s mod 4], so the owner
 * color stands at slots 0, 4 and 8 — and at slot 0 it is the start field):
 *
 *   blue   (loop 0–9)   blue, red, green, yellow, blue, red, green, yellow, blue, red
 *   yellow (loop 10–19) yellow, green, red, blue, yellow, green, red, blue, yellow, green
 *   red    (loop 20–29) red, blue, green, yellow, red, blue, green, yellow, red, blue
 *   green  (loop 30–39) green, yellow, red, blue, green, yellow, red, blue, green, yellow
 *
 * Guarantees (verified by the engine tests and by exhaustive search — this
 * exact assignment minimises the longest possible move):
 *   1. Deterministic — the pattern is data, never random.
 *   2. Every color appears exactly 10 times (perfect balance).
 *   3. No two adjacent fields share a color (no accidental clusters).
 *   4. Symmetric structure: every arm repeats its own 4-color cycle, and the
 *      "second color" of the four arms is a permutation of all four colors.
 *   5. Every "next field of color X" lies 1–5 fields ahead (tight pacing).
 *   6. Only the four player colors appear — no black or unrelated colors.
 */

/**
 * The exact per-arm weaving template. The position-1 colors across the four
 * arms (red, green, blue, yellow) form a permutation of all four colors —
 * the property that guarantees perfect balance.
 */
export const SEGMENT_TEMPLATES: Record<PlayerColorId, TrackColorId[]> = {
  blue: ['blue', 'red', 'green', 'yellow'],
  yellow: ['yellow', 'green', 'red', 'blue'],
  red: ['red', 'blue', 'green', 'yellow'],
  green: ['green', 'yellow', 'red', 'blue'],
};

/** Segment owners in loop order (blue's arm first). */
const SEGMENT_OWNERS: PlayerColorId[] = TURN_ORDER; // blue, yellow, red, green

export interface TrackFieldConfig {
  /** Stable identifier, e.g. "f12". */
  id: string;
  /** Logical loop index (0..39, clockwise from blue's start field). */
  loopIndex: number;
  /** Grid cell on the 11×11 board. */
  col: number;
  row: number;
  /** World coordinates on the playing surface. */
  world: WorldPoint;
  /** Deliberate visual color of the field itself. */
  color: TrackColorId;
  /** True for the first field of a player's segment (their start field). */
  isStart: boolean;
  /** The player whose 10-field segment the field belongs to. */
  segmentOwner: PlayerColorId;
  /** Section of the board the field belongs to. */
  section: 'track' | 'start';
  /** True when the field sits directly before a player's home-row entry
   * (the last track field of that player's path). */
  isFinishAdjacent: boolean;
}

function buildTrackFields(): TrackFieldConfig[] {
  const fields: TrackFieldConfig[] = [];
  for (let i = 0; i < LOOP.length; i++) {
    const cell = LOOP[i]!;
    const segment = Math.floor(i / 10);
    const owner = SEGMENT_OWNERS[segment]!;
    const template = SEGMENT_TEMPLATES[owner];
    // Slot s of the segment = template[s mod 4] (positions 0,4,8 = owner).
    const color = template[i % 10 % 4]!;
    const isStart = i % 10 === 0 && START_INDEX[owner] === i;
    const world = cellToWorld(cell.col, cell.row);
    fields.push({
      id: `f${i}`,
      loopIndex: i,
      col: cell.col,
      row: cell.row,
      world,
      color,
      isStart,
      segmentOwner: owner,
      section: isStart ? 'start' : 'track',
      isFinishAdjacent: i % 10 === 9,
    });
  }
  return fields;
}

/** The full, authoritative track field table (loop order). */
export const TRACK_FIELDS: TrackFieldConfig[] = buildTrackFields();

/** Visual color of every loop field, indexed by loop index. */
export const FIELD_COLORS: TrackColorId[] = TRACK_FIELDS.map((f) => f.color);

/** Field config lookup by loop index. */
export function trackField(loopIndex: number): TrackFieldConfig {
  return TRACK_FIELDS[((loopIndex % LOOP.length) + LOOP.length) % LOOP.length]!;
}

/** How far ahead the next field of `color` lies from a loop index (1..5). */
export function distanceToNextColor(fromLoop: number, color: TrackColorId): number {
  for (let ahead = 1; ahead <= 5; ahead++) {
    if (FIELD_COLORS[(fromLoop + ahead) % FIELD_COLORS.length] === color) return ahead;
  }
  return -1; // unreachable with the woven pattern
}
