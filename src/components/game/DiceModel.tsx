'use client';

import * as THREE from 'three';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { TIMING } from '@/config/gameConfig';
import { COLORS, COLORS_DEEP, MATERIAL, STAR_COLOR, STAR_COLOR_DEEP } from '@/config/theme';
import { useGameStore } from '@/store/gameStore';
import { playSfx } from '@/services/audio';
import type { DiceFaceId } from '@/engine/types';
import { DICE_REST, DIE_SIZE, easeOutCubic, makeStarShape, quatForFace } from './geometry';

/**
 * The 6-sided color die, matched to the match's rules: STANDARD (default) it
 * carries the four player colors + a WHITE face and a BLACK face (the two
 * platform faces — they walk a pawn to the next white/black platform); STAR
 * MODE swaps those two for golden STAR wilds. It lives on the central
 * pedestal of the board — the primary interaction spot: click it (or press
 * Space, or use the HUD button) while it is your turn. It tumbles, bounces,
 * settles with the ENGINE's rolled face up, and then tells the store the
 * animation is complete. The animation never decides the result.
 */

const HALF = DIE_SIZE / 2;

/**
 * Sticker layout per physical face: [+X, -X, +Y, -Y, +Z, -Z]. The four
 * color faces are fixed; the two “wild slots” ±Z carry white & black in the
 * standard game and the golden stars in Star Mode.
 */
interface Sticker {
  face: DiceFaceId;
  position: [number, number, number];
  rotation: [number, number, number];
}

const COLOR_STICKERS: Array<Pick<Sticker, 'position' | 'rotation'>> = [
  { position: [HALF + 0.004, 0, 0], rotation: [0, Math.PI / 2, 0] }, // red (+X)
  { position: [-HALF - 0.004, 0, 0], rotation: [0, -Math.PI / 2, 0] }, // blue (−X)
  { position: [0, HALF + 0.004, 0], rotation: [-Math.PI / 2, 0, 0] }, // green (+Y)
  { position: [0, -HALF - 0.004, 0], rotation: [Math.PI / 2, 0, 0] }, // yellow (−Y)
];
const WILD_SLOT_A: Pick<Sticker, 'position' | 'rotation'> = {
  position: [0, 0, HALF + 0.004],
  rotation: [0, 0, 0],
}; // +Z
const WILD_SLOT_B: Pick<Sticker, 'position' | 'rotation'> = {
  position: [0, 0, -HALF - 0.004],
  rotation: [0, Math.PI, 0],
}; // −Z

const STICKERS_STANDARD: Sticker[] = [
  { face: 'red', ...COLOR_STICKERS[0]! },
  { face: 'blue', ...COLOR_STICKERS[1]! },
  { face: 'green', ...COLOR_STICKERS[2]! },
  { face: 'yellow', ...COLOR_STICKERS[3]! },
  { face: 'white', ...WILD_SLOT_A },
  { face: 'black', ...WILD_SLOT_B },
];

const STICKERS_STAR_MODE: Sticker[] = [
  { face: 'red', ...COLOR_STICKERS[0]! },
  { face: 'blue', ...COLOR_STICKERS[1]! },
  { face: 'green', ...COLOR_STICKERS[2]! },
  { face: 'yellow', ...COLOR_STICKERS[3]! },
  { face: 'star', ...WILD_SLOT_A },
  { face: 'star', ...WILD_SLOT_B },
];

const IDLE_SPIN = new THREE.Euler(0, 0, 0);

