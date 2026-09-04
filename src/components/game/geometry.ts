import * as THREE from 'three';
import { BOARD, cellToWorld, DICE_PEDESTAL_TOP } from '@/engine/layout';
import { cellForPosition } from '@/engine/board';
import { DICE_FACES, type DiceFaceId } from '@/config/gameConfig';
import type { Area, PlayerColorId, Position } from '@/engine/types';

/**
 * Shared world-space geometry constants + helpers for the 3D layer.
 * Vertical layering (world y): table top = 0 · foundation top = 0.44 ·
 * cream surface top = 0.60 · raised field top = 0.675 · base slot top = 0.815.
 * NOTE: drei RoundedBox radii must stay below half of the smallest box
 * dimension or the extruded geometry bloats and covers the board.
 */

export const SURFACE_TOP = BOARD.surfaceTop;
export const FIELD_TOP = SURFACE_TOP + 0.075; // 0.675
export const BASE_PANEL_TOP = SURFACE_TOP + 0.14; // 0.74
export const BASE_TOP = BASE_PANEL_TOP + 0.075; // 0.815

export const DIE_SIZE = 1.05;

/** The die rests at the CENTER of the table on its pedestal. */
export const DICE_REST: [number, number, number] = [0, DICE_PEDESTAL_TOP + DIE_SIZE / 2, 0];

/** Top surface y of the cell a pawn stands on, by logical area. */
export function cellTopY(area: Area): number {
  return area === 'base' ? BASE_TOP : FIELD_TOP;
}

/** World position (feet of the pawn) for any logical position. */
export function worldOf(color: PlayerColorId, pos: Position): THREE.Vector3 {
  const cell = cellForPosition(color, pos);
  const { x, z } = cellToWorld(cell.col, cell.row);
  return new THREE.Vector3(x, cellTopY(pos.area), z);
}

// ---------------------------------------------------------------------------
// Color die — face ↔ orientation mapping
// ---------------------------------------------------------------------------

/**
 * Sticker placement: +X red · −X blue · +Y green · −Y yellow · +Z star · −Z star
 * (the two golden star wilds sit on opposite faces). Quaternions bring that
 * face pointing +Y (up).
 */
const FACE_EULERS: Record<DiceFaceId, THREE.Euler> = {
  red: new THREE.Euler(0, 0, Math.PI / 2),
  blue: new THREE.Euler(0, 0, -Math.PI / 2),
  green: new THREE.Euler(0, 0, 0),
  yellow: new THREE.Euler(Math.PI, 0, 0),
  star: new THREE.Euler(-Math.PI / 2, 0, 0),
};

export const FACE_UP_QUAT: Record<DiceFaceId, THREE.Quaternion> = Object.fromEntries(
  DICE_FACES.map((face) => [face, new THREE.Quaternion().setFromEuler(FACE_EULERS[face])]),
) as Record<DiceFaceId, THREE.Quaternion>;

/** Orientation that shows `face` on top (defaults to green). */
export function quatForFace(face: DiceFaceId | null): THREE.Quaternion {
  return FACE_UP_QUAT[face ?? 'green']!;
}

// ---------------------------------------------------------------------------
// Star sticker — the golden five-point wild
// ---------------------------------------------------------------------------

/** Flat five-pointed star shape (outer radius 0.3). */
export function makeStarShape(outer: number, inner: number): THREE.Shape {
  const shape = new THREE.Shape();
  const points = 5;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

// ---------------------------------------------------------------------------
// Small easing helpers
// ---------------------------------------------------------------------------

export function easeOutCubic(t: number): number {
  const c = 1 - t;
  return 1 - c * c * c;
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
