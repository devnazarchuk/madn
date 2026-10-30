'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Dices,
  Footprints,
  PartyPopper,
  PlayCircle,
  Shield,
  Sparkles,
  Target,
  Trophy,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { COLORS, MATERIAL } from '@/config/theme';
import type { PlayerColorId } from '@/engine/types';
import { playSfx } from '@/services/audio';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * ============================================================================
 * HOW TO PLAY — visual manual, tutorial intro & interactive onboarding.
 * ============================================================================
 * The manual teaches the actual implemented mechanics (Classic behavior)
 * with small animated diagrams instead of walls of text. The interactive
 * tutorial walks through the same mechanics step by step.
 */

const GOLD = MATERIAL.gold;
const CREAM = '#FBF3E0';

// ---------------------------------------------------------------------------
// Keyframe helper — builds a hop-by-hop journey along given points
// ---------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

function journeyKeyframes(points: Point[], hop = 26) {
  const x: number[] = [];
  const y: number[] = [];
  const times: number[] = [];
  const hopW = 1;
  const dwellW = 0.4;
  const total = (points.length - 1) * hopW + points.length * dwellW;
  let t = 0;
  const push = (px: number, py: number) => {
    x.push(px);
    y.push(py);
    times.push(Math.min(1, t / total));
  };
  push(points[0]!.x, points[0]!.y);
  t += dwellW;
  push(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    t += hopW / 2;
    push((points[i - 1]!.x + points[i]!.x) / 2, Math.min(points[i - 1]!.y, points[i]!.y) - hop);
    t += hopW / 2;
    push(points[i]!.x, points[i]!.y);
    t += dwellW;
    push(points[i]!.x, points[i]!.y);
  }
  const norm = times[times.length - 1]!;
  for (let i = 0; i < times.length; i++) times[i] = times[i]! / norm;
  return { x, y, times };
}

// ---------------------------------------------------------------------------
// Miniature scene primitives
// ---------------------------------------------------------------------------

function Field({ x, y, color, r = 17 }: { x: number; y: number; color: string; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={color} stroke="rgba(36,27,20,0.25)" strokeWidth={2} />
      <circle cx={x} cy={y} r={r - 5} fill="rgba(255,255,255,0.18)" stroke="none" />
    </g>
  );
}

function Pawn({ color, x, y, scale = 1 }: { color: string; x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx={0} cy={12} rx={10} ry={9} fill="rgba(36,27,20,0.18)" />
      <ellipse cx={0} cy={7} rx={9} ry={9} fill={color} stroke="rgba(36,27,20,0.35)" strokeWidth={1.5} />
      <circle cx={0} cy={-5} r={7.5} fill={color} stroke="rgba(36,27,20,0.35)" strokeWidth={1.5} />
      <circle cx={-2.6} cy={-6} r={1.4} fill="#241B14" />
      <circle cx={2.6} cy={-6} r={1.4} fill="#241B14" />
    </g>
  );
}

function TravelingPawn({
  points,
  still,
  color,
  stillAt = 1,
}: {
  points: Point[];
  still: boolean;
  color: string;
  stillAt?: number;
}) {
  const keys = useMemo(() => journeyKeyframes(points), [points]);
  if (still) {
    const p = points[Math.min(stillAt, points.length - 1)]!;
    return <Pawn color={color} x={p.x} y={p.y} />;
  }
  return (
    <motion.g
      animate={{
        x: keys.x,
        y: keys.y,
        opacity: [0, 1, 1, 1, 0],
      }}
      transition={{
        duration: Math.max(3.2, points.length * 1.15),
        times: keys.times,
        repeat: Infinity,
        repeatDelay: 0.5,
        ease: 'easeInOut',
        opacity: { duration: Math.max(3.2, points.length * 1.15), times: [0, 0.05, 0.93, 0.98, 1], repeat: Infinity, repeatDelay: 0.5 },
      }}
    >
      <Pawn color={color} x={0} y={0} />
    </motion.g>
  );
}

