/**
 * ============================================================================
 * GAME CONFIG — "Color Hop! Kids" ruleset (RULES_VERSION: kids-v1)
 * ============================================================================
 * A color-dice race game inspired by the classic German children's game
 * "Mensch ärgere Dich nicht® Kids" (Schmidt Spiele, 4 players, 3 pawns each).
 *
 * RULES RESEARCH NOTE
 * -------------------
 * The original printed instructions of the Kids edition could not be fully
 * retrieved. Rules below were reconstructed from product imagery
 * (cross-shaped board, 6-color track cycle, color die with colored dots,
 * 3-slot home rows, 4 animal characters) and are documented here.
 * Every uncertain mechanic is a config flag so it can be corrected without
 * touching engine logic.
 *
 * DOCUMENTED RULES (v1)
 * ---------------------
 * 1. Board: classic cross layout, 40 fields in one loop, 6 track colors
 *    (red, blue, green, yellow + neutral purple & black) in a repeating
 *    cycle. Each player's segment starts with their own color.
 * 2. The die is a real 6-faced color die: one face per track color.
 * 3. Movement: roll a color, move ONE of your pawns forward to the NEXT
 *    track field showing that color (distance 1-6 — the color die is a
 *    number die in disguise, no counting needed).
 * 4. Entering: roll YOUR OWN color to move a pawn from the base onto your
 *    start field (start fields are painted in the player's color).
 *    (KIDS_V1_ASSUMPTION) fastStart: while all 3 of your pawns are still in
 *    the base, ANY color lets the first pawn enter — no waiting at the start.
 * 5. Capturing: land on an opponent's pawn → it returns to its base.
 *    Landing on your own pawn is not allowed for that pawn.
 * 6. Home: when no matching color remains ahead, the pawn goes HOME
 *    (goal row of 3 star slots in the player's arm). First player with all
 *    3 pawns home wins. (KIDS_V1_ASSUMPTION: home matches every color.)
 * 7. Stuck turns: if no pawn can use the roll at all, the player may roll
 *    again, up to `maxRollsPerTurn` per turn, then the turn passes.
 * 8. No extra-roll rules (no "roll again after capture/entry").
 */

export const RULES_VERSION = 'kids-v1';

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

export const RULES = {
  /** Pawns per player (Kids edition: 3). */
  pawnsPerPlayer: 3,
  /** Total fields of the main loop (classic cross layout). */
  trackFields: 40,
  /** Home (goal) slots per player. */
  homeSlots: 3,
  /** Base slots per player. */
  baseSlots: 3,
  /**
   * While every pawn of a player is still in the base, any color allows the
   * first pawn to enter the board (prevents a frustrating opening).
   */
  fastStart: true,
  /**
   * A pawn whose rolled color has no matching field ahead of it may enter
   * its home row (home matches every color).
   */
  homeMatchesAnyColor: true,
  /** Rolls a player may attempt when no legal move exists (then pass). */
  maxRollsPerTurn: 3,
  /** Auto-execute the move when exactly one legal move exists (ms delay). */
  autoSingleMoveDelay: 850,
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
