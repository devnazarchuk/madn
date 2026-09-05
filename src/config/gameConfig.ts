/**
 * ============================================================================
 * GAME CONFIG — static board & component constants (ruleset kids-v3)
 * ============================================================================
 * A color-dice race game inspired by the classic German children's game
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
 * DOCUMENTED BOARD (edition reconstruction, kids-v3)
 * ---------------------------------------------------
 * 1. Board: classic cross layout, 40 fields in one loop. The track uses
 *    ONLY the four player colors (red, blue, green, yellow) woven from two
 *    mirrored 4-color cycles so that every color appears exactly 10 times,
 *    no two adjacent fields share a color, and every segment starts with
 *    its owner's color (see engine/boardTrackConfig.ts for the full table).
 * 2. The die is a 6-faced color die: the four player colors once each plus
 *    TWO golden STAR faces. A star is a wild roll — the player picks any of
 *    the four colors and applies it.
 * 3. Movement: roll a color, move ONE pawn forward to the NEXT track field
 *    showing that color (distance 1–5 — no counting needed). Every
 *    intermediate field must be free (strict blocking) unless the active
 *    rules allow free passing.
 * 4. Entering: roll YOUR OWN color (or a star, which counts as any color
 *    including your own) to move a pawn onto your start field.
 * 5. Home: when no matching color remains ahead, the pawn steps into its
 *    home row at the mouth slot and later rolls walk it deeper, one slot at
 *    a time. First player with ALL pawns home wins.
 * 6. Stuck turns: no legal move → roll again, up to 3 rolls per turn.
 */

export const RULES_VERSION = 'kids-v3';

/** Faces of the 6-sided die: four player colors + two golden star wilds. */
export const DICE_FACES = [
  'red',
  'blue',
  'green',
  'yellow',
  'star',
  'star',
] as const;

/**
 * Static board constants. Behaviour flags (entry, passing, capture, extra
 * turns, pawns per player) live in engine/rulesConfig.ts instead.
 */
export const RULES = {
  /** Total fields of the main loop (classic cross layout). */
  trackFields: 40,
  /** Home (goal) slots per player. */
  homeSlots: 3,
  /** Base slots per player (geometry always offers 3; the config decides how many pawns use them). */
  baseSlots: 3,
  /**
   * Hard cap on rolls per turn (covers stuck-rerolls AND extra-roll chains).
   */
  maxRollsPerTurn: 5,
  /** Rolls a player may attempt when no legal move exists (then pass). */
  stuckRollsPerTurn: 3,
  /** Auto-execute the move when exactly one legal move exists (ms delay). */
  autoSingleMoveDelay: 850,
  /** Auto-resolve a star roll when only one color is playable (ms delay). */
  autoStarResolveDelay: 900,
  /** Edition assumption A8: the home row matches every color. */
  homeMatchesAnyColor: true,
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

/** Player/track color palette (world-facing hex values live in theme.ts). */
export const PLAYER_COLORS = ['red', 'blue', 'green', 'yellow'] as const;

export type PlayerColorId = (typeof PLAYER_COLORS)[number];
/** Track spaces only ever carry the four player colors (no black/purple). */
export type TrackColorId = PlayerColorId;
/** Die faces: the four track colors plus the golden star wild. */
export type DiceFaceId = TrackColorId | 'star';

/** Convenience list of the four colors a star may resolve to. */
export const STAR_CHOICES = PLAYER_COLORS;
