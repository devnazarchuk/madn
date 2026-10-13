'use client';

import * as THREE from 'three';
import { MATERIAL, COLORS, COLORS_DEEP, type PawnAccessoryId, type PawnSkinId } from '@/config/theme';
import type { PlayerColorId } from '@/engine/types';

/**
 * ============================================================================
 * PAWN FIGURES — four skin families, always in each player's OWN color.
 * ============================================================================
 *  classic : the four animal friends (Fox, Bear, Frog, Chick) — toy figures
 *            built from soft primitives with friendly faces.
 *  gem     : a faceted gemstone on a pedestal base (flat-shaded sparkle).
 *  chess   : a lathe-turned chessman silhouette with a golden collar.
 *  egg     : a striped Easter egg with a golden foot ring.
 *
 * COLOR-PRESERVATION: every skin & every accessory renders in the player's
 * designated base color (plus neutral cream/white/gold trims) — ownership
 * and identification stay instantly clear on the board.
 *
 * Accessories (beanie, santa hat, scarf, sun cap, crown) sit on an anchor
 * point derived from the active skin so hats never swallow ears or eyes.
 * Shared geometries + module-level materials keep the scene light; each pawn
 * owns its body material so highlights (selectable / hovered / selected)
 * never leak across pawns.
 *
 * The figures stand on y = 0 (feet) and face +z.
 */

// ---------------------------------------------------------------------------
// Shared resources (created once, never disposed)
// ---------------------------------------------------------------------------

const GEO = {
  sphere: new THREE.SphereGeometry(1, 24, 18),
  cone: new THREE.ConeGeometry(1, 1, 18),
  /** Gem body — flat-shaded icosahedron. */
  gem: new THREE.IcosahedronGeometry(1, 0),
  /** Chessman silhouette (lathe profile, radii in world units). */
  chess: new THREE.LatheGeometry(
    [
      [0.22, 0],
      [0.21, 0.02],
      [0.19, 0.05],
      [0.09, 0.09],
      [0.075, 0.26],
      [0.13, 0.32],
      [0.13, 0.35],
      [0.08, 0.44],
      [0.15, 0.5],
      [0.1, 0.56],
      [0.12, 0.6],
      [0.1, 0.64],
      [0.06, 0.68],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    32,
  ),
  /** Cylinder for bands & brims. */
  cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
} as const;

const ACCENT = {
  cream: new THREE.MeshStandardMaterial({ color: MATERIAL.cream, roughness: 0.55 }),
  dark: new THREE.MeshStandardMaterial({ color: '#3E2A18', roughness: 0.42 }),
  white: new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.38 }),
  gold: new THREE.MeshStandardMaterial({ color: MATERIAL.gold, roughness: 0.42 }),
} as const;

/** Deep player-color materials for hats/scarves (static — color never changes). */
const DEEP_MAT: Record<PlayerColorId, THREE.MeshStandardMaterial> = {
  red: new THREE.MeshStandardMaterial({ color: COLORS_DEEP.red, roughness: 0.5 }),
  blue: new THREE.MeshStandardMaterial({ color: COLORS_DEEP.blue, roughness: 0.5 }),
  green: new THREE.MeshStandardMaterial({ color: COLORS_DEEP.green, roughness: 0.5 }),
  yellow: new THREE.MeshStandardMaterial({ color: COLORS_DEEP.yellow, roughness: 0.5 }),
};

/** Bright player-color materials for accessory accents (static). */
const BRIGHT_MAT: Record<PlayerColorId, THREE.MeshStandardMaterial> = {
  red: new THREE.MeshStandardMaterial({ color: COLORS.red, roughness: 0.5 }),
  blue: new THREE.MeshStandardMaterial({ color: COLORS.blue, roughness: 0.5 }),
  green: new THREE.MeshStandardMaterial({ color: COLORS.green, roughness: 0.5 }),
  yellow: new THREE.MeshStandardMaterial({ color: COLORS.yellow, roughness: 0.5 }),
};

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

// ---------------------------------------------------------------------------
// Alternative pawn skins — always in the player's own color
// ---------------------------------------------------------------------------

