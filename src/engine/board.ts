import { RULES, type PlayerColorId } from '@/config/gameConfig';
import type { Position } from './types';

/**
 * ============================================================================
 * BOARD TOPOLOGY — classic cross layout (11×11 grid), one 40-field loop.
 * ============================================================================
 * Pure topology only (cells, indices, position helpers). The deliberate
 * visual color of every field — plus ids, world coordinates and start/finish
 * metadata — lives in engine/boardTrackConfig.ts, the single authoritative
 * track layout definition.
 *
 * Grid coordinates (col,row) from 0..10 (row 0 = "north" edge).
 *
 *  - Four 4×4 corner blocks hold the player bases (3 slots each, arranged
 *    in a compact triangle).
 *  - Four 3×4 arms; each arm's two outer columns carry the track, the center
 *    column holds the player's HOME row (3 slots) entered from the OUTER end.
 *  - The center 3×3 block: 4 corner cells are track fields, 4 edge cells are
 *    decorative goal mouths, the middle cell is the central dice plaza.
 *
 * Player assignment (clockwise): blue = north-west, yellow = north-east,
 * red = south-east, green = south-west.
 *
 * STARTS & HOME ENTRIES (kids-v4)
 * --------------------------------
 * Every player's start field sits directly beside their base corner, and the
 * 40-field circuit that follows runs clockwise all the way around the board,
 * finishing at the ARM TIP directly opposite that player's home row — the
 * closest straight-line cell colinear with the row, which feeds the pawn
 * straight into it:
 *
 *   blue   start {0,4}  → circuit ends at the WEST  tip {0,5}  → feeds east into row 5
 *   yellow start {6,0}  → circuit ends at the NORTH tip {5,0}  → feeds south into col 5
 *   red    start {10,6} → circuit ends at the EAST  tip {10,5} → feeds west into row 5
 *   green  start {4,10} → circuit ends at the SOUTH tip {5,10} → feeds north into col 5
 *
 * The journey of one pawn therefore has 43 positions: 40 track fields
 * (loop indices start … start+39) followed by the 3 home slots, where home
 * slot 0 is the OUTER cell (beside the tip) and home slot 2 (beside the goal
 * mouth) is the WINNING cell. All journey logic uses `journeyIndex`.
 */

export interface GridCell {
  col: number;
  row: number;
}

/** The 40 loop fields in clockwise order, starting at blue's start field. */
export const LOOP: GridCell[] = [
  { col: 4, row: 3 }, // 0  top arm, west column (northbound)
  { col: 4, row: 2 },
  { col: 4, row: 1 },
  { col: 4, row: 0 },
  { col: 5, row: 0 }, // 4  NORTH tip — feeds yellow's home row
  { col: 6, row: 0 },
  { col: 6, row: 1 },
  { col: 6, row: 2 },
  { col: 6, row: 3 },
  { col: 6, row: 4 }, // 9  center NE corner
  { col: 7, row: 4 }, // 10 east arm, north row (eastbound)
  { col: 8, row: 4 },
  { col: 9, row: 4 },
  { col: 10, row: 4 },
  { col: 10, row: 5 }, // 14 EAST tip — feeds red's home row
  { col: 10, row: 6 },
  { col: 9, row: 6 },
  { col: 8, row: 6 },
  { col: 7, row: 6 },
  { col: 6, row: 6 }, // 19 center SE corner
  { col: 6, row: 7 }, // 20 bottom arm, east column (southbound)
  { col: 6, row: 8 },
  { col: 6, row: 9 },
  { col: 6, row: 10 },
  { col: 5, row: 10 }, // 24 SOUTH tip — feeds green's home row
  { col: 4, row: 10 },
  { col: 4, row: 9 },
  { col: 4, row: 8 },
  { col: 4, row: 7 },
  { col: 4, row: 6 }, // 29 center SW corner
  { col: 3, row: 6 }, // 30 west arm, south row (westbound)
  { col: 2, row: 6 },
  { col: 1, row: 6 },
  { col: 0, row: 6 },
  { col: 0, row: 5 }, // 34 WEST tip — feeds blue's home row
  { col: 0, row: 4 }, // 35 BLUE START — beside the NW base, heading east
  { col: 1, row: 4 },
  { col: 2, row: 4 },
  { col: 3, row: 4 },
  { col: 4, row: 4 }, // 39 center NW corner — blue's first-corner turn
];

/**
 * Loop index of each player's start field. Each start sits directly beside
 * the player's base corner so that the full 40-field circuit ends at the arm
 * tip colinear with that player's home row (see module docs).
 */
export const START_INDEX: Record<PlayerColorId, number> = {
  blue: 35,
  yellow: 5,
  red: 15,
  green: 25,
};

/**
 * The loop index every player's circuit ENDS on — always the arm tip
 * directly opposite (colinear with) that player's home row: the GOLDEN ARROW
 * GATEWAY, a mandatory stop. The pawn standing there steps into home slot 0
 * with its next OWN-color roll (kids-v6: it may never loop past the arrow).
 */
export const FINISH_TIP_INDEX: Record<PlayerColorId, number> = {
  blue: 34,
  yellow: 4,
  red: 14,
  green: 24,
};

/** Clockwise turn order. */
export const TURN_ORDER: PlayerColorId[] = ['blue', 'yellow', 'red', 'green'];

/** Default color sets by player count (spread evenly around the board). */
export const DEFAULT_COLORS: Record<number, PlayerColorId[]> = {
  2: ['red', 'blue'],
  3: ['red', 'green', 'blue'],
  4: ['red', 'green', 'blue', 'yellow'],
};

