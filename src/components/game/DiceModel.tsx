'use client';

import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { TIMING } from '@/config/gameConfig';
import { COLORS, MATERIAL } from '@/config/theme';
import { useGameStore } from '@/store/gameStore';
import { playSfx } from '@/services/audio';
import type { DiceFaceId } from '@/engine/types';
import { DICE_REST, DIE_SIZE, easeOutCubic, quatForFace } from './geometry';

/**
 * The 6-sided color die. Click (or press Space) to roll while it is your
 * turn: it tumbles, bounces, settles with the rolled face up and then tells
 * the store the animation is complete.
 */

const HALF = DIE_SIZE / 2;

/** Sticker layout per face: [+X, -X, +Y, -Y, +Z, -Z]. */
const STICKERS: Array<{
  face: DiceFaceId;
  position: [number, number, number];
  rotation: [number, number, number];
}> = [
  { face: 'red', position: [HALF + 0.004, 0, 0], rotation: [0, Math.PI / 2, 0] },
  { face: 'blue', position: [-HALF - 0.004, 0, 0], rotation: [0, -Math.PI / 2, 0] },
  { face: 'green', position: [0, HALF + 0.004, 0], rotation: [-Math.PI / 2, 0, 0] },
  { face: 'yellow', position: [0, -HALF - 0.004, 0], rotation: [Math.PI / 2, 0, 0] },
  { face: 'purple', position: [0, 0, HALF + 0.004], rotation: [0, 0, 0] },
  { face: 'black', position: [0, 0, -HALF - 0.004], rotation: [0, Math.PI, 0] },
];

const IDLE_SPIN = new THREE.Euler(0, 0, 0);