/** Faceted gemstone on a small base (flat-shaded via the owned bodyMat). */
function GemBody({ color, bodyMat }: { color: PlayerColorId; bodyMat: THREE.Material }) {
  return (
    <>
      {/* pedestal base in the deep player tone */}
      <mesh geometry={GEO.cone} material={DEEP_MAT[color]} position={[0, 0.1, 0]} scale={[0.19, 0.2, 0.19]} castShadow />
      {/* golden collar */}
      <mesh geometry={GEO.cyl} material={ACCENT.gold} position={[0, 0.21, 0]} scale={[0.16, 0.025, 0.16]} castShadow />
      {/* the gem itself — the player's color, sparkling facets */}
      <mesh geometry={GEO.gem} material={bodyMat} position={[0, 0.52, 0]} scale={[0.31, 0.36, 0.31]} castShadow />
    </>
  );
}

/** Lathe-turned chessman with a golden collar ring. */
function ChessBody({ color, bodyMat }: { color: PlayerColorId; bodyMat: THREE.Material }) {
  return (
    <>
      <mesh geometry={GEO.chess} material={bodyMat} castShadow />
      {/* top knob in the deep player tone */}
      <mesh geometry={GEO.sphere} material={DEEP_MAT[color]} position={[0, 0.7, 0]} scale={[0.07, 0.07, 0.07]} castShadow />
      {/* golden collar on the stem */}
      <mesh geometry={GEO.cyl} material={ACCENT.gold} position={[0, 0.335, 0]} scale={[0.145, 0.025, 0.145]} castShadow />
    </>
  );
}

/** Striped Easter egg with a golden foot ring. */
function EggBody({ color, bodyMat }: { color: PlayerColorId; bodyMat: THREE.Material }) {
  return (
    <>
      {/* golden foot ring */}
      <mesh geometry={GEO.cyl} material={ACCENT.gold} position={[0, 0.02, 0]} scale={[0.17, 0.03, 0.17]} castShadow />
      {/* the egg — player color */}
      <mesh geometry={GEO.sphere} material={bodyMat} position={[0, 0.31, 0]} scale={[0.23, 0.31, 0.23]} castShadow />
      {/* cream stripe rings following the egg silhouette */}
      <mesh geometry={GEO.cyl} material={ACCENT.cream} position={[0, 0.17, 0]} scale={[0.206, 0.028, 0.206]} castShadow />
      <mesh geometry={GEO.cyl} material={DEEP_MAT[color]} position={[0, 0.3, 0]} scale={[0.232, 0.028, 0.232]} castShadow />
      <mesh geometry={GEO.cyl} material={ACCENT.cream} position={[0, 0.44, 0]} scale={[0.2, 0.028, 0.2]} castShadow />
    </>
  );
}

// ---------------------------------------------------------------------------
// Accessories — hats/scarf/crown in each player's color
// ---------------------------------------------------------------------------

/** Where a hat sits: derived per skin (and per animal for the classic skin). */
interface Anchor {
  y: number;
  r: number;
  /** Backward offset so hats sit behind bulgy eyes. */
  z?: number;
  /** Slight playful tilt (radians around x). */
  tilt?: number;
}

const CLASSIC_ANCHOR: Record<PlayerColorId, Anchor> = {
  red: { y: 0.78, r: 0.16, z: -0.02 }, // fox — ears poke through the sides
  blue: { y: 0.85, r: 0.17, z: -0.02 }, // bear
  green: { y: 0.5, r: 0.17, z: -0.07, tilt: -0.25 }, // frog — pushed back behind the eyes
  yellow: { y: 0.76, r: 0.15, z: -0.01 }, // chick
};

const SKIN_ANCHOR: Record<Exclude<PawnSkinId, 'classic'>, Anchor> = {
  gem: { y: 0.66, r: 0.17 },
  chess: { y: 0.72, r: 0.13 },
  egg: { y: 0.6, r: 0.16, tilt: -0.1 },
};

/** Neck anchors for the scarf — the band must sit OUTSIDE the body
 *  silhouette (animal bodies are chunky spheres) to stay visible. */
const SCARF_ANCHOR: Record<PlayerColorId, { y: number; r: number }> = {
  red: { y: 0.5, r: 0.27 }, // fox — chunky chest
  blue: { y: 0.5, r: 0.27 }, // bear
  green: { y: 0.26, r: 0.3 }, // frog — above the squat belly, behind the eyes
  yellow: { y: 0.44, r: 0.21 }, // chick — slim neck
};

