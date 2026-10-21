import { PLAYER_COLORS, RULES, TRACK_COLORS, type PlayerColorId, type TrackColorId } from '@/config/gameConfig';
import { FINISH_TIP_INDEX, LOOP, START_INDEX, TURN_ORDER } from './board';
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
 *   • whether it is a start field, and whose 10-field window it belongs to.
 *
 * The visual color pattern (ruleset kids-v5)
 * ------------------------------------------
 * Four 10-field windows, each beginning at a player's START field (each start
 * sits beside its owner's base corner — see engine/board.ts). Every window
 * is woven from a full 10-slot template:
 *
 *   [owner, c1, SPEC_A, c3, owner, c2, SPEC_B, c1, owner, SPEC_C]
 *
 * where the three SPEC slots carry the white/black PLATFORMS. White-heavy
 * and black-heavy windows alternate around the board so the platforms
 * interleave evenly (every 3–4 fields around the whole loop):
 *
 *   blue   (loop 35–4)   W-heavy: blue, red, WHITE, yellow, blue, green, BLACK, red, blue, WHITE
 *   yellow (loop 5–14)  B-heavy: yellow, green, BLACK, blue, yellow, red, WHITE, green, yellow, BLACK
 *   red    (loop 15–24)  W-heavy: red, blue, WHITE, yellow, red, green, BLACK, blue, red, WHITE
 *   green  (loop 25–34)  B-heavy: green, yellow, BLACK, blue, green, red, WHITE, yellow, green, BLACK
 *
 * Guarantees (verified by the engine tests):
 *   1. Deterministic — the pattern is data, never random.
 *   2. Every PLAYER color appears exactly 7 times; WHITE and BLACK exactly
 *      6 times each (matching their 1/6 share of the die faces).
 *   3. No two adjacent fields share a color (no accidental clusters,
 *      including the window seams and the loop wrap).
 *   4. Every start field is painted in its owner's color (window slots 0,
 *      4 and 8 — the owner keeps a steady rhythm through their window).
 *   5. White and black platforms alternate perfectly around the loop
 *      (W, K, W, K, … at 3–4 field spacing) — no platform runs, no clusters.
 *   6. Every "next field of color X" lies 1–8 fields ahead on the shared
 *      track (tight pacing for every face of the standard die).
 *   7. Only the six track colors appear — nothing else.
 *
 * The home rows (the final 3 cells into each winning area)
 * ---------------------------------------------------------
 * A pawn's journey ends at the arm tip — the GOLDEN ARROW GATEWAY (journey
 * 39, a white or black platform) — which is a MANDATORY STOP: no move may
 * skip over it into the row. Every home row is painted in ITS PLAYER'S OWN
 * COLOR (the classic look: three cells of the player's color leading to the
 * star). The movement model follows the paint:
 *   • Step 1 — standing before the arrow, only the arrow cell's exact
 *     platform color moves a pawn ONTO the gateway;
 *   • Step 2 — standing on the gateway, only the OWN color (or a resolved
 *     star) steps onto slot 0, and own-color rolls then walk the row slot by
 *     slot onto the golden winning cell;
 *   • a foreign color never matches inside the row — near the tip such a
 *     roll simply finds no reachable field (the search is capped at the
 *     gateway — see engine/rules/validatePath.ts).
 */

/**
 * The exact per-player 10-slot weaving template. Slots 0, 4 and 8 carry the
 * owner's color (slot 0 is the start field); slots 2, 6 and 9 carry the
 * white/black PLATFORMS (W-heavy windows for blue & red, K-heavy for yellow
 * & green — perfect platform alternation around the loop). The c1/c2/c3
 * colors spread the remaining player colors; each player color ends up with
 * exactly 7 fields.
 */
export const SEGMENT_TEMPLATES: Record<PlayerColorId, TrackColorId[]> = {
  blue: ['blue', 'red', 'white', 'yellow', 'blue', 'green', 'black', 'red', 'blue', 'white'],
  yellow: ['yellow', 'green', 'black', 'blue', 'yellow', 'red', 'white', 'green', 'yellow', 'black'],
  red: ['red', 'blue', 'white', 'yellow', 'red', 'green', 'black', 'blue', 'red', 'white'],
  green: ['green', 'yellow', 'black', 'blue', 'green', 'red', 'white', 'yellow', 'green', 'black'],
};

