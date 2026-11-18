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
import { TRACK_FIELDS, CLASSIC_LAYOUT } from '@/engine/boardTrackConfig';
import { BOARD, cellToWorld } from '@/engine/layout';
import {
  BOARD_SKINS,
  COLORS,
  COLORS_DEEP,
  COLORS_SOFT,
  MATERIAL,
  TILE_SKINS,
  type BoardSkin,
  type TileSkin,
} from '@/config/theme';
import { PLAYER_COLORS } from '@/config/gameConfig';
import type { PlayerColorId, TrackColorId } from '@/engine/types';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { woodTexture, linenTexture } from './textures';
import { BASE_PANEL_TOP, FIELD_TOP, makeStarShape, SURFACE_TOP } from './geometry';

/**
 * The classic 11×11 cross board: a wood foundation with procedural high-
 * resolution grain (map + bump), a fine linen-weave playing surface, 40
 * colored inlay track fields woven from the four player colors and the
 * white & black PLATFORMS (colors from engine/boardTrackConfig — the single
 * authoritative track layout), home stretches painted in each player's OWN
 * color as clearly smaller, semi-transparent finish platforms (one pawn per
 * slot) leading to the star-marked winning area (the last one ringed in
 * gold), golden feed arrows on the arm tips — the MANDATORY STOP gateways
 * where a full circuit must halt before stepping into its color row — 4
 * corner bases with triangle slot formations, and the central dice plaza
 * with the pedestal the die rests on. The wood/cream palette follows the
 * selected BOARD SKIN; track field colors and gameplay-critical colors are
 * never affected by skins or themes. Fully static (memoized) except the
 * active-base glow. Lights, floor and seasonal scenery live in Environment.
 */

const FOUNDATION_H = 0.44; // top at 0.44 (valid RoundedBox radius 0.2 < 0.22)
const FOUNDATION_TOP = FOUNDATION_H;
const SURFACE_H = 0.16; // center 0.52, top at 0.60 (valid radius 0.07 < 0.08)
const FIELD_Y = SURFACE_TOP + BOARD.tileHeight / 2; // 0.6375
const HOME_Y = FIELD_Y;
const MOUTH_Y = SURFACE_TOP + 0.016;
const GOLD_FRAME_Y = FOUNDATION_TOP + 0.015;

// ---------------------------------------------------------------------------
// Track / home / base geometry
// ---------------------------------------------------------------------------

/**
 * One track field as a crafted colored inlay: a warm cream socket ring
 * (consistent separation between neighbours), a slightly raised colored
 * inlay and a painted edge — shape language & finish follow the TILE SKIN
 * (smooth classic inlay, faceted low-poly gems, plush cushions with a
 * little top button, glossy porcelain with golden rims). Start fields
 * additionally carry a golden ring.
 */
