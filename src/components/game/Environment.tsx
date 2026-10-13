'use client';

import * as THREE from 'three';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { THEMES, type SeasonalTheme } from '@/config/theme';
import { useSettingsStore, type QualityLevel } from '@/store/settingsStore';
import { feltTexture, softDotSprite } from './textures';

/**
 * ============================================================================
 * ENVIRONMENT — theme-driven lights, floor, seasonal scenery & weather.
 * ============================================================================
 * The immersive world AROUND the board: a snowy pine forest with gift
 * parcels for Christmas, an icy rock garden for Winter, a flower meadow
 * with hidden Easter eggs, or a sunny beach with palms — plus matching
 * weather particles (snowfall, drifting petals, golden sparkles).
 *
 * PERFORMANCE CONTRACT (frustum/occlusion culling + draw-call budget):
 *  - every prop batch (pines, gifts, flowers, eggs, palms…) is ONE
 *    InstancedMesh → exactly one draw call per prop type, with instance
 *    matrices in StaticDrawUsage;
 *  - three.js frustum-culls every object (batch or single mesh) whose
 *    bounding sphere leaves the camera view — props behind the camera or
 *    off-screen never render, and nothing in this file ever disables
 *    frustumCulled;
 *  - static meshes freeze their world matrix (matrixAutoUpdate=false),
 *    so the scene graph skips per-frame matrix math for scenery;
 *  - weather particle systems scale their count with the quality level
 *    and skip animation frames on medium/low (every 2nd / 3rd frame);
 *  - the shadow pass disappears entirely when shadows are toggled off.
 *
 * COLOR-PRESERVATION: scenery uses only neutral/seasonal colors — the
 * board, track fields and pawns keep their player colors untouched.
 */

// ---------------------------------------------------------------------------
// Deterministic placement (seeded — identical forests on every device)
// ---------------------------------------------------------------------------

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Object-count budget per quality level. */
function propBudget(quality: QualityLevel): { big: number; small: number; weather: number } {
  if (quality === 'high') return { big: 30, small: 12, weather: 700 };
  if (quality === 'medium') return { big: 18, small: 8, weather: 350 };
  return { big: 10, small: 5, weather: 150 };
}

// ---------------------------------------------------------------------------
// Lights — theme palette, shadow pass only when enabled
// ---------------------------------------------------------------------------

function ThemeLights({ theme, shadows, quality }: { theme: SeasonalTheme; shadows: boolean; quality: QualityLevel }) {
  const shadowSize: [number, number] = quality === 'high' ? [2048, 2048] : [1024, 1024];
  return (
    <>
      <ambientLight intensity={theme.ambient.intensity} color={theme.ambient.color} />
      <hemisphereLight args={[theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity]} />
      <directionalLight
        position={theme.sun.position}
        intensity={theme.sun.intensity}
        color={theme.sun.color}
        castShadow={shadows}
        shadow-mapSize={shadowSize}
        shadow-camera-left={-11}
        shadow-camera-right={11}
        shadow-camera-top={11}
        shadow-camera-bottom={-11}
        shadow-camera-near={2}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
      />
      {/* soft fill from the opposite side (never casts) */}
      <directionalLight
        position={[-theme.sun.position[0], theme.sun.position[1] * 0.6, -theme.sun.position[2]]}
        intensity={0.3}
        color={theme.hemi.sky}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Floor — felt in the theme's tone, with procedural texture + bump
// ---------------------------------------------------------------------------

function Floor({ theme, sharpTextures }: { theme: SeasonalTheme; sharpTextures: boolean }) {
  const felt = useMemo(() => feltTexture(theme.table, sharpTextures), [theme.table, sharpTextures]);
  return (
    <RoundedBox
      args={[46, 1.2, 46]}
      radius={0.55}
      smoothness={3}
      position={[0, -0.6, 0]}
      receiveShadow
      onUpdate={(self) => {
        self.updateMatrix();
        self.matrixAutoUpdate = false;
      }}
    >
      <meshStandardMaterial
        color="#FFFFFF"
        map={felt}
        bumpMap={felt}
        bumpScale={0.02}
        roughness={0.88}
        metalness={0.02}
      />
    </RoundedBox>
  );
}

// ---------------------------------------------------------------------------
// Instancing helper — one draw call per prop type
// ---------------------------------------------------------------------------

interface Placement {
  x: number;
  z: number;
  /** Uniform scale multiplier. */
  s: number;
  yaw: number;
  color?: string;
}

/** Shared geometry/material — placement drives the instance transforms. */
function InstancedProp({
  geometry,
  material,
  placements,
  /** Extra per-placement [x,y,z] offset applied before scale (world units). */
  offset = [0, 0, 0],
  tintBase = true,
  receiveShadow = false,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  placements: Placement[];
  offset?: [number, number, number];
  tintBase?: boolean;
  receiveShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const col = new THREE.Color();
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i]!;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
      pos.set(p.x + offset[0] * p.s, offset[1] * p.s, p.z + offset[2] * p.s);
      scale.setScalar(p.s);
      m.compose(pos, q, scale);
      mesh.setMatrixAt(i, m);
      if (p.color) mesh.setColorAt(i, col.set(p.color));
      else if (tintBase) mesh.setColorAt(i, col.set('#FFFFFF'));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
  }, [placements, offset, tintBase]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, Math.max(1, placements.length)]}
      castShadow
      receiveShadow={receiveShadow}
    />
  );
}

