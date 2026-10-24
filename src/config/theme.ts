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
  /** White platform — bright ivory (pops against the cream socket). */
  white: '#FBF9F1',
  /** Black platform — soft charcoal (kid-friendly, never pure black). */
  black: '#37332D',
} as const satisfies Record<TrackColorId, string>;

/** Slightly deeper variants for rims/shadows. */
export const COLORS_DEEP: Record<TrackColorId, string> = {
  red: '#C23A28',
  blue: '#2D6EA8',
  green: '#2E8F63',
  yellow: '#D9A32E',
  /** Slate rim framing the white platform. */
  white: '#97917F',
  /** Deep rim framing the black platform. */
  black: '#161310',
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

// ---------------------------------------------------------------------------
// SEASONAL THEMES & CUSTOMIZATION — purely visual layers.
//
// COLOR-PRESERVATION CONTRACT: the four player colors, the track field
// colors and all rule-critical colors above NEVER change with a theme, a
// board skin or a pawn skin. Themes only repaint the room around the board
// (background, floor, lighting, props, weather) and dress the pawns with
// color-matched accessories — ownership & identification on the board stay
// instantly clear at all times.
// ---------------------------------------------------------------------------

export type ThemeId = 'classic' | 'christmas' | 'winter' | 'easter' | 'summer';
export type BoardSkinId = 'walnut' | 'maple' | 'chocolate' | 'ivory';
export type PawnSkinId = 'classic' | 'elf' | 'gem' | 'chess' | 'egg' | 'gift';
export type PawnAccessoryId = 'none' | 'beanie' | 'santa' | 'cap' | 'crown';
/** 'auto' = follow whatever the active seasonal theme suggests. */
export type AccessoryChoice = PawnAccessoryId | 'auto';

export type EnvironmentKind = 'room' | 'snowForest' | 'meadow' | 'beach';
export type WeatherKind = 'none' | 'snow' | 'petals' | 'sparkles';

export interface SeasonalTheme {
  /** UI label. */
  label: string;
  /** Scene background (replaces the warm playroom wall). */
  background: string;
  /** Distance fog for depth; far >= 90 effectively disables it. */
  fog: { color: string; near: number; far: number };
  /** The floor the board sits on (theme-tinted). */
  table: string;
  ambient: { intensity: number; color: string };
  hemi: { sky: string; ground: string; intensity: number };
  sun: { position: [number, number, number]; intensity: number; color: string };
  environment: EnvironmentKind;
  weather: WeatherKind;
  /** Accessory pawns wear when the choice is 'auto'. */
  accessory: PawnAccessoryId;
}

export const THEMES: Record<ThemeId, SeasonalTheme> = {
  classic: {
    label: 'Classic room',
    background: '#221913',
    fog: { color: '#221913', near: 60, far: 120 },
    table: '#8A6B4F',
    ambient: { intensity: 0.52, color: '#FFF2DC' },
    hemi: { sky: '#FFEFD2', ground: '#3A2B1E', intensity: 0.4 },
    sun: { position: [7, 14, 5], intensity: 1.3, color: '#FFF6E6' },
    environment: 'room',
    weather: 'none',
    accessory: 'none',
  },
  christmas: {
    label: 'Christmas',
    background: '#1B2B36',
    fog: { color: '#37485A', near: 26, far: 72 },
    table: '#DCE7F2',
    ambient: { intensity: 0.5, color: '#CFE1EE' },
    hemi: { sky: '#EAF3FB', ground: '#2C4353', intensity: 0.5 },
    sun: { position: [6, 16, 7], intensity: 1.15, color: '#EAF2FA' },
    environment: 'snowForest',
    weather: 'snow',
    accessory: 'santa',
  },
  winter: {
    label: 'Winter',
    background: '#22323F',
    fog: { color: '#3E5263', near: 24, far: 64 },
    table: '#CFDEEA',
    ambient: { intensity: 0.52, color: '#D8E5EF' },
    hemi: { sky: '#DDEBF5', ground: '#33434F', intensity: 0.55 },
    sun: { position: [-7, 15, 6], intensity: 1.05, color: '#E5EEF6' },
    environment: 'snowForest',
    weather: 'snow',
    accessory: 'beanie',
  },
  easter: {
    label: 'Easter',
    background: '#A9D7EC',
    fog: { color: '#C4E5F2', near: 30, far: 86 },
    table: '#7CBF68',
    ambient: { intensity: 0.58, color: '#FFF4E2' },
    hemi: { sky: '#FFFBEF', ground: '#5E8F4E', intensity: 0.5 },
    sun: { position: [9, 15, 4], intensity: 1.35, color: '#FFF3D9' },
    environment: 'meadow',
    weather: 'petals',
    // No accessory in spring — the striped egg skin stays fully visible.
    accessory: 'none',
  },
  summer: {
    label: 'Summer',
    background: '#8FD0F2',
    fog: { color: '#C6E8F7', near: 34, far: 96 },
    table: '#E3D2A4',
    ambient: { intensity: 0.56, color: '#FFF8E0' },
    hemi: { sky: '#FFF9E6', ground: '#B99F6B', intensity: 0.55 },
    sun: { position: [10, 18, 4], intensity: 1.5, color: '#FFF2C8' },
    environment: 'beach',
    weather: 'sparkles',
    accessory: 'cap',
  },
};

/** UI order for the theme picker. */
export const THEME_ORDER: ThemeId[] = ['classic', 'christmas', 'winter', 'easter', 'summer'];

// ---------------------------------------------------------------------------
// Board skins — the wood & cream palette of the board itself. Track field
// colors, home rows, golden accents and all gameplay colors are untouched.
// ---------------------------------------------------------------------------

export interface BoardSkin {
  label: string;
  /** Foundation wood (outer frame & pedestal wood). */
  foundation: string;
  foundationDeep: string;
  /** Cream playing surface tone. */
  surface: string;
  surfaceDeep: string;
}

export const BOARD_SKINS: Record<BoardSkinId, BoardSkin> = {
  walnut: {
    label: 'Walnut',
    foundation: '#5B3A24',
    foundationDeep: '#40281A',
    surface: '#F4E7CE',
    surfaceDeep: '#E8D6B4',
  },
  maple: {
    label: 'Maple',
    foundation: '#B98A5A',
    foundationDeep: '#96683C',
    surface: '#FAF0DA',
    surfaceDeep: '#EDDFBA',
  },
  chocolate: {
    label: 'Chocolate',
    foundation: '#3E2716',
    foundationDeep: '#2A1A0E',
    surface: '#EBD9B4',
    surfaceDeep: '#D9C091',
  },
  ivory: {
    label: 'Ivory',
    foundation: '#E9DFC8',
    foundationDeep: '#CFC2A6',
    surface: '#FCF7EA',
    surfaceDeep: '#EFE6CE',
  },
};

export const BOARD_SKIN_ORDER: BoardSkinId[] = ['walnut', 'maple', 'chocolate', 'ivory'];

// ---------------------------------------------------------------------------
// Pawn skins & accessories — always rendered in each player's OWN color.
// ---------------------------------------------------------------------------

export const PAWN_SKIN_LABELS: Record<PawnSkinId, string> = {
  classic: 'Animal friends',
  elf: 'Elves',
  gem: 'Gemstones',
  chess: 'Chessmen',
  egg: 'Easter eggs',
  gift: 'Gift boxes',
};

export const PAWN_SKIN_ORDER: PawnSkinId[] = ['classic', 'elf', 'gem', 'chess', 'egg', 'gift'];

export const ACCESSORY_LABELS: Record<AccessoryChoice, string> = {
  auto: 'Auto (theme)',
  none: 'None',
  beanie: 'Beanie',
  santa: 'Santa hat',
  cap: 'Sun cap',
  crown: 'Crown',
};

export const ACCESSORY_ORDER: AccessoryChoice[] = [
  'auto',
  'none',
  'beanie',
  'santa',
  'cap',
  'crown',
];

export function faceColor(face: DiceFaceId): string {
  return face === 'star' ? STAR_COLOR : COLORS[face];
}

export function faceLabel(face: DiceFaceId): string {
  return face === 'star' ? 'Star' : face.charAt(0).toUpperCase() + face.slice(1);
}

/** True for faces that need dark text on top (the white face). */
export function faceIsLight(face: DiceFaceId): boolean {
  return face === 'white';
}
