/**
 * Match history API client — talks to /api/matches (Prisma/SQLite backend).
 * Fails soft: the game is fully playable when the API is unreachable.
 */

export interface MatchPlayer {
  name: string;
  color: string;
  kind: string;
}

export interface MatchRecord {
  id: string;
  createdAt: string;
  winnerName: string;
  winnerColor: string;
  playerCount: number;
  aiCount: number;
  moves: number;
  captures: number;
  durationSec: number;
  players: MatchPlayer[];
  preset?: string;
  rulesConfig?: Record<string, unknown>;
  eventLog?: Record<string, unknown>[];
}

export type MatchRecordInput = Omit<MatchRecord, 'id' | 'createdAt' | 'eventLog'> & {
  eventLog?: Record<string, unknown>[];
};

export async function saveMatch(input: MatchRecordInput): Promise<MatchRecord | null> {
  try {
    const res = await fetch('/api/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return null;
    return data as MatchRecord;
  } catch {
    return null;
  }
}

export async function listMatches(limit = 8): Promise<MatchRecord[]> {
  try {
    const res = await fetch(`/api/matches?limit=${limit}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    return data as MatchRecord[];
  } catch {
    return [];
  }
}