const SKIN_SCARF_ANCHOR: Record<Exclude<PawnSkinId, 'classic'>, { y: number; r: number }> = {
  gem: { y: 0.3, r: 0.2 },
  chess: { y: 0.45, r: 0.12 },
  egg: { y: 0.3, r: 0.25 },
};

function anchorFor(skin: PawnSkinId, color: PlayerColorId): Anchor {
  return skin === 'classic' ? CLASSIC_ANCHOR[color]! : SKIN_ANCHOR[skin]!;
}

/** Cozy beanie in the player's deep color with a cream pompom. */
function Beanie({ color, a }: { color: PlayerColorId; a: Anchor }) {
  return (
    <group position={[0, a.y, a.z ?? 0]} rotation={[a.tilt ?? 0, 0, 0.1]}>
      <mesh geometry={GEO.sphere} material={DEEP_MAT[color]} position={[0, 0.02, 0]} scale={[a.r * 1.06, a.r * 0.8, a.r * 1.06]} castShadow />
      <mesh geometry={GEO.cyl} material={ACCENT.cream} position={[0, -a.r * 0.22, 0]} scale={[a.r * 1.02, 0.05, a.r * 1.02]} castShadow />
      {ball('pom', 0, a.r * 0.82, 0, 0.06, ACCENT.cream)}
    </group>
  );
}

/** Santa hat in the player's deep color with cream band & tip. */
function SantaHat({ color, a }: { color: PlayerColorId; a: Anchor }) {
  return (
    <group position={[0, a.y, a.z ?? 0]} rotation={[a.tilt ?? 0, 0, -0.16]}>
      <mesh geometry={GEO.cone} material={DEEP_MAT[color]} position={[0, a.r * 0.75, 0]} scale={[a.r * 1.02, 0.34, a.r * 1.02]} castShadow />
      <mesh geometry={GEO.cyl} material={ACCENT.cream} position={[0, -0.01, 0]} scale={[a.r * 1.04, 0.05, a.r * 1.04]} castShadow />
      {ball('tip', 0, a.r * 1.55, 0, 0.055, ACCENT.cream)}
    </group>
  );
}

/** Neck scarf: chunky knit collar (deep + cream stripe + bright rings)
 *  with a hanging tail — unmistakably knitwear in the player's colors. */
function Scarf({ color, a }: { color: PlayerColorId; a: { y: number; r: number } }) {
  return (
    <group>
      {/* the knit collar — deep band + cream stripe + bright top ring */}
      <mesh geometry={GEO.cyl} material={DEEP_MAT[color]} position={[0, a.y, 0]} scale={[a.r + 0.035, 0.11, a.r + 0.035]} castShadow />
      <mesh geometry={GEO.cyl} material={ACCENT.cream} position={[0, a.y + 0.11, 0]} scale={[a.r + 0.02, 0.04, a.r + 0.02]} castShadow />
      <mesh geometry={GEO.cyl} material={BRIGHT_MAT[color]} position={[0, a.y + 0.16, 0]} scale={[a.r + 0.01, 0.045, a.r + 0.01]} castShadow />
      {/* hanging tail down the chest, with a cream fringe tip */}
      <mesh geometry={GEO.cyl} material={BRIGHT_MAT[color]} position={[0, a.y - 0.17, a.r * 0.85]} scale={[0.07, 0.3, 0.05]} rotation={[0.28, 0, 0]} castShadow />
      {ball('fringe', 0, a.y - 0.32, a.r * 0.95, 0.06, ACCENT.cream)}
    </group>
  );
}

/** Summer sun cap: bright player-color crown + big cream brim — the crown
 *  rides above the head silhouette so the cap reads clearly at any zoom. */
function SunCap({ color, a }: { color: PlayerColorId; a: Anchor }) {
  return (
    <group position={[0, a.y, a.z ?? 0]} rotation={[a.tilt ?? 0, 0, 0.08]}>
      <mesh geometry={GEO.sphere} material={BRIGHT_MAT[color]} position={[0, 0.12, 0]} scale={[a.r * 1.35, a.r * 1.0, a.r * 1.35]} castShadow />
      {/* brim — flattened disc shading the face */}
      <mesh geometry={GEO.cyl} material={ACCENT.cream} position={[0, -0.06, a.r * 0.8]} scale={[a.r * 1.05, 0.05, a.r * 0.65]} castShadow />
      {ball('button', 0, a.r * 1.28, 0, 0.05, ACCENT.gold)}
    </group>
  );
}

