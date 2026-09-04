'use client';

import * as THREE from 'three';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { LOOP, START_INDEX } from '@/engine/board';
import { RULES, TIMING } from '@/config/gameConfig';
import { COLORS, MATERIAL } from '@/config/theme';
import { stackIndex } from '@/engine/rules';
import { useGameStore, type MoveAnim } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { PlayerColorId, Position } from '@/engine/types';
import { cellTopY, worldOf } from './geometry';
import { IDLE_STYLE, PawnCharacter } from './PawnCharacter';

/**
 * All pawns + the animation "director".
 *  - Pawns read the logical state; while a MoveAnim is active the mover hops
 *    field-by-field along the ENGINE path and captured victims fly back home.
 *  - The director calls confirmMoveAnimation() once the whole sequence is
 *    visually finished (the store also holds an independent failsafe).
 *  - Illegal taps trigger a shake on the specific pawn (shakePawnId/token).
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

/** Offsets for pawns sharing one field ("pawn towers"). */
function stackOffset(idx: number): [number, number] {
  if (idx === 0) return [0, 0];
  if (idx === 1) return [0.2, 0.15];
  return [-0.2, 0.15];
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
  // Walking deeper inside the home row: a single gentle hop.
  if (anim.from.area === 'home') {
    return [{ from: worldOf(anim.color, anim.from), to: worldOf(anim.color, anim.to) }];
  }
  if (anim.kind === 'move') {
    const start = START_INDEX[anim.color];
    const norm = (i: number) => (i - start + RULES.trackFields) % RULES.trackFields;
    const fromIdx = anim.from.area === 'track' ? norm(anim.from.index) : -1;
    // Entering home walks the remaining TRACK fields (up to the last one),
    // then hops into the mouth slot — never past the start field again.
    const toIdx =
      anim.to.area === 'track' ? norm(anim.to.index) : RULES.trackFields - 1;
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
  return [{ from: worldOf(anim.color, anim.from), to: worldOf(anim.color, anim.to) }];
}

function hopDurationMs(anim: MoveAnim, reduced: boolean): number {
  const base = anim.kind === 'move' ? TIMING.hopPerFieldMs : TIMING.hopImportantMs;
  return reduced ? base * 0.45 : base;
}

function hopHeight(anim: MoveAnim, reduced: boolean): number {
  const base = anim.kind === 'entry' ? 1.15 : anim.kind === 'finish' ? 1.35 : 0.55;
  return reduced ? base * 0.2 : base;
}

/** Total visual duration of the whole move (mover + all victims). */
function moveTotalMs(anim: MoveAnim, reduced: boolean): number {
  const hops = moverHops(anim);
  const ms = hopDurationMs(anim, reduced);
  const moverTotal = hops.length * ms;
  const settle = anim.kind === 'finish' ? TIMING.finishBurstMs * (reduced ? 0.3 : 0.45) : 90;
  if (anim.victims.length > 0) {
    const stagger = (anim.victims.length - 1) * 110;
    return (
      moverTotal + TIMING.captureImpactMs + stagger + TIMING.captureReturnMs * (reduced ? 0.5 : 1) + 60
    );
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

function victimPosAt(
  anim: MoveAnim,
  moverTotal: number,
  t: number,
  victimIdx: number,
): THREE.Vector3 | null {
  const cap = anim.victims[victimIdx];
  if (!cap) return null;
  const start = moverTotal + TIMING.captureImpactMs + victimIdx * 110;
  if (t < start) return worldOf(cap.color, cap.from);
  const u = Math.max(0, Math.min(1, (t - start) / TIMING.captureReturnMs));
  const from = worldOf(cap.color, cap.from);
  const to = worldOf(cap.color, cap.to);
  const pos = from.clone().lerp(to, u);
  pos.y += 1.75 * Math.sin(u * Math.PI);
  return pos;
}

/** Shortest-path yaw interpolation. */
function lerpYaw(current: number, target: number, rate: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * rate;
}

// ---------------------------------------------------------------------------
// Pawn component
// ---------------------------------------------------------------------------

function Pawn({ pawn }: { pawn: PawnSpec }) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshStandardMaterial>(null);
  const yaw = useRef<number | null>(null);
  const shake = useRef({ token: 0, start: 0 });
  const [hovered, setHovered] = useState(false);
  const phaseOffset = useMemo(() => Math.random() * Math.PI * 2, []);

  // Per-pawn body material (a pawn's color never changes).
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

  // Face targets by area.
  const restingYaw = (pos: THREE.Vector3, area: Position['area']): number => {
    if (area === 'track') {
      // face the next loop field (travel direction)
      const next = LOOP[(pawn.pos.area === 'track' ? (pawn.pos.index + 1) % RULES.trackFields : 0)]!;
      const nx = (next.col - 5) * 1.18 - pos.x;
      const nz = (next.row - 5) * 1.18 - pos.z;
      if (nx * nx + nz * nz < 0.0004) return Math.atan2(pos.x, pos.z);
      return Math.atan2(nx, nz);
    }
    if (area === 'home') return Math.atan2(-pos.x, -pos.z); // face the center
    return Math.atan2(pos.x, pos.z); // base: face outward
  };

  const onPawnClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    useGameStore.getState().tapPawn(pawn.id);
  };
  const onPawnOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    if (isMovablePawn(useGameStore.getState(), pawn.id)) document.body.style.cursor = 'pointer';
  };
  const onPawnOut = () => {
    setHovered(false);
    document.body.style.cursor = 'auto';
  };

  useFrame((state) => {
    const g = group.current;
    if (!g || !matRef.current) return;
    const st = useGameStore.getState();
    const reduced = useSettingsStore.getState().reducedMotion;
    const now = Date.now();
    const t = state.clock.elapsedTime;
    const anim = st.moveAnim;

    // Shake feedback for illegal taps.
    if (st.shakePawnId === pawn.id && shake.current.token !== st.shakeToken) {
      shake.current = { token: st.shakeToken, start: now };
    }
    const shakeAge = now - shake.current.start;
    const shaking = shakeAge >= 0 && shakeAge < 420 && shake.current.token > 0;

    if (anim && st.screen === 'game') {
      const isMover = anim.pawnId === pawn.id;
      const victimIdx = anim.victims.findIndex((v) => v.pawnId === pawn.id);
      if (isMover || victimIdx >= 0) {
        const hops = moverHops(anim);
        const ms = hopDurationMs(anim, reduced);
        const moverTotal = hops.length * ms;
        const elapsed = now - anim.startedAt;
        if (isMover) {
          g.position.copy(moverPosAt(anim, hops, elapsed, reduced));
          // face the hop direction
          const k = Math.max(0, Math.min(hops.length - 1, Math.floor(elapsed / ms)));
          const hop = hops[k]!;
          const dx = hop.to.x - hop.from.x;
          const dz = hop.to.z - hop.from.z;
          if (dx * dx + dz * dz > 0.0001) {
            yaw.current = lerpYaw(yaw.current ?? 0, Math.atan2(dx, dz), 0.35);
            g.rotation.y = yaw.current;
          }
          g.rotation.z = 0;
          g.scale.setScalar(1);
        } else {
          const vp = victimPosAt(anim, moverTotal, elapsed, victimIdx);
          if (vp) g.position.copy(vp);
          yaw.current = (yaw.current ?? 0) + 0.14;
          g.rotation.y = yaw.current;
        }
        matRef.current.emissiveIntensity = 0.22;
        if (ring.current) ring.current.visible = false;
        return;
      }
    }

    // Static / selectable position.
    const base = worldOf(pawn.color, pawn.pos);
    const movable = isMovablePawn(st, pawn.id);
    const isHome = pawn.pos.area === 'home';
    const isWinnerRow = isHome && !!st.winner;

    // Stack offset when own pawns share this track field.
    if (pawn.pos.area === 'track' && st.game) {
      const si = stackIndex(st.game, pawn);
      if (si > 0) {
        const [ox, oz] = stackOffset(si);
        base.x += ox;
        base.z += oz;
      }
    }

    const style = IDLE_STYLE[pawn.color];
    let scale = 1;

    if (isHome && !reduced) {
      // Finished pawns celebrate on their home slot.
      const energy = isWinnerRow ? 1.6 : 1;
      base.y += Math.abs(Math.sin(t * 3.1 * energy + phaseOffset)) * (isWinnerRow ? 0.16 : 0.07);
      if (isWinnerRow) {
        yaw.current = (yaw.current ?? restingYaw(base, 'home')) + 0.03;
        g.rotation.y = yaw.current;
      }
    } else if (movable && !reduced) {
      base.y += 0.12 + 0.06 * Math.sin(t * 3.4 + phaseOffset);
      matRef.current.emissiveIntensity = 0.4 + 0.3 * Math.sin(t * 4 + phaseOffset);
    } else {
      // Gentle idle with per-character personality.
      base.y += style.bobAmplitude * Math.sin(t * style.bobSpeed * Math.PI + phaseOffset);
      matRef.current.emissiveIntensity = hovered && movable ? 0.25 : 0;
    }

    if (hovered && movable) {
      base.y += 0.09;
      scale = 1.06;
    }

    // Idle squash/sway (skipped while moving).
    if (!reduced) {
      if (style.squash > 0) {
        const s = 1 - style.squash * Math.max(0, Math.sin(t * style.squashSpeed * Math.PI + phaseOffset));
        g.scale.set(scale * (1 + (1 - s) * 0.5), scale * s, scale * (1 + (1 - s) * 0.5));
      } else {
        g.scale.setScalar(scale);
      }
      g.rotation.z = style.sway * Math.sin(t * style.swaySpeed * Math.PI + phaseOffset);
    } else {
      g.scale.setScalar(scale);
      g.rotation.z = 0;
    }

    // Face the natural direction (once set, lerp gently).
    const targetYaw = restingYaw(base, pawn.pos.area);
    yaw.current = yaw.current === null ? targetYaw : lerpYaw(yaw.current, targetYaw, 0.12);
    g.rotation.y = yaw.current;

    // Illegal-tap shake (x wobble that decays).
    if (shaking) {
      const k = 1 - shakeAge / 420;
      g.position.x = base.x + Math.sin(shakeAge * 0.06) * 0.09 * k;
    } else {
      g.position.copy(base);
    }

    if (ring.current) {
      ring.current.visible = movable;
      if (movable) {
        ring.current.scale.setScalar(1 + 0.12 * Math.sin(t * 3.1 + phaseOffset));
        if (ringMat.current) ringMat.current.emissiveIntensity = 0.8 + 0.4 * Math.sin(t * 3.1);
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

      {/* the animal friend — pointer events bubble up from every part */}
      <group onClick={onPawnClick} onPointerOver={onPawnOver} onPointerOut={onPawnOut}>
        <PawnCharacter color={pawn.color} bodyMat={mat} />
      </group>
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
    useGameStore.getState().tapPawn(pawnId);
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
