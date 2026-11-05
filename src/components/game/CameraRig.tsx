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
 *
 * Two default framings, picked purely from the viewport aspect ratio:
 *  - landscape / desktop keeps the classic axis-aligned three-quarter view
 *    (fov widening + pull-back below a ≈1.63 aspect so nothing clips);
 *  - portrait / mobile gets a DIAGONAL DIAMOND view: the camera slides to a
 *    45° azimuth at a slightly flatter elevation, so one corner of the board
 *    points straight down toward the bottom of the screen — the classic
 *    kids' ludo-app framing that fills a tall canvas naturally.
 */

/**
 * ============================================================================
 * Camera choreography — see the module doc above.
 *
 * PORTRAIT FRAMING TARGETS (validated against real phone viewports):
 *   - the board spans ≈103% of the viewport width (left/right corners touch
 *     or slightly overshoot the screen edges),
 *   - the bottom corner rests just above the bottom gameplay bar (~83% of
 *     the viewport height) while keeping breathing room below the top bar.
 * The framing is derived from the live viewport aspect ratio on every
 * resize/orientation change — nothing is hardcoded to one device.
 * ============================================================================
 */

const ORBIT_TARGET = new THREE.Vector3(0, 0.5, 0);
const DEFAULT_POSITION = new THREE.Vector3(...CAMERA_DEFAULTS.position);
/** Top surface height of the board (y). */
const SURFACE_Y = 0.6;

/** Portrait diamond tuning: how far past the screen edges the widest board
 *  corners reach (1.03 → board spans ≈103% of viewport width) and how far
 *  the orbit target is lifted along +Y (moves the board down-screen so its
 *  bottom corner rests just above the bottom gameplay bar). Values are
 *  visual targets, tuned against real phone viewports in the browser. */
const PORTRAIT_FIT = {
  widthScale: 1.03,
  targetLift: 6.5,
} as const;

interface ViewSpec {
  /** Unit vector from the orbit target toward the default camera. */
  direction: THREE.Vector3;
  /** Authored default distance — used whenever the aspect needs no widening. */
  baseDistance: number;
  /** Vertical fov at the reference aspect. */
  fov: number;
  /** Widest horizontal half-extent the board must span on screen. */
  halfWidth: number;
  /** View-axis depth of the corners that carry that extent. */
  nearDepth: number;
  /** Below this aspect ratio the fov widens and the camera pulls back. */
  fitAspect: number;
  /** Extra degrees of fov per unit of aspect shortfall. */
  fovGain: number;
  fovMax: number;
  distanceMax: number;
  /** The orbit target for this framing. */
  target: THREE.Vector3;
}

/**
 * Derives the horizontal fit constraint from the actual board corners for a
 * given view direction. Perspective widens near geometry, so among the
 * corners carrying the widest screen extent (max |screen-right|) the deepest
 * one binds:
 *   halfWidth / (distance − nearDepth) ≤ tan(hFov/2).
 */
function cornerFit(direction: THREE.Vector3, margin: number, targetY: number) {
  const horiz = new THREE.Vector3(direction.x, 0, direction.z).normalize();
  const right = new THREE.Vector3(horiz.z, 0, -horiz.x);
  const corner = new THREE.Vector3();
  let halfWidth = 0;
  let nearDepth = -Infinity;
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      corner.set((sx * BOARD.size) / 2, SURFACE_Y - targetY, (sz * BOARD.size) / 2);
      const r = Math.abs(corner.dot(right));
      const d = corner.dot(direction);
      if (r > halfWidth + 1e-6) {
        halfWidth = r;
        nearDepth = d;
      } else if (r > halfWidth - 1e-6) {
        nearDepth = Math.max(nearDepth, d);
      }
    }
  }
  return { halfWidth: halfWidth + margin, nearDepth };
}

/** Landscape / desktop view: the authored axis-aligned three-quarter angle. */
const LANDSCAPE: ViewSpec = (() => {
  const direction = DEFAULT_POSITION.clone().sub(ORBIT_TARGET).normalize();
  return {
    direction,
    baseDistance: DEFAULT_POSITION.distanceTo(ORBIT_TARGET),
    fov: CAMERA_DEFAULTS.fov,
    ...cornerFit(direction, 0.5, ORBIT_TARGET.y),
    fitAspect: 1.63,
    fovGain: 8,
    fovMax: 62,
    distanceMax: 32,
    target: ORBIT_TARGET,
  };
})();

