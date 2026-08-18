/**
 * ============================================================================
 * GAME CONFIG — static board & component constants (ruleset kids-v2)
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
 * DOCUMENTED BOARD (edition reconstruction)
 * -----------------------------------------
 * 1. Board: classic cross layout, 40 fields in one loop, 6 track colors
 *    (red, blue, green, yellow + neutral purple & black) in a repeating
 *    cycle. Each player's segment starts with their own color.
 * 2. The die is a 6-faced color die: one face per track color.
 * 3. Movement: roll a color, move ONE pawn forward to the NEXT track field
 *    showing that color (distance 1–6 — no counting needed).
 * 4. Entering / passing / capturing / extra rolls / pawns per player are
 *    configurable — see rulesConfig.ts (defaults = the documented
 *    reconstruction, labelled Classic).
 * 5. Home: when no matching color remains ahead, the pawn goes HOME
 *    (home row of 3 slots; home matches every color). First player with all
 *    pawns home wins.
 * 6. Stuck turns: no legal move → roll again, up to 3 rolls per turn.
 */

export const RULES_VERSION = 'kids-v2';

/** Repeating cycle of the six track colors along the loop. */
export const TRACK_COLOR_CYCLE = [
  'red',
  'blue',
  'purple',
  'black',
  'green',
  'yellow',
] as const;

/** Faces of the 6-sided color die (one face per track color). */
export const DICE_FACES = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'black',
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
export const NEUTRAL_COLORS = ['purple', 'black'] as const;

export type PlayerColorId = (typeof PLAYER_COLORS)[number];
export type NeutralColorId = (typeof NEUTRAL_COLORS)[number];
export type TrackColorId = PlayerColorId | NeutralColorId;
export type DiceFaceId = TrackColorId;