export function DiceModel() {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshStandardMaterial>(null);

  const diceRolling = useGameStore((s) => s.diceRolling);
  const animToken = useGameStore((s) => s.diceAnimToken);
  const screen = useGameStore((s) => s.screen);

  const roll = useRef({
    token: 0,
    startAt: 0,
    angVel: new THREE.Vector3(6, 9, 7),
    settleQuat: new THREE.Quaternion(),
    settleCaptured: false,
    bounceIdx: -1,
    confirmed: true,
  });

  // Start a roll whenever the store raises a new animation token.
  useEffect(() => {
    if (!diceRolling || screen !== 'game') return;
    const r = roll.current;
    r.token = animToken;
    r.startAt = Date.now();
    r.settleCaptured = false;
    r.bounceIdx = -1;
    r.confirmed = false;
    const dir = () => (Math.random() < 0.5 ? -1 : 1);
    r.angVel.set(
      dir() * (4 + Math.random() * 4),
      dir() * (4 + Math.random() * 4),
      dir() * (4 + Math.random() * 4),
    );
    playSfx('diceRoll');
  }, [diceRolling, animToken, screen]);

  const canRollNow = (): boolean => {
    const st = useGameStore.getState();
    const g = st.game;
    if (!g || st.screen !== 'game' || st.paused || st.introPlaying) return false;
    return (
      g.phase === 'await-roll' && !st.diceRolling && g.players[g.activeIndex]?.kind === 'human'
    );
  };

  const onDieClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (canRollNow()) {
      useGameStore.getState().rollDice();
    }
  };
  const onDieOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (canRollNow()) document.body.style.cursor = 'pointer';
  };
  const onDieOut = () => {
    document.body.style.cursor = 'auto';
  };

  const bodyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#F7F1E3',
        roughness: 0.35,
        metalness: 0.04,
      }),
    [],
  );
  useEffect(() => () => bodyMat.dispose(), [bodyMat]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const st = useGameStore.getState();
    const now = Date.now();
    const canRoll = canRollNow();

    if (st.diceRolling && st.diceAnimToken === roll.current.token) {
      const r = roll.current;
      const t = (now - r.startAt) / TIMING.diceRollDuration;
      if (t < 0.72) {
        // Tumble: constant angular velocity + decaying bounces.
        const elapsed = (now - r.startAt) / 1000;
        g.quaternion.setFromEuler(
          new THREE.Euler(r.angVel.x * elapsed, r.angVel.y * elapsed, r.angVel.z * elapsed),
        );
        const bounce = Math.abs(Math.sin(t * 9 * Math.PI));
        g.position.set(
          DICE_REST[0],
          DICE_REST[1] + 1.35 * bounce * Math.pow(Math.max(0, 1 - t), 1.6),
          DICE_REST[2],
        );
        const idx = Math.floor(t * 9);
        if (idx !== r.bounceIdx) {
          r.bounceIdx = idx;
          playSfx('diceBounce', { intensity: Math.max(0.2, 1 - t) });
        }
        r.settleCaptured = false;
      } else {
        if (!r.settleCaptured) {
          r.settleQuat.copy(g.quaternion);
          r.settleCaptured = true;
        }
        const u = Math.max(0, Math.min(1, (t - 0.72) / 0.28));
        const target = quatForFace(st.game?.diceFace ?? null);
        g.quaternion.slerpQuaternions(r.settleQuat, target, easeOutCubic(u));
        g.position.set(DICE_REST[0], DICE_REST[1] + 0.32 * (1 - u), DICE_REST[2]);
        if (u >= 1 && !r.confirmed) {
          r.confirmed = true;
          playSfx('diceSettle');
          st.confirmDiceAnimation(st.diceAnimToken);
        }
      }
      if (ring.current) ring.current.visible = false;
      return;
    }

    // Idle: rest orientation shows the last rolled face; while waiting for a
    // human roll the die floats gently and spins to invite a click.
    if (canRoll) {
      const tt = state.clock.elapsedTime;
      g.quaternion.setFromEuler(
        IDLE_SPIN.set(0.35 * Math.sin(tt * 0.8), tt * 1.15, 0.22 * Math.cos(tt * 0.7)),
      );
      g.position.set(DICE_REST[0], DICE_REST[1] + 0.45 + 0.1 * Math.sin(tt * 2.3), DICE_REST[2]);
      if (ring.current) {
        ring.current.visible = true;
        ring.current.scale.setScalar(1 + 0.09 * Math.sin(tt * 3.1));
        if (ringMat.current) ringMat.current.emissiveIntensity = 0.9 + 0.4 * Math.sin(tt * 3.1);
      }
    } else {
      const target = quatForFace(st.game?.diceFace ?? null);
      g.quaternion.slerp(target, 1 - Math.exp(-dt * 5));
      g.position.set(DICE_REST[0], DICE_REST[1], DICE_REST[2]);
      if (ring.current) ring.current.visible = false;
    }
  });

  return (
    <group>
      {/* invitation ring on the table */}
      <mesh ref={ring} position={[DICE_REST[0], 0.03, DICE_REST[2]]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
        <torusGeometry args={[0.85, 0.07, 10, 48]} />
        <meshStandardMaterial
          ref={ringMat}
          color={MATERIAL.gold}
          emissive={MATERIAL.gold}
          emissiveIntensity={1}
          transparent
          opacity={0.85}
          roughness={0.3}
        />
      </mesh>

      <group ref={group} position={DICE_REST}>
        <RoundedBox
          args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]}
          radius={0.09}
          smoothness={4}
          castShadow
          material={bodyMat}
          onClick={onDieClick}
          onPointerOver={onDieOver}
          onPointerOut={onDieOut}
        />
        {STICKERS.map((s) => (
          <mesh
            key={s.face}
            position={s.position}
            rotation={s.rotation}
            onClick={onDieClick}
            onPointerOver={onDieOver}
            onPointerOut={onDieOut}
          >
            <circleGeometry args={[0.3, 36]} />
            <meshStandardMaterial color={COLORS[s.face]} roughness={0.42} metalness={0.02} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
