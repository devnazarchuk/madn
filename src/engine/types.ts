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
  | 'choose-pawn'     // waiting for pawn selection (moves highlighted)
  | 'animating'       // pawn move/capture/finish animation running
  | 'no-moves'        // roll produced no legal move (brief pause, then pass/reroll)
  | 'turn-end'        // brief transition before next player
  | 'game-over';      // a player has won

export interface LegalMove {
  pawnId: string;
  from: Position;
  to: Position;
  /** Pawn leaves its base. */
  isEntry: boolean;
  /** Pawn enters its home row. */
  isFinish: boolean;
  /** Opponent pawns sent back to base (all of them when "pawn towers" are on). */
  capturedPawnIds: string[];
  /** Number of fields advanced (progress metric). */
  distance: number;
}

/** Machine-readable reason a pawn cannot use the current roll. */
export type MoveRejectionReason =
  | 'pawn-finished'
  | 'entry-color'
  | 'own-pawn-blocks'
  | 'blocked-path'
  | 'no-capture-allowed'
  | 'protected-field';

export interface MoveValidation {
  legal: boolean;
  move?: LegalMove;
  reason?: MoveRejectionReason;
}

export type GameEventKind =
  | 'game-started'
  | 'roll'
  | 'reroll'
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
  /** Latest dice face (set when the engine rolls). */
  diceFace: DiceFaceId | null;
  /** Rolls used in the current turn (stuck-rerolls + extra rolls). */
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
