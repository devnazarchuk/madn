'use client';

import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import {
  BASE_BLOCK,
  BASE_SLOTS,
  FINISH_TIP_INDEX,
  HOME_MOUTH,
  HOME_ROW,
  LOOP,
} from '@/engine/board';
import { TRACK_FIELDS } from '@/engine/boardTrackConfig';
import { BOARD, cellToWorld } from '@/engine/layout';
import { COLORS, COLORS_DEEP, COLORS_SOFT, MATERIAL } from '@/config/theme';
import { PLAYER_COLORS } from '@/config/gameConfig';
import type { PlayerColorId } from '@/engine/types';
import { useGameStore } from '@/store/gameStore';
import type { QualityLevel } from '@/store/settingsStore';
import { BASE_PANEL_TOP, FIELD_TOP, makeStarShape, SURFACE_TOP } from './geometry';

/**
 * The classic 11×11 cross board: walnut foundation, cream playing surface,
 * 40 colored inlay track fields woven from the four player colors and the
 * white & black PLATFORMS (colors from engine/boardTrackConfig — the single
 * authoritative track layout), home stretches painted in each player's OWN
 * color as clearly smaller, semi-transparent finish platforms (one pawn per
 * slot) leading to the star-marked winning area (the last one ringed in
 * gold), golden feed arrows on the arm tips — the MANDATORY STOP gateways
 * where a full circuit must halt before stepping into its color row —
 * 4 corner bases with triangle slot formations, and the central dice plaza
 * with the pedestal the die rests on. Fully static (memoized) except the
 * active-base glow.
 */

const FOUNDATION_H = 0.44; // top at 0.44 (valid RoundedBox radius 0.2 < 0.22)
const FOUNDATION_TOP = FOUNDATION_H;
const SURFACE_H = 0.16; // center 0.52, top at 0.60 (valid radius 0.07 < 0.08)
const FIELD_Y = SURFACE_TOP + BOARD.tileHeight / 2; // 0.6375
const HOME_Y = FIELD_Y;
const MOUTH_Y = SURFACE_TOP + 0.016;
const GOLD_FRAME_Y = FOUNDATION_TOP + 0.015;

// ---------------------------------------------------------------------------
// Lights & table
// ---------------------------------------------------------------------------

function Lights({ quality }: { quality: QualityLevel }) {
  const shadowSize: [number, number] = quality === 'high' ? [2048, 2048] : [1024, 1024];
  return (
    <>
      <ambientLight intensity={0.52} color="#FFF2DC" />
      <hemisphereLight args={['#FFEFD2', '#3A2B1E', 0.4]} />
      <directionalLight
        position={[7, 14, 5]}
        intensity={1.3}
        color="#FFF6E6"
        castShadow
        shadow-mapSize={shadowSize}
        shadow-camera-left={-9.5}
        shadow-camera-right={9.5}
        shadow-camera-top={9.5}
        shadow-camera-bottom={-9.5}
        shadow-camera-near={2}
        shadow-camera-far={32}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-8, 9, -6]} intensity={0.34} color="#F2E9DC" />
    </>
  );
}

function Table() {
  return (
    <RoundedBox
      args={[46, 1.2, 46]}
      radius={0.55}
      smoothness={3}
      position={[0, -0.6, 0]}
      receiveShadow
    >
      <meshStandardMaterial color={MATERIAL.table} roughness={0.85} metalness={0.02} />
    </RoundedBox>
  );
}

// ---------------------------------------------------------------------------
// Track / home / base geometry
// ---------------------------------------------------------------------------

/**
 * One track field as a crafted colored inlay: a warm cream socket ring
 * (consistent separation between neighbours), a slightly raised colored
 * inlay with soft highlights, and a deep-tone painted edge. White & black
 * PLATFORM fields use the same craft with their platform colors. Start
 * fields additionally carry a golden ring.
 */
function TrackField({
  color,
  deepColor,
  isStart,
  protectedStart,
}: {
  color: string;
  deepColor: string;
  isStart: boolean;
  protectedStart: boolean;
}) {
  return (
    <group>
      {/* cream socket — clear separation between adjacent spaces */}
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.5, BOARD.tileHeight, 28]} />
        <meshStandardMaterial color={MATERIAL.creamDeep} roughness={0.6} metalness={0.02} />
      </mesh>
      {/* the colored inlay — slightly proud of the socket */}
      <mesh position={[0, 0.004, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.44, 0.455, BOARD.tileHeight + 0.008, 32]} />
        <meshStandardMaterial
          color={color}
          roughness={0.38}
          metalness={0.05}
          emissive={color}
          emissiveIntensity={0.055}
        />
      </mesh>
      {/* painted edge — the inlay's deep-tone rim */}
      <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.44, 0.018, 8, 40]} />
        <meshStandardMaterial color={deepColor} roughness={0.5} metalness={0.03} />
      </mesh>
      {isStart && (
        <mesh position={[0, 0.058, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.475, 0.042, 10, 44]} />
          <meshStandardMaterial color={MATERIAL.gold} metalness={0.7} roughness={0.28} />
        </mesh>
      )}
      {/* Safe-field halo — only when start protection is switched on. */}
      {isStart && protectedStart && (
        <mesh position={[0, 0.085, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.545, 0.045, 10, 44]} />
          <meshStandardMaterial
            color="#FDFBF4"
            emissive="#FDFBF4"
            emissiveIntensity={0.55}
            roughness={0.35}
          />
        </mesh>
      )}
    </group>
  );
}

