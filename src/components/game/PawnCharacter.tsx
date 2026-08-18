'use client';

import * as THREE from 'three';
import { MATERIAL } from '@/config/theme';
import type { PlayerColorId } from '@/engine/types';

/**
 * ============================================================================
 * THE FOUR ANIMAL FRIENDS — Fox (red), Bear (blue), Frog (green), Chick (yellow)
 * ============================================================================
 * Stylized toy figures built from soft primitives: rounded proportions,
 * friendly faces, glossy toy plastic. Shared geometries + materials keep the
 * scene light; each pawn owns its body material so highlights (selectable /
 * hovered / selected) never leak across pawns.
 *
 * The figures stand on y = 0 (feet) and face +z.
 */

// ---------------------------------------------------------------------------
// Shared resources (created once, never disposed)
// ---------------------------------------------------------------------------

const GEO = {
  sphere: new THREE.SphereGeometry(1, 20, 16),
  cone: new THREE.ConeGeometry(1, 1, 16),
} as const;

const ACCENT = {
  cream: new THREE.MeshStandardMaterial({ color: MATERIAL.cream, roughness: 0.55 }),
  dark: new THREE.MeshStandardMaterial({ color: '#3E2A18', roughness: 0.42 }),
  white: new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.38 }),
  gold: new THREE.MeshStandardMaterial({ color: MATERIAL.gold, roughness: 0.42 }),
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Positioned sphere with optional stretch. */
function ball(
  key: string,
  x: number,
  y: number,
  z: number,
  r: number,
  material: THREE.Material,
  stretch: [number, number, number] = [1, 1, 1],
) {
  return (
    <mesh
      key={key}
      geometry={GEO.sphere}
      material={material}
      position={[x, y, z]}
      scale={[r * stretch[0], r * stretch[1], r * stretch[2]]}
      castShadow
    />
  );
}

/** Positioned cone (points +y by default). */
function spike(
  key: string,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  material: THREE.Material,
  rotation: [number, number, number] = [0, 0, 0],
) {
  return (
    <mesh
      key={key}
      geometry={GEO.cone}
      material={material}
      position={[x, y, z]}
      scale={[r, h, r]}
      rotation={rotation}
      castShadow
    />
  );
}

// ---------------------------------------------------------------------------
// Characters — each returns its JSX subtree directly
// ---------------------------------------------------------------------------

function FoxBody({ bodyMat }: { bodyMat: THREE.Material }) {
  return (
    <>
      {/* body */}
      {ball('body', 0, 0.3, 0, 0.25, bodyMat, [1, 1.25, 1])}
      {/* head */}
      {ball('head', 0, 0.62, 0.02, 0.21, bodyMat)}
      {/* pointed ears */}
      {spike('ear-l', -0.125, 0.83, -0.03, 0.085, 0.2, bodyMat, [0.1, 0, 0.32])}
      {spike('ear-r', 0.125, 0.83, -0.03, 0.085, 0.2, bodyMat, [0.1, 0, -0.32])}
      {/* muzzle + nose */}
      {ball('muzzle', 0, 0.575, 0.17, 0.1, ACCENT.cream, [1, 0.85, 1.1])}
      {ball('nose', 0, 0.605, 0.245, 0.045, ACCENT.dark)}
      {/* eyes */}
      {ball('eye-l', -0.088, 0.665, 0.165, 0.036, ACCENT.dark)}
      {ball('eye-r', 0.088, 0.665, 0.165, 0.036, ACCENT.dark)}
      {/* bushy tail with cream tip */}
      {ball('tail', 0, 0.24, -0.27, 0.13, bodyMat, [1, 0.85, 1.5])}
      {ball('tail-tip', 0, 0.215, -0.42, 0.075, ACCENT.cream)}
      {/* feet */}
      {ball('foot-l', -0.09, 0.035, 0.07, 0.05, ACCENT.dark, [1, 0.7, 1.2])}
      {ball('foot-r', 0.09, 0.035, 0.07, 0.05, ACCENT.dark, [1, 0.7, 1.2])}
    </>
  );
}

function BearBody({ bodyMat }: { bodyMat: THREE.Material }) {
  return (
    <>
      {/* body */}
      {ball('body', 0, 0.32, 0, 0.27, bodyMat, [1, 1.1, 0.95])}
      {/* head */}
      {ball('head', 0, 0.66, 0.01, 0.22, bodyMat)}
      {/* round ears with inner pads */}
      {ball('ear-l', -0.165, 0.845, -0.01, 0.085, bodyMat)}
      {ball('ear-r', 0.165, 0.845, -0.01, 0.085, bodyMat)}
      {ball('earpad-l', -0.165, 0.855, 0.035, 0.045, ACCENT.cream)}
      {ball('earpad-r', 0.165, 0.855, 0.035, 0.045, ACCENT.cream)}
      {/* muzzle + nose */}
      {ball('muzzle', 0, 0.6, 0.185, 0.105, ACCENT.cream, [1.05, 0.85, 1])}
      {ball('nose', 0, 0.645, 0.255, 0.05, ACCENT.dark)}
      {/* eyes */}
      {ball('eye-l', -0.088, 0.715, 0.17, 0.036, ACCENT.dark)}
      {ball('eye-r', 0.088, 0.715, 0.17, 0.036, ACCENT.dark)}
      {/* belly patch */}
      {ball('belly', 0, 0.3, 0.145, 0.165, ACCENT.cream, [1, 1, 0.6])}
      {/* feet */}
      {ball('foot-l', -0.1, 0.04, 0.08, 0.055, bodyMat, [1, 0.75, 1.25])}
      {ball('foot-r', 0.1, 0.04, 0.08, 0.055, bodyMat, [1, 0.75, 1.25])}
    </>
  );
}

