import { db } from '@/lib/db';
import type { Match } from '@prisma/client';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const COLORS = ['red', 'blue', 'green', 'yellow'] as const;

const playerSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.enum(COLORS),
  kind: z.enum(['human', 'ai']),
});

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
};

function parsePlayers(raw: string): ApiMatchPlayer[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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
    players: parsePlayers(row.players),
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
      },
    });
    return Response.json(toApiMatch(row), { status: 201 });
  } catch (error) {
    console.error('POST /api/matches failed:', error);
    return Response.json({ error: 'Failed to save match' }, { status: 500 });
  }
}