/** Window owners in clockwise start order. */
const SEGMENT_OWNERS: PlayerColorId[] = TURN_ORDER; // blue, yellow, red, green

export interface TrackFieldConfig {
  /** Stable identifier, e.g. "f12". */
  id: string;
  /** Logical loop index (0..39, clockwise). */
  loopIndex: number;
  /** Grid cell on the 11×11 board. */
  col: number;
  row: number;
  /** World coordinates on the playing surface. */
  world: WorldPoint;
  /** Deliberate visual color of the field itself. */
  color: TrackColorId;
  /** True for a player's start field (painted in the owner's color). */
  isStart: boolean;
  /** The player whose 10-field window (from their start) the field belongs to. */
  segmentOwner: PlayerColorId;
  /** Section of the board the field belongs to. */
  section: 'track' | 'start';
  /** The home row this field feeds when a pawn's circuit ends here (arm tips). */
  homeFeedOf: PlayerColorId | null;
  /** True when the field sits directly before a player's home-row entry
   * (the arm tip colinear with that player's home row). */
  isFinishAdjacent: boolean;
}

function buildTrackFields(): TrackFieldConfig[] {
  const fields: TrackFieldConfig[] = [];
  for (let i = 0; i < LOOP.length; i++) {
    const cell = LOOP[i]!;
    // Whose 10-field window covers this loop index?
    let owner: PlayerColorId = SEGMENT_OWNERS[0]!;
    for (const candidate of SEGMENT_OWNERS) {
      if ((i - START_INDEX[candidate] + LOOP.length) % LOOP.length < 10) {
        owner = candidate;
        break;
      }
    }
    const template = SEGMENT_TEMPLATES[owner];
    const slotInWindow = (i - START_INDEX[owner] + LOOP.length) % LOOP.length;
    const color = template[slotInWindow]!;
    const isStart = START_INDEX[owner] === i;
    const homeFeedOf =
      (Object.keys(FINISH_TIP_INDEX) as PlayerColorId[]).find(
        (p) => FINISH_TIP_INDEX[p] === i,
      ) ?? null;
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
      homeFeedOf,
      isFinishAdjacent: homeFeedOf !== null,
    });
  }
  return fields;
}

/** The full, authoritative track field table (loop order). */
export const TRACK_FIELDS: TrackFieldConfig[] = buildTrackFields();

/** Visual color of every loop field, indexed by loop index. */
export const FIELD_COLORS: TrackColorId[] = TRACK_FIELDS.map((f) => f.color);

/**
 * The color of every HOME slot, per player — all three cells of each row are
 * painted in the PLAYER'S OWN COLOR (the classic home stretch look: three
 * matching cells leading into the winning area marked with a star). Rolling
 * the own color therefore steps a pawn from the golden arrow gateway into
 * the row and then slot by slot onto the golden winning cell; foreign colors
 * never match inside it (the search is capped at the gateway — see
 * engine/rules/validatePath.ts).
 */
export const HOME_COLORS: Record<PlayerColorId, TrackColorId[]> = {
  blue: ['blue', 'blue', 'blue'],
  yellow: ['yellow', 'yellow', 'yellow'],
  red: ['red', 'red', 'red'],
  green: ['green', 'green', 'green'],
};

/** Field config lookup by loop index. */
export function trackField(loopIndex: number): TrackFieldConfig {
  return TRACK_FIELDS[((loopIndex % LOOP.length) + LOOP.length) % LOOP.length]!;
}

/** How far ahead the next field of `color` lies from a loop index (1..8). */
export function distanceToNextColor(fromLoop: number, color: TrackColorId): number {
  for (let ahead = 1; ahead <= 8; ahead++) {
    if (FIELD_COLORS[(fromLoop + ahead) % FIELD_COLORS.length] === color) return ahead;
  }
  return -1; // unreachable with the woven pattern
}

// ---------------------------------------------------------------------------
// BOARD LAYOUTS — classic (official) pattern vs. the Full Random map
// ---------------------------------------------------------------------------

const PLAYER_COLORS_ALL: readonly PlayerColorId[] = PLAYER_COLORS;

/**
 * The color layout a match is played on: the 40 track colors (loop order)
 * and the 3 home-row colors of every player. The CLASSIC layout is the
 * documented Kids edition weave (above). The RANDOM layout paints every
 * field — INCLUDING the three home-stretch cells — with random colors, so
 * even the way home demands the matching rolls (see generateRandomLayout).
 */
