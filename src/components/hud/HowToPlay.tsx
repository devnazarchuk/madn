'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Bot,
  ChevronDown,
  Disc3,
  Dices,
  DoorOpen,
  Flag,
  Footprints,
  Hourglass,
  Layers,
  Map as MapIcon,
  PartyPopper,
  PlayCircle,
  Shield,
  SkipForward,
  Sparkles,
  Target,
  Trophy,
  Users,
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
 * The manual teaches the ACTUAL implemented mechanics (single source of
 * truth: the engine + rulesConfig) with animated diagrams instead of walls
 * of text.
 *
 *  · Two depths: the SHORT guide (the six core mechanics) and the FULL
 *    rules walkthrough (every rule the engine knows — special rules included).
 *  · The manual lists sections COLLAPSED by default; opening a section plays
 *    its animation — collapsed sections render nothing, so exactly the
 *    animations you want run, never all of them at once.
 *  · The interactive tutorial walks the same steps one at a time, in short
 *    or full length (Next/Back navigation, progress, exit anytime).
 */

const GOLD = MATERIAL.gold;
const CREAM = '#FBF3E0';

export type TutorialMode = 'short' | 'full';

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

/** A die face showing a golden star (Star Mode wild). */
function SceneStarDie({ x, y, still }: { x: number; y: number; still: boolean }) {
  return (
    <motion.g
      animate={still ? undefined : { scale: [1, 1.14, 1], rotate: [0, -8, 8, 0] }}
      transition={still ? undefined : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      style={{ transformOrigin: `${x}px ${y}px` }}
    >
      <g transform={`translate(${x} ${y})`}>
        <rect x={-16} y={-16} width={32} height={32} rx={8} fill={GOLD} stroke="rgba(36,27,20,0.3)" strokeWidth={2} />
        <path
          d="M0,-9 L2.6,-2.8 9.5,-2.8 3.9,1.8 5.9,8.7 0,4.4 -5.9,8.7 -3.9,1.8 -9.5,-2.8 -2.6,-2.8 Z"
          fill={CREAM}
          stroke="rgba(36,27,20,0.25)"
          strokeWidth={1.2}
        />
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
// Core scenes
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
// Special-rule scenes (full walkthrough)
// ---------------------------------------------------------------------------

function SceneStar({ still }: { still: boolean }) {
  return (
    <Scene label="A golden star is wild — it counts as any color you like">
      <SceneStarDie x={46} y={50} still={still} />
      <Field x={115} y={70} color={COLORS.blue} />
      <Field x={170} y={70} color={COLORS.yellow} />
      <Field x={225} y={70} color={COLORS.green} />
      <Field x={280} y={70} color={COLORS.red} />
      {!still && (
        <motion.circle
          cx={280}
          cy={70}
          r={23}
          fill="none"
          stroke={GOLD}
          strokeWidth={3}
          animate={{ opacity: [0, 0.9, 0], scale: [1, 1.2, 1.35] }}
          transition={{ duration: 2.4, times: [0, 0.5, 1], repeat: Infinity }}
        />
      )}
      <SceneLabel x={200} y={104}>pick ANY color — even white or black</SceneLabel>
      <Field x={225} y={150} color={COLORS.green} />
      <SceneLabel x={225} y={182}>the star walks you there</SceneLabel>
      <TravelingPawn
        still={still}
        color={COLORS.red}
        stillAt={1}
        points={[
          { x: 115, y: 54 },
          { x: 280, y: 54 },
          { x: 280, y: 134 },
          { x: 225, y: 134 },
        ]}
      />
    </Scene>
  );
}

function SceneEntryAny({ still }: { still: boolean }) {
  const cycle = [COLORS.blue, COLORS.yellow, COLORS.green, COLORS.red];
  return (
    <Scene label="With any-color entry every roll lets a pawn out of the base">
      <g transform="translate(46 50)">
        <rect x={-16} y={-16} width={32} height={32} rx={8} fill={CREAM} stroke="rgba(36,27,20,0.3)" strokeWidth={2} />
        {still ? (
          <circle cx={0} cy={0} r={8.5} fill={COLORS.blue} stroke="rgba(36,27,20,0.25)" strokeWidth={1.5} />
        ) : (
          <motion.circle
            cx={0}
            cy={0}
            r={8.5}
            stroke="rgba(36,27,20,0.25)"
            strokeWidth={1.5}
            animate={{ fill: [COLORS.blue, COLORS.yellow, COLORS.green, COLORS.red, COLORS.blue] }}
            transition={{ duration: 3.2, repeat: Infinity, times: [0, 0.25, 0.5, 0.75, 1], ease: 'easeInOut' }}
          />
        )}
      </g>
      <SceneLabel x={46} y={92}>ANY color works</SceneLabel>
      <rect x={110} y={92} width={104} height={78} rx={16} fill="rgba(91,58,36,0.14)" stroke="rgba(91,58,36,0.3)" strokeWidth={2} />
      <SceneLabel x={162} y={112}>your base</SceneLabel>
      <Pawn color={COLORS.red} x={162} y={144} scale={0.72} />
      <TravelingPawn
        still={still}
        color={COLORS.red}
        stillAt={1}
        points={[{ x: 184, y: 138 }, { x: 252, y: 130 }]}
      />
      <Field x={272} y={146} color={COLORS.red} />
      <SceneLabel x={272} y={180}>start field</SceneLabel>
    </Scene>
  );
}

function ScenePass({ still }: { still: boolean }) {
  return (
    <Scene label="Free passing hops over pawns; blocked paths must wait">
      {/* left — hop over */}
      <Field x={50} y={96} color={COLORS.blue} />
      <Field x={105} y={96} color={COLORS.yellow} />
      <Field x={160} y={96} color={COLORS.green} />
      <Pawn color={COLORS.blue} x={105} y={82} scale={0.8} />
      <SceneLabel x={105} y={142}>hop over freely</SceneLabel>
      <TravelingPawn
        still={still}
        color={COLORS.red}
        stillAt={1}
        points={[
          { x: 50, y: 82 },
          { x: 160, y: 82 },
        ]}
      />
      {/* right — blocked */}
      <Field x={215} y={96} color={COLORS.blue} />
      <Field x={270} y={96} color={COLORS.yellow} />
      <Field x={318} y={96} color={COLORS.green} r={13} />
      <Pawn color={COLORS.blue} x={270} y={82} scale={0.8} />
      <SceneLabel x={285} y={142}>blocked — wait</SceneLabel>
      {!still && (
        <motion.g
          animate={{ x: [0, -4, 4, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 1.1, ease: 'easeInOut' }}
        >
          <Pawn color={COLORS.red} x={215} y={82} scale={0.95} />
        </motion.g>
      )}
      {still && <Pawn color={COLORS.red} x={215} y={82} scale={0.95} />}
    </Scene>
  );
}

function SceneSafe({ still }: { still: boolean }) {
  return (
    <Scene label="A pawn on its own start field is safe — nobody may land there">
      {/* own start field with a protective ring */}
      <motion.g
        animate={still ? undefined : { opacity: [0.9, 0.4, 0.9], scale: [1, 1.08, 1] }}
        transition={still ? undefined : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '150px 96px' }}
      >
        <circle cx={150} cy={96} r={24} fill="none" stroke={COLORS.red} strokeWidth={3.5} strokeDasharray="5 4" />
      </motion.g>
      <Field x={150} y={96} color={COLORS.red} />
      <Pawn color={COLORS.red} x={150} y={82} />
      {/* shield badge */}
      <g transform="translate(150 44)">
        <circle r={14} fill={GOLD} stroke="#B6842B" strokeWidth={2} />
        <path d="M0,-7 L6,-4 V2 C6,6 3,8.5 0,10 C-3,8.5 -6,6 -6,2 V-4 Z" fill="#3E2A18" transform="scale(0.9)" />
      </g>
      {/* the rival has to stop next to it */}
      <Field x={235} y={96} color={COLORS.yellow} />
      <SceneLabel x={235} y={142}>rivals must stop here</SceneLabel>
      <TravelingPawn
        still={still}
        color={COLORS.blue}
        stillAt={1}
        points={[
          { x: 285, y: 82 },
          { x: 235, y: 82 },
        ]}
      />
      <SceneLabel x={150} y={182}>safe on your start field</SceneLabel>
    </Scene>
  );
}

function SceneTower({ still }: { still: boolean }) {
  return (
    <Scene label="A pawn tower stands together — one bump sends them all home">
      <Field x={150} y={110} color={COLORS.red} />
      <Pawn color={COLORS.red} x={144} y={98} scale={0.9} />
      <Pawn color={COLORS.red} x={158} y={104} scale={0.9} />
      <SceneLabel x={150} y={62}>pawn tower</SceneLabel>
      {/* the blue pawn lands on the tower */}
      <TravelingPawn
        still={still}
        color={COLORS.blue}
        stillAt={still ? 1 : 0}
        points={[{ x: 270, y: 94 }, { x: 150, y: 94 }]}
      />
      {/* both tower pawns fly home */}
      {still ? (
        <>
          <Pawn color={COLORS.red} x={92} y={164} scale={0.7} />
          <Pawn color={COLORS.red} x={116} y={168} scale={0.7} />
        </>
      ) : (
        <>
          <motion.g
            animate={{ x: [144, 92], y: [98, 164], opacity: [1, 1, 0.9, 0] }}
            transition={{ duration: 2.4, times: [0, 0.55, 0.8, 1], repeat: Infinity, repeatDelay: 0.8, ease: 'easeInOut' }}
          >
            <Pawn color={COLORS.red} x={0} y={0} scale={0.9} />
          </motion.g>
          <motion.g
            animate={{ x: [158, 116], y: [104, 168], opacity: [1, 1, 0.9, 0] }}
            transition={{ duration: 2.4, times: [0, 0.55, 0.8, 1], repeat: Infinity, repeatDelay: 0.8, ease: 'easeInOut', delay: 0.12 }}
          >
            <Pawn color={COLORS.red} x={0} y={0} scale={0.9} />
          </motion.g>
        </>
      )}
      <rect x={66} y={156} width={92} height={30} rx={10} fill="rgba(91,58,36,0.14)" stroke="rgba(91,58,36,0.3)" strokeWidth={2} />
      <SceneLabel x={112} y={176}>all go home!</SceneLabel>
    </Scene>
  );
}

function SceneExtra({ still }: { still: boolean }) {
  return (
    <Scene label="A bump or your own color earns an extra roll">
      <SceneDie x={60} y={60} color={COLORS.red} still={still} />
      {/* circling "again" arrow around the die */}
      {!still && (
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '60px 60px' }}
        >
          <path
            d="M 60 22 A 38 38 0 1 1 34 32"
            fill="none"
            stroke={GOLD}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <path d="M 30 24 L 38 36 L 44 24 Z" fill={GOLD} />
        </motion.g>
      )}
      <SceneLabel x={60} y={122}>roll again!</SceneLabel>
      <Field x={150} y={96} color={COLORS.blue} />
      <Field x={210} y={96} color={COLORS.red} />
      <Field x={270} y={96} color={COLORS.green} />
      <Pawn color={COLORS.blue} x={210} y={82} scale={0.8} />
      <SceneLabel x={210} y={142}>bump…</SceneLabel>
      <TravelingPawn
        still={still}
        color={COLORS.red}
        stillAt={1}
        points={[
          { x: 150, y: 82 },
          { x: 270, y: 82 },
        ]}
      />
      <SceneLabel x={225} y={182}>…or roll your own color</SceneLabel>
    </Scene>
  );
}

function SceneSkip({ still }: { still: boolean }) {
  return (
    <Scene label="With skipping on, you may pass on a move you do not like">
      {/* skip button mock */}
      <motion.g
        animate={still ? undefined : { scale: [1, 0.94, 1] }}
        transition={still ? undefined : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '85px 90px' }}
      >
        <rect x={45} y={72} width={80} height={36} rx={14} fill="#F2C14E" stroke="rgba(36,27,20,0.3)" strokeWidth={2} />
        <text x={85} y={95} textAnchor="middle" fontSize={13} fontWeight={800} fill="#3E2A18">
          Skip
        </text>
      </motion.g>
      <SceneLabel x={85} y={128}>pass on this one</SceneLabel>
      {/* the pawn stays put, gently idling */}
      <Field x={210} y={90} color={COLORS.yellow} />
      {still ? (
        <Pawn color={COLORS.red} x={210} y={76} />
      ) : (
        <motion.g animate={{ rotate: [0, -5, 5, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} style={{ transformOrigin: '210px 90px' }}>
          <Pawn color={COLORS.red} x={210} y={76} />
        </motion.g>
      )}
      <Field x={275} y={90} color={COLORS.green} />
      <SceneLabel x={262} y={140}>a better roll may come</SceneLabel>
      <SceneLabel x={210} y={182}>you wait on your field</SceneLabel>
    </Scene>
  );
}

function SceneCeramic({ still }: { still: boolean }) {
  const ladder = [
    { x: 120, w: 44, label: '50%' },
    { x: 120, w: 66, label: '75%' },
    { x: 120, w: 84, label: '99%' },
  ];
  return (
    <Scene label="Ceramic dice quietly favor you when you are stuck">
      <SceneDie x={60} y={90} color={COLORS.red} still={still} />
      {!still && (
        <motion.circle
          cx={60}
          cy={90}
          r={26}
          fill="none"
          stroke={GOLD}
          strokeWidth={2.5}
          animate={{ opacity: [0, 0.8, 0], scale: [1, 1.25, 1.4] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <SceneLabel x={60} y={140}>stuck? luck leans in</SceneLabel>
      {/* the exit-color luck ladder */}
      {ladder.map((bar, i) => (
        <g key={bar.label}>
          <rect
            x={150}
            y={64 + i * 30}
            width={84}
            height={16}
            rx={8}
            fill="rgba(91,58,36,0.12)"
          />
          {!still ? (
            <motion.rect
              x={150}
              y={64 + i * 30}
              height={16}
              rx={8}
              fill={GOLD}
              initial={false}
              animate={{ width: [0, bar.w, bar.w, 0] }}
              transition={{ duration: 3.6, times: [0, 0.22 + i * 0.16, 0.85, 1], repeat: Infinity, delay: i * 0.25, ease: 'easeOut' }}
            />
          ) : (
            <rect x={150} y={64 + i * 30} width={bar.w} height={16} rx={8} fill={GOLD} />
          )}
          <text x={244} y={76 + i * 30} fontSize={11} fontWeight={800} fill="#8A6B4F">
            {bar.label}
          </text>
        </g>
      ))}
      <SceneLabel x={205} y={40}>exit color while all pawns wait</SceneLabel>
      <SceneLabel x={205} y={182}>consecutive failed tries</SceneLabel>
    </Scene>
  );
}

function SceneMap({ still }: { still: boolean }) {
  const fields = [
    { x: 60, y: 80 },
    { x: 125, y: 80 },
    { x: 190, y: 80 },
    { x: 255, y: 80 },
    { x: 95, y: 140 },
    { x: 160, y: 140 },
    { x: 225, y: 140 },
    { x: 290, y: 140 },
  ];
  const palette = [COLORS.red, COLORS.blue, COLORS.green, COLORS.yellow, '#FFFFFF', '#37332D'];
  return (
    <Scene label="Full random map — every field gets a random color each match">
      {fields.map((f, i) =>
        still ? (
          <Field key={i} x={f.x} y={f.y} color={palette[i % palette.length]!} />
        ) : (
          <motion.circle
            key={i}
            cx={f.x}
            cy={f.y}
            r={17}
            stroke="rgba(36,27,20,0.25)"
            strokeWidth={2}
            animate={{
              fill: [
                palette[(i + 1) % palette.length]!,
                palette[(i + 3) % palette.length]!,
                palette[(i + 5) % palette.length]!,
                palette[(i + 1) % palette.length]!,
              ],
            }}
            transition={{ duration: 4.2, repeat: Infinity, delay: i * 0.22, ease: 'easeInOut', times: [0, 0.33, 0.66, 1] }}
          />
        ),
      )}
      <SceneLabel x={170} y={40}>the whole board is repainted — even home!</SceneLabel>
      <SceneLabel x={170} y={182}>only the start fields keep their color</SceneLabel>
    </Scene>
  );
}

// ---------------------------------------------------------------------------
// Section definitions (single source of truth for manual AND tutorial)
// ---------------------------------------------------------------------------

interface ManualSection {
  id: string;
  title: string;
  /** One-line teaser, always visible. */
  lead: string;
  icon: typeof Dices;
  Scene?: (props: { still: boolean }) => React.ReactElement;
  bullets: string[];
}

const SHORT_SECTIONS: ManualSection[] = [
  {
    id: 'goal',
    title: 'The goal',
    lead: 'Race your pawns into your own home stretch — first to bring every pawn home wins!',
    icon: Target,
    Scene: SceneRace,
    bullets: [
      'Every player races their pawns around the cross-shaped track.',
      'The own home stretch is fed from the arm tip opposite your color row.',
    ],
  },
  {
    id: 'roll',
    title: 'Roll & move',
    lead: 'Roll a color, then move ONE pawn to the NEXT field of that color. No counting — just matching.',
    icon: Dices,
    Scene: SceneRoll,
    bullets: [
      'Roll a color → move ONE pawn to the next field of that color.',
      'White & black faces are long platform strides (Star Mode turns them into wild stars).',
    ],
  },
  {
    id: 'base',
    title: 'Leave the base',
    lead: 'Roll your own color to bring a pawn out onto your start field.',
    icon: PlayCircle,
    Scene: SceneBase,
    bullets: [
      'Roll your OWN color to bring a pawn onto your start field.',
      'While all pawns still wait in the base, any color may let the first one out.',
    ],
  },
  {
    id: 'bump',
    title: 'Bumping rivals',
    lead: 'Land exactly on a rival pawn and it goes all the way back to its base.',
    icon: Bot,
    Scene: SceneBump,
    bullets: [
      'Land exactly on an opponent to send it back to its base.',
      'Pawns on their own start field are safe when "Safe start fields" is on.',
    ],
  },
  {
    id: 'arrow',
    title: 'The golden arrow',
    lead: 'The arrow at the arm tip is a mandatory stop — then your own color walks you home.',
    icon: Footprints,
    Scene: SceneArrow,
    bullets: [
      'The golden arrow is a MANDATORY stop — you can never hop over it.',
      'Roll the arrow cell\'s color to land on it, then your own color to step inside the row.',
    ],
  },
  {
    id: 'win',
    title: 'Winning',
    lead: 'Fill your home stretch — one pawn per cell — and the game ends immediately. Hooray!',
    icon: Trophy,
    Scene: SceneWin,
    bullets: [
      'One pawn per finish cell — the first stands on the golden cell forever.',
      'Bring ALL pawns home to win; the game ends immediately.',
    ],
  },
];

/** Full walkthrough — the six core sections plus EVERY special rule. */
const FULL_SECTIONS: ManualSection[] = [
  SHORT_SECTIONS[0]!,
  SHORT_SECTIONS[1]!,
  {
    id: 'star',
    title: 'Star Mode (wild die)',
    lead: 'In Star Mode the golden star is wild — it counts as ANY color you like.',
    icon: Sparkles,
    Scene: SceneStar,
    bullets: [
      'OFF (standard): the die carries a WHITE and a BLACK face — roll them to hop to the next white or black platform on the track.',
      'ON (Star Mode): those two faces become golden STARS — a star counts as ANY color, even white or black.',
      'A star also brings a pawn out of the base — pick your own color for it.',
    ],
  },
  SHORT_SECTIONS[2]!,
  {
    id: 'entryAny',
    title: 'Any-color entry',
    lead: 'The any-color variant lets EVERY roll bring a pawn out of the base.',
    icon: DoorOpen,
    Scene: SceneEntryAny,
    bullets: [
      'Classic rule: only YOUR color starts a pawn — the game waits for it.',
      'Any-color entry: every roll lets a pawn step out — games start much faster.',
      'First-pawn help: while ALL your pawns wait in the base, any color lets the first one out.',
      'The Quick Game preset plays with any-color entry; switch it in Custom Rules.',
    ],
  },
  {
    id: 'pass',
    title: 'Passing other pawns',
    lead: 'Classic blocks jumping — the friendly variant lets you hop right over others.',
    icon: Footprints,
    Scene: ScenePass,
    bullets: [
      'Blocked paths (Classic): nobody may be jumped over — wait until the way is clear.',
      'Free passing (Family Mode): you may jump over pawns — only the landing field matters.',
      'Inside a home stretch nobody is EVER passed — every finish slot holds one pawn.',
    ],
  },
  SHORT_SECTIONS[3]!,
  {
    id: 'safe',
    title: 'Safe start fields',
    lead: 'With safe starts, a pawn standing on its own start field cannot be bumped.',
    icon: Shield,
    Scene: SceneSafe,
    bullets: [
      'A pawn on its OWN start field is protected — nobody may land there.',
      'The protection needs Bumping to be switched on.',
      'Family Mode plays with safe starts; enable it in Custom Rules.',
    ],
  },
  {
    id: 'towers',
    title: 'Pawn towers',
    lead: 'Pawn towers: your own pawns may share a field — but a bump takes them ALL home.',
    icon: Layers,
    Scene: SceneTower,
    bullets: [
      'Your own pawns may stand together on one TRACK field.',
      'An opponent who lands on your tower bumps ALL of them home!',
      'Inside the home stretch the limit stays strict: one pawn per finish cell.',
    ],
  },
  {
    id: 'extraRolls',
    title: 'Extra rolls',
    lead: 'Extra rolls reward bumps and own-color rolls with another turn.',
    icon: Hourglass,
    Scene: SceneExtra,
    bullets: [
      'Extra roll after a bump: bump an opponent and you immediately roll again.',
      'Extra roll on your color: rolling your own color earns another roll right away.',
      'Both are OFF in Classic — turn them on in Custom Rules for livelier races.',
    ],
  },
  {
    id: 'skip',
    title: 'Skipping moves',
    lead: 'With skipping on, you may pass on a move you do not like.',
    icon: SkipForward,
    Scene: SceneSkip,
    bullets: [
      'A Skip button lets you pass on a legal move you do not like.',
      'OFF (Classic): if you can move, you must move.',
      'Family Mode enables skipping for gentler matches.',
    ],
  },
  SHORT_SECTIONS[4]!,
  {
    id: 'finishRule',
    title: 'Reaching the golden goal',
    lead: 'Choose whether the golden goal must be hit exactly — or any roll that reaches it counts.',
    icon: Flag,
    bullets: [
      'Exact landing (Classic): a roll that would carry a pawn PAST the golden cell cannot move it.',
      'Carry past is fine (Family Mode): any roll that reaches or passes the golden cell completes the pawn.',
      'The golden arrow gateway before the row is ALWAYS a mandatory stop.',
    ],
  },
  {
    id: 'ceramic',
    title: 'Ceramic dice (smart luck)',
    lead: 'Ceramic dice quietly tip luck in your favor when you are stuck — fair play stays fair.',
    icon: Disc3,
    Scene: SceneCeramic,
    bullets: [
      'OFF in fair play — normal rolls are perfectly honest.',
      'Fully blocked? The die gently favors colors that let a pawn move.',
      'All pawns in the base? The exit color climbs 50% → 75% → 99% on consecutive failed tries.',
      'A match-winning roll gets a random 15–25% boost. Miss the 99% chance and the dice will tease you!',
    ],
  },
  {
    id: 'map',
    title: 'Board color pattern',
    lead: 'Pick the official color weave — or repaint the whole board randomly every match.',
    icon: MapIcon,
    Scene: SceneMap,
    bullets: [
      'Classic: the documented official weave; every home row is painted in the owner\'s color.',
      'Full random map: EVERY field — including all three home-stretch cells — gets a random color each match.',
      'Even walking home demands the matching rolls! Start fields keep their owner\'s color.',
    ],
  },
  {
    id: 'pawns',
    title: 'Pawns per player',
    lead: 'Race three pawns — or just two for a quicker match.',
    icon: Users,
    bullets: [
      'Three pawns: the documented edition amount.',
      'Two pawns: shorter races for quick games.',
    ],
  },
  SHORT_SECTIONS[5]!,
];

// ---------------------------------------------------------------------------
// Interactive tutorial overlay (short & full)
// ---------------------------------------------------------------------------

export function TutorialOverlay({
  open,
  onClose,
  mode = 'short',
}: {
  open: boolean;
  onClose: () => void;
  mode?: TutorialMode;
}) {
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const [step, setStep] = useState(0);
  const steps = mode === 'full' ? FULL_SECTIONS : SHORT_SECTIONS;

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
      if (e.key === 'ArrowRight') setStep((s) => Math.min(steps.length - 1, s + 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, steps.length]);

  if (!open) return null;
  const current = steps[step]!;
  const SceneComp = current.Scene;
  const last = step === steps.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Interactive tutorial"
      className="pointer-events-auto fixed inset-0 z-[70] flex flex-col bg-[#241B14]/92 backdrop-blur-sm"
    >
      {/* header — progress & exit */}
      <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-[#D9C3A0]">
          Step {step + 1} of {steps.length}
        </p>
        {/* compact progress bar (17-dot row would crowd small phones) */}
        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/15" aria-hidden>
          <div
            className="h-full rounded-full bg-[#D9A441] transition-all duration-300"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>
        <Button
          size="icon"
          variant="secondary"
          aria-label="Exit tutorial"
          onClick={() => {
            playSfx('uiClick');
            onClose();
          }}
          className="size-9 shrink-0 rounded-xl bg-white/10 text-[#F6EBD9] hover:bg-white/20"
        >
          <X size={17} />
        </Button>
      </div>

      {/* stage */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-3 py-2 sm:px-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${mode}-${current.id}`}
            initial={reducedMotion ? false : { opacity: 0, x: 34, scale: 0.97 }}
            animate={reducedMotion ? undefined : { opacity: 1, x: 0, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, x: -34, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-lg rounded-3xl border border-[#5B3A24]/25 bg-[#FBF3E0] p-3 shadow-2xl shadow-black/50 sm:p-4"
          >
            {SceneComp ? (
              <SceneComp still={reducedMotion} />
            ) : (
              <div className="flex items-center justify-center rounded-2xl bg-[#F8EED8] py-8 text-[#B6842B]">
                <current.icon size={44} strokeWidth={1.6} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* caption + controls */}
      <div className="px-3 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:pb-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={`cap-${mode}-${current.id}`}
            initial={reducedMotion ? false : { opacity: 0, y: 14 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: 0.24 }}
            className="mx-auto w-full max-w-lg"
          >
            <div className="scrollbar-cute max-h-[30dvh] overflow-y-auto rounded-3xl border border-white/10 bg-[#2E241A]/95 p-4 text-[#F6EBD9] shadow-xl">
              <p className="mb-1 flex items-center gap-2 text-base font-extrabold">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-[#D9A441] text-[#3E2A18]">
                  <current.icon size={15} />
                </span>
                {current.title}
              </p>
              <p className="text-sm leading-relaxed text-[#E4D2B4]">{current.lead}</p>
              <ul className="mt-2 space-y-1">
                {current.bullets.map((b) => (
                  <li key={b} className="flex gap-1.5 text-xs leading-snug text-[#D9C3A0]">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#D9A441]" aria-hidden />
                    {b}
                  </li>
                ))}
              </ul>
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
                Back
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
            The short tour shows the most important rules with animations — about a minute. The
            manual also holds the full walkthrough with every special rule.
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
// Visual manual dialog — short & full walkthrough, collapsible sections
// ---------------------------------------------------------------------------

export function HowToPlayDialog({
  open,
  onClose,
  onTutorial,
}: {
  open: boolean;
  onClose: () => void;
  onTutorial: (mode: TutorialMode) => void;
}) {
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const [tab, setTab] = useState<TutorialMode>('short');
  /** Single-open accordion — collapsed by default so only the wanted
   *  animation ever runs. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenId(null);
  }

  const sections = tab === 'full' ? FULL_SECTIONS : SHORT_SECTIONS;

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
            Little animated examples — tap a section to open it. The full walkthrough covers every
            special rule; the deeper reference lives in the game&apos;s book button.
          </DialogDescription>
        </DialogHeader>

        {/* short / full segmented control */}
        <div
          role="tablist"
          aria-label="Manual depth"
          className="grid w-full grid-cols-2 gap-1 rounded-2xl bg-[#E8D6B4] p-1"
        >
          {(
            [
              { id: 'short', label: 'Short guide' },
              { id: 'full', label: 'Full rules' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                playSfx('uiClick');
                setTab(t.id);
                setOpenId(null);
              }}
              className={`h-10 min-w-0 rounded-xl text-sm font-bold transition ${
                tab === t.id
                  ? 'bg-white text-[#3E2A18] shadow'
                  : 'text-[#6B4E35] hover:bg-white/40'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* collapsible sections — nothing renders for closed sections, so
            collapsed sections never animate (and never cost performance) */}
        <div className="space-y-2">
          {sections.map((section, i) => {
            const isOpen = openId === section.id;
            const SceneComp = section.Scene;
            return (
              <div
                key={section.id}
                className="overflow-hidden rounded-2xl border border-[#5B3A24]/15 bg-white/60"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => {
                    playSfx('uiClick');
                    setOpenId(isOpen ? null : section.id);
                  }}
                  className="flex w-full items-center gap-2 border-b border-[#5B3A24]/10 bg-[#F8EED8]/70 px-3 py-2.5 text-left transition hover:bg-[#F8EED8]"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#5B3A24] text-[#F6EBD9]">
                    <section.icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1 text-sm font-bold text-[#3E2A18]">
                      <span className="text-[#B08A5E]">{i + 1}.</span> {section.title}
                    </span>
                    {!isOpen && (
                      <span className="mt-0.5 block truncate text-[11px] leading-snug text-[#8A6B4F]">
                        {section.lead}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-[#8A6B4F] transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <motion.div
                    initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                    animate={reducedMotion ? undefined : { height: 'auto', opacity: 1 }}
                    exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="grid gap-2 p-3 sm:grid-cols-[1.1fr_1fr] sm:items-center sm:gap-3"
                  >
                    {SceneComp && (
                      <div className="rounded-xl bg-[#F8EED8]/80 p-1.5">
                        <SceneComp still={reducedMotion} />
                      </div>
                    )}
                    <ul className="space-y-1.5">
                      {section.bullets.map((b) => (
                        <li key={b} className="flex gap-1.5 text-xs leading-snug text-[#6B4E35]">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#D9A441]" aria-hidden />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>

        <p className="px-1 text-[11px] leading-snug text-[#8A6B4F]">
          Every family plays its own way — the Custom rules menu lets you tune entry, bumping,
          extra rolls, the board pattern and more.
        </p>

        <div className="flex justify-end">
          <Button
            onClick={() => {
              playSfx('star');
              onTutorial(tab);
            }}
            className="h-11 rounded-2xl bg-[#43B57E] font-bold text-white hover:bg-[#2E8F63]"
          >
            <PlayCircle size={17} />
            {tab === 'full' ? 'Try the full tutorial' : 'Try the interactive tutorial'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
