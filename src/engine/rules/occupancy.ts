import { RULES } from '@/config/gameConfig';
import type { GameState, PawnState, PlayerRuntime } from '../types';

/**
 * ============================================================================
 * BOARD OCCUPANCY — who stands where, purely from the LOGICAL game state.
 * ============================================================================
 * The authoritative source of occupancy is always this module (never 3D
 * coordinates or visual collision detection): the engine knows exactly which
 * pawns occupy each logical position.
 */

/** ALL pawns occupying a track field (any color — stacks included). */
export function pawnsOnTrack(state: GameState, loopIdx: number): PawnState[] {
  const found: PawnState[] = [];
  for (const p of state.players) {
    for (const pawn of p.pawns) {
      if (pawn.pos.area === 'track' && pawn.pos.index === loopIdx) found.push(pawn);
    }
  }
  return found;
}

/** Pawns of one color occupying a track field. */
export function pawnsOfColorOnTrack(state: GameState, loopIdx: number, color: string): PawnState[] {
  return pawnsOnTrack(state, loopIdx).filter((p) => p.color === color);
}

/** First free slot of a player's private area ('base' | 'home'). */
export function firstFreeSlot(pawns: PawnState[], area: 'base' | 'home'): number | null {
  for (let i = 0; i < RULES[area === 'base' ? 'baseSlots' : 'homeSlots']; i++) {
    if (!pawns.some((pawn) => pawn.pos.area === area && pawn.pos.index === i)) return i;
  }
  return null;
}

/** Whether a home-row slot is occupied by the player's own pawn. */
export function homeSlotOccupied(player: PlayerRuntime, slot: number): boolean {
  return player.pawns.some((p) => p.pos.area === 'home' && p.pos.index === slot);
}

/** Find a pawn by id across all players. */
export function pawnById(state: GameState, id: string): PawnState | null {
  for (const p of state.players) {
    const found = p.pawns.find((pawn) => pawn.id === id);
    if (found) return found;
  }
  return null;
}

/** The runtime record of the player with the given color. */
export function playerOf(state: GameState, color: string): PlayerRuntime {
  return state.players.find((p) => p.color === color)!;
}

/** Deep-enough pure clone so engine transitions never mutate their input. */
export function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      pawns: p.pawns.map((pawn) => ({ ...pawn, pos: { ...pawn.pos } })),
    })),
    events: [...state.events],
  };
}
