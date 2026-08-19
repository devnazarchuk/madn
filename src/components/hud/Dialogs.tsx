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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { listMatches, type MatchRecord } from '@/services/matchesApi';
import { COLORS, MATERIAL } from '@/config/theme';
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
        <ScrollArea className="max-h-[55vh] pr-3">
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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Match history (backed by /api/matches — SQLite)
// ---------------------------------------------------------------------------

export function HistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<MatchRecord[] | null>(null);
  const [loading, setLoading] = useState(false);

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
          <ScrollArea className="max-h-[55vh] pr-3">
            <ul className="space-y-2">
              {rows.map((m) => {
                const winnerColor = m.winnerColor as PlayerColorId;
                return (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 rounded-xl border border-[#5B3A24]/15 bg-white/60 px-3 py-2.5"
                  >
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
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
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
