'use client';

import * as THREE from 'three';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { TIMING } from '@/config/gameConfig';
import { BOARD, CAMERA_DEFAULTS } from '@/engine/layout';
import { useGameStore } from '@/store/gameStore';
import { easeInOut } from './geometry';

/**
 * Camera choreography: a sweeping intro dive when a match starts, gentle
 * auto-rotation on the menu/setup/rules screens and a celebratory orbit for
 * the winner. The player can freely orbit (but not pan) during the game and
 * always restore the default view via the HUD camera button.
 */

const ORBIT_TARGET = new THREE.Vector3(0, 0.5, 0);
const DEFAULT_POSITION = new THREE.Vector3(...CAMERA_DEFAULTS.position);
const VIEW_DIRECTION = DEFAULT_POSITION.clone().sub(ORBIT_TARGET).normalize();
const BASE_DISTANCE = DEFAULT_POSITION.distanceTo(ORBIT_TARGET);
/** Top surface height of the board (y). */
const SURFACE_Y = 0.6;

/**
 * Depth (along the view axis) that the NEAR board edge sits in front of the
 * orbit target. Perspective widens near geometry, so the near corners — not
 * the board centre row — are the binding constraint for the horizontal fit:
 * a corner at (±half, surface, +half) must satisfy
 *   half / (distance − NEAR_DEPTH_OFFSET) ≤ tan(hFov/2).
 */
const NEAR_DEPTH_OFFSET =
  (BOARD.size / 2) * VIEW_DIRECTION.z + (SURFACE_Y - ORBIT_TARGET.y) * VIEW_DIRECTION.y;

/**
 * Aspect fit — the default 42° view keeps the whole 14.2-unit board in frame
 * only for wide aspects (≈1.63 and up, i.e. 16:9+). On portrait phones (and
 * even tablets) the near board corners would clip at the left/right screen
 * edges, so below that ratio the view is widened (fov) and the camera pulled
 * back along the same view axis just far enough for the full playing surface
 * to stay visible; the three-quarter viewing angle itself never changes.
 */
const FIT = {
  /** Below this aspect the default framing clips the near board corners. */
  aspect: 1.63,
  /** Half of the board (7.1) plus a safety margin, in world units. */
  halfWidth: BOARD.size / 2 + 0.5,
  fovMax: 62,
  fovGain: 8,
  distanceMax: 32,
} as const;

function cameraFitFor(aspect: number): { fov: number; distance: number } {
  if (!Number.isFinite(aspect) || aspect >= FIT.aspect) {
    return { fov: CAMERA_DEFAULTS.fov, distance: BASE_DISTANCE };
  }
  const fov = Math.min(FIT.fovMax, CAMERA_DEFAULTS.fov + (FIT.aspect / aspect - 1) * FIT.fovGain);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect;
  const distance = THREE.MathUtils.clamp(
    NEAR_DEPTH_OFFSET + FIT.halfWidth / tanHalf,
    BASE_DISTANCE,
    FIT.distanceMax,
  );
  return { fov, distance };
}

/**
 * Imperatively moving/widening the shared three.js camera is the documented
 * R3F pattern for view control. Routed through this module-level helper so
 * the hook-derived camera value is not directly assigned in the component.
 */
function applyCameraFit(camera: THREE.Camera, position: THREE.Vector3, fov: number) {
  camera.position.copy(position);
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

export function CameraRig() {
  const screen = useGameStore((s) => s.screen);
  const introPlaying = useGameStore((s) => s.introPlaying);
  const winner = useGameStore((s) => s.winner);
  const cameraResetToken = useGameStore((s) => s.cameraResetToken);
  const { camera, size } = useThree();
  const fromPos = useRef(new THREE.Vector3());
  const startAt = useRef(0);
  const controls = useRef<OrbitControlsImpl>(null);

  const fit = useMemo(() => cameraFitFor(size.width / Math.max(1, size.height)), [size.width, size.height]);
  /** Fitted camera position: same direction and elevation, adapted distance. */
  const fitPosition = useMemo(
    () => VIEW_DIRECTION.clone().multiplyScalar(fit.distance).add(ORBIT_TARGET),
    [fit.distance],
  );

  // Aspect fit — applied before the first paint (so portrait phones never
  // flash a cropped board) and re-applied whenever the orientation changes.
  // The numeric deps keep this stable for same-value aspect resizes, so an
  // ordinary desktop window resize does not reset a player's camera.
  useLayoutEffect(() => {
    applyCameraFit(camera, fitPosition, fit.fov);
  }, [fit.fov, fitPosition, camera]);

  useEffect(() => {
    if (introPlaying) {
      fromPos.current.copy(camera.position);
      startAt.current = Date.now();
    }
  }, [introPlaying, camera]);

  // Restore the fitted three-quarter view whenever the HUD asks for it.
  useEffect(() => {
    if (cameraResetToken === 0) return;
    const c = controls.current;
    if (!c) return;
    applyCameraFit(camera, fitPosition, fit.fov);
    c.target.set(0, 0.5, 0);
    c.update();
  }, [cameraResetToken, camera, fit.fov, fitPosition]);

  useFrame(() => {
    if (!introPlaying) return;
    const t = Math.min(1, (Date.now() - startAt.current) / TIMING.introDuration);
    camera.position.lerpVectors(fromPos.current, fitPosition, easeInOut(t));
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
      maxDistance={Math.max(CAMERA_DEFAULTS.maxDistance, fit.distance + 5)}
      minPolarAngle={CAMERA_DEFAULTS.minPolarAngle}
      maxPolarAngle={CAMERA_DEFAULTS.maxPolarAngle}
      autoRotate={autoRotate}
      autoRotateSpeed={screen === 'menu' ? 0.55 : 1.05}
    />
  );
}
