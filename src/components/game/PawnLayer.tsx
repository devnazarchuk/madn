'use client';

import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { LOOP, START_INDEX } from '@/engine/board';
import { RULES, TIMING } from '@/config/gameConfig';
import { COLORS, MATERIAL } from '@/config/theme';
import { useGameStore, type MoveAnim } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { playSfx } from '@/services/audio';
import type { PlayerColorId, Position } from '@/engine/types';
import { cellTopY, worldOf } from './geometry';

/**
 * All pawns + the animation "director".
 *  - Pawns read the logical state; while a MoveAnim is active the mover hops
 *    field-by-field and a captured victim flies back to its base.
 *  - The director calls confirmMoveAnimation() once the whole sequence is
 *    visually finished (the store also holds an independent failsafe).
 */

interface PawnSpec {
  id: string;
  color: PlayerColorId;
  pos: Position;
}

/** Stable empty fallback (never return a fresh array from a zustand selector). */
const EMPTY_PAWNS: PawnSpec[] = [];

type GameStoreSnapshot = ReturnType<typeof useGameStore.getState>;

function isMovablePawn(st: GameStoreSnapshot, pawnId: string): boolean {
  const g = st.game;
  if (!g || st.screen !== 'game' || st.paused || st.introPlaying) return false;
  if (g.phase !== 'choose-pawn' || st.moveAnim || st.diceRolling) return false;
  const p = g.players[g.activeIndex];
  return !!p && p.kind === 'human' && st.legalMoves.some((m) => m.pawnId === pawnId);
}

// ---------------------------------------------------------------------------
// Move choreography (pure helpers)
// ---------------------------------------------------------------------------

interface Hop {
  from: THREE.Vector3;
  to: THREE.Vector3;
}

function trackCellWorld(color: PlayerColorId, loopIdx: number): THREE.Vector3 {
  const cell = LOOP[loopIdx]!;
  const { x, z } = { x: (cell.col - 5) * 1.18, z: (cell.row - 5) * 1.18 };
  return new THREE.Vector3(x, cellTopY('track'), z);
}

function moverHops(anim: MoveAnim): Hop[] {
  if (anim.kind === 'move') {
    const start = START_INDEX[anim.color];
    const norm = (i: number) => (i - start + RULES.trackFields) % RULES.trackFields;
    const fromIdx = anim.from.area === 'track' ? norm(anim.from.index) : -1;
    const toIdx = anim.to.area === 'track' ? norm(anim.to.index) : RULES.trackFields;
    const pts: THREE.Vector3[] = [worldOf(anim.color, anim.from)];
    for (let p = fromIdx + 1; p <= toIdx; p++) {
      pts.push(trackCellWorld(anim.color, (start + p) % RULES.trackFields));
    }
    pts.push(worldOf(anim.color, anim.to));
    const hops: Hop[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      if (a.distanceTo(b) > 0.001) hops.push({ from: a, to: b });
    }
    return hops.length > 0 ? hops : [{ from: pts[0]!, to: pts[pts.length - 1]! }];
  }
  return [
    { from: worldOf(anim.color, anim.from), to: worldOf(anim.color, anim.to) },
  ];
}

function hopDurationMs(anim: MoveAnim, reduced: boolean): number {
  const base = anim.kind === 'move' ? TIMING.hopPerFieldMs : TIMING.hopImportantMs;
  return reduced ? base * 0.45 : base;
}

function hopHeight(anim: MoveAnim, reduced: boolean): number {
  const base = anim.kind === 'entry' ? 1.15 : anim.kind === 'finish' ? 1.35 : 0.55;
  return reduced ? base * 0.2 : base;
}

/** Total visual duration of the whole move (mover + victim return). */
function moveTotalMs(anim: MoveAnim, reduced: boolean): number {
  const hops = moverHops(anim);
  const ms = hopDurationMs(anim, reduced);
  const moverTotal = hops.length * ms;
  const settle = anim.kind === 'finish' ? TIMING.finishBurstMs * (reduced ? 0.3 : 0.45) : 90;
  if (anim.capture) {
    return moverTotal + TIMING.captureImpactMs + TIMING.captureReturnMs * (reduced ? 0.5 : 1) + 60;
  }
  return moverTotal + settle;
}

