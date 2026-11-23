'use client';

import * as THREE from 'three';
import { useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useSettingsStore } from '@/store/settingsStore';
import { useLook } from '@/hooks/use-look';
import { THEMES, type SeasonalTheme } from '@/config/theme';
import { CAMERA_DEFAULTS } from '@/engine/layout';
import { BoardModel } from './BoardModel';
import { Environment } from './Environment';
import { PawnLayer } from './PawnLayer';
import { DiceModel } from './DiceModel';
import { CameraRig } from './CameraRig';

/**
 * Theme fog, scaled by the REAL camera distance: the phone framings sit
 * noticeably farther out than the desktop three-quarter view, so without the
 * compensation the winter fogs (near ≈ 24-34) would wash the board out.
 * Re-evaluated cheaply per frame (only rewrites the fog object on a change).
 */

/** Module-level imperative mutation (R3F-documented pattern for store scene). */
function applySceneFog(scene: THREE.Scene, fog: SeasonalTheme['fog'], k: number): void {
  scene.fog = new THREE.Fog(fog.color, fog.near * k, fog.far * k);
}

function ThemeFog({ fog }: { fog: SeasonalTheme['fog'] }) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const last = useRef({ color: '', near: -1, far: -1 });
  useFrame(() => {
    const k = Math.max(1, camera.position.length() / 34);
    const near = fog.near * k;
    const far = fog.far * k;
    const l = last.current;
    if (
      !scene.fog ||
      l.color !== fog.color ||
      Math.abs(l.near - near) > 0.5 ||
      Math.abs(l.far - far) > 0.5
    ) {
      applySceneFog(scene, fog, k);
      last.current = { color: fog.color, near, far };
    }
  });
  return null;
}

/**
 * Full-viewport react-three-fiber canvas: the themed environment (lights,
 * floor, seasonal scenery & weather), the board, the pawns and the color
 * die. Quality and the graphics effect toggles (shadows, anti-aliasing,
 * resolution cap) all come from the settings store; three.js frustum-culls
 * every object outside the camera view.
 */
export default function GameCanvas() {
  const quality = useSettingsStore((s) => s.quality);
  const { theme: themeId } = useLook();
  const shadows = useSettingsStore((s) => s.shadows);
  const antialias = useSettingsStore((s) => s.antialias);
  const theme = THEMES[themeId];

  return (
    <Canvas
      // three r0.187 removed PCFSoftShadowMap — 'percentage' (PCFShadowMap) is the softest map left.
      shadows={shadows ? (quality === 'high' ? 'percentage' : 'basic') : false}
      dpr={quality === 'high' ? [1, 2] : quality === 'medium' ? [1, 1.5] : [0.75, 1]}
      camera={{ position: CAMERA_DEFAULTS.position, fov: CAMERA_DEFAULTS.fov }}
      gl={{ antialias }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={[theme.background]} />
      <ThemeFog fog={theme.fog} />
      <Environment />
      <BoardModel />
      <PawnLayer />
      <DiceModel />
      <CameraRig />
    </Canvas>
  );
}