/**
 * Home rows: 3 slots per player inside their arm's center column.
 * Slot 0 is the OUTER cell — directly beside the arm tip that feeds the row;
 * slot 2 (the WINNING cell) is the inner cell beside the decorative mouth.
 */
export const HOME_ROW: Record<PlayerColorId, GridCell[]> = {
  // west arm, middle row — fed straight east from the west tip {0,5}
  blue: [
    { col: 1, row: 5 },
    { col: 2, row: 5 },
    { col: 3, row: 5 },
  ],
  // top arm, middle column — fed straight south from the north tip {5,0}
  yellow: [
    { col: 5, row: 1 },
    { col: 5, row: 2 },
    { col: 5, row: 3 },
  ],
  // east arm, middle row — fed straight west from the east tip {10,5}
  red: [
    { col: 9, row: 5 },
    { col: 8, row: 5 },
    { col: 7, row: 5 },
  ],
  // bottom arm, middle column — fed straight north from the south tip {5,10}
  green: [
    { col: 5, row: 9 },
    { col: 5, row: 8 },
    { col: 5, row: 7 },
  ],
};

/**
 * Decorative goal cells just beyond each winning cell, flanking the central
 * dice plaza (the finish line a completed pawn reaches toward).
 */
export const HOME_MOUTH: Record<PlayerColorId, GridCell> = {
  blue: { col: 4, row: 5 },
  yellow: { col: 5, row: 4 },
  red: { col: 6, row: 5 },
  green: { col: 5, row: 6 },
};

/** Corner blocks (4×4) that host the bases, by player. */
export const BASE_BLOCK: Record<PlayerColorId, GridCell> = {
  blue: { col: 0, row: 0 },
  yellow: { col: 7, row: 0 },
  red: { col: 7, row: 7 },
  green: { col: 0, row: 7 },
};

/**
 * Base slots: the three pawns wait in a compact TRIANGLE formation (one
 * apex pawn toward the board center, two tucked toward the corner) instead of
 * a straight line — cleaner, and takes up less of the corner block.
 * Local pattern is defined with the apex pointing along the inward diagonal.
 */
export function baseSlots(color: PlayerColorId): GridCell[] {
  const block = BASE_BLOCK[color];
  // Block spans 4×4 cells from its anchor; its center:
  const cx = block.col + 1.5;
  const cy = block.row + 1.5;
  // Unit vector pointing toward the OUTER board corner (diagonal):
  const dx = Math.sign(block.col - 5) || -1;
  const dy = Math.sign(block.row - 5) || -1;
  const ux = dx / Math.SQRT2;
  const uy = dy / Math.SQRT2;
  // Perpendicular of the diagonal:
  const px = -uy;
  const py = ux;
  // Triangle: apex toward the board center, two rear slots toward the corner.
  const front = 0.64; // apex offset along the inward diagonal
  const back = 0.34; // rear pair offset toward the corner
  const side = 0.55; // rear pair spread along the perpendicular
  const apex: [number, number] = [-front * ux, -front * uy];
  const rearA: [number, number] = [back * ux + side * px, back * uy + side * py];
  const rearB: [number, number] = [back * ux - side * px, back * uy - side * py];
  return [apex, rearA, rearB].map(([ox, oy]) => ({
    col: cx + ox,
    row: cy + oy,
  }));
}

export const BASE_SLOTS: Record<PlayerColorId, GridCell[]> = {
  blue: baseSlots('blue'),
  yellow: baseSlots('yellow'),
  red: baseSlots('red'),
  green: baseSlots('green'),
};

// ---------------------------------------------------------------------------
// Position helpers
// ---------------------------------------------------------------------------

export function samePosition(a: Position, b: Position): boolean {
  return a.area === b.area && a.index === b.index;
}

/**
 * The pawn's position along its OWN 43-step journey:
 *   0..39  — the track (path index relative to the start field)
 *   40..42 — the home row (slot 0 = outer cell, slot 2 = winning cell)
 *   -1     — still waiting in the base.
 */
export function journeyIndex(color: PlayerColorId, pos: Position): number {
  if (pos.area === 'base') return -1;
  if (pos.area === 'home') return RULES.trackFields + pos.index;
  return pathIndex(color, pos);
}

/** Position along the player's own 40-field track (0..39), -1 for base, 40+ for home. */
export function pathIndex(color: PlayerColorId, pos: Position): number {
  if (pos.area === 'base') return -1;
  if (pos.area === 'home') return RULES.trackFields;
  const start = START_INDEX[color];
  return (pos.index - start + RULES.trackFields) % RULES.trackFields;
}

/** The loop index that lies `pathIdx` fields after the given path index. */
export function loopIndexFromPath(color: PlayerColorId, pathIdx: number): number {
  return (START_INDEX[color] + pathIdx) % RULES.trackFields;
}

/** The loop index "under" a journey position (home slots map to the virtual next lap). */
export function loopIndexFromJourney(color: PlayerColorId, journey: number): number {
  return (START_INDEX[color] + journey) % RULES.trackFields;
}

/** Grid cell for any logical position. */
export function cellForPosition(color: PlayerColorId, pos: Position): GridCell {
  switch (pos.area) {
    case 'track':
      return LOOP[pos.index];
    case 'base':
      return BASE_SLOTS[color][pos.index];
    case 'home':
      return HOME_ROW[color][pos.index];
  }
}

/** All pawns' home row is private; base is private; track is shared. */
export function isPrivateArea(pos: Position): boolean {
  return pos.area === 'base' || pos.area === 'home';
}