// ---------------------------------------------------------------------------
// Snowy pine forest (Christmas & Winter) — trunks + two green tiers + snow cap
// ---------------------------------------------------------------------------

const GEO = {
  trunk: new THREE.CylinderGeometry(0.16, 0.22, 0.7, 10),
  tier1: new THREE.ConeGeometry(1.35, 1.7, 12),
  tier2: new THREE.ConeGeometry(0.95, 1.3, 12),
  snowCap: new THREE.ConeGeometry(0.62, 0.85, 12),
  gift: new THREE.BoxGeometry(1, 1, 1),
  knot: new THREE.SphereGeometry(0.16, 12, 10),
  rock: new THREE.IcosahedronGeometry(0.55, 0),
  stem: new THREE.CylinderGeometry(0.025, 0.03, 0.5, 6),
  blossom: new THREE.SphereGeometry(0.13, 12, 10),
  /** Egg-shaped (taller) painted Easter egg — big enough to read at distance. */
  egg: new THREE.SphereGeometry(0.26, 16, 12).scale(1, 1.32, 1),
  palmTrunk: new THREE.CylinderGeometry(0.13, 0.19, 2.4, 10),
  palmCrown1: new THREE.ConeGeometry(1.05, 0.55, 10),
  palmCrown2: new THREE.ConeGeometry(0.72, 0.45, 10),
  beachBall: new THREE.SphereGeometry(0.28, 14, 12),
} as const;

const MAT = {
  trunk: new THREE.MeshStandardMaterial({ color: '#4E3826', roughness: 0.85 }),
  pine: new THREE.MeshStandardMaterial({ color: '#2E5D4C', roughness: 0.8 }),
  pineLight: new THREE.MeshStandardMaterial({ color: '#3B7458', roughness: 0.8 }),
  snow: new THREE.MeshStandardMaterial({ color: '#EDF4FA', roughness: 0.6, emissive: '#C9DCF0', emissiveIntensity: 0.06 }),
  gift: new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.4 }),
  gold: new THREE.MeshStandardMaterial({ color: '#D9A441', metalness: 0.65, roughness: 0.3 }),
  ice: new THREE.MeshStandardMaterial({ color: '#D5E6F5', roughness: 0.25, metalness: 0.15, emissive: '#CFE4F7', emissiveIntensity: 0.1 }),
  stem: new THREE.MeshStandardMaterial({ color: '#4E9A3D', roughness: 0.7 }),
  blossom: new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.45 }),
  egg: new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.32, metalness: 0.08 }),
  palmTrunk: new THREE.MeshStandardMaterial({ color: '#8A6B4F', roughness: 0.85 }),
  palmCrown: new THREE.MeshStandardMaterial({ color: '#4FA060', roughness: 0.7 }),
  palmCrownLight: new THREE.MeshStandardMaterial({ color: '#63B573', roughness: 0.7 }),
  beachBall: new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.35 }),
} as const;

/** Ring placement helper — props circle the board at a distance. */
function ringPlacements(
  count: number,
  seed: number,
  radiusMin: number,
  radiusMax: number,
  colors?: string[],
): Placement[] {
  const r = rng(seed);
  const out: Placement[] = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + (r() - 0.5) * 0.5;
    const rad = radiusMin + r() * (radiusMax - radiusMin);
    out.push({
      x: Math.cos(ang) * rad,
      z: Math.sin(ang) * rad,
      s: 0.85 + r() * 0.55,
      yaw: r() * Math.PI * 2,
      color: colors?.[Math.floor(r() * colors.length)],
    });
  }
  return out;
}

