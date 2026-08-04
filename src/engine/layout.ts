import {
  BASE_SLOTS,
  HOME_MOUTH,
  HOME_ROW,
  LOOP,
  cellForPosition,
} from './board';
import type { PlayerColorId, Position } from './types';

/**
 * ============================================================================
 * BOARD LAYOUT — logical positions → world coordinates (top view).
 * ============================================================================
 * The 11×11 grid is centered on the origin. Three.js convention: +x east,
 * +z toward the camera (south). One grid cell = SPACING world units.
 */

export const BOARD = {
  /** Grid cells per axis (11×11 classic cross). */
  grid: 11,
  /** World units per grid cell. */
  spacing: 1.18,
  /** Half extent of the playing surface (without frame). */
  surfaceHalf: 6.55,
  /** Frame thickness. */
  frame: 0.55,
  /** Full board size (world units). */
  size: 14.2,
  /** Height of the board foundation. */
  thickness: 0.5,
  /** Track field circle radius. */
  fieldRadius: 0.5,
  /** Base/home slot radius. */
  slotRadius: 0.44,
  /** Height fields/slots rise above the surface. */
  tileHeight: 0.075,
} as const;

export interface WorldPoint {
  x: number;
  z: number;
}

export function cellToWorld(col: number, row: number): WorldPoint {
  const c = (col - 5) * BOARD.spacing;
  const r = (row - 5) * BOARD.spacing;
  return { x: c, z: r };
}

/** World position of a pawn with the given logical position. */
export function positionToWorld(color: PlayerColorId, pos: Position): WorldPoint {
  const cell = cellForPosition(color, pos);
  return cellToWorld(cell.col, cell.row);
}

/** Precomputed track field world positions (loop order). */
export const TRACK_POINTS: WorldPoint[] = LOOP.map((cell) => cellToWorld(cell.col, cell.row));

export const HOME_POINTS: Record<PlayerColorId, WorldPoint[]> = {
  blue: HOME_ROW.blue.map((c) => cellToWorld(c.col, c.row)),
  yellow: HOME_ROW.yellow.map((c) => cellToWorld(c.col, c.row)),
  red: HOME_ROW.red.map((c) => cellToWorld(c.col, c.row)),
  green: HOME_ROW.green.map((c) => cellToWorld(c.col, c.row)),
};

export const MOUTH_POINTS: Record<PlayerColorId, WorldPoint> = {
  blue: cellToWorld(HOME_MOUTH.blue.col, HOME_MOUTH.blue.row),
  yellow: cellToWorld(HOME_MOUTH.yellow.col, HOME_MOUTH.yellow.row),
  red: cellToWorld(HOME_MOUTH.red.col, HOME_MOUTH.red.row),
  green: cellToWorld(HOME_MOUTH.green.col, HOME_MOUTH.green.row),
};

export const BASE_POINTS: Record<PlayerColorId, WorldPoint[]> = {
  blue: BASE_SLOTS.blue.map((c) => cellToWorld(c.col, c.row)),
  yellow: BASE_SLOTS.yellow.map((c) => cellToWorld(c.col, c.row)),
  red: BASE_SLOTS.red.map((c) => cellToWorld(c.col, c.row)),
  green: BASE_SLOTS.green.map((c) => cellToWorld(c.col, c.row)),
};

/** Where the 3D die rests (on the table beside the east arm). */
export const DICE_REST: WorldPoint = { x: 8.75, z: 0.4 };

/** Orbit target defaults. */
export const CAMERA_DEFAULTS = {
  position: [0, 13.2, 10.4] as [number, number, number],
  fov: 42,
  minDistance: 9,
  maxDistance: 24,
  maxPolarAngle: Math.PI / 2.22,
  minPolarAngle: Math.PI / 7,
};