function TrackField({
  color,
  deepColor,
  socketColor,
  isStart,
  protectedStart,
  tile,
}: {
  color: string;
  deepColor: string;
  socketColor: string;
  isStart: boolean;
  protectedStart: boolean;
  tile: TileSkin;
}) {
  return (
    <group>
      {/* cream socket — clear separation between adjacent spaces */}
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.5, BOARD.tileHeight, tile.segments]} />
        <meshStandardMaterial
          color={socketColor}
          roughness={0.6}
          metalness={0.02}
          flatShading={tile.flat}
        />
      </mesh>
      {/* the colored inlay — slightly proud of the socket */}
      <mesh position={[0, 0.004, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.44, 0.455, BOARD.tileHeight + 0.008, tile.segments]} />
        <meshStandardMaterial
          color={color}
          roughness={tile.roughness}
          metalness={tile.metalness}
          flatShading={tile.flat}
          emissive={color}
          emissiveIntensity={tile.glow}
        />
      </mesh>
      {/* plush style: a soft top button at the inlay center */}
      {tile.button && (
        <mesh position={[0, 0.05, 0]} castShadow>
          <sphereGeometry args={[0.075, 14, 10]} />
          <meshStandardMaterial color={deepColor} roughness={0.8} metalness={0} flatShading={false} />
        </mesh>
      )}
      {/* painted edge — the inlay's rim */}
      {tile.rim === 'paint' && (
        <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.44, 0.018 * tile.rimScale, 8, Math.min(40, tile.segments * 2 + 8)]} />
          <meshStandardMaterial color={deepColor} roughness={0.5} metalness={0.03} flatShading={tile.flat} />
        </mesh>
      )}
      {tile.rim === 'gold' && (
        <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.44, 0.016 * tile.rimScale, 8, 44]} />
          <meshStandardMaterial color={MATERIAL.gold} metalness={0.68} roughness={0.3} />
        </mesh>
      )}
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
 * The home stretch: three FINISH PLATFORMS painted per the MATCH's board
 * layout (the classic look: 3 cells in the player's OWN color — or that
 * row's random colors in the Full Random map), deliberately styled apart
 * from the regular track cells: clearly smaller inlays with a semi-
 * transparent tint, so a child instantly reads them as home/finish
 * platforms rather than ordinary track fields — each one a private parking
 * slot for exactly ONE pawn (the golden winning cell keeps the first
 * finisher, later pawns park behind it). The last slot keeps the golden
 * winning-cell ring. The engine follows the paint: the golden arrow gateway
 * feeds the row — rolls matching each cell's paint step a pawn in and slot
 * by slot onto the golden cell (see engine/rules/validatePath.ts).
 */
function HomeSlots({
  color,
  skin,
  slotColors,
  tile,
}: {
  color: PlayerColorId;
  skin: BoardSkin;
  /** The three finish-platform colors from the match's layout. */
  slotColors: TrackColorId[];
  tile: TileSkin;
}) {
  const goalIdx = HOME_ROW[color].length - 1;
  return (
    <group>
      {HOME_ROW[color].map((cell, i) => {
        const { x, z } = cellToWorld(cell.col, cell.row);
        const paint = slotColors[i] ?? color;
        return (
          <group key={i} position={[x, HOME_Y, z]}>
            {/* cream socket — noticeably tighter than a track cell */}
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[0.38, 0.38, BOARD.tileHeight, tile.segments]} />
              <meshStandardMaterial color={skin.surfaceDeep} roughness={0.6} metalness={0.02} flatShading={tile.flat} />
            </mesh>
            {/* the finish platform — smaller & semi-transparent, clearly
                distinct from the saturated track inlays */}
            <mesh position={[0, 0.004, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.3, 0.315, BOARD.tileHeight + 0.008, tile.segments]} />
              <meshStandardMaterial
                color={COLORS[paint]}
                roughness={tile.roughness}
                metalness={tile.metalness}
                flatShading={tile.flat}
                emissive={COLORS[paint]}
                emissiveIntensity={tile.glow}
                transparent
                opacity={0.78}
              />
            </mesh>
            {/* plush style: soft top button */}
            {tile.button && (
              <mesh position={[0, 0.05, 0]} castShadow>
                <sphereGeometry args={[0.06, 14, 10]} />
                <meshStandardMaterial color={COLORS_DEEP[paint]} roughness={0.8} />
              </mesh>
            )}
            {/* the platform framing rim */}
            {tile.rim === 'paint' && (
              <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.3, 0.022 * tile.rimScale, 8, Math.min(40, tile.segments * 2 + 8)]} />
                <meshStandardMaterial color={COLORS_DEEP[paint]} roughness={0.5} metalness={0.03} flatShading={tile.flat} />
              </mesh>
            )}
            {tile.rim === 'gold' && (
              <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.3, 0.02 * tile.rimScale, 8, 44]} />
                <meshStandardMaterial color={MATERIAL.gold} metalness={0.68} roughness={0.3} />
              </mesh>
            )}
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

/**
 * The decorative goal cell just beyond each winning cell: a soft player-color
 * halo with a small golden star inlay — the trophy a finished pawn reaches
 * toward, right beside the central dice plaza.
 */
function HomeMouth({ color }: { color: PlayerColorId }) {
  const cell = HOME_MOUTH[color];
  const { x, z } = cellToWorld(cell.col, cell.row);
  const starGeom = useMemo(() => new THREE.ShapeGeometry(makeStarShape(0.2, 0.08)), [color]);
  useEffect(
    () => () => {
      starGeom.dispose();
    },
    [starGeom],
  );
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
      <mesh
        geometry={starGeom}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.026, 0]}
        renderOrder={2}
      >
        <meshStandardMaterial
          color={MATERIAL.gold}
          metalness={0.6}
          roughness={0.32}
          emissive={MATERIAL.gold}
          emissiveIntensity={0.22}
        />
      </mesh>
    </group>
  );
}

