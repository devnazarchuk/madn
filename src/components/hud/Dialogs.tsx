'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Dices, DoorOpen, Home, Hourglass, RefreshCw, Swords, Star, Trophy } from 'lucide-react';
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
import type { PlayerColorId } from '@/engine/types';
import { ColorDot, fmtDuration } from './shared';

// ---------------------------------------------------------------------------
// How to play
// ---------------------------------------------------------------------------

const RULES_LIST: Array<{ icon: typeof Home; title: string; body: string }> = [
  {
    icon: Home,
    title: 'Bring all 3 pawns home',
    body: 'Race your three wooden pawns around the board and into your home row. First player with all pawns home wins.',
  },
  {
    icon: Dices,
    title: 'Roll the color die',
    body: 'Tap the die. It shows a color — one of your pawns must hop to the next track field of that color.',
  },
  {
    icon: DoorOpen,
    title: 'Entering the board',
    body: 'Roll your OWN color to move a pawn out of its base onto your start field. While all your pawns are still waiting in the base, any color lets you start.',
  },
  {
    icon: Swords,
    title: 'Captures',
    body: 'Land on an opponent pawn and it is sent all the way back to its base. Landing on your own pawn is blocked.',
  },
  {
    icon: Star,
    title: 'Going home',
    body: 'When no matching color lies ahead of a pawn, that pawn may enter its home row — every color matches home.',
  },
  {
    icon: Hourglass,
    title: 'Stuck turns',
    body: 'No legal move? The die rolls again automatically, up to three tries — then the turn passes on.',
  },
];

export function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg rounded-3xl border-[#5B3A24]/20 bg-[#FBF3E0] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-baloo)] text-2xl font-bold text-[#3E2A18]">
            How to play
          </DialogTitle>
          <DialogDescription>
            A cozy wooden race for 2–4 players, young and old.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[55vh] pr-3">
          <ul className="space-y-4">
            {RULES_LIST.map((rule) => (
              <li key={rule.title} className="flex gap-3">
                <span
                  className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: MATERIAL.walnut }}
                >
                  <rule.icon size={17} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#3E2A18]">{rule.title}</p>
                  <p className="text-sm text-[#6B4E35]">{rule.body}</p>
                </div>
              </li>
            ))}
          </ul>
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
