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
export type TileSkinId = 'classic' | 'faceted' | 'plush' | 'porcelain';
export type DiceSkinId = 'classic' | 'wooden' | 'crystal' | 'midnight';
export type PawnSkinId = 'classic' | 'elf' | 'gem' | 'chess' | 'egg' | 'gift';
export type PawnAccessoryId = 'none' | 'beanie' | 'santa' | 'cap' | 'crown';
/** 'auto' = follow whatever the active seasonal theme suggests. */
export type AccessoryChoice = PawnAccessoryId | 'auto';

// ---------------------------------------------------------------------------
// INTERFACE THEMES — the paint job of every menu, dialog and HUD surface.
// Purely UI colors (panels, text, borders, accents); gameplay colors stay
// untouched everywhere. 'auto' follows the active seasonal theme.
// ---------------------------------------------------------------------------

export type UiThemeId = 'heirloom' | 'noel' | 'frost' | 'meadow' | 'sunset' | 'night';
export type UiThemeChoice = UiThemeId | 'auto';

export const UI_THEME_LABELS: Record<UiThemeId, string> = {
  heirloom: 'Warm wood',
  noel: 'Christmas',
  frost: 'Winter ice',
  meadow: 'Spring meadow',
  sunset: 'Summer sunset',
  night: 'Cozy night',
};

export const UI_THEME_ORDER: UiThemeId[] = ['heirloom', 'noel', 'frost', 'meadow', 'sunset', 'night'];

// ---------------------------------------------------------------------------
// SEASON PRESETS — the "Auto" answer for every Look-of-the-game value.
// `seasonThemeForDate` maps the calendar to a seasonal theme, and each theme
// carries a curated look preset (board / tiles / dice / pawns / UI theme)
// that any value set to 'auto' follows. Every value can still be picked
// manually — the two systems never fight each other.
// ---------------------------------------------------------------------------

/** Calendar → seasonal theme. */
export function seasonThemeForDate(date: Date = new Date()): ThemeId {
  const m = date.getMonth(); // 0–11
  const d = date.getDate();
  if (m === 11 || (m === 0 && d <= 6)) return 'christmas'; // Dec 1 – Jan 6
  if (m === 0 || m === 1) return 'winter'; // rest of Jan – Feb
  if (m === 2 || m === 3) return 'easter'; // Mar – Apr
  if (m >= 5 && m <= 7) return 'summer'; // Jun – Aug
  return 'classic'; // May, Sep, Oct, Nov
}

/** Curated look that 'auto' values follow for each seasonal theme. */
export interface SeasonLookPreset {
  boardSkin: BoardSkinId;
  tileSkin: TileSkinId;
  diceSkin: DiceSkinId;
  pawnSkin: PawnSkinId;
  uiTheme: UiThemeId;
}

export const SEASON_LOOK_PRESETS: Record<ThemeId, SeasonLookPreset> = {
  classic: { boardSkin: 'walnut', tileSkin: 'classic', diceSkin: 'classic', pawnSkin: 'classic', uiTheme: 'heirloom' },
  christmas: { boardSkin: 'chocolate', tileSkin: 'plush', diceSkin: 'wooden', pawnSkin: 'gift', uiTheme: 'noel' },
  winter: { boardSkin: 'ivory', tileSkin: 'porcelain', diceSkin: 'crystal', pawnSkin: 'elf', uiTheme: 'frost' },
  easter: { boardSkin: 'maple', tileSkin: 'classic', diceSkin: 'classic', pawnSkin: 'egg', uiTheme: 'meadow' },
  summer: { boardSkin: 'maple', tileSkin: 'faceted', diceSkin: 'crystal', pawnSkin: 'gem', uiTheme: 'sunset' },
};

// --- Auto-aware choice types (settings store) -------------------------------

export type ThemeChoice = ThemeId | 'auto';
export type BoardSkinChoice = BoardSkinId | 'auto';
export type TileSkinChoice = TileSkinId | 'auto';
export type DiceSkinChoice = DiceSkinId | 'auto';
export type PawnSkinChoice = PawnSkinId | 'auto';

/** What the settings store holds — any value may be 'auto'. */
export interface LookChoices {
  theme: ThemeChoice;
  boardSkin: BoardSkinChoice;
  tileSkin: TileSkinChoice;
  diceSkin: DiceSkinChoice;
  pawnSkin: PawnSkinChoice;
  pawnAccessory: AccessoryChoice;
  uiTheme: UiThemeChoice;
}

/** Fully-resolved look — what the game actually renders. */
export interface ResolvedLook {
  /** The season the calendar picked right now (also used for hints). */
  season: ThemeId;
  theme: ThemeId;
  boardSkin: BoardSkinId;
  tileSkin: TileSkinId;
  diceSkin: DiceSkinId;
  pawnSkin: PawnSkinId;
  /** The accessory pawns actually wear (auto already resolved). */
  accessory: PawnAccessoryId;
  uiTheme: UiThemeId;
}

/**
 * Resolves every Look-of-the-game value: 'auto' follows the preset of the
 * ACTIVE theme — so a manually picked season still dresses its own board,
 * tiles, dice and pawns coherently, while 'auto' everywhere follows the
 * calendar season.
 */