export function DiceModel() {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshStandardMaterial>(null);
  const [hovered, setHovered] = useState(false);
  /** Smoothly-eased 0..1 hover amount — drives the tilt & spin-up. */
  const hoverAmt = useRef(0);

  const diceRolling = useGameStore((s) => s.diceRolling);
  const animToken = useGameStore((s) => s.diceAnimToken);
  const screen = useGameStore((s) => s.screen);
  // The physical die matches the match's rules: Star Mode swaps the two
  // platform faces (white & black) for the golden star wilds.
  const starMode = useGameStore((s) => s.game?.rulesConfig.starMode ?? false);
  const stickers = starMode ? STICKERS_STAR_MODE : STICKERS_STANDARD;

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
    setHovered(true);
    if (canRollNow()) document.body.style.cursor = 'pointer';
  };
  const onDieOut = () => {
    setHovered(false);
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

  // The golden star sticker geometry (shared by the two star faces).
  const starGeo = useMemo(() => {
    const shape = makeStarShape(0.3, 0.135);
    return new THREE.ShapeGeometry(shape, 12);
  }, []);
  useEffect(() => () => starGeo.dispose(), [starGeo]);
  const starMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: STAR_COLOR,
        roughness: 0.32,
        metalness: 0.35,
        emissive: new THREE.Color(STAR_COLOR),
        emissiveIntensity: 0.18,
      }),
    [],
  );
  useEffect(() => () => starMat.dispose(), [starMat]);
  const starRimMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: STAR_COLOR_DEEP,
        roughness: 0.45,
        metalness: 0.2,
      }),
    [],
  );
  useEffect(() => () => starRimMat.dispose(), [starRimMat]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const st = useGameStore.getState();
    const now = Date.now();
    const canRoll = canRollNow();

    // Ease the hover amount toward its target (used by the idle invitation
    // animation: a gentle spin-up + tilt when the cursor rests on the die).
    const hoverTarget = hovered && canRoll ? 1 : 0;
    hoverAmt.current += (hoverTarget - hoverAmt.current) * Math.min(1, dt * 9);
    const h = hoverAmt.current;

    if (st.diceRolling && st.diceAnimToken === roll.current.token) {
      const r = roll.current;
      const t = (now - r.startAt) / TIMING.diceRollDuration;
      g.scale.setScalar(1);
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
    // human roll the die floats gently and spins to invite a click — and a
    // HOVERED die spins up (at HALF the earlier speed), tilts playfully and
    // swells so the cursor visibly "catches" it.
    if (canRoll) {
      const tt = state.clock.elapsedTime;
      g.quaternion.setFromEuler(
        IDLE_SPIN.set(
          0.35 * Math.sin(tt * 0.8) + 0.22 * h * Math.sin(tt * 2.05),
          tt * (1.15 + 0.85 * h),
          0.22 * Math.cos(tt * 0.7) + 0.16 * h * Math.cos(tt * 1.8),
        ),
      );
      g.position.set(
        DICE_REST[0],
        DICE_REST[1] + 0.45 + 0.1 * Math.sin(tt * 2.3) + 0.14 * h,
        DICE_REST[2],
      );
      g.scale.setScalar(1 + 0.08 * h);
      if (ring.current) {
        ring.current.visible = true;
        ring.current.scale.setScalar(1 + 0.09 * Math.sin(tt * 3.1));
        if (ringMat.current) {
          ringMat.current.emissiveIntensity = 0.9 + 0.4 * Math.sin(tt * 3.1) + 0.6 * h;
        }
      }
    } else {
      const target = quatForFace(st.game?.diceFace ?? null);
      g.quaternion.slerp(target, 1 - Math.exp(-dt * 5));
      g.position.set(DICE_REST[0], DICE_REST[1], DICE_REST[2]);
      g.scale.setScalar(1);
      if (ring.current) ring.current.visible = false;
    }
  });

  return (
    <group>
      {/* invitation halo on top of the central pedestal */}
      <mesh ref={ring} position={[0, DICE_REST[1] - HALF + 0.035, 0]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
        <torusGeometry args={[0.66, 0.055, 10, 48]} />
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
        {stickers.map((s, i) => (
          <group key={i} position={s.position} rotation={s.rotation}>
            {s.face === 'star' ? (
              <>
                <mesh
                  geometry={starGeo}
                  material={starMat}
                  onClick={onDieClick}
                  onPointerOver={onDieOver}
                  onPointerOut={onDieOut}
                />
                <mesh
                  geometry={starGeo}
                  material={starRimMat}
                  scale={1.12}
                  position={[0, 0, -0.004]}
                  onClick={onDieClick}
                  onPointerOver={onDieOver}
                  onPointerOut={onDieOut}
                />
              </>
            ) : s.face === 'white' || s.face === 'black' ? (
              <>
                {/* platform face — a framed disc, distinct from the cream body */}
                <mesh
                  onClick={onDieClick}
                  onPointerOver={onDieOver}
                  onPointerOut={onDieOut}
                >
                  <circleGeometry args={[0.3, 36]} />
                  <meshStandardMaterial
                    color={COLORS[s.face]}
                    roughness={s.face === 'white' ? 0.3 : 0.42}
                    metalness={0.03}
                  />
                </mesh>
                <mesh
                  position={[0, 0, -0.005]}
                  onClick={onDieClick}
                  onPointerOver={onDieOver}
                  onPointerOut={onDieOut}
                >
                  <ringGeometry args={[0.3, 0.375, 40]} />
                  <meshStandardMaterial
                    color={COLORS_DEEP[s.face]}
                    roughness={0.45}
                    metalness={0.12}
                  />
                </mesh>
              </>
            ) : (
              <mesh
                onClick={onDieClick}
                onPointerOver={onDieOver}
                onPointerOut={onDieOut}
              >
                <circleGeometry args={[0.3, 36]} />
                <meshStandardMaterial color={COLORS[s.face]} roughness={0.42} metalness={0.02} />
              </mesh>
            )}
          </group>
        ))}
      </group>
    </group>
  );
}