function moverPosAt(anim: MoveAnim, hops: Hop[], t: number, reduced: boolean): THREE.Vector3 {
  const ms = hopDurationMs(anim, reduced);
  const h = hopHeight(anim, reduced);
  const k = Math.max(0, Math.min(hops.length - 1, Math.floor(t / ms)));
  const hop = hops[k]!;
  const u = Math.max(0, Math.min(1, (t - k * ms) / ms));
  const pos = hop.from.clone().lerp(hop.to, u);
  pos.y += h * Math.sin(u * Math.PI);
  return pos;
}

function victimPosAt(anim: MoveAnim, moverTotal: number, t: number): THREE.Vector3 | null {
  const cap = anim.capture;
  if (!cap) return null;
  const start = moverTotal + TIMING.captureImpactMs;
  if (t < start) return worldOf(cap.color, cap.from);
  const u = Math.max(0, Math.min(1, (t - start) / TIMING.captureReturnMs));
  const from = worldOf(cap.color, cap.from);
  const to = worldOf(cap.color, cap.to);
  const pos = from.clone().lerp(to, u);
  pos.y += 1.75 * Math.sin(u * Math.PI);
  return pos;
}

// ---------------------------------------------------------------------------
// Pawn component
// ---------------------------------------------------------------------------

function Pawn({ pawn }: { pawn: PawnSpec }) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshStandardMaterial>(null);
  const phaseOffset = useMemo(() => Math.random() * Math.PI * 2, []);

  // Shared meeple material, created once (a pawn's color never changes).
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null);
  if (matRef.current === null) {
    matRef.current = new THREE.MeshStandardMaterial({
      color: COLORS[pawn.color],
      roughness: 0.36,
      metalness: 0.05,
      emissive: new THREE.Color(COLORS[pawn.color]),
      emissiveIntensity: 0,
    });
  }
  const mat = matRef.current;
  useEffect(
    () => () => {
      matRef.current?.dispose();
    },
    [],
  );

  const onPawnClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const st = useGameStore.getState();
    if (isMovablePawn(st, pawn.id)) {
      playSfx('pawnSelect');
      st.choosePawn(pawn.id);
    }
  };
  const onPawnOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const st = useGameStore.getState();
    if (isMovablePawn(st, pawn.id)) document.body.style.cursor = 'pointer';
  };
  const onPawnOut = () => {
    document.body.style.cursor = 'auto';
  };

  useFrame(() => {
    const g = group.current;
    if (!g || !matRef.current) return;
    const st = useGameStore.getState();
    const reduced = useSettingsStore.getState().reducedMotion;
    const now = Date.now();
    const anim = st.moveAnim;
    let movable = false;

    if (anim && st.screen === 'game') {
      const isMover = anim.pawnId === pawn.id;
      const isVictim = anim.capture?.pawnId === pawn.id;
      if (isMover || isVictim) {
        const hops = moverHops(anim);
        const ms = hopDurationMs(anim, reduced);
        const moverTotal = hops.length * ms;
        const t = now - anim.startedAt;
        if (isMover) {
          g.position.copy(moverPosAt(anim, hops, t, reduced));
        } else {
          const vp = victimPosAt(anim, moverTotal, t);
          if (vp) g.position.copy(vp);
          if (anim.capture) g.rotation.y = t * 0.012;
        }
        matRef.current.emissiveIntensity = 0.22;
        if (ring.current) ring.current.visible = false;
        return;
      }
    }

    // Static / selectable position.
    const base = worldOf(pawn.color, pawn.pos);
    movable = isMovablePawn(st, pawn.id);
    if (movable && !reduced) {
      base.y += 0.1 + 0.055 * Math.sin(now * 0.0045 + phaseOffset);
      matRef.current.emissiveIntensity = 0.4 + 0.3 * Math.sin(now * 0.006 + phaseOffset);
    } else {
      matRef.current.emissiveIntensity = 0;
      g.rotation.y = 0;
    }
    g.position.copy(base);
    if (ring.current) {
      ring.current.visible = movable;
      if (movable) {
        ring.current.scale.setScalar(1 + 0.12 * Math.sin(now * 0.005 + phaseOffset));
        if (ringMat.current) ringMat.current.emissiveIntensity = 0.8 + 0.4 * Math.sin(now * 0.005);
      }
    }
  });

  return (
    <group ref={group}>
      {/* selection ring */}
      <mesh ref={ring} position={[0, 0.035, 0]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
        <torusGeometry args={[0.46, 0.055, 10, 40]} />
        <meshStandardMaterial
          ref={ringMat}
          color={MATERIAL.gold}
          emissive={MATERIAL.gold}
          emissiveIntensity={1}
          roughness={0.3}
          metalness={0.5}
        />
      </mesh>

      {/* meeple: base puck + cone body + sphere head */}
      <mesh castShadow position={[0, 0.045, 0]} material={mat} onClick={onPawnClick} onPointerOver={onPawnOver} onPointerOut={onPawnOut}>
        <cylinderGeometry args={[0.33, 0.35, 0.09, 24]} />
      </mesh>
      <mesh castShadow position={[0, 0.33, 0]} material={mat} onClick={onPawnClick} onPointerOver={onPawnOver} onPointerOut={onPawnOut}>
        <coneGeometry args={[0.25, 0.52, 24]} />
      </mesh>
      <mesh castShadow position={[0, 0.63, 0]} material={mat} onClick={onPawnClick} onPointerOver={onPawnOver} onPointerOut={onPawnOut}>
        <sphereGeometry args={[0.165, 24, 18]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Target rings — glowing markers on every legal destination
// ---------------------------------------------------------------------------

function TargetRings() {
  const legalMoves = useGameStore((s) => s.legalMoves);
  const showHints = useSettingsStore((s) => s.showMoveHints);
  const phase = useGameStore((s) => s.game?.phase ?? null);
  const activeKind = useGameStore((s) => s.game?.players[s.game.activeIndex ?? 0]?.kind ?? null);

  const visible = phase === 'choose-pawn' && activeKind === 'human' && showHints;

  const onRingClick = (e: ThreeEvent<MouseEvent>, pawnId: string) => {
    e.stopPropagation();
    const st = useGameStore.getState();
    if (isMovablePawn(st, pawnId)) {
      playSfx('pawnSelect');
      st.choosePawn(pawnId);
    }
  };

  if (!visible) return null;
  return (
    <>
      {legalMoves.map((m) => {
        const color = m.pawnId.split('-')[0] as PlayerColorId;
        const target = worldOf(color, m.to);
        return (
          <mesh
            key={m.pawnId}
            position={[target.x, cellTopY(m.to.area) + 0.03, target.z]}
            rotation={[Math.PI / 2, 0, 0]}
            onClick={(e) => onRingClick(e, m.pawnId)}
          >
            <torusGeometry args={[0.36, 0.08, 10, 36]} />
            <meshStandardMaterial
              color={MATERIAL.gold}
              emissive={MATERIAL.gold}
              emissiveIntensity={0.9}
              transparent
              opacity={0.92}
              roughness={0.3}
            />
          </mesh>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Director — confirms the move animation once it is visually complete
// ---------------------------------------------------------------------------

function MoveDirector() {
  const plan = useRef<{ token: number; total: number } | null>(null);
  useFrame(() => {
    const st = useGameStore.getState();
    const anim = st.moveAnim;
    if (!anim) {
      plan.current = null;
      return;
    }
    if (plan.current?.token !== anim.token) {
      const reduced = useSettingsStore.getState().reducedMotion;
      plan.current = { token: anim.token, total: moveTotalMs(anim, reduced) };
    }
    if (Date.now() - anim.startedAt >= plan.current.total) {
      st.confirmMoveAnimation(anim.token);
    }
  });
  return null;
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export function PawnLayer() {
  const game = useGameStore((s) => s.game);
  const pawns = useMemo<PawnSpec[]>(
    () =>
      game
        ? game.players.flatMap((p) =>
            p.pawns.map((pw) => ({ id: pw.id, color: pw.color, pos: pw.pos as Position })),
          )
        : EMPTY_PAWNS,
    [game],
  );
  return (
    <>
      {pawns.map((pw) => (
        <Pawn key={pw.id} pawn={pw} />
      ))}
      <TargetRings />
      <MoveDirector />
    </>
  );
}
