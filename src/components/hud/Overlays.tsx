'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  BookOpen,
  Check,
  Home,
  LogOut,
  Pause,
  Play,
  RotateCcw,
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
import { useGameStore } from '@/store/gameStore';
import { playSfx } from '@/services/audio';
import { COLORS } from '@/config/theme';
import { CHARACTERS } from '@/engine/game';
import { AnimalIcon, ColorDot, fmtDuration } from './shared';
import { SettingsPanel } from './SettingsPanel';
import { RulesDialog } from './Dialogs';

// ---------------------------------------------------------------------------
// Confetti — a restrained celebration (plain canvas, no dependencies)
// ---------------------------------------------------------------------------

function ConfettiBurst() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    const palette = [COLORS.red, COLORS.blue, COLORS.green, COLORS.yellow, '#D9A441', '#F6EBD9'];
    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      rot: number;
      vr: number;
      size: number;
      color: string;
      shape: number;
    }
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const particles: Particle[] = [];
    for (let i = 0; i < 130; i++) {
      const fromLeft = i % 2 === 0;
      particles.push({
        x: (fromLeft ? rnd(0.05, 0.25) : rnd(0.75, 0.95)) * canvas.width,
        y: canvas.height * rnd(0.55, 0.75),
        vx: rnd(-1, 1) * 2.4 * dpr + (fromLeft ? 1.6 : -1.6) * dpr,
        vy: rnd(-9.5, -5.5) * dpr,
        rot: rnd(0, Math.PI * 2),
        vr: rnd(-0.16, 0.16),
        size: rnd(5, 10) * dpr,
        color: palette[Math.floor(Math.random() * palette.length)]!,
        shape: Math.random() < 0.55 ? 0 : 1,
      });
    }

    let raf = 0;
    const startedAt = performance.now();
    const tick = () => {
      const age = performance.now() - startedAt;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const fade = age > 3200 ? Math.max(0, 1 - (age - 3200) / 700) : 1;
      for (const p of particles) {
        p.vy += 0.16 * dpr;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.color;
        if (p.shape === 0) {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (age < 3900) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60]"
      style={{ width: '100vw', height: '100vh' }}
    />
  );
}

// ---------------------------------------------------------------------------
// Winner overlay
// ---------------------------------------------------------------------------

