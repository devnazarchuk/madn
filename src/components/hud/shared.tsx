'use client';

import { playSfx } from '@/services/audio';
import { COLORS, COLORS_DEEP, STAR_COLOR } from '@/config/theme';
import type { DiceFaceId, PlayerColorId } from '@/engine/types';

/** Soft pointer-enter tick for big menu buttons (≈ −20 dB, never annoying). */
export function hoverSfx(): void {
  playSfx('uiHover');
}

// ---------------------------------------------------------------------------
// Animal icons — small hand-drawn silhouettes of the four characters
// (Fox, Bear, Frog, Chick). Fill = currentColor so they sit on any chip.
// ---------------------------------------------------------------------------

interface GlyphProps {
  size?: number;
}

function FoxGlyph({ size = 20 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3.6 2.4 8 6.2h8l4.4-3.8v8.1c0 5.1-3.7 9.4-8.4 11.2C7.3 17.7 3.6 13.4 3.6 8.3Z" />
    </svg>
  );
}

function BearGlyph({ size = 20 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5.6" cy="6.6" r="3.1" />
      <circle cx="18.4" cy="6.6" r="3.1" />
      <path d="M12 4.6c4.7 0 8.4 3.3 8.4 7.6s-3.7 7.6-8.4 7.6-8.4-3.3-8.4-7.6S7.3 4.6 12 4.6Z" />
    </svg>
  );
}

function FrogGlyph({ size = 20 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="6.6" cy="7" r="3.2" />
      <circle cx="17.4" cy="7" r="3.2" />
      <path d="M12 6.4c5 0 9 3.6 9 8s-4 7.2-9 7.2-9-2.8-9-7.2 4-8 9-8Z" />
    </svg>
  );
}

function ChickGlyph({ size = 20 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11 3.2c.5-1 2-1 2.4 0l.5 1.5c2.8.9 4.9 3.4 4.9 6.4 0 3.8-3.2 6.8-7.2 6.8s-7.2-3-7.2-6.8c0-3 2-5.5 4.8-6.4Z" />
      <path d="M19.4 10.6l3.4 1.7-3.3 1.7c.1-.6.1-1.1.1-1.7 0-.6 0-1.2-.2-1.7Z" />
    </svg>
  );
}

/** The animal friend of a color, as a tidy silhouette icon. */
export function AnimalIcon({ color, size = 20 }: { color: PlayerColorId; size?: number }) {
  switch (color) {
    case 'red':
      return <FoxGlyph size={size} />;
    case 'blue':
      return <BearGlyph size={size} />;
    case 'green':
      return <FrogGlyph size={size} />;
    case 'yellow':
      return <ChickGlyph size={size} />;
  }
}

/** Glyph accessor for chips & badges (renders at the given size). */
export const CHAR_ICON: Record<PlayerColorId, (props: GlyphProps) => React.ReactElement> = {
  red: FoxGlyph,
  blue: BearGlyph,
  green: FrogGlyph,
  yellow: ChickGlyph,
};

export function ColorDot({
  color,
  size = 10,
  className = '',
}: {
  color: DiceFaceId;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full ring-1 ring-black/15 ${className}`}
      style={{ width: size, height: size, backgroundColor: color === 'star' ? STAR_COLOR : COLORS[color] }}
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
  total = 3,
}: {
  color: PlayerColorId;
  home: number;
  track: number;
  total?: number;
}) {
  return (
    <span className="flex shrink-0 items-center gap-0.5 sm:gap-1" aria-hidden>
      {Array.from({ length: total }, (_, i) => {
        if (i < home) {
          return (
            <span
              key={i}
              className="inline-block size-1.5 rounded-full sm:size-2"
              style={{ backgroundColor: '#D9A441' }}
            />
          );
        }
        if (i < home + track) {
          return (
            <span
              key={i}
              className="inline-block size-1.5 rounded-full sm:size-2"
              style={{ backgroundColor: COLORS_DEEP[color] }}
            />
          );
        }
        return (
          <span key={i} className="inline-block size-1.5 rounded-full bg-black/15 sm:size-2" />
        );
      })}
    </span>
  );
}