export function resolveLook(choices: LookChoices, date: Date = new Date()): ResolvedLook {
  const season = seasonThemeForDate(date);
  const theme = choices.theme === 'auto' ? season : choices.theme;
  const preset = SEASON_LOOK_PRESETS[theme];
  const pawnSkin = choices.pawnSkin === 'auto' ? preset.pawnSkin : choices.pawnSkin;
  return {
    season,
    theme,
    boardSkin: choices.boardSkin === 'auto' ? preset.boardSkin : choices.boardSkin,
    tileSkin: choices.tileSkin === 'auto' ? preset.tileSkin : choices.tileSkin,
    diceSkin: choices.diceSkin === 'auto' ? preset.diceSkin : choices.diceSkin,
    pawnSkin,
    accessory: effectiveAccessory(choices.pawnAccessory, theme, pawnSkin),
    uiTheme: choices.uiTheme === 'auto' ? preset.uiTheme : choices.uiTheme,
  };
}

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
// Tile skins — the craft style of the track & finish platforms the pawns
// hop across. Track field COLORS and all gameplay colors are untouched:
// skins change shape language, finish and trim only.
// ---------------------------------------------------------------------------

export interface TileSkin {
  label: string;
  /** Radial segments of the inlay cylinders (low = chunky low-poly look). */
  segments: number;
  /** Flat shading — visible facets (the stylized low-poly language). */
  flat: boolean;
  /** Inlay surface finish. */
  roughness: number;
  metalness: number;
  /** Extra glow of the inlay's own color (0 = none). */
  glow: number;
  /** Rim torus style: 'paint' = deep-tone ring, 'gold' = golden ring,
   *  'none' = no rim. */
  rim: 'paint' | 'gold' | 'none';
  /** Rim thickness multiplier. */
  rimScale: number;
  /** A little top button/knob at the inlay center (plush style). */
  button: boolean;
}

export const TILE_SKINS: Record<TileSkinId, TileSkin> = {
  classic: {
    label: 'Classic inlay',
    segments: 32,
    flat: false,
    roughness: 0.38,
    metalness: 0.05,
    glow: 0.055,
    rim: 'paint',
    rimScale: 1,
    button: false,
  },
  faceted: {
    label: 'Faceted gems',
    segments: 9,
    flat: true,
    roughness: 0.3,
    metalness: 0.08,
    glow: 0.12,
    rim: 'paint',
    rimScale: 1.3,
    button: false,
  },
  plush: {
    label: 'Plush cushions',
    segments: 20,
    flat: false,
    roughness: 0.85,
    metalness: 0,
    glow: 0,
    rim: 'paint',
    rimScale: 0.9,
    button: true,
  },
  porcelain: {
    label: 'Porcelain glaze',
    segments: 40,
    flat: false,
    roughness: 0.14,
    metalness: 0.12,
    glow: 0.03,
    rim: 'gold',
    rimScale: 0.8,
    button: false,
  },
};

export const TILE_SKIN_ORDER: TileSkinId[] = ['classic', 'faceted', 'plush', 'porcelain'];

// ---------------------------------------------------------------------------
// Dice skins — the body & sticker craft of the 3D color die. The FACE colors
// are always the gameplay colors; skins restyle the body and the trim only.
// ---------------------------------------------------------------------------

export interface DiceSkin {
  label: string;
  /** Die body material colors & finish. */
  body: string;
  bodyRoughness: number;
  bodyMetalness: number;
  /** Flat-shaded faceted body. */
  bodyFlat: boolean;
  /** Subtle self-glow of the body (dark skins). */
  bodyEmissive: string | null;
  bodyEmissiveIntensity: number;
  /** Sticker style: 'paint' = plain color disc, 'framed' = cream ring frame,
   *  'glow' = color disc + emissive halo ring. */
  sticker: 'paint' | 'framed' | 'glow';
  /** Sticker disc finish. */
  stickerRoughness: number;
}

export const DICE_SKINS: Record<DiceSkinId, DiceSkin> = {
  classic: {
    label: 'Ivory classic',
    body: '#F7F1E3',
    bodyRoughness: 0.35,
    bodyMetalness: 0.04,
    bodyFlat: false,
    bodyEmissive: null,
    bodyEmissiveIntensity: 0,
    sticker: 'paint',
    stickerRoughness: 0.42,
  },
  wooden: {
    label: 'Wooden toy',
    body: '#B98A5A',
    bodyRoughness: 0.55,
    bodyMetalness: 0.02,
    bodyFlat: true,
    bodyEmissive: null,
    bodyEmissiveIntensity: 0,
    sticker: 'framed',
    stickerRoughness: 0.4,
  },
  crystal: {
    label: 'Crystal',
    body: '#EAF4FB',
    bodyRoughness: 0.12,
    bodyMetalness: 0.3,
    bodyFlat: true,
    bodyEmissive: '#BFE3F7',
    bodyEmissiveIntensity: 0.08,
    sticker: 'paint',
    stickerRoughness: 0.2,
  },
  midnight: {
    label: 'Midnight glow',
    body: '#2B2622',
    bodyRoughness: 0.4,
    bodyMetalness: 0.2,
    bodyFlat: false,
    bodyEmissive: '#3A3129',
    bodyEmissiveIntensity: 0.25,
    sticker: 'glow',
    stickerRoughness: 0.3,
  },
};

export const DICE_SKIN_ORDER: DiceSkinId[] = ['classic', 'wooden', 'crystal', 'midnight'];

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

/**
 * Resolves the accessory a pawn ACTUALLY wears: 'auto' follows the active
 * seasonal theme, and skins that come with their own built-in hat (the elf's
 * signature pointed hat) never get a second hat stacked on top — otherwise
 * an elf in the Christmas theme would wear its own hat AND a Santa hat.
 * The golden crown is the one exception: it is designed to perch above the
 * elf's hat pompom, so it is always allowed.
 */
export function effectiveAccessory(
  choice: AccessoryChoice,
  theme: ThemeId,
  skin: PawnSkinId,
): PawnAccessoryId {
  const raw = choice === 'auto' ? THEMES[theme].accessory : choice;
  if (skin === 'elf' && (raw === 'beanie' || raw === 'santa' || raw === 'cap')) {
    return 'none';
  }
  return raw;
}

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
