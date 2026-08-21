import { db } from '@/lib/db';
import type { Match } from '@prisma/client';
import { z } from 'zod';
import { normalizeRulesConfig } from '@/engine/rulesConfig';

export const dynamic = 'force-dynamic';

const COLORS = ['red', 'blue', 'green', 'yellow'] as const;
const PRESETS = ['classic', 'custom', 'quick', 'family'] as const;

const playerSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.enum(COLORS),
  kind: z.enum(['human', 'ai']),
});

/** Loose event schema — the engine's event log shape, stored verbatim. */
const eventSchema = z.record(z.string(), z.unknown());

const matchInputSchema = z
  .object({
    winnerName: z.string().trim().min(1).max(40),
    winnerColor: z.enum(COLORS),
    playerCount: z.number().int().min(2).max(4),
    aiCount: z.number().int().min(0),
    moves: z.number().int().min(0),
    captures: z.number().int().min(0),
    durationSec: z.number().int().min(1),
    players: z.array(playerSchema).min(2).max(4),
    preset: z.enum(PRESETS).default('classic'),
    rulesConfig: z.record(z.string(), z.unknown()).default({}),
    eventLog: z.array(eventSchema).max(2500).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.aiCount > data.playerCount) {
      ctx.addIssue({
        code: 'custom',
        path: ['aiCount'],
        message: 'aiCount must not exceed playerCount',
      });
    }
  });

type ApiMatchPlayer = { name: string; color: string; kind: string };

type ApiMatch = {
  id: string;
  createdAt: string;
  winnerName: string;
  winnerColor: string;
  playerCount: number;
  aiCount: number;
  moves: number;
  captures: number;
  durationSec: number;
  players: ApiMatchPlayer[];
  preset: string;
  rulesConfig: unknown;
  eventLog: unknown[];
};

function parseJson<T>(raw: string, fallback: T): T {
  try {
    const parsed: unknown = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function toApiMatch(row: Match): ApiMatch {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    winnerName: row.winnerName,
    winnerColor: row.winnerColor,
    playerCount: row.playerCount,
    aiCount: row.aiCount,
    moves: row.moves,
    captures: row.captures,
    durationSec: row.durationSec,
    players: parseJson<ApiMatchPlayer[]>(row.players, []),
    preset: row.preset,
    rulesConfig: parseJson<unknown>(row.rulesConfig, {}),
    eventLog: parseJson<unknown[]>(row.eventLog ?? '[]', []),
  };
}

export async function GET(request: Request) {
  const rawLimit = new URL(request.url).searchParams.get('limit');
  let limit = 8;
  if (rawLimit !== null) {
    const parsed = Number.parseInt(rawLimit, 10);
    if (Number.isFinite(parsed)) limit = parsed;
  }
  limit = Math.min(50, Math.max(1, limit));

  try {
    const rows = await db.match.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return Response.json(rows.map(toApiMatch));
  } catch (error) {
    console.error('GET /api/matches failed:', error);
    return Response.json({ error: 'Failed to load matches' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = matchInputSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request body';
    return Response.json({ error: message }, { status: 400 });
  }

  const input = parsed.data;
  // Server-side normalization guarantees the stored rules are a valid,
  // self-consistent configuration (the same rules the engine would accept).
  const rulesConfig = normalizeRulesConfig(input.rulesConfig);
  const eventLogJson = JSON.stringify(input.eventLog);

  try {
    const row = await db.match.create({
      data: {
        winnerName: input.winnerName,
        winnerColor: input.winnerColor,
        playerCount: input.playerCount,
        aiCount: input.aiCount,
        moves: input.moves,
        captures: input.captures,
        durationSec: input.durationSec,
        players: JSON.stringify(input.players),
        preset: input.preset,
        rulesConfig: JSON.stringify(rulesConfig),
        eventLog: eventLogJson.length > 400_000 ? null : eventLogJson,
      },
    });
    return Response.json(toApiMatch(row), { status: 201 });
  } catch (error) {
    console.error('POST /api/matches failed:', error);
    return Response.json({ error: 'Failed to save match' }, { status: 500 });
  }
}
