'use client';

import { Canvas } from '@react-three/fiber';
import { useSettingsStore } from '@/store/settingsStore';
import { CAMERA_DEFAULTS } from '@/engine/layout';
import { BoardModel } from './BoardModel';
import { PawnLayer } from './PawnLayer';
import { DiceModel } from './DiceModel';
import { CameraRig } from './CameraRig';

/**
 * Full-viewport react-three-fiber canvas: the wooden table, the board,
 * the pawns and the color die. Quality follows the settings store.
 */
export default function GameCanvas() {
  const quality = useSettingsStore((s) => s.quality);

  return (
    <Canvas
      // three r0.187 removed PCFSoftShadowMap — 'percentage' (PCFShadowMap) is the softest map left.
      shadows={quality === 'high' ? 'percentage' : quality === 'medium' ? 'basic' : false}
      dpr={quality === 'high' ? [1, 2] : quality === 'medium' ? [1, 1.5] : [0.75, 1]}
      camera={{ position: CAMERA_DEFAULTS.position, fov: CAMERA_DEFAULTS.fov }}
      gl={{ antialias: quality !== 'low' }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#221913']} />
      <BoardModel quality={quality} />
      <PawnLayer />
      <DiceModel />
      <CameraRig />
    </Canvas>
  );
}
