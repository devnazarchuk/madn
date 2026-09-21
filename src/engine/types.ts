import type { DiceFaceId, PlayerColorId, TrackColorId } from '@/config/gameConfig';
import type { RulesConfig } from './rulesConfig';

export type { DiceFaceId, PlayerColorId, TrackColorId };
export type { RulesConfig };

export type PlayerKind = 'human' | 'ai';
export type AiLevel = 'easy' | 'medium' | 'hard';

export interface PlayerSetup {
  id: string;
  color: PlayerColorId;
  name: string;
  kind: PlayerKind;
  aiLevel: AiLevel;
}

/** Where a pawn logically lives. */
export type Area = 'base' | 'track' | 'home';

export interface Position {
  area: Area;
  /** base: slot 0..2 · track: loop index 0..39 · home: slot 0..2 */
  index: number;
}

export interface PawnState {
  /** Stable id like "blue-1". */
  id: string;
  color: PlayerColorId;
  pos: Position;
}

export interface PlayerRuntime extends PlayerSetup {
  pawns: PawnState[];
}

export type GamePhase =
  | 'await-roll'      // waiting for the active player to roll
  | 'rolling'         // dice animation running
  | 'choose-star'     // star rolled — the active player picks a color
  | 'choose-pawn'     // waiting for pawn selection (moves highlighted)
  | 'animating'       // pawn move/capture/finish animation running
  | 'no-moves'        // roll produced no legal move (brief pause, then the turn is skipped)
  | 'turn-end'        // brief transition before next player
  | 'game-over';      // a player has won

export interface LegalMove {
  pawnId: string;
  from: Position;
  to: Position;
  /** Pawn leaves its base onto its start field. */
  isEntry: boolean;
  /** Pawn lands on the golden winning cell (home slot 2) — the first pawn to
   * finish stands there forever; later pawns park behind it, one per slot. */
  isFinish: boolean;
  /** Pawn moves to a home slot short of the winning cell (stepping from the
   * golden arrow gateway into the stretch or advancing inside it). */
  isHomeAdvance: boolean;
  /** Opponent pawns sent back to base (all of them when "pawn towers" are on). */
  capturedPawnIds: string[];
  /** Number of fields advanced (progress metric). */
  distance: number;
}

/**
 * Machine-readable reason a pawn cannot use the current roll.
 * Structured codes — the UI translates them into child-friendly messages.
 */
export type MoveRejectionReason =
  | 'PAWN_NOT_OWNED_BY_ACTIVE_PLAYER'
  | 'NO_DICE_RESULT'
  | 'STAR_UNRESOLVED'
  | 'WRONG_DICE_COLOR'
  | 'PATH_BLOCKED'
  | 'DESTINATION_OCCUPIED'
  | 'CAPTURE_DISABLED'
  | 'PROTECTED_FIELD'
  | 'FINISH_LANE_BLOCKED'
  | 'MOVE_EXCEEDS_FINISH'
  | 'PAWN_FINISHED'
  /**
   * No field showing the rolled face lies within the pawn's legal reach —
   * with the golden arrow gateway cap this is a REAL state: the next match
   * would lie beyond the gateway (or past the goal), so the pawn must wait
   * for another roll.
   */
  | 'NO_MATCH_AHEAD';

export interface MoveValidation {
  legal: boolean;
  move?: LegalMove;
  reason?: MoveRejectionReason;
}

export type GameEventKind =
  | 'game-started'
  | 'roll'
  | 'star-choice'
  | 'move'
  | 'capture'
  | 'finish'
  | 'pass'
  | 'turn'
  | 'game-over';

export interface GameEvent {
  seq: number;
  turn: number;
  kind: GameEventKind;
  player?: PlayerColorId;
  face?: DiceFaceId;
  pawnId?: string;
  from?: Position;
  to?: Position;
  capturedPawnId?: string;
  detail?: string;
}

export interface GameState {
  players: PlayerRuntime[];
  /** Index into players of the active player. */
  activeIndex: number;
  turn: number;
  phase: GamePhase;
  /**
   * Latest dice face — THE single authoritative result (set when the engine
   * rolls). 'star' means the wild was rolled and is not yet resolved to a
   * color; no move is legal while it is unresolved.
   */
  diceFace: DiceFaceId | null;
  /**
   * True while the pending dice result originated as a golden STAR. A star
   * is wild: even with `ownColorToMove` on, a resolved star may become ANY
   * color — the color-match rule only voids plain color rolls.
   */
  diceFromStar: boolean;
  /** Rolls used in the current turn (extra-roll chains). */
  rollsThisTurn: number;
  /** Why the active player may roll again, if they may ('capture' | 'own-color'). */
  extraRoll: 'capture' | 'own-color' | null;
  /** Rules used for THIS match — replayed matches keep their own config. */
  rulesConfig: RulesConfig;
  winner: PlayerColorId | null;
  /** Seeded RNG state. */
  rngState: number;
  events: GameEvent[];
  startedAt: number;
  captures: number;
}
