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
 *  - Four 4×4 corner blocks hold the player bases (3 slots each).
 *  - Four 3×4 arms; each arm's two outer columns carry the track, the center
 *    column holds the player's HOME row (3 slots) plus a decorative mouth.
 *  - The center 3×3 block: 4 corner cells are track fields, 4 edge cells are
 *    home mouths, the middle cell is the central dice plaza.
 *
 * Player assignment (clockwise): blue = north-west, yellow = north-east,
 * red = south-east, green = south-west. A player's start field begins their
 * 10-field segment; the segment's first field is painted in their color.
 */

export interface GridCell {
  col: number;
  row: number;
}

/** The 40 loop fields in clockwise order, starting at blue's start field. */
export const LOOP: GridCell[] = [
  { col: 4, row: 3 }, // 0  blue start (top arm, west column)
  { col: 4, row: 2 },
  { col: 4, row: 1 },
  { col: 4, row: 0 },
  { col: 5, row: 0 }, // 4  top tip
  { col: 6, row: 0 },
  { col: 6, row: 1 },
  { col: 6, row: 2 },
  { col: 6, row: 3 },
  { col: 6, row: 4 }, // 9  center NE corner
  { col: 7, row: 4 }, // 10 yellow start (east arm, north row)
  { col: 8, row: 4 },
  { col: 9, row: 4 },
  { col: 10, row: 4 },
  { col: 10, row: 5 }, // 14 east tip
  { col: 10, row: 6 },
  { col: 9, row: 6 },
  { col: 8, row: 6 },
  { col: 7, row: 6 },
  { col: 6, row: 6 }, // 19 center SE corner
  { col: 6, row: 7 }, // 20 red start (bottom arm, east column)
  { col: 6, row: 8 },
  { col: 6, row: 9 },
  { col: 6, row: 10 },
  { col: 5, row: 10 }, // 24 bottom tip
  { col: 4, row: 10 },
  { col: 4, row: 9 },
  { col: 4, row: 8 },
  { col: 4, row: 7 },
  { col: 4, row: 6 }, // 29 center SW corner
  { col: 3, row: 6 }, // 30 green start (west arm, south row)
  { col: 2, row: 6 },
  { col: 1, row: 6 },
  { col: 0, row: 6 },
  { col: 0, row: 5 }, // 34 west tip
  { col: 0, row: 4 },
  { col: 1, row: 4 },
  { col: 2, row: 4 },
  { col: 3, row: 4 },
  { col: 4, row: 4 }, // 39 center NW corner — blue's path ends here
];

/** Loop index of each player's start field. */
export const START_INDEX: Record<PlayerColorId, number> = {
  blue: 0,
  yellow: 10,
  red: 20,
  green: 30,
};

/** Clockwise turn order. */
export const TURN_ORDER: PlayerColorId[] = ['blue', 'yellow', 'red', 'green'];

/** Default color sets by player count (spread evenly around the board). */
export const DEFAULT_COLORS: Record<number, PlayerColorId[]> = {
  2: ['red', 'blue'],
  3: ['red', 'green', 'blue'],
  4: ['red', 'green', 'blue', 'yellow'],
};

/** Home rows: 3 slots per player inside their arm's center column + the mouth cell. */
export const HOME_ROW: Record<PlayerColorId, GridCell[]> = {
  blue: [
    { col: 3, row: 5 },
    { col: 2, row: 5 },
    { col: 1, row: 5 },
  ],
  yellow: [
    { col: 5, row: 3 },
    { col: 5, row: 2 },
    { col: 5, row: 1 },
  ],
  red: [
    { col: 7, row: 5 },
    { col: 8, row: 5 },
    { col: 9, row: 5 },
  ],
  green: [
    { col: 5, row: 7 },
    { col: 5, row: 8 },
    { col: 5, row: 9 },
  ],
};

/** Decorative mouth cells between the loop's end and each home row. */
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
 * Base slots: three circles arranged in an arc inside each corner block.
 * Local pattern (relative to the block's inner corner), rotated per corner.
 */
export function baseSlots(color: PlayerColorId): GridCell[] {
  const block = BASE_BLOCK[color];
  // Block spans 4×4 cells from its anchor; its center:
  const cx = block.col + 1.5;
  const cy = block.row + 1.5;
  // Direction pointing toward the outer board corner:
  const dx = Math.sign(block.col - 5) || -1;
  const dy = Math.sign(block.row - 5) || -1;
  // Slightly shifted toward the corner, spread along the perpendicular.
  const shift = 0.42;
  const spread = 1.12;
  const base: Array<[number, number]> = [
    [-spread, 0],
    [0, 0],
    [spread, 0],
  ];
  return base.map(([px, py]) => ({
    col: cx + dx * shift + px * -dy,
    row: cy + dy * shift + py * dx,
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

/** Position along the player's own 40-field journey (0..39), -1 for base, 40 for home. */
export function pathIndex(color: PlayerColorId, pos: Position): number {
  if (pos.area === 'base') return -1;
  if (pos.area === 'home') return RULES.trackFields;
  const start = START_INDEX[color];
  return (pos.index - start + RULES.trackFields) % RULES.trackFields;
}

/** The loop index that lies `ahead` fields after the given path index. */
export function loopIndexFromPath(color: PlayerColorId, pathIdx: number): number {
  return (START_INDEX[color] + pathIdx) % RULES.trackFields;
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
