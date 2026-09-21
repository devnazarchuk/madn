import { normalizeRulesConfig, type RulesConfig } from './rulesConfig';
import type { GameState } from './types';

/**
 * ============================================================================
 * LOCAL PERSISTENCE — autosave, custom rule presets, last player setup.
 * ============================================================================
 * Everything is versioned and validated on load; corrupt or incompatible
 * data is discarded gracefully (the game falls back to defaults).
 */

/**
 * v4 — kids-v5 board generation: white & black platforms woven into the
 * track, the standard die carries white/black faces (Star Mode is optional).
 * Saves from older board generations are discarded rather than mis-rendered
 * (their pawns stood on a different color weave).
 */
const AUTOSAVE_KEY = 'madn-kids-autosave-v4';
const PRESETS_KEY = 'madn-kids-rule-presets-v1';
const SETUP_KEY = 'madn-kids-last-setup-v1';

/** Events kept in the autosave (the full log is persisted server-side on win). */
const MAX_AUTOSAVE_EVENTS = 600;

const VALID_PHASES = [
  'await-roll',
  'rolling',
  'choose-star',
  'choose-pawn',
  'animating',
  'no-moves',
  'turn-end',
  'game-over',
] as const;
const VALID_FACES = ['red', 'blue', 'green', 'yellow', 'white', 'black', 'star'] as const;
const VALID_COLORS = ['red', 'blue', 'green', 'yellow'] as const;

// ---------------------------------------------------------------------------
// Autosave of the running match
// ---------------------------------------------------------------------------

export interface AutosavePayload {
  savedAt: number;
  game: GameState;
  totalMoves: number;
}

function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const g = value as Record<string, unknown>;
  if (
    !Array.isArray(g.players) ||
    g.players.length < 2 ||
    typeof g.activeIndex !== 'number' ||
    typeof g.phase !== 'string' ||
    typeof g.turn !== 'number' ||
    g.rulesConfig === null ||
    typeof g.rulesConfig !== 'object' ||
    !Array.isArray(g.events)
  ) {
    return false;
  }
  // Incompatible saves (old rulesets / die faces) are discarded, never
  // partially trusted.
  if (!VALID_PHASES.includes(g.phase as (typeof VALID_PHASES)[number])) return false;
  if (g.diceFace !== null && !VALID_FACES.includes(g.diceFace as (typeof VALID_FACES)[number])) {
    return false;
  }
  for (const p of g.players) {
    const player = p as Record<string, unknown>;
    if (!VALID_COLORS.includes(player.color as (typeof VALID_COLORS)[number])) return false;
    if (!Array.isArray(player.pawns)) return false;
  }
  return true;
}

export function saveAutosave(game: GameState, totalMoves: number): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed: GameState = {
      ...game,
      events: game.events.slice(-MAX_AUTOSAVE_EVENTS),
    };
    const payload: AutosavePayload = { savedAt: Date.now(), game: trimmed, totalMoves };
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
  } catch {
    // Storage full / unavailable — the game continues without autosave.
  }
}

export function loadAutosave(): AutosavePayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;
    if (!isGameState(p.game)) return null;
    const game = p.game as GameState;
    // Validate + normalize the embedded rules config.
    game.rulesConfig = normalizeRulesConfig(game.rulesConfig);
    if (game.phase === 'game-over') return null;
    return { savedAt: typeof p.savedAt === 'number' ? p.savedAt : Date.now(), game, totalMoves: Number(p.totalMoves) || 0 };
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Custom rule presets
// ---------------------------------------------------------------------------

export interface SavedPreset {
  id: string;
  name: string;
  savedAt: number;
  config: RulesConfig;
}

function readPresets(): SavedPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const presets: SavedPreset[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const p = item as Record<string, unknown>;
      if (typeof p.id !== 'string' || typeof p.name !== 'string') continue;
      presets.push({
        id: p.id,
        name: p.name.slice(0, 40),
        savedAt: typeof p.savedAt === 'number' ? p.savedAt : Date.now(),
        config: normalizeRulesConfig(p.config),
      });
    }
    return presets;
  } catch {
    return [];
  }
}

function writePresets(presets: SavedPreset[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // ignore
  }
}

export function listPresets(): SavedPreset[] {
  return readPresets();
}

export function savePreset(name: string, config: RulesConfig): SavedPreset {
  const presets = readPresets();
  const trimmed = name.trim().slice(0, 40) || 'My rules';
  const existing = presets.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  const preset: SavedPreset = {
    id: existing?.id ?? `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed,
    savedAt: Date.now(),
    config: { ...normalizeRulesConfig({ ...config, preset: 'custom' }) },
  };
  const next = existing
    ? presets.map((p) => (p.id === existing.id ? preset : p))
    : [...presets, preset];
  writePresets(next);
  return preset;
}

export function renamePreset(id: string, name: string): SavedPreset[] {
  const presets = readPresets().map((p) =>
    p.id === id ? { ...p, name: name.trim().slice(0, 40) || p.name } : p,
  );
  writePresets(presets);
  return presets;
}

export function deletePreset(id: string): SavedPreset[] {
  const presets = readPresets().filter((p) => p.id !== id);
  writePresets(presets);
  return presets;
}

// ---------------------------------------------------------------------------
// Last player setup
// ---------------------------------------------------------------------------

export interface LastSetup {
  playerCount: number;
  seats: Array<{
    color: string;
    kind: string;
    aiLevel: string;
    name: string;
  }>;
}

export function saveLastSetup(setup: LastSetup): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  } catch {
    // ignore
  }
}

export function loadLastSetup(): LastSetup | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SETUP_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;
    if (typeof p.playerCount !== 'number' || !Array.isArray(p.seats)) return null;
    return p as unknown as LastSetup;
  } catch {
    return null;
  }
}
