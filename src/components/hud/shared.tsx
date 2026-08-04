'use client';

import { Cat, Dog, Mouse, Rabbit, type LucideIcon } from 'lucide-react';
import { COLORS, COLORS_DEEP } from '@/config/theme';
import type { PlayerColorId, TrackColorId } from '@/engine/types';

/** Lucide character icons matching the four animal characters. */
export const CHAR_ICON: Record<PlayerColorId, LucideIcon> = {
  blue: Rabbit,
  yellow: Mouse,
  red: Cat,
  green: Dog,
};

export function ColorDot({
  color,
  size = 10,
  className = '',
}: {
  color: TrackColorId;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full ring-1 ring-black/15 ${className}`}
      style={{ width: size, height: size, backgroundColor: COLORS[color] }}
    />
  );
}

/** "4:07" from seconds. */
export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Tiny pawn-count dots: filled gold = home, colored = track, hollow = base. */
export function PawnDots({
  color,
  home,
  track,
}: {
  color: PlayerColorId;
  home: number;
  track: number;
}) {
  const total = 3;
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {Array.from({ length: total }, (_, i) => {
        if (i < home) {
          return (
            <span
              key={i}
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: '#D9A441' }}
            />
          );
        }
        if (i < home + track) {
          return (
            <span
              key={i}
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: COLORS_DEEP[color] }}
            />
          );
        }
        return <span key={i} className="inline-block size-2 rounded-full bg-black/15" />;
      })}
    </span>
  );
}
