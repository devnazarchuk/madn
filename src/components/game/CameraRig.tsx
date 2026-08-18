'use client';

import * as THREE from 'three';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { TIMING } from '@/config/gameConfig';
import { CAMERA_DEFAULTS } from '@/engine/layout';
import { useGameStore } from '@/store/gameStore';
import { easeInOut } from './geometry';

/**
 * Camera choreography: a sweeping intro dive when a match starts, gentle
 * auto-rotation on the menu/setup/rules screens and a celebratory orbit for
 * the winner. The player can freely orbit (but not pan) during the game and
 * always restore the default view via the HUD camera button.
 */

const INTRO_TARGET = new THREE.Vector3(...CAMERA_DEFAULTS.position);

export function CameraRig() {
  const screen = useGameStore((s) => s.screen);
  const introPlaying = useGameStore((s) => s.introPlaying);
  const winner = useGameStore((s) => s.winner);
  const cameraResetToken = useGameStore((s) => s.cameraResetToken);
  const { camera } = useThree();
  const fromPos = useRef(new THREE.Vector3());
  const startAt = useRef(0);
  const controls = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    if (introPlaying) {
      fromPos.current.copy(camera.position);
      startAt.current = Date.now();
    }
  }, [introPlaying, camera]);

  // Restore the default three-quarter view whenever the HUD asks for it.
  useEffect(() => {
    if (cameraResetToken === 0) return;
    const c = controls.current;
    if (!c) return;
    camera.position.set(...CAMERA_DEFAULTS.position);
    c.target.set(0, 0.5, 0);
    c.update();
  }, [cameraResetToken, camera]);

  useFrame(() => {
    if (!introPlaying) return;
    const t = Math.min(1, (Date.now() - startAt.current) / TIMING.introDuration);
    camera.position.lerpVectors(fromPos.current, INTRO_TARGET, easeInOut(t));
    camera.lookAt(0, 0.6, 0);
    if (t >= 1) useGameStore.getState().finishIntro();
  });

  const autoRotate = !introPlaying && (screen === 'menu' || screen === 'setup' || screen === 'rules' || !!winner);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!introPlaying}
      target={[0, 0.5, 0]}
      enablePan={false}
      enableDamping
      dampingFactor={0.09}
      rotateSpeed={0.85}
      zoomSpeed={0.7}
      minDistance={CAMERA_DEFAULTS.minDistance}
      maxDistance={CAMERA_DEFAULTS.maxDistance}
      minPolarAngle={CAMERA_DEFAULTS.minPolarAngle}
      maxPolarAngle={CAMERA_DEFAULTS.maxPolarAngle}
      autoRotate={autoRotate}
      autoRotateSpeed={screen === 'menu' ? 0.55 : 1.05}
    />
  );
}