function FrogBody({ bodyMat }: { bodyMat: THREE.Material }) {
  return (
    <>
      {/* squat body doubling as head */}
      {ball('body', 0, 0.26, 0, 0.28, bodyMat, [1, 0.92, 1])}
      {/* big bulgy eyes on top */}
      {ball('eye-l', -0.115, 0.465, 0.09, 0.085, ACCENT.white)}
      {ball('eye-r', 0.115, 0.465, 0.09, 0.085, ACCENT.white)}
      {ball('pupil-l', -0.115, 0.475, 0.16, 0.041, ACCENT.dark)}
      {ball('pupil-r', 0.115, 0.475, 0.16, 0.041, ACCENT.dark)}
      {/* cheek dots */}
      {ball('cheek-l', -0.15, 0.3, 0.175, 0.05, ACCENT.cream)}
      {ball('cheek-r', 0.15, 0.3, 0.175, 0.05, ACCENT.cream)}
      {/* belly */}
      {ball('belly', 0, 0.2, 0.155, 0.17, ACCENT.cream, [1, 0.9, 0.6])}
      {/* feet */}
      {ball('foot-l', -0.14, 0.045, 0.11, 0.07, bodyMat, [1.15, 0.55, 1.5])}
      {ball('foot-r', 0.14, 0.045, 0.11, 0.07, bodyMat, [1.15, 0.55, 1.5])}
    </>
  );
}

function ChickBody({ bodyMat }: { bodyMat: THREE.Material }) {
  return (
    <>
      {/* round body */}
      {ball('body', 0, 0.28, 0, 0.24, bodyMat)}
      {/* head */}
      {ball('head', 0, 0.6, 0.01, 0.19, bodyMat)}
      {/* beak */}
      {spike('beak', 0, 0.585, 0.19, 0.052, 0.11, ACCENT.gold, [Math.PI / 2, 0, 0])}
      {/* head tuft */}
      {spike('tuft', 0, 0.785, -0.01, 0.035, 0.1, bodyMat, [-0.35, 0, 0])}
      {/* eyes */}
      {ball('eye-l', -0.075, 0.655, 0.15, 0.034, ACCENT.dark)}
      {ball('eye-r', 0.075, 0.655, 0.15, 0.034, ACCENT.dark)}
      {/* little wings */}
      {ball('wing-l', -0.225, 0.31, 0.01, 0.1, bodyMat, [0.45, 0.95, 1])}
      {ball('wing-r', 0.225, 0.31, 0.01, 0.1, bodyMat, [0.45, 0.95, 1])}
      {/* feet */}
      {ball('foot-l', -0.075, 0.03, 0.07, 0.04, ACCENT.gold, [1, 0.65, 1.2])}
      {ball('foot-r', 0.075, 0.03, 0.07, 0.04, ACCENT.gold, [1, 0.65, 1.2])}
    </>
  );
}

/**
 * The animal figure for a pawn color. `bodyMat` is owned by the caller so
 * per-pawn highlights (glow) stay private.
 */
export function PawnCharacter({
  color,
  bodyMat,
}: {
  color: PlayerColorId;
  bodyMat: THREE.Material;
}) {
  switch (color) {
    case 'red':
      return <FoxBody bodyMat={bodyMat} />;
    case 'blue':
      return <BearBody bodyMat={bodyMat} />;
    case 'green':
      return <FrogBody bodyMat={bodyMat} />;
    case 'yellow':
      return <ChickBody bodyMat={bodyMat} />;
  }
}

/**
 * Per-character idle animation parameters — each animal feels different.
 * Used by PawnLayer's useFrame: t is seconds.
 */
export interface IdleStyle {
  bobAmplitude: number;
  bobSpeed: number;
  squash: number;
  squashSpeed: number;
  sway: number;
  swaySpeed: number;
}

export const IDLE_STYLE: Record<PlayerColorId, IdleStyle> = {
  // fox: alert, quick little sway
  red: { bobAmplitude: 0.015, bobSpeed: 2.6, squash: 0, squashSpeed: 0, sway: 0.06, swaySpeed: 1.7 },
  // bear: slow deep breathing
  blue: { bobAmplitude: 0.024, bobSpeed: 1.1, squash: 0.035, squashSpeed: 0.9, sway: 0, swaySpeed: 0 },
  // frog: rhythmic squash-hops
  green: { bobAmplitude: 0.02, bobSpeed: 2.1, squash: 0.09, squashSpeed: 2.1, sway: 0, swaySpeed: 0 },
  // chick: quick excited pecking
  yellow: { bobAmplitude: 0.022, bobSpeed: 3.4, squash: 0, squashSpeed: 0, sway: 0.03, swaySpeed: 2.6 },
};