/** Portrait / mobile view: 45° azimuth × 40° elevation diamond angle. */
const DIAMOND: ViewSpec = (() => {
  const elevation = THREE.MathUtils.degToRad(40);
  const horizontal = Math.SQRT1_2; // cos/sin of 45° azimuth
  const direction = new THREE.Vector3(
    Math.cos(elevation) * horizontal,
    Math.sin(elevation),
    Math.cos(elevation) * horizontal,
  );
  // Lifted orbit target: pushes the board down-screen so its bottom corner
  // rests above the bottom gameplay bar.
  const target = ORBIT_TARGET.clone();
  target.y += PORTRAIT_FIT.targetLift;
  // Raw corner extent (no authored margin). The width scale DIVIDES into the
  // fit width so the widest corners land at NDC ±widthScale — i.e. the board
  // spans ≈103% of the viewport width (slight, even overshoot). (Putting the
  // scale in the distance instead would cancel out and pin the corners to
  // exactly the screen edge.)
  const { halfWidth, nearDepth } = cornerFit(direction, 0, target.y);
  const fitWidth = halfWidth / PORTRAIT_FIT.widthScale;
  return {
    direction,
    // The fit the diamond has at a square aspect with the base fov.
    baseDistance: nearDepth + fitWidth / Math.tan(THREE.MathUtils.degToRad(CAMERA_DEFAULTS.fov / 2)),
    fov: CAMERA_DEFAULTS.fov,
    halfWidth: fitWidth,
    nearDepth,
    fitAspect: 1,
    fovGain: 12,
    fovMax: 64,
    distanceMax: 48,
    target,
  };
})();

/** Taller-than-wide viewports (phones in portrait) get the diamond framing. */
const DIAMOND_MAX_ASPECT = 1;

/**
 * Aspect fit — keeps the whole board (frame included) in frame for any
 * viewport: wide screens sit at the authored fov/distance, narrow ones widen
 * the fov and pull the camera back along the view axis just enough. The
 * viewing angle itself never changes within a branch; crossing the
 * landscape↔portrait boundary swaps to the matching default framing.
 */
function cameraFitFor(aspect: number): {
  fov: number;
  distance: number;
  direction: THREE.Vector3;
  target: THREE.Vector3;
} {
  const view = aspect < DIAMOND_MAX_ASPECT ? DIAMOND : LANDSCAPE;
  if (!Number.isFinite(aspect) || aspect >= view.fitAspect) {
    return { fov: view.fov, distance: view.baseDistance, direction: view.direction, target: view.target };
  }
  const fov = Math.min(view.fovMax, view.fov + (view.fitAspect / aspect - 1) * view.fovGain);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect;
  const distance = THREE.MathUtils.clamp(
    view.nearDepth + view.halfWidth / tanHalf,
    view.baseDistance,
    view.distanceMax,
  );
  return { fov, distance, direction: view.direction, target: view.target };
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
    () => fit.direction.clone().multiplyScalar(fit.distance).add(fit.target),
    [fit],
  );

  // Aspect fit — applied before the first paint (so portrait phones never
  // flash a cropped or wrongly angled board) and re-applied whenever the
  // orientation changes. Also re-seats the orbit target (the portrait branch
  // orbits a lifted point so the board sits low, above the bottom bar).
  useLayoutEffect(() => {
    applyCameraFit(camera, fitPosition, fit.fov);
    const c = controls.current;
    if (c) {
      c.target.copy(fit.target);
      c.update();
    }
  }, [fit.fov, fit.target, fitPosition, camera]);

  useEffect(() => {
    if (introPlaying) {
      fromPos.current.copy(camera.position);
      startAt.current = Date.now();
    }
  }, [introPlaying, camera]);

  // Restore the fitted default view (diamond on portrait, three-quarter on
  // landscape) whenever the HUD asks for it.
  useEffect(() => {
    if (cameraResetToken === 0) return;
    const c = controls.current;
    if (!c) return;
    applyCameraFit(camera, fitPosition, fit.fov);
    c.target.copy(fit.target);
    c.update();
  }, [cameraResetToken, camera, fit.fov, fit.target, fitPosition]);

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