/**
 * The home stretch: three FINISH PLATFORMS painted in the PLAYER'S OWN COLOR
 * (the classic look — 3 matching cells leading into the winning area marked
 * with a star), deliberately styled apart from the regular track cells:
 * clearly smaller inlays with a semi-transparent tint, so a child instantly
 * reads them as home/finish platforms rather than ordinary track fields —
 * each one a private parking slot for exactly ONE pawn (the golden winning
 * cell keeps the first finisher, later pawns park behind it). The last slot
 * keeps the golden winning-cell ring. The engine follows the paint: the
 * golden arrow gateway feeds the row — own-color rolls step a pawn in and
 * slot by slot onto the golden cell (see engine/rules/validatePath.ts).
 */
function HomeSlots({ color }: { color: PlayerColorId }) {
  const goalIdx = HOME_ROW[color].length - 1;
  return (
    <group>
      {HOME_ROW[color].map((cell, i) => {
        const { x, z } = cellToWorld(cell.col, cell.row);
        return (
          <group key={i} position={[x, HOME_Y, z]}>
            {/* cream socket — noticeably tighter than a track cell */}
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[0.38, 0.38, BOARD.tileHeight, 28]} />
              <meshStandardMaterial color={MATERIAL.creamDeep} roughness={0.6} metalness={0.02} />
            </mesh>
            {/* the player-color finish platform — smaller & semi-transparent,
                clearly distinct from the saturated track inlays */}
            <mesh position={[0, 0.004, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.3, 0.315, BOARD.tileHeight + 0.008, 32]} />
              <meshStandardMaterial
                color={COLORS[color]}
                roughness={0.38}
                metalness={0.05}
                emissive={COLORS[color]}
                emissiveIntensity={0.055}
                transparent
                opacity={0.78}
              />
            </mesh>
            {/* the player-color framing rim */}
            <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.3, 0.022, 8, 40]} />
              <meshStandardMaterial color={COLORS_DEEP[color]} roughness={0.5} metalness={0.03} />
            </mesh>
            {/* the golden winning cell */}
            {i === goalIdx && (
              <mesh position={[0, 0.058, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.335, 0.032, 10, 44]} />
                <meshStandardMaterial color={MATERIAL.gold} metalness={0.7} roughness={0.28} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function HomeMouth({ color }: { color: PlayerColorId }) {
  const cell = HOME_MOUTH[color];
  const { x, z } = cellToWorld(cell.col, cell.row);
  return (
    <group position={[x, MOUTH_Y, z]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[0.36, 0.36, 0.032, 28]} />
        <meshStandardMaterial color={COLORS[color]} roughness={0.55} transparent opacity={0.35} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.36, 0.035, 8, 36]} />
        <meshStandardMaterial color={COLORS_DEEP[color]} roughness={0.4} />
      </mesh>
    </group>
  );
}

function BaseCorner({ color }: { color: PlayerColorId }) {
  const block = BASE_BLOCK[color];
  const { x, z } = cellToWorld(block.col + 1.5, block.row + 1.5);
  return (
    <group position={[x, 0, z]}>
      {/* painted panel */}
      <RoundedBox
        args={[4.3, 0.14, 4.3]}
        radius={0.06}
        smoothness={3}
        position={[0, BASE_PANEL_TOP - 0.07, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={COLORS_SOFT[color]} roughness={0.62} />
      </RoundedBox>
      {/* pawn slots */}
      {BASE_SLOTS[color].map((cell, i) => {
        const p = cellToWorld(cell.col, cell.row);
        return (
          <group key={i} position={[p.x - x, BASE_PANEL_TOP + 0.0375, p.z - z]}>
            <mesh receiveShadow>
              <cylinderGeometry args={[0.44, 0.44, 0.075, 28]} />
              <meshStandardMaterial color={MATERIAL.cream} roughness={0.48} />
            </mesh>
            <mesh position={[0, 0.042, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.42, 0.045, 8, 36]} />
              <meshStandardMaterial color={COLORS_DEEP[color]} roughness={0.4} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * The central dice plaza: a warm wooden hub inlay with a raised pedestal —
 * THE place the die lives. Sized to stay clear of the four home mouths and
 * all track fields.
 */
function DicePlaza() {
  const hubR = BOARD.diceHubRadius;
  const ped = BOARD.dicePedestal;
  const pedY = SURFACE_TOP + ped.height / 2;
  return (
    <group>
      {/* hub inlay on the surface */}
      <mesh receiveShadow position={[0, SURFACE_TOP + 0.008, 0]}>
        <cylinderGeometry args={[hubR, hubR, 0.016, 40]} />
        <meshStandardMaterial color={MATERIAL.medallion} roughness={0.55} metalness={0.06} />
      </mesh>
      <mesh position={[0, SURFACE_TOP + 0.022, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[hubR - 0.02, 0.03, 8, 48]} />
        <meshStandardMaterial color={MATERIAL.gold} metalness={0.68} roughness={0.3} />
      </mesh>
      {/* the raised pedestal the die rests on */}
      <mesh castShadow receiveShadow position={[0, pedY, 0]}>
        <cylinderGeometry args={[ped.radius, ped.radius + 0.02, ped.height, 44]} />
        <meshStandardMaterial color={MATERIAL.walnut} roughness={0.62} metalness={0.05} />
      </mesh>
      {/* golden trim on the pedestal rim */}
      <mesh position={[0, SURFACE_TOP + ped.height - 0.012, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[ped.radius - 0.015, 0.028, 10, 44]} />
        <meshStandardMaterial color={MATERIAL.gold} metalness={0.72} roughness={0.25} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Active player base glow (the only dynamic board element)
// ---------------------------------------------------------------------------

function ActiveBaseGlow() {
  const activeColor = useGameStore((s) => {
    if (s.screen !== 'game' || !s.game) return null;
    if (s.game.phase === 'game-over') return s.winner;
    return s.game.players[s.game.activeIndex]?.color ?? null;
  });
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!mat.current || !mesh.current) return;
    const pulse = 0.62 + 0.38 * Math.sin(Date.now() * 0.0042);
    mat.current.emissiveIntensity = pulse;
    mesh.current.scale.setScalar(1 + 0.02 * Math.sin(Date.now() * 0.0042));
  });

  if (!activeColor) return null;
  const block = BASE_BLOCK[activeColor];
  const { x, z } = cellToWorld(block.col + 1.5, block.row + 1.5);
  return (
    <mesh ref={mesh} position={[x, BASE_PANEL_TOP + 0.06, z]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[2.32, 0.07, 10, 72]} />
      <meshStandardMaterial
        ref={mat}
        color={COLORS[activeColor]}
        emissive={COLORS[activeColor]}
        emissiveIntensity={0.8}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Assembled board
// ---------------------------------------------------------------------------

export function BoardModel({ quality }: { quality: QualityLevel }) {
  const trackFields = useMemo(
    () =>
      TRACK_FIELDS.map((f) => ({
        x: f.world.x,
        z: f.world.z,
        color: f.color,
        deepColor: COLORS_DEEP[f.color],
        isStart: f.isStart,
      })),
    [],
  );
  // Safe-start halo appears when the active rules protect start fields —
  // during a match the MATCH config is authoritative.
  const protectedStarts = useGameStore((s) =>
    s.screen === 'game' ? (s.game?.rulesConfig.protectedStarts ?? false) : false,
  );

  return (
    <group>
      <Lights quality={quality} />
      <Table />

      {/* walnut foundation + gold frame + cream surface (radii must stay
          below half of the smallest box dimension — see geometry note) */}
      <RoundedBox
        args={[BOARD.size, FOUNDATION_H, BOARD.size]}
        radius={0.2}
        smoothness={4}
        position={[0, FOUNDATION_H / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={MATERIAL.walnut} roughness={0.72} metalness={0.04} />
      </RoundedBox>
      <mesh position={[0, GOLD_FRAME_Y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[6.92, 0.075, 10, 96]} />
        <meshStandardMaterial color={MATERIAL.gold} metalness={0.68} roughness={0.3} />
      </mesh>
      <RoundedBox
        args={[BOARD.size - BOARD.frame * 2, SURFACE_H, BOARD.size - BOARD.frame * 2]}
        radius={0.07}
        smoothness={3}
        position={[0, FOUNDATION_TOP + SURFACE_H / 2, 0]}
        receiveShadow
      >
        <meshStandardMaterial color={MATERIAL.cream} roughness={0.78} />
      </RoundedBox>

      {/* 40 loop fields — colored inlays from the authoritative track config */}
      {trackFields.map((f, i) => (
        <group key={i} position={[f.x, FIELD_Y, f.z]}>
          <TrackField
            color={COLORS[f.color]}
            deepColor={f.deepColor}
            isStart={f.isStart}
            protectedStart={protectedStarts}
          />
        </group>
      ))}

      {/* home rows + mouths */}
      {PLAYER_COLORS.map((color) => (
        <group key={color}>
          <HomeSlots color={color} />
          <HomeMouth color={color} />
        </group>
      ))}

      {/* corner bases */}
      {PLAYER_COLORS.map((color) => (
        <BaseCorner key={color} color={color} />
      ))}

      <DicePlaza />
      <ActiveBaseGlow />
    </group>
  );
}
