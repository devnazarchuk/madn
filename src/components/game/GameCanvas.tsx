'use client';

import { Canvas } from '@react-three/fiber';
import { useSettingsStore } from '@/store/settingsStore';
import { THEMES } from '@/config/theme';
import { CAMERA_DEFAULTS } from '@/engine/layout';
import { BoardModel } from './BoardModel';
import { Environment } from './Environment';
import { PawnLayer } from './PawnLayer';
import { DiceModel } from './DiceModel';
import { CameraRig } from './CameraRig';

/**
 * Full-viewport react-three-fiber canvas: the themed environment (lights,
 * floor, seasonal scenery & weather), the board, the pawns and the color
 * die. Quality and the graphics effect toggles (shadows, anti-aliasing,
 * resolution cap) all come from the settings store; three.js frustum-culls
 * every object outside the camera view.
 */
export default function GameCanvas() {
  const quality = useSettingsStore((s) => s.quality);
  const themeId = useSettingsStore((s) => s.theme);
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
      <fog attach="fog" args={[theme.fog.color, theme.fog.near, theme.fog.far]} />
      <Environment />
      <BoardModel />
      <PawnLayer />
      <DiceModel />
      <CameraRig />
    </Canvas>
  );
}
