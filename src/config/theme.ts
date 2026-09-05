import type { DiceFaceId, PlayerColorId, TrackColorId } from './gameConfig';

/**
 * ============================================================================
 * THEME — warm, premium wooden-toy palette (shared by 3D scene and UI).
 * ============================================================================
 */

export const COLORS = {
  red: '#E8503A',
  blue: '#3E8ED0',
  green: '#43B57E',
  yellow: '#F2C14E',
} as const satisfies Record<TrackColorId, string>;

/** Slightly deeper variants for rims/shadows. */
export const COLORS_DEEP: Record<TrackColorId, string> = {
  red: '#C23A28',
  blue: '#2D6EA8',
  green: '#2E8F63',
  yellow: '#D9A32E',
};

/** The golden star die face (wild roll). */
export const STAR_COLOR = '#D9A441';
export const STAR_COLOR_DEEP = '#B6842B';

/** Light tints for UI surfaces. */
export const COLORS_SOFT: Record<PlayerColorId, string> = {
  red: '#FBE3DE',
  blue: '#DEEDF8',
  green: '#DFF2E8',
  yellow: '#FBEFD4',
};

export const MATERIAL = {
  /** Board foundation (walnut). */
  walnut: '#5B3A24',
  walnutDeep: '#40281A',
  /** Playing surface (warm oak/cream). */
  cream: '#F4E7CE',
  creamDeep: '#E8D6B4',
  /** Frame accents. */
  gold: '#D9A441',
  goldDeep: '#B6842B',
  /** Table behind the board. */
  table: '#8A6B4F',
  /** Medallion wood. */
  medallion: '#6E4A2E',
} as const;

/** Emoji-ish glyph per character for quick UI badges (no external assets). */
export const CHARACTER_ICON: Record<PlayerColorId, string> = {
  blue: '🐰',
  yellow: '🐭',
  red: '🐱',
  green: '🐶',
};

export function faceColor(face: DiceFaceId): string {
  return face === 'star' ? STAR_COLOR : COLORS[face];
}

export function faceLabel(face: DiceFaceId): string {
  return face === 'star' ? 'Star' : face.charAt(0).toUpperCase() + face.slice(1);
}