function SceneDie({ x, y, color, still }: { x: number; y: number; color: string; still: boolean }) {
  return (
    <motion.g
      animate={still ? undefined : { scale: [1, 1.12, 1], rotate: [0, -6, 6, 0] }}
      transition={still ? undefined : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{ transformOrigin: `${x}px ${y}px` }}
    >
      <g transform={`translate(${x} ${y})`}>
        <rect x={-16} y={-16} width={32} height={32} rx={8} fill={CREAM} stroke="rgba(36,27,20,0.3)" strokeWidth={2} />
        <circle cx={0} cy={0} r={8.5} fill={color} stroke="rgba(36,27,20,0.25)" strokeWidth={1.5} />
      </g>
    </motion.g>
  );
}

function SceneLabel({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={10.5}
      fontWeight={700}
      fill="#8A6B4F"
      style={{ letterSpacing: '0.04em' }}
    >
      {children}
    </text>
  );
}

/** Shared svg frame — a soft stage with rounded ground. */
function Scene({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <svg
      viewBox="0 0 340 190"
      className="h-auto w-full"
      role="img"
      aria-label={label}
    >
      {children}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The six demo scenes
// ---------------------------------------------------------------------------

function SceneRace({ still }: { still: boolean }) {
  return (
    <Scene label="A pawn hops along the track into its color row to the golden cell">
      {/* track */}
      <Field x={40} y={70} color={COLORS.blue} />
      <Field x={95} y={70} color={COLORS.green} />
      <Field x={150} y={70} color={COLORS.yellow} />
      <Field x={205} y={70} color={COLORS.blue} />
      <Field x={260} y={70} color={COLORS.green} />
      <SceneLabel x={150} y={104}>the track — every color appears</SceneLabel>
      {/* home stretch of the red player */}
      <Field x={140} y={150} color={COLORS.red} />
      <Field x={195} y={150} color={COLORS.red} />
      <Field x={250} y={150} color={GOLD} />
      <SceneLabel x={195} y={182}>your home stretch &amp; golden goal</SceneLabel>
      <TravelingPawn
        still={still}
        color={COLORS.red}
        stillAt={2}
        points={[
          { x: 40, y: 54 },
          { x: 95, y: 54 },
          { x: 150, y: 54 },
          { x: 150, y: 134 },
          { x: 195, y: 134 },
          { x: 250, y: 134 },
        ]}
      />
    </Scene>
  );
}

function SceneRoll({ still }: { still: boolean }) {
  const target = { x: 245, y: 134 };
  return (
    <Scene label="The die shows red, so the pawn hops to the next red field">
      <SceneDie x={40} y={46} color={COLORS.red} still={still} />
      <Field x={110} y={70} color={COLORS.blue} />
      <Field x={165} y={70} color={COLORS.green} />
      <Field x={220} y={70} color={COLORS.yellow} />
      <Field x={275} y={70} color={COLORS.red} />
      {!still && (
        <motion.circle
          cx={target.x}
          cy={target.y}
          r={22}
          fill="none"
          stroke={GOLD}
          strokeWidth={3}
          animate={{ opacity: [0, 0, 0.9, 0], scale: [1, 1, 1.25, 1.4] }}
          transition={{ duration: 2.6, times: [0, 0.45, 0.6, 1], repeat: Infinity }}
        />
      )}
      <SceneLabel x={192} y={104}>hop to the NEXT field of that color</SceneLabel>
      <Field x={245} y={150} color={COLORS.red} />
      <SceneLabel x={245} y={182}>no counting needed</SceneLabel>
      <TravelingPawn
        still={still}
        color={COLORS.red}
        stillAt={1}
        points={[
          { x: 110, y: 54 },
          { x: 275, y: 54 },
          { x: 275, y: 134 },
        ]}
      />
    </Scene>
  );
}

function SceneBase({ still }: { still: boolean }) {
  return (
    <Scene label="Rolling your own color brings a pawn out of the base">
      <SceneDie x={52} y={50} color={COLORS.red} still={still} />
      {/* the base pod */}
      <rect x={110} y={92} width={104} height={78} rx={16} fill="rgba(91,58,36,0.14)" stroke="rgba(91,58,36,0.3)" strokeWidth={2} />
      <SceneLabel x={162} y={112}>your base</SceneLabel>
      <Pawn color={COLORS.red} x={140} y={138} scale={0.72} />
      <Pawn color={COLORS.red} x={162} y={144} scale={0.72} />
      <TravelingPawn
        still={still}
        color={COLORS.red}
        stillAt={still ? 1 : 0}
        points={[{ x: 184, y: 138 }, { x: 252, y: 130 }]}
      />
      {/* start field */}
      <Field x={272} y={146} color={COLORS.red} />
      <SceneLabel x={272} y={180}>start field</SceneLabel>
      <SceneLabel x={52} y={92}>roll your color</SceneLabel>
    </Scene>
  );
}

function SceneBump({ still }: { still: boolean }) {
  return (
    <Scene label="A red pawn lands on a blue pawn and bumps it back to its base">
      <Field x={150} y={100} color={COLORS.red} />
      <Field x={210} y={100} color={COLORS.yellow} />
      <Field x={270} y={100} color={COLORS.green} />
      {/* victim's base */}
      <rect x={116} y={140} width={70} height={40} rx={12} fill="rgba(91,58,36,0.14)" stroke="rgba(91,58,36,0.3)" strokeWidth={2} />
      <SceneLabel x={151} y={186}>back to base!</SceneLabel>
      {/* victim flies home */}
      {still ? (
        <Pawn color={COLORS.blue} x={151} y={158} scale={0.72} />
      ) : (
        <motion.g
          animate={{
            x: [210, 210, 151, 151],
            y: [84, 40, 158, 158],
            opacity: [1, 1, 0.9, 0],
          }}
          transition={{ duration: 3, times: [0, 0.42, 0.68, 1], repeat: Infinity, repeatDelay: 0.7, ease: 'easeInOut' }}
        >
          <Pawn color={COLORS.blue} x={0} y={0} scale={0.8} />
        </motion.g>
      )}
      <TravelingPawn
        still={still}
        color={COLORS.red}
        stillAt={1}
        points={[{ x: 150, y: 84 }, { x: 210, y: 84 }]}
      />
    </Scene>
  );
}

function SceneArrow({ still }: { still: boolean }) {
  return (
    <Scene label="The golden arrow is a mandatory stop, then the pawn walks its home row">
      <Field x={50} y={70} color={COLORS.blue} />
      <Field x={105} y={70} color={COLORS.green} />
      <Field x={160} y={70} color={COLORS.yellow} />
      {/* golden arrow gateway */}
      <motion.g
        animate={still ? undefined : { scale: [1, 1.1, 1] }}
        transition={still ? undefined : { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '225px 70px' }}
      >
        <Field x={225} y={70} color={GOLD} />
        <path d="M 215 70 L 231 70 M 226 63 L 233 70 L 226 77" stroke="#3E2A18" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
      <SceneLabel x={225} y={104}>mandatory stop</SceneLabel>
      {/* home row */}
      <Field x={225} y={150} color={COLORS.red} />
      <Field x={275} y={150} color={COLORS.red} />
      <Field x={318} y={150} color={GOLD} r={15} />
      <SceneLabel x={275} y={182}>own color walks you home</SceneLabel>
      <TravelingPawn
        still={still}
        color={COLORS.red}
        stillAt={1}
        points={[
          { x: 160, y: 54 },
          { x: 225, y: 54 },
          { x: 225, y: 134 },
          { x: 275, y: 134 },
        ]}
      />
    </Scene>
  );
}

function SceneWin({ still }: { still: boolean }) {
  const confetti = [
    { x: 60, c: COLORS.yellow, d: 0 },
    { x: 120, c: COLORS.green, d: 0.4 },
    { x: 230, c: COLORS.blue, d: 0.8 },
    { x: 290, c: COLORS.yellow, d: 1.2 },
  ];
  return (
    <Scene label="Three pawns parked on the home cells — the match is won">
      <Field x={130} y={120} color={COLORS.red} />
      <Field x={185} y={120} color={COLORS.red} />
      <Field x={240} y={120} color={GOLD} />
      <Pawn color={COLORS.red} x={130} y={106} />
      <Pawn color={COLORS.red} x={185} y={106} />
      <Pawn color={COLORS.red} x={240} y={106} />
      {!still &&
        confetti.map((c, i) => (
          <motion.circle
            key={i}
            cx={c.x}
            r={4}
            fill={c.c}
            animate={{ cy: [170, 30], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 2.2, delay: c.d, repeat: Infinity, ease: 'easeOut', times: [0, 0.2, 0.8, 1] }}
          />
        ))}
      {/* trophy pops over the golden cell */}
      <motion.g
        animate={still ? undefined : { y: [0, -8, 0] }}
        transition={still ? undefined : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <g transform="translate(240 66)">
          <circle r={22} fill={GOLD} stroke="#B6842B" strokeWidth={2} />
          <path
            d="M -8 -10 L 8 -10 L 8 -2 C 8 6 4 10 0 10 C -4 10 -8 6 -8 -2 Z M -8 -8 L -13 -8 C -13 -1 -10 3 -7 3 M 8 -8 L 13 -8 C 13 -1 10 3 7 3 M -3 10 L 3 10 L 3 14 L -3 14 Z"
            fill="#3E2A18"
          />
        </g>
      </motion.g>
      <SceneLabel x={185} y={40}>all pawns home — you win!</SceneLabel>
    </Scene>
  );
}

// ---------------------------------------------------------------------------
// Step definitions (shared by the tutorial and the manual)
// ---------------------------------------------------------------------------

interface TutorialStep {
  id: string;
  title: string;
  text: string;
  Scene: (props: { still: boolean }) => React.ReactElement;
  icon: typeof Dices;
}

const STEPS: TutorialStep[] = [
  {
    id: 'goal',
    title: 'The goal',
    text: 'Race your pawns around the board into your own home stretch. The first player with every pawn home wins!',
    Scene: SceneRace,
    icon: Target,
  },
  {
    id: 'roll',
    title: 'Roll & move',
    text: 'Tap the die, then move ONE pawn to the NEXT field showing the rolled color. No counting — just matching.',
    Scene: SceneRoll,
    icon: Dices,
  },
  {
    id: 'base',
    title: 'Leave the base',
    text: 'Roll your own color to bring a pawn out onto your start field. (In Quick Game any color works — a golden star is always wild.)',
    Scene: SceneBase,
    icon: PlayCircle,
  },
  {
    id: 'bump',
    title: 'Bumping rivals',
    text: 'Land exactly on a rival pawn and it goes all the way back to its base. Careful — rivals can bump you too!',
    Scene: SceneBump,
    icon: Bot,
  },
  {
    id: 'arrow',
    title: 'The golden arrow',
    text: 'The arrow at the arm tip is a mandatory stop — roll its color to reach it, then your own color to enter your row. Every finish slot holds one pawn.',
    Scene: SceneArrow,
    icon: Footprints,
  },
  {
    id: 'win',
    title: 'Winning',
    text: 'Fill your home stretch — one pawn per cell, the first on the golden cell — and the game ends immediately. Hooray!',
    Scene: SceneWin,
    icon: Trophy,
  },
];

// ---------------------------------------------------------------------------
// Interactive tutorial overlay
// ---------------------------------------------------------------------------

export function TutorialOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const [step, setStep] = useState(0);

  // Restart at step 1 whenever the tutorial (re)opens — adjusted during
  // render per the React docs so no effect/setState cascade is needed.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setStep(0);
  }

  const finish = useCallback(() => {
    playSfx('star');
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'ArrowRight') setStep((s) => Math.min(STEPS.length - 1, s + 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const current = STEPS[step]!;
  const SceneComp = current.Scene;
  const last = step === STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Interactive tutorial"
      className="pointer-events-auto fixed inset-0 z-[70] flex flex-col bg-[#241B14]/92 backdrop-blur-sm"
    >
      {/* header — progress & exit */}
      <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#D9C3A0]">
          Step {step + 1} of {STEPS.length}
        </p>
        <div className="flex items-center gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`h-2 rounded-full transition-all ${
                i === step ? 'w-5 bg-[#D9A441]' : i < step ? 'w-2 bg-[#D9A441]/60' : 'w-2 bg-white/25'
              }`}
            />
          ))}
        </div>
        <Button
          size="icon"
          variant="secondary"
          aria-label="Exit tutorial"
          onClick={() => {
            playSfx('uiClick');
            onClose();
          }}
          className="size-9 rounded-xl bg-white/10 text-[#F6EBD9] hover:bg-white/20"
        >
          <X size={17} />
        </Button>
      </div>

      {/* stage */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 sm:px-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={reducedMotion ? false : { opacity: 0, x: 34, scale: 0.97 }}
            animate={reducedMotion ? undefined : { opacity: 1, x: 0, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, x: -34, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-lg rounded-3xl border border-[#5B3A24]/25 bg-[#FBF3E0] p-3 shadow-2xl shadow-black/50 sm:p-4"
          >
            <SceneComp still={reducedMotion} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* caption + controls */}
      <div className="px-3 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:pb-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={`cap-${current.id}`}
            initial={reducedMotion ? false : { opacity: 0, y: 14 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: 0.24 }}
            className="mx-auto w-full max-w-lg"
          >
            <div className="rounded-3xl border border-white/10 bg-[#2E241A]/95 p-4 text-[#F6EBD9] shadow-xl">
              <p className="mb-1 flex items-center gap-2 text-base font-extrabold">
                <span className="flex size-7 items-center justify-center rounded-xl bg-[#D9A441] text-[#3E2A18]">
                  <current.icon size={15} />
                </span>
                {current.title}
              </p>
              <p className="text-sm leading-relaxed text-[#E4D2B4]">{current.text}</p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  playSfx('uiClick');
                  setStep((s) => Math.max(0, s - 1));
                }}
                disabled={step === 0}
                className="h-11 rounded-2xl border-white/20 bg-white/10 px-4 font-semibold text-[#F6EBD9] hover:bg-white/20 disabled:opacity-40"
              >
                <ArrowLeft size={16} /> Back
              </Button>
              <Button
                onClick={() => {
                  playSfx('uiClick');
                  if (last) {
                    finish();
                  } else {
                    setStep((s) => s + 1);
                  }
                }}
                className="h-11 flex-1 rounded-2xl bg-[#E8503A] font-bold text-white shadow-lg shadow-[#E8503A]/25 hover:bg-[#C23A28]"
              >
                {last ? (
                  <>
                    <PartyPopper size={17} /> Start playing!
                  </>
                ) : (
                  <>
                    Next <ArrowRight size={16} />
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tutorial intro chooser — shown the first time "How to play" is opened
// ---------------------------------------------------------------------------

export function TutorialIntroDialog({
  open,
  onClose,
  onStart,
  onManual,
  onDontShow,
}: {
  open: boolean;
  onClose: () => void;
  onStart: () => void;
  onManual: () => void;
  onDontShow: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm rounded-[2rem] border-[#5B3A24]/25 bg-[#FBF3E0] sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <span className="mx-auto mb-1 flex size-14 items-center justify-center rounded-2xl bg-[#D9A441] text-[#3E2A18] shadow-md">
            <Sparkles size={26} />
          </span>
          <DialogTitle className="font-[family-name:var(--font-baloo)] text-2xl font-bold text-[#3E2A18]">
            Would you like to take an interactive tutorial?
          </DialogTitle>
          <DialogDescription className="text-sm text-[#8A6B4F]">
            It demonstrates the most important rules with short animations and visual examples —
            it takes about a minute. You can also read the manual instead.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          <Button
            onClick={() => {
              playSfx('star');
              onStart();
            }}
            className="h-12 w-full rounded-2xl bg-[#E8503A] text-base font-bold text-white shadow-lg shadow-[#E8503A]/25 hover:bg-[#C23A28]"
          >
            <PlayCircle size={18} /> Start interactive tutorial
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              playSfx('uiClick');
              onManual();
            }}
            className="h-11 w-full rounded-2xl border-[#5B3A24]/25 bg-white/60 font-semibold text-[#3E2A18] hover:bg-white/85"
          >
            Read manual
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              playSfx('uiClick');
              onDontShow();
            }}
            className="h-10 w-full rounded-2xl text-sm font-medium text-[#8A6B4F] hover:bg-[#F4E7CE]"
          >
            Don&apos;t show again
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Visual manual dialog
// ---------------------------------------------------------------------------

const MANUAL_BULLETS: Record<string, string[]> = {
  goal: [
    'Every player races their pawns around the cross-shaped track.',
    'The own home stretch is fed from the arm tip opposite your color row.',
  ],
  roll: [
    'Roll a color → move ONE pawn to the next field of that color.',
    'White & black faces are long platform strides (Star Mode turns them into wild stars).',
  ],
  base: [
    'Roll your OWN color to bring a pawn onto your start field.',
    'While all pawns still wait in the base, any color may let the first one out.',
  ],
  bump: [
    'Land exactly on an opponent to send it back to its base.',
    'Pawns on their own start field are safe when "Safe start fields" is on.',
  ],
  arrow: [
    'The golden arrow is a MANDATORY stop — you can never hop over it.',
    'Roll the arrow cell\'s color to land on it, then your own color to step inside the row.',
  ],
  win: [
    'One pawn per finish cell — the first stands on the golden cell forever.',
    'Bring ALL pawns home to win; the game ends immediately.',
  ],
};

export function HowToPlayDialog({
  open,
  onClose,
  onTutorial,
}: {
  open: boolean;
  onClose: () => void;
  onTutorial: () => void;
}) {
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg rounded-3xl border-[#5B3A24]/20 bg-[#FBF3E0] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-[family-name:var(--font-baloo)] text-2xl font-bold text-[#3E2A18]">
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#D9A441] text-[#3E2A18]">
              <Shield size={18} />
            </span>
            How to play
          </DialogTitle>
          <DialogDescription>
            The most important rules, shown with little examples — the full rule reference lives in
            the game&apos;s book button.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {STEPS.map((step, i) => {
            const SceneComp = step.Scene;
            return (
              <div
                key={step.id}
                className="overflow-hidden rounded-2xl border border-[#5B3A24]/15 bg-white/60"
              >
                <div className="border-b border-[#5B3A24]/10 bg-[#F8EED8]/70 px-3 py-2">
                  <p className="flex items-center gap-2 text-sm font-bold text-[#3E2A18]">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-[#5B3A24] text-[#F6EBD9]">
                      <step.icon size={13} />
                    </span>
                    {i + 1}. {step.title}
                  </p>
                </div>
                <div className="grid gap-2 p-3 sm:grid-cols-[1.1fr_1fr] sm:items-center sm:gap-3">
                  <div className="rounded-xl bg-[#F8EED8]/80 p-1.5">
                    <SceneComp still={reducedMotion} />
                  </div>
                  <ul className="space-y-1.5">
                    {MANUAL_BULLETS[step.id]!.map((b) => (
                      <li key={b} className="flex gap-1.5 text-xs leading-snug text-[#6B4E35]">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#D9A441]" aria-hidden />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
          <p className="px-1 text-[11px] leading-snug text-[#8A6B4F]">
            Every family plays its own way — the Custom rules menu lets you tune entry, bumping,
            extra rolls, the board pattern and more.
          </p>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => {
              playSfx('star');
              onTutorial();
            }}
            className="h-11 rounded-2xl bg-[#43B57E] font-bold text-white hover:bg-[#2E8F63]"
          >
            <PlayCircle size={17} /> Try the interactive tutorial
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