/** Golden crown with the player's gems. */
function Crown({ color, a }: { color: PlayerColorId; a: Anchor }) {
  const spikes = [0, 1, 2, 3, 4];
  return (
    <group position={[0, a.y + 0.06, a.z ?? 0]}>
      <mesh geometry={GEO.cyl} material={ACCENT.gold} scale={[a.r * 1.02, 0.1, a.r * 1.02]} castShadow />
      {spikes.map((i) => {
        const ang = (i / 5) * Math.PI * 2;
        return (
          <mesh
            key={i}
            geometry={GEO.cone}
            material={ACCENT.gold}
            position={[Math.sin(ang) * a.r * 0.85, 0.09, Math.cos(ang) * a.r * 0.85]}
            scale={[0.035, 0.09, 0.035]}
            castShadow
          />
        );
      })}
      {/* the player's gems around the band */}
      {[0, 1, 2, 3].map((i) => {
        const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <mesh
            key={`gem-${i}`}
            geometry={GEO.sphere}
            material={DEEP_MAT[color]}
            position={[Math.sin(ang) * a.r * 0.98, 0, Math.cos(ang) * a.r * 0.98]}
            scale={[0.035, 0.035, 0.035]}
          />
        );
      })}
    </group>
  );
}

/**
 * The pawn figure for a color + skin, wearing the chosen accessory.
 * `bodyMat` is owned by the caller so per-pawn highlights (glow) stay
 * private. Gem skin relies on the bodyMat being flat-shaded.
 */
export function PawnCharacter({
  color,
  bodyMat,
  skin = 'classic',
  accessory = 'none',
}: {
  color: PlayerColorId;
  bodyMat: THREE.Material;
  skin?: PawnSkinId;
  accessory?: PawnAccessoryId;
}) {
  const a = anchorFor(skin, color);
  const scarfA = skin === 'classic' ? SCARF_ANCHOR[color]! : SKIN_SCARF_ANCHOR[skin]!;
  return (
    <group>
      {skin === 'classic' && (
        <>
          {color === 'red' && <FoxBody bodyMat={bodyMat} />}
          {color === 'blue' && <BearBody bodyMat={bodyMat} />}
          {color === 'green' && <FrogBody bodyMat={bodyMat} />}
          {color === 'yellow' && <ChickBody bodyMat={bodyMat} />}
        </>
      )}
      {skin === 'gem' && <GemBody color={color} bodyMat={bodyMat} />}
      {skin === 'chess' && <ChessBody color={color} bodyMat={bodyMat} />}
      {skin === 'egg' && <EggBody color={color} bodyMat={bodyMat} />}

      {/* color-matched accessory — hats anchor at the figure's crown */}
      {accessory === 'beanie' && <Beanie color={color} a={a} />}
      {accessory === 'santa' && <SantaHat color={color} a={a} />}
      {accessory === 'scarf' && <Scarf color={color} a={scarfA} />}
      {accessory === 'cap' && <SunCap color={color} a={a} />}
      {accessory === 'crown' && <Crown color={color} a={a} />}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Idle animation parameters
// ---------------------------------------------------------------------------

export interface IdleStyle {
  bobAmplitude: number;
  bobSpeed: number;
  squash: number;
  squashSpeed: number;
  sway: number;
  swaySpeed: number;
}

/** Per-animal personality for the classic skin. */
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

/** Gentle generic idle for the alternative skins. */
const GENERIC_IDLE: IdleStyle = {
  bobAmplitude: 0.016,
  bobSpeed: 1.9,
  squash: 0.02,
  squashSpeed: 1.5,
  sway: 0.03,
  swaySpeed: 1.1,
};

/** Idle style for the active skin (animals keep their personality). */
export function idleStyleFor(color: PlayerColorId, skin: PawnSkinId): IdleStyle {
  return skin === 'classic' ? IDLE_STYLE[color] : GENERIC_IDLE;
}
