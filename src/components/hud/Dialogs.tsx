'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Dices,
  DoorOpen,
  Hourglass,
  RefreshCw,
  ScrollText,
  Star,
  Swords,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { listMatches, type MatchRecord } from '@/services/matchesApi';
import { COLORS, MATERIAL, faceLabel } from '@/config/theme';
import { EDITION_FACTS, describeRules, type RulesConfig } from '@/engine/rulesConfig';
import { useGameStore } from '@/store/gameStore';
import type { PlayerColorId } from '@/engine/types';
import { ColorDot, fmtDuration } from './shared';

// ---------------------------------------------------------------------------
// Rules reference — ALWAYS reflects the active rules configuration
// ---------------------------------------------------------------------------

const SECTION_ICONS = [Dices, DoorOpen, Swords, Hourglass, Star];

export function RulesDialog({
  open,
  onClose,
  config,
}: {
  open: boolean;
  onClose: () => void;
  /** Falls back to the match config (in game) or the next-match config. */
  config?: RulesConfig;
}) {
  const activeConfig = useGameStore((s) =>
    s.screen === 'game' ? (s.game?.rulesConfig ?? s.rulesConfig) : s.rulesConfig,
  );
  const effective = config ?? activeConfig;
  const sections = useMemo(() => describeRules(effective), [effective]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg rounded-3xl border-[#5B3A24]/20 bg-[#FBF3E0] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-baloo)] text-2xl font-bold text-[#3E2A18]">
            How to play
          </DialogTitle>
          <DialogDescription>
            These rules match the current settings{effective.preset === 'classic' ? ' (Classic).' : ` (${effective.preset} mode).`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {sections.map((section, i) => {
              const Icon = SECTION_ICONS[i % SECTION_ICONS.length]!;
              return (
                <div key={section.title}>
                  <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-[#3E2A18]">
                    <span
                      className="flex size-6 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: MATERIAL.walnut }}
                    >
                      <Icon size={13} />
                    </span>
                    {section.title}
                  </p>
                  <ul className="space-y-1">
                    {section.points.map((point) => (
                      <li key={point} className="flex gap-1.5 text-sm text-[#6B4E35]">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#D9A441]" aria-hidden />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// About — edition research, verified facts vs. documented assumptions
// ---------------------------------------------------------------------------

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg rounded-3xl border-[#5B3A24]/20 bg-[#FBF3E0] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-baloo)] text-2xl font-bold text-[#3E2A18]">
            About this game
          </DialogTitle>
          <DialogDescription>
            A loving digital adaptation of the Kids edition of the German classic.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
              <p className="mb-1 font-bold text-[#3E2A18]">What we know for sure</p>
              <ul className="space-y-1">
                {EDITION_FACTS.verified.map((fact) => (
                  <li key={fact} className="flex gap-1.5 text-[#6B4E35]">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#43B57E]" aria-hidden />
                    {fact}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-bold text-[#3E2A18]">What we reconstructed</p>
              <p className="mb-1 text-xs italic text-[#8A6B4F]">
                The original printed rulebook could not be retrieved, so these mechanics are
                documented assumptions — each one can be changed in the rules menu:
              </p>
              <ul className="space-y-1">
                {EDITION_FACTS.assumed.map((fact) => (
                  <li key={fact} className="flex gap-1.5 text-[#6B4E35]">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#D9A441]" aria-hidden />
                    {fact}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-bold text-[#3E2A18]">How we handle uncertainty</p>
              <p className="text-[#6B4E35]">
                Classic Rules reproduce the documented reconstruction exactly and are locked.
                Everything uncertain becomes a switch in the Additional Rules menu — so families
                can play it THEIR way, and nobody silently invents official rules. The full
                research document ships with the project (RULES.md).
              </p>
            </div>
          </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Event-log rendering (match review)
// ---------------------------------------------------------------------------

interface StoredEvent {
  seq: number;
  turn: number;
  kind: string;
  player?: string;
  face?: string;
  pawnId?: string;
  capturedPawnId?: string;
  detail?: string;
}

function eventLine(e: StoredEvent, names: Record<string, string>): string {
  const who = e.player ? (names[e.player] ?? e.player) : '';
  switch (e.kind) {
    case 'game-started':
      return `Match started — ${e.detail ?? ''}`;
    case 'turn':
      return e.detail?.includes('extra') ? `${who} — ${e.detail}` : `${who}'s turn`;
    case 'roll':
      return `${who} rolled ${e.face ? faceLabel(e.face as Parameters<typeof faceLabel>[0]) : '?'}`;
    case 'reroll':
      return `${who} — no legal move, rolling again`;
    case 'move':
      return `${who} · ${e.pawnId ?? ''} ${e.detail ?? 'moved'}`;
    case 'capture':
      return `${who} bumped ${e.capturedPawnId ?? ''} back to base`;
    case 'finish':
      return `${who} brought ${e.pawnId ?? ''} home`;
    case 'pass':
      return `${who} passed (${e.detail ?? 'no move'})`;
    case 'game-over':
      return `Game over — ${e.detail ?? ''}`;
    default:
      return e.detail ?? e.kind;
  }
}

function EventLogView({ events, players }: { events: StoredEvent[]; players: Array<{ name: string; color: string }> }) {
  const names: Record<string, string> = {};
  for (const p of players) names[p.color] = p.name;
  return (
    <ol className="scrollbar-cute max-h-56 space-y-1 overflow-y-auto pr-1">
      {events.map((e, i) => (
        <li key={i} className="flex items-baseline gap-2 text-xs text-[#6B4E35]">
          <span className="w-9 shrink-0 text-right font-mono text-[10px] text-[#B08A5E]">
            #{e.turn}
          </span>
          <span className="flex items-center gap-1.5">
            {e.player && <ColorDot color={e.player as PlayerColorId} size={8} />}
            {eventLine(e, names)}
          </span>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Match history (backed by /api/matches — SQLite) with per-match review
// ---------------------------------------------------------------------------

export function HistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<MatchRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listMatches(8));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg rounded-3xl border-[#5B3A24]/20 bg-[#FBF3E0] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-baloo)] text-2xl font-bold text-[#3E2A18]">
            Match history
          </DialogTitle>
          <DialogDescription>The last games played at this table.</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl bg-[#E8D6B4]" />
            ))}
          </div>
        )}

        {!loading && rows !== null && rows.length === 0 && (
          <p className="py-6 text-center text-sm text-[#6B4E35]">
            No matches yet — play the first one!
          </p>
        )}

        {!loading && rows !== null && rows.length > 0 && (
          <ul className="space-y-2">
              {rows.map((m) => {
                const winnerColor = m.winnerColor as PlayerColorId;
                const reviewing = reviewId === m.id;
                const hasLog = Array.isArray(m.eventLog) && m.eventLog.length > 0;
                return (
                  <li
                    key={m.id}
                    className="rounded-xl border border-[#5B3A24]/15 bg-white/60 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-full text-white"
                        style={{ backgroundColor: COLORS[winnerColor] ?? MATERIAL.walnut }}
                      >
                        <Trophy size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#3E2A18]">
                          {m.winnerName}
                          <span className="ml-2 font-normal text-[#8A6B4F]">won</span>
                          {m.preset && m.preset !== 'classic' && (
                            <span className="ml-2 rounded-full bg-[#F4E7CE] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[#8A6B4F]">
                              {m.preset} rules
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-[#8A6B4F]">
                          {m.players.length} players · {m.moves} moves · {m.captures} captures ·{' '}
                          {fmtDuration(m.durationSec)} · {format(new Date(m.createdAt), 'd MMM, HH:mm')}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#8A6B4F]">
                          {m.players.map((p, i) => (
                            <span key={i} className="inline-flex items-center gap-1">
                              <ColorDot color={p.color as PlayerColorId} size={7} />
                              {p.name}
                            </span>
                          ))}
                        </p>
                      </div>
                      {hasLog && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 rounded-lg border-[#5B3A24]/25"
                          onClick={() => setReviewId(reviewing ? null : m.id)}
                          aria-expanded={reviewing}
                        >
                          <ScrollText size={13} /> {reviewing ? 'Hide' : 'Review'}
                        </Button>
                      )}
                    </div>
                    {reviewing && hasLog && (
                      <div className="mt-2 rounded-lg bg-[#F4E7CE]/60 p-2">
                        <EventLogView events={(m.eventLog ?? []) as unknown as StoredEvent[]} players={m.players} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
        )}

        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