function PineForest({ count, withSnowCaps }: { count: number; withSnowCaps: boolean }) {
  const trees = useMemo(() => ringPlacements(count, 1337, 11.5, 21), [count]);
  const gifts = useMemo(() => ringPlacements(Math.max(4, Math.floor(count / 4)), 4242, 9.8, 13), [count]);
  const rocks = useMemo(() => ringPlacements(Math.max(4, Math.floor(count / 3)), 911, 10.5, 18), [count]);
  return (
    <group>
      <InstancedProp geometry={GEO.trunk} material={MAT.trunk} placements={trees} offset={[0, 0.35, 0]} />
      <InstancedProp geometry={GEO.tier1} material={MAT.pine} placements={trees} offset={[0, 1.35, 0]} />
      <InstancedProp geometry={GEO.tier2} material={MAT.pineLight} placements={trees} offset={[0, 2.35, 0]} />
      {withSnowCaps && (
        <InstancedProp geometry={GEO.snowCap} material={MAT.snow} placements={trees} offset={[0, 3.05, 0]} />
      )}
      {/* Christmas only: gift parcels in seasonal colors with golden knots */}
      <InstancedProp
        geometry={GEO.gift}
        material={MAT.gift}
        placements={gifts.map((g) => ({
          ...g,
          s: g.s * 0.55,
          color: g.color ?? ['#C23A28', '#2E8F63', '#D9A441', '#FDFBF4'][Math.floor(Math.abs(g.x) * 4) % 4],
        }))}
        offset={[0, 0.28, 0]}
      />
      <InstancedProp geometry={GEO.knot} material={MAT.gold} placements={gifts} offset={[0, 0.62, 0]} />
    </group>
  );
}

