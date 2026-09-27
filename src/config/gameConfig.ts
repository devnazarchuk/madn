/**
 * ============================================================================
 * GAME CONFIG — static board & component constants (ruleset kids-v6)
 * ============================================================================
 * A color-dice race game inspired by the classic board game
 * "Mensch ärgere Dich nicht® Kids" (Schmidt Spiele, 2–4 players, 3 pawns each).
 *
 * RULES RESEARCH NOTE
 * -------------------
 * The original printed instructions of the Kids edition could not be fully
 * retrieved (search services unreachable from the development sandbox).
 * Rules were reconstructed from edition metadata and product imagery and are
 * documented in RULES.md — verified facts vs. documented assumptions.
 * Every uncertain mechanic is configurable at runtime via `rulesConfig.ts`
 * (Classic / Quick / Family / Custom presets), never hard-coded here.
 *
 * DOCUMENTED BOARD (edition reconstruction, kids-v6)
 * ---------------------------------------------------
 * 1. Board: classic cross layout, 40 fields in one loop. Every player's
 *    start field sits directly beside their base corner; the clockwise
 *    circuit ends at the ARM TIP directly opposite that player's home row —
 *    the GOLDEN ARROW GATEWAY (a white or black platform: black for blue &
 *    red, white for yellow & green).
 * 2. The track uses the four player colors PLUS white and black PLATFORM
 *    cells (6 white + 6 black), woven in four 10-field windows from each
 *    player's start (engine/boardTrackConfig.ts): every player color appears
 *    7 times, white and black 6 times each, no two adjacent fields share a
 *    color, and every start field carries its owner's color.
 * 3. The die is a 6-faced color die. STANDARD (default, starMode OFF): the
 *    four player colors + a WHITE face and a BLACK face — rolling white or
 *    black walks a pawn to the next white/black platform, exactly like a
 *    color roll walks to the next field of that color. STAR MODE (optional
 *    rule toggle, ON): the white/black faces are replaced by TWO golden
 *    STAR wilds — a star counts as ANY color (including white or black).
 * 4. Movement: roll a face, move ONE pawn forward to the NEXT field showing
 *    that face — distance 1–8 on the track. The golden arrow gateway is a
 *    MANDATORY STOP: a pawn may never skip over it into the home stretch —
 *    not even with the player's OWN color. Standing before the arrow, only
 *    the arrow cell's exact platform color moves the pawn ONTO it (Step 1);
 *    standing ON the arrow, only the OWN color (or a resolved star) steps
 *    onto the first home cell (Step 2). A pawn on its own gateway may never
 *    continue around the main board loop.
 * 5. Every home row is painted in its player's OWN color (3 matching cells
 *    leading into the winning area marked with a star); rolling the own
 *    color walks the row slot by slot. STRICTLY ONE PAWN PER FINISH CELL —
 *    the golden winning cell keeps its first finisher forever, later pawns
 *    park behind it (this always applies, even with friendly stacking on).
 *    `finishRule` — 'exact' (Classic default): a roll carrying a home pawn
 *    PAST the winning cell cannot move it; 'flexible': such a roll completes
 *    the pawn onto the golden cell.
 * 6. Victory: the first player whose pawns ALL stand inside their home
 *    stretch, one per cell, packed onto the golden winning cell.
 * 7. Entering: roll YOUR OWN color (in Star Mode, a star resolved to it) to
 *    move a pawn onto your start field. A white or black roll never
 *    authorizes an entry under the own-color rule (they are not player
 *    colors) — but 'any-color' entry and the first-pawn assist accept them.
 * 8. Turns: no legal move (or, with `ownColorToMove` on, a rolled face that
 *    is not your own color) → the turn is SKIPPED immediately — never
 *    re-rolled. The own-color-only variant requires Star Mode (the wild is
 *    the only way to roll the arrow gateway's platform color).
 */

export const RULES_VERSION = 'kids-v6';

/** Player/track color palette (world-facing hex values live in theme.ts). */
export const PLAYER_COLORS = ['red', 'blue', 'green', 'yellow'] as const;

export type PlayerColorId = (typeof PLAYER_COLORS)[number];
/** Track spaces carry the four player colors plus the white/black platforms. */
export type TrackColorId = PlayerColorId | (typeof PLATFORM_COLORS)[number];
/** Die faces: the four player colors, white & black, plus the golden star wild. */
export type DiceFaceId = TrackColorId | 'star';

/** All colors a track field can carry: the four player colors + platforms. */
export const PLATFORM_COLORS = ['white', 'black'] as const;
export const TRACK_COLORS = [...PLAYER_COLORS, ...PLATFORM_COLORS] as const;

/** Faces of the 6-sided STANDARD die (starMode OFF): 4 colors + white + black. */
export const DICE_FACES = [
  'red',
  'blue',
  'green',
  'yellow',
  'white',
  'black',
] as const;

/** Faces of the 6-sided STAR-MODE die (starMode ON): 4 colors + 2 wilds. */
export const DICE_FACES_STAR_MODE = [
  'red',
  'blue',
  'green',
  'yellow',
  'star',
  'star',
] as const;

/** The die faces used by a match, by its Star Mode rules toggle. */
export function diceFacesFor(starMode: boolean): readonly DiceFaceId[] {
  return starMode ? DICE_FACES_STAR_MODE : DICE_FACES;
}

/**
 * Static board constants. Behaviour flags (entry, passing, capture, extra
 * turns, finish, own-color movement, Star Mode, pawns per player) live in
 * engine/rulesConfig.ts instead.
 */
export const RULES = {
  /** Total fields of the main loop (classic cross layout). */
  trackFields: 40,
  /** Home (goal) slots per player — slot 2 is the winning cell. */
  homeSlots: 3,
  /** Base slots per player (geometry always offers 3; the config decides how many pawns use them). */
  baseSlots: 3,
  /**
   * Hard cap on rolls per turn (covers extra-roll chains; a turn without a
   * legal move is skipped immediately — there are no stuck re-rolls).
   */
  maxRollsPerTurn: 5,
  /** Auto-execute the move when exactly one legal move exists (ms delay). */
  autoSingleMoveDelay: 850,
  /** Auto-resolve a star roll when only one color is playable (ms delay). */
  autoStarResolveDelay: 900,
} as const;

/** Timing for the presentation layer (milliseconds). */
export const TIMING = {
  diceRollDuration: 1650,
  hopPerFieldMs: 150,
  hopImportantMs: 230,
  captureImpactMs: 260,
  captureReturnMs: 720,
  finishBurstMs: 700,
  turnEndMs: 620,
  noMovesMs: 1400,
  aiRollDelay: 700,
  aiThinkDelay: 650,
  introDuration: 2000,
} as const;

/** Every color a golden star may resolve to (any color on the board). */
export const STAR_CHOICES = TRACK_COLORS;