export interface BoardLayout {
  /** Track colors in loop order — exactly 40 entries. */
  trackColors: TrackColorId[];
  /** Home-row colors per player — exactly 3 entries each. */
  homeColors: Record<PlayerColorId, TrackColorId[]>;
}

/** The official Kids-edition color pattern (the default board). */
export const CLASSIC_LAYOUT: BoardLayout = {
  trackColors: FIELD_COLORS,
  homeColors: HOME_COLORS,
};

const ALL_TRACK_COLORS: readonly TrackColorId[] = TRACK_COLORS;

/**
 * Builds the FULL RANDOM map (seeded, deterministic — the same seed always
 * paints the same board, so autosaved matches and replays stay reproducible):
 *   • every start field keeps its owner's color (entries stay readable),
 *   • every other track cell is a random track color (four player colors +
 *     the white/black platforms) with NO two neighbors sharing a color —
 *     including the wrap-around seam between fields 39 and 0,
 *   • every home-stretch cell (all 12) is random as well — the row is no
 *     longer painted in the owner's color, so pawns must roll each cell's
 *     own random color to walk home (the golden-arrow gateway still feeds
 *     slot 0 by that cell's paint, and one-pawn-per-slot still holds).
 */
export function generateRandomLayout(seed: number): BoardLayout {
  // Mulberry32 — the same family of RNG the engine uses for dice.
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (exclude: TrackColorId[]): TrackColorId => {
    for (let attempt = 0; attempt < 64; attempt++) {
      const color = ALL_TRACK_COLORS[Math.floor(rand() * ALL_TRACK_COLORS.length)]!;
      if (!exclude.includes(color)) return color;
    }
    // Exhaustive exclusion is impossible with 6 colors — fall back safely.
    return ALL_TRACK_COLORS.find((c) => !exclude.includes(c)) ?? 'red';
  };

  const trackColors: TrackColorId[] = new Array(LOOP.length);
  for (const color of PLAYER_COLORS_ALL) trackColors[START_INDEX[color]] = color;

  for (let i = 0; i < LOOP.length; i++) {
    if (trackColors[i]) continue;
    const prev = trackColors[(i - 1 + LOOP.length) % LOOP.length];
    const excluded: TrackColorId[] = prev ? [prev] : [];
    // The final cell must also differ from field 0 (the loop seam).
    if (i === LOOP.length - 1 && trackColors[0]) excluded.push(trackColors[0]!);
    trackColors[i] = pick(excluded);
  }

  const homeColors = {} as Record<PlayerColorId, TrackColorId[]>;
  for (const color of PLAYER_COLORS_ALL) {
    const row: TrackColorId[] = [];
    for (let slot = 0; slot < RULES.homeSlots; slot++) {
      row.push(pick(row.length > 0 ? [row[row.length - 1]!] : []));
    }
    homeColors[color] = row;
  }

  return { trackColors, homeColors };
}

/**
 * Validates unknown data (autosaves) into a BoardLayout, falling back to the
 * classic pattern. Accepts only well-shaped 40+12 color tables.
 */
export function normalizeLayout(value: unknown): BoardLayout {
  const isColor = (c: unknown): c is TrackColorId =>
    typeof c === 'string' && (ALL_TRACK_COLORS as readonly string[]).includes(c);
  try {
    const raw = value as Partial<BoardLayout> | null;
    if (
      raw &&
      Array.isArray(raw.trackColors) &&
      raw.trackColors.length === LOOP.length &&
      raw.trackColors.every(isColor) &&
      raw.homeColors &&
      PLAYER_COLORS_ALL.every(
        (p) =>
          Array.isArray(raw.homeColors![p]) &&
          raw.homeColors![p]!.length === RULES.homeSlots &&
          raw.homeColors![p]!.every(isColor),
      )
    ) {
      return {
        trackColors: [...raw.trackColors],
        homeColors: {
          red: [...raw.homeColors.red!],
          blue: [...raw.homeColors.blue!],
          green: [...raw.homeColors.green!],
          yellow: [...raw.homeColors.yellow!],
        },
      };
    }
  } catch {
    // fall through to the classic layout
  }
  return CLASSIC_LAYOUT;
}