function BaseCorner({ color, skin }: { color: PlayerColorId; skin: BoardSkin }) {
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
              <meshStandardMaterial color={skin.surface} roughness={0.48} />
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
 * The golden feed arrow on each arm TIP: the ARROW GATEWAY cell — the loop
 * position directly opposite a color row where a pawn's full circuit ends —
 * pointing straight into that row. kids-v6: this cell is a MANDATORY STOP
 * (the engine caps every move at it); the arrow promises the only way home:
 * stop here first, then roll the own color to step inside.
 */
function TipFeeds() {
  // Tip world cell + the direction pointing into the fed home row.
  const tips = useMemo(() => {
    const dirs: Record<PlayerColorId, [number, number]> = {
      blue: [1, 0], // west tip → row extends east
      yellow: [0, 1], // north tip → row extends south
      red: [-1, 0], // east tip → row extends west
      green: [0, -1], // south tip → row extends north
    };
    return PLAYER_COLORS.map((color) => {
      const cell = LOOP[FINISH_TIP_INDEX[color]]!;
      const { x, z } = cellToWorld(cell.col, cell.row);
      return { color, x, z, dir: dirs[color] };
    });
  }, []);
  const geometries = useMemo(
    () =>
      tips.map((tip) => {
        const [dx, dz] = tip.dir;
        const px = -dz;
        const pz = dx;
        const L = 0.3;
        const W = 0.26;
        const verts = new Float32Array([
          dx * L, 0, dz * L,
          -dx * L * 0.45 + (px * W) / 2, 0, -dz * L * 0.45 + (pz * W) / 2,
          -dx * L * 0.45 - (px * W) / 2, 0, -dz * L * 0.45 - (pz * W) / 2,
        ]);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        g.computeVertexNormals();
        return g;
      }),
    [tips],
  );
  useEffect(
    () => () => {
      for (const g of geometries) g.dispose();
    },
    [geometries],
  );
  return (
    <>
      {tips.map((tip, i) => (
        <mesh
          key={tip.color}
          geometry={geometries[i]!}
          position={[tip.x, FIELD_TOP + 0.02, tip.z]}
          renderOrder={2}
        >
          <meshStandardMaterial
            color={MATERIAL.gold}
            metalness={0.65}
            roughness={0.3}
            emissive={MATERIAL.gold}
            emissiveIntensity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </>
  );
}

/**
 * The central dice plaza: a warm wooden hub inlay with a raised pedestal —
 * THE place the die lives. Sized to stay clear of the four home mouths and
 * all track fields.
 */
function DicePlaza({ skin }: { skin: BoardSkin }) {
  const hubR = BOARD.diceHubRadius;
  const ped = BOARD.dicePedestal;
  const pedY = SURFACE_TOP + ped.height / 2;
  return (
    <group>
      {/* hub inlay on the surface */}
      <mesh receiveShadow position={[0, SURFACE_TOP + 0.008, 0]}>
        <cylinderGeometry args={[hubR, hubR, 0.016, 40]} />
        <meshStandardMaterial color={skin.foundationDeep} roughness={0.55} metalness={0.06} />
      </mesh>
      <mesh position={[0, SURFACE_TOP + 0.022, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[hubR - 0.02, 0.03, 8, 48]} />
        <meshStandardMaterial color={MATERIAL.gold} metalness={0.68} roughness={0.3} />
      </mesh>
      {/* the raised pedestal the die rests on */}
      <mesh castShadow receiveShadow position={[0, pedY, 0]}>
        <cylinderGeometry args={[ped.radius, ped.radius + 0.02, ped.height, 44]} />
        <meshStandardMaterial color={skin.foundation} roughness={0.62} metalness={0.05} />
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

export function BoardModel() {
  const boardSkin = useSettingsStore((s) => s.boardSkin);
  const tileSkinId = useSettingsStore((s) => s.tileSkin);
  const sharpTextures = useSettingsStore((s) => s.sharpTextures);
  const skin = BOARD_SKINS[boardSkin];
  const tile = TILE_SKINS[tileSkinId];
  // The match's color layout (classic weave or Full Random map) — outside a
  // match the board shows the official pattern. Track field colors and
  // gameplay-critical colors are never affected by skins or themes.
  const gameLayout = useGameStore((s) => (s.screen === 'game' ? s.game?.layout : null));
  const layout = gameLayout ?? CLASSIC_LAYOUT;
  // Procedural high-res wood grain & linen weave (cached by skin+quality;
  // double as bump maps so the board keeps a tactile, premium feel).
  const wood = useMemo(() => woodTexture(boardSkin, sharpTextures), [boardSkin, sharpTextures]);
  const linen = useMemo(() => linenTexture(boardSkin, sharpTextures), [boardSkin, sharpTextures]);

  const trackFields = useMemo(
    () =>
      TRACK_FIELDS.map((f) => ({
        x: f.world.x,
        z: f.world.z,
        loopIndex: f.loopIndex,
        color: layout.trackColors[f.loopIndex] ?? f.color,
        deepColor: COLORS_DEEP[layout.trackColors[f.loopIndex] ?? f.color],
        isStart: f.isStart,
      })),
    [layout],
  );
  // Safe-start halo appears when the active rules protect start fields —
  // during a match the MATCH config is authoritative.
  const protectedStarts = useGameStore((s) =>
    s.screen === 'game' ? (s.game?.rulesConfig.protectedStarts ?? false) : false,
  );

  return (
    <group>
      {/* skinned foundation + gold frame + linen surface (radii must stay
          below half of the smallest box dimension — see geometry note) */}
      <RoundedBox
        args={[BOARD.size, FOUNDATION_H, BOARD.size]}
        radius={0.2}
        smoothness={4}
        position={[0, FOUNDATION_H / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color="#FFFFFF"
          map={wood}
          bumpMap={wood}
          bumpScale={0.035}
          roughness={0.68}
          metalness={0.04}
        />
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
        <meshStandardMaterial
          color="#FFFFFF"
          map={linen}
          bumpMap={linen}
          bumpScale={0.02}
          roughness={0.8}
        />
      </RoundedBox>

      {/* 40 loop fields — colored inlays from the authoritative track config */}
      {trackFields.map((f, i) => (
        <group key={i} position={[f.x, FIELD_Y, f.z]}>
          <TrackField
            color={COLORS[f.color]}
            deepColor={f.deepColor}
            socketColor={skin.surfaceDeep}
            isStart={f.isStart}
            protectedStart={protectedStarts}
            tile={tile}
          />
        </group>
      ))}

      {/* home stretches + goal mouths + the golden tip feed arrows */}
      {PLAYER_COLORS.map((color) => (
        <group key={color}>
          <HomeSlots color={color} skin={skin} slotColors={layout.homeColors[color] ?? [color, color, color]} tile={tile} />
          <HomeMouth color={color} />
        </group>
      ))}
      <TipFeeds />

      {/* corner bases */}
      {PLAYER_COLORS.map((color) => (
        <BaseCorner key={color} color={color} skin={skin} />
      ))}

      <DicePlaza skin={skin} />
      <ActiveBaseGlow />
    </group>
  );
}
