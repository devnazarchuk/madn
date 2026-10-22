import { RULES } from '@/config/gameConfig';
import type { GameEvent, GameState, LegalMove } from '../types';
import { cloneState, firstFreeSlot, homeRowPacked, pawnById } from './occupancy';

/**
 * ============================================================================
 * MOVE EXECUTION — the atomic state transition (runs ONLY after the whole
 * path was validated legal by the legal-move pipeline).
 * ============================================================================
 * Sequence per the mandate:
 *   captures (victims → their bases) → the pawn itself moves → events are
 *   emitted → win check → extra-roll check. The input state is never mutated;
 *   a fresh cloned state is returned.
 *
 * The win condition (kids-v6): a player wins when their pawns ALL stand
 * inside the home stretch — strictly ONE PAWN PER FINISH CELL — packed
 * against the golden winning cell (the row fills sequentially: the first
 * finisher onto the golden cell, the next onto the middle slot, the last
 * onto the outer slot). Pawns merely inside the stretch with a free cell
 * ahead of them still have work to do.
 */

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
  /** Why the same player earned another roll ('capture' | 'own-color'). */
  extraTurn: 'capture' | 'own-color' | null;
}

/** Applies a fully validated legal move. Pure — returns a cloned state plus new events. */
export function applyMove(input: GameState, move: LegalMove): ApplyResult {
  const state: GameState = cloneState(input);
  const cfg = state.rulesConfig;
  const player = state.players[state.activeIndex]!;
  const color = player.color;
  const pawn = pawnById(state, move.pawnId)!;
  let seq = state.events.length;
  const events: GameEvent[] = [];

  // Captures first: every victim flies back to its base (first free slot).
  for (const victimId of move.capturedPawnIds) {
    const victim = pawnById(state, victimId)!;
    const victimPlayer = state.players.find((p) => p.color === victim.color)!;
    const slot = firstFreeSlot(victimPlayer.pawns, 'base') ?? 0;
    victim.pos = { area: 'base', index: slot };
    state.captures += 1;
    events.push({
      seq: seq++,
      turn: state.turn,
      kind: 'capture',
      player: color,
      pawnId: victim.id,
      capturedPawnId: victim.id,
      detail: `bumped back to base by ${pawn.id}`,
    });
  }

  // The pawn itself moves to the validated destination (exact slot).
  pawn.pos = { ...move.to };

  // A successful base exit ends the Ceramic-Dice pity streak of its owner.
  if (move.isEntry) player.exitFailStreak = 0;

  events.push({
    seq: seq++,
    turn: state.turn,
    kind: 'move',
    player: color,
    pawnId: pawn.id,
    from: move.from,
    to: pawn.pos,
    detail: move.isEntry
      ? `entered the board (${cfg.entryRule === 'any-color' ? 'any color' : 'own color'})`
      : move.isFinish
        ? 'reached the golden winning cell'
        : move.isHomeAdvance
          ? move.from.area === 'home'
            ? `walked deeper into the home stretch (slot ${move.to.index})`
            : 'stepped from the arrow gateway into the home stretch (slot 0)'
          : 'moved',
  });

  if (move.isFinish) {
    events.push({
      seq: seq++,
      turn: state.turn,
      kind: 'finish',
      player: color,
      pawnId: pawn.id,
      to: pawn.pos,
    });
  }

  // Win check: ALL pawns of the player stand inside the home stretch, ONE PER
  // FINISH CELL, packed against the golden winning cell — the match ends
  // immediately (see homeRowPacked for the exact packing semantics).
  if (homeRowPacked(player)) {
    state.winner = color;
    state.phase = 'game-over';
    events.push({
      seq: seq++,
      turn: state.turn,
      kind: 'game-over',
      player: color,
      detail: `${player.name} wins`,
    });
    state.events.push(...events);
    return { state, events, extraTurn: null };
  }

  // Extra rolls (only when the rules grant them; hard-capped per turn).
  let extraTurn: 'capture' | 'own-color' | null = null;
  if (cfg.extraTurnOnCapture && move.capturedPawnIds.length > 0) extraTurn = 'capture';
  else if (cfg.extraTurnOnOwnColor && state.diceFace === color) extraTurn = 'own-color';

  if (extraTurn && state.rollsThisTurn < RULES.maxRollsPerTurn) {
    state.phase = 'await-roll';
    state.extraRoll = extraTurn;
    events.push({
      seq: seq++,
      turn: state.turn,
      kind: 'turn',
      player: color,
      detail: `extra roll after ${extraTurn === 'capture' ? 'a capture' : 'rolling the own color'}`,
    });
  } else {
    extraTurn = null;
    state.phase = 'turn-end';
  }

  state.events.push(...events);
  return { state, events, extraTurn };
}