function IceRocks({ count }: { count: number }) {
  const rocks = useMemo(() => ringPlacements(count, 7331, 10.5, 18), [count]);
  return (
    <group>
      <InstancedProp geometry={GEO.rock} material={MAT.ice} placements={rocks} offset={[0, 0.25, 0]} receiveShadow />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Easter meadow — flowers with pastel blossoms + hidden painted eggs
// ---------------------------------------------------------------------------

function Meadow({ count }: { count: number }) {
  const flowers = useMemo(
    () => ringPlacements(count, 2024, 10.5, 21, ['#F7B7C6', '#C9B6F5', '#FFF6EC', '#FFE28A']),
    [count],
  );
  const eggs = useMemo(
    () => ringPlacements(Math.max(6, Math.floor(count / 3)), 5150, 10, 15.5, ['#F7B7C6', '#C9B6F5', '#BDE3F0', '#FFE28A']),
    [count],
  );
  return (
    <group>
      <InstancedProp geometry={GEO.stem} material={MAT.stem} placements={flowers} offset={[0, 0.25, 0]} />
      <InstancedProp geometry={GEO.blossom} material={MAT.blossom} placements={flowers} offset={[0, 0.58, 0]} />
      <InstancedProp geometry={GEO.egg} material={MAT.egg} placements={eggs} offset={[0, 0.34, 0]} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Summer beach — palms + beach balls
// ---------------------------------------------------------------------------

function Beach({ count }: { count: number }) {
  const palms = useMemo(() => ringPlacements(count, 8888, 12.5, 21), [count]);
  const balls = useMemo(
    () => ringPlacements(Math.max(4, Math.floor(count / 4)), 9090, 9.6, 14, ['#E8503A', '#F2C14E', '#43B57E', '#3E8ED0']),
    [count],
  );
  return (
    <group>
      <InstancedProp geometry={GEO.palmTrunk} material={MAT.palmTrunk} placements={palms} offset={[0, 1.2, 0]} />
      <InstancedProp geometry={GEO.palmCrown1} material={MAT.palmCrown} placements={palms} offset={[0, 2.55, 0]} />
      <InstancedProp geometry={GEO.palmCrown2} material={MAT.palmCrownLight} placements={palms} offset={[0, 2.95, 0]} />
      <InstancedProp geometry={GEO.beachBall} material={MAT.beachBall} placements={balls} offset={[0, 0.28, 0]} receiveShadow />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Weather particles — snow / petals / sparkles (quality-scaled, throttled)
// ---------------------------------------------------------------------------

interface WeatherSpec {
  count: number;
  color: string;
  size: number;
  opacity: number;
  /** Fall speed range (units/s). */
  fall: [number, number];
  /** Horizontal sway amplitude. */
  sway: number;
  additive: boolean;
}

const WEATHER: Record<'snow' | 'petals' | 'sparkles', Omit<WeatherSpec, 'count'>> = {
  snow: { color: '#FFFFFF', size: 0.16, opacity: 0.92, fall: [0.5, 1.15], sway: 0.9, additive: false },
  petals: { color: '#F7C9D9', size: 0.26, opacity: 0.95, fall: [0.28, 0.6], sway: 1.5, additive: false },
  sparkles: { color: '#FFD97A', size: 0.2, opacity: 0.85, fall: [0.05, 0.14], sway: 0.35, additive: true },
};

interface WeatherSystem {
  count: number;
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  speeds: Float32Array;
  phases: Float32Array;
}

/**
 * Module-level weather-system cache — created once per kind+count and kept
 * for the session (the same lifetime policy as the shared geometry/material
 * caches above and the procedural texture cache). useFrame mutates these
 * arrays in place; nothing here is ever passed through React state.
 */
const WEATHER_CACHE = new Map<string, WeatherSystem>();

function getWeatherSystem(kind: 'snow' | 'petals' | 'sparkles', count: number): WeatherSystem {
  const key = `${kind}:${count}`;
  const hit = WEATHER_CACHE.get(key);
  if (hit) return hit;
  const spec = WEATHER[kind];
  const r = rng(777);
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (r() - 0.5) * 46;
    positions[i * 3 + 1] = r() * 15;
    positions[i * 3 + 2] = (r() - 0.5) * 46;
    speeds[i] = spec.fall[0] + r() * (spec.fall[1] - spec.fall[0]);
    phases[i] = r() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  const system: WeatherSystem = { count, geometry, positions, speeds, phases };
  WEATHER_CACHE.set(key, system);
  return system;
}

function WeatherParticles({ kind, count, quality }: { kind: 'snow' | 'petals' | 'sparkles'; count: number; quality: QualityLevel }) {
  const spec = WEATHER[kind];
  const ref = useRef<THREE.Points>(null);
  const frame = useRef(0);
  const sprite = useMemo(() => softDotSprite(), []);
  // Render scope only reads the cached geometry for the JSX prop; useFrame
  // re-fetches the shared system from the module cache — the render binding
  // is never mutated, only the module-cached buffers are.
  const geo = getWeatherSystem(kind, count).geometry;

  // Quality-scaled frame throttling: medium updates every 2nd, low every 3rd
  // frame — the animation cost drops proportionally with the device budget.
  const skip = quality === 'high' ? 1 : quality === 'medium' ? 2 : 3;

  useFrame((state, delta) => {
    frame.current++;
    if (frame.current % skip !== 0) return;
    const pts = ref.current;
    if (!pts) return;
    const dt = Math.min(0.05, delta || 0.016);
    const t = state.clock.elapsedTime;
    const sys = getWeatherSystem(kind, count);
    const arr = sys.positions;
    for (let i = 0; i < sys.count; i++) {
      const i3 = i * 3;
      arr[i3 + 1] -= sys.speeds[i]! * dt;
      arr[i3] += Math.sin(t * 0.8 + sys.phases[i]!) * spec.sway * dt;
      if (arr[i3 + 1]! < -0.5) {
        // respawn at the top of the volume
        arr[i3 + 1] = 14 + Math.random() * 1.5;
        arr[i3] = (Math.random() - 0.5) * 46;
        arr[i3 + 2] = (Math.random() - 0.5) * 46;
      }
    }
    pts.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        color={spec.color}
        size={spec.size}
        map={sprite}
        transparent
        opacity={spec.opacity}
        depthWrite={false}
        sizeAttenuation
        blending={spec.additive ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </points>
  );
}

// ---------------------------------------------------------------------------
// Assembled environment
// ---------------------------------------------------------------------------

export function Environment() {
  const themeId = useSettingsStore((s) => s.theme);
  const quality = useSettingsStore((s) => s.quality);
  const shadows = useSettingsStore((s) => s.shadows);
  const weather = useSettingsStore((s) => s.weather);
  const scenery = useSettingsStore((s) => s.scenery);
  const sharpTextures = useSettingsStore((s) => s.sharpTextures);

  const theme = THEMES[themeId];
  const budget = propBudget(quality);

  return (
    <group>
      <ThemeLights theme={theme} shadows={shadows} quality={quality} />
      <Floor theme={theme} sharpTextures={sharpTextures} />

      {/* seasonal scenery around the board (toggleable) */}
      {scenery && theme.environment === 'snowForest' && (
        <>
          <PineForest count={budget.big} withSnowCaps />
          {/* Christmas adds gift parcels; Winter adds an icy rock garden */}
          {themeId === 'winter' && <IceRocks count={budget.small} />}
        </>
      )}
      {scenery && theme.environment === 'meadow' && <Meadow count={budget.big * 2} />}
      {scenery && theme.environment === 'beach' && <Beach count={Math.floor(budget.big * 0.7)} />}

      {/* weather particles (toggleable, quality-scaled) */}
      {weather && (theme.weather === 'snow' || theme.weather === 'petals' || theme.weather === 'sparkles') && (
        <WeatherParticles kind={theme.weather} count={budget.weather} quality={quality} />
      )}
    </group>
  );
}