export function WinnerOverlay() {
  const winner = useGameStore((s) => s.winner);
  const game = useGameStore((s) => s.game);
  const matchSaved = useGameStore((s) => s.matchSaved);
  const restart = useGameStore((s) => s.restart);
  const quitToMenu = useGameStore((s) => s.quitToMenu);

  const player = game?.players.find((p) => p.color === winner);
  const durationSec = game ? Math.max(1, Math.round((Date.now() - game.startedAt) / 1000)) : 0;

  return (
    <>
      {winner && <ConfettiBurst />}
      <Dialog open={!!winner}>
        <DialogContent
          className="max-w-sm rounded-[2rem] border-[#5B3A24]/25 bg-[#FBF3E0]"
          showCloseButton={false}
          aria-describedby={undefined}
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          >
            <DialogHeader className="items-center text-center">
              <motion.span
                initial={{ rotate: -12, scale: 0.8 }}
                animate={{ rotate: [0, -8, 8, 0], scale: 1 }}
                transition={{ delay: 0.35, duration: 0.7 }}
                className="mx-auto mb-1 flex size-20 items-center justify-center rounded-full text-white shadow-lg"
                style={{ backgroundColor: winner ? COLORS[winner] : '#5B3A24' }}
              >
                <Trophy size={40} />
              </motion.span>
              <DialogTitle className="font-[family-name:var(--font-baloo)] text-3xl font-extrabold text-[#3E2A18]">
                {player?.name ?? 'Player'} wins!
              </DialogTitle>
              <DialogDescription className="flex items-center justify-center gap-2 text-sm text-[#8A6B4F]">
                <span className="text-[#5B3A24]">
                  {winner ? <AnimalIcon color={winner} size={15} /> : null}
                </span>
                {winner ? `${CHARACTERS[winner].name} the ${CHARACTERS[winner].animal} · ` : ''}
                all pawns are home
              </DialogDescription>
            </DialogHeader>

            <div className="my-4 grid grid-cols-3 gap-2 text-center">
              {[
                {
                  label: 'Moves',
                  value: `${game?.events.filter((e) => e.kind === 'move').length ?? 0}`,
                },
                { label: 'Captures', value: `${game?.captures ?? 0}` },
                { label: 'Duration', value: fmtDuration(durationSec) },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border border-[#5B3A24]/15 bg-white/60 py-2.5">
                  <p className="text-lg font-bold text-[#3E2A18]">{s.value}</p>
                  <p className="text-[11px] uppercase tracking-wide text-[#8A6B4F]">{s.label}</p>
                </div>
              ))}
            </div>

            {game && (
              <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
                {game.players.map((p) => (
                  <span
                    key={p.id}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      p.color === winner ? 'text-white' : 'bg-white/60 text-[#6B4E35]'
                    }`}
                    style={p.color === winner ? { backgroundColor: COLORS[p.color] } : undefined}
                  >
                    <ColorDot color={p.color} size={9} />
                    {p.name}
                  </span>
                ))}
              </div>
            )}

            {matchSaved && (
              <p className="mb-3 flex items-center justify-center gap-1.5 text-xs text-[#43B57E]">
                <Check size={13} /> Saved to match history
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => {
                  playSfx('star');
                  restart();
                }}
                className="h-12 rounded-2xl bg-[#E8503A] text-base font-bold text-white hover:bg-[#C23A28]"
              >
                <RotateCcw size={17} /> Play again
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  playSfx('uiClick');
                  quitToMenu();
                }}
                className="h-12 rounded-2xl border-[#5B3A24]/25 bg-white/60 text-base font-semibold text-[#3E2A18] hover:bg-white/85"
              >
                <Home size={17} /> Menu
              </Button>
            </div>
          </motion.div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pause overlay — resume / restart / rules / settings / quit (with warning)
// ---------------------------------------------------------------------------

export function PauseOverlay() {
  const paused = useGameStore((s) => s.paused);
  const winner = useGameStore((s) => s.winner);
  const togglePause = useGameStore((s) => s.togglePause);
  const restart = useGameStore((s) => s.restart);
  const quitToMenu = useGameStore((s) => s.quitToMenu);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);

  return (
    <>
      <Dialog open={paused && !winner} onOpenChange={(v) => !v && togglePause()}>
        <DialogContent className="max-w-sm rounded-[2rem] border-[#5B3A24]/25 bg-[#FBF3E0] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-[family-name:var(--font-baloo)] text-2xl font-bold text-[#3E2A18]">
              <Pause size={20} /> Paused
            </DialogTitle>
            <DialogDescription>The animal friends take a cookie break.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => {
                playSfx('uiClick');
                togglePause();
              }}
              className="h-11 rounded-2xl bg-[#43B57E] font-semibold text-white hover:bg-[#2E8F63]"
            >
              <Play size={16} /> Resume
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                playSfx('uiClick');
                restart();
              }}
              className="h-11 rounded-2xl border-[#5B3A24]/25 bg-white/60 font-semibold text-[#3E2A18] hover:bg-white/85"
            >
              <RotateCcw size={15} /> Restart
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                playSfx('modal');
                setRulesOpen(true);
              }}
              className="h-11 rounded-2xl border-[#5B3A24]/25 bg-white/60 font-semibold text-[#3E2A18] hover:bg-white/85"
            >
              <BookOpen size={15} /> Rules
            </Button>
            {confirmQuit ? (
              <Button
                onClick={() => {
                  playSfx('uiClick');
                  setConfirmQuit(false);
                  quitToMenu();
                }}
                className="h-11 rounded-2xl bg-[#C23A28] font-semibold text-white hover:bg-[#A02A1C]"
              >
                <AlertTriangle size={15} /> Really quit?
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  playSfx('uiClick');
                  setConfirmQuit(true);
                }}
                className="h-11 rounded-2xl border-[#C23A28]/35 bg-white/60 font-semibold text-[#C23A28] hover:bg-[#FBE3DE]"
              >
                <LogOut size={15} /> Quit
              </Button>
            )}
          </div>
          {confirmQuit && (
            <p className="text-center text-xs text-[#8A6B4F]">
              Your match is saved — you can continue it from the menu.
            </p>
          )}

          <div className="mt-2 rounded-2xl border border-[#5B3A24]/15 bg-white/50 p-3.5">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#8A6B4F]">
              <Swords size={13} /> Settings
            </p>
            {/* Uncapped on phones — the dialog itself scrolls natively; the
                desktop cap keeps the pause menu compact. */}
            <div className="scrollbar-cute overflow-y-auto pr-1 sm:max-h-[34vh]">
              <SettingsPanel />
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </>
  );
}

/** Both overlays, self-gated. */
export function Overlays() {
  return (
    <>
      <WinnerOverlay />
      <PauseOverlay />
    </>
  );
}
