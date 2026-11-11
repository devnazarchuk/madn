'use client';

import * as THREE from 'three';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { TIMING } from '@/config/gameConfig';
import { BOARD, CAMERA_DEFAULTS } from '@/engine/layout';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore, type MobileViewId } from '@/store/settingsStore';
import { easeInOut } from './geometry';

/**
 * ============================================================================
 * Camera choreography.
 * ============================================================================
 * A sweeping intro dive when a match starts, gentle auto-rotation on the
 * menu/setup/rules screens and a celebratory orbit for the winner. The player
 * can freely orbit (but not pan) during the game and always restore the
 * default view via the HUD camera button.
 *
 * Three framings, picked from the live viewport aspect ratio (recomputed on
 * every resize / orientation change — nothing is hardcoded to one device):
 *
 *  - LANDSCAPE (aspect ≥ 1, desktop): the classic axis-aligned three-quarter
 *    view, byte-for-byte the authored default (fov widening + pull-back below
 *    a ≈1.63 aspect keeps the board in frame on narrow windows).
 *
 *  - PORTRAIT phones get one of TWO switchable views (HUD toggle, persisted):
 *      · 'diagonal' — the kids'-ludo diamond angle (45° azimuth, raised
 *        elevation), one corner pointing down-screen, tuned CLOSE: the
 *        board runs ≈12% past the screen sides (only empty wooden corner
 *        tips crop; every pawn stays fully visible);
 *      · 'topdown'  — a straight overhead (90°) look, board edges LEVEL
 *        with the screen edges (no diamond rotation) spanning exactly 100%
 *        of the viewport width, centered between the HUD bars.
 *
 * PORTRAIT FRAMING CONTRACT:
 *   · width — the board spans exactly `widthScale` of the viewport width
 *     (diamond 1.12, top-down 1.0), solved EXACTLY against the real
 *     perspective projection (per-corner depth) so the contract holds for
 *     every phone aspect, not just the one it was tuned on;
 *   · vertical — the diamond parks its lowest corner just above the bottom
 *     gameplay bar (≈84% down); the top-down view centers the board in the
 *     free area between the top player bar and the bottom bar;
 *   · recomputed on every resize / orientation change — nothing is
 *     hardcoded to one device.
 * ============================================================================
 */

/** Stable base orbit target (board center, just above the surface). */
const BASE_TARGET = new THREE.Vector3(0, 0.5, 0);
const DEFAULT_POSITION = new THREE.Vector3(...CAMERA_DEFAULTS.position);

/** The four top corners of the framed playing surface (world space). */
const CORNERS: readonly THREE.Vector3[] = (() => {
  const h = BOARD.size / 2;
  return [
    new THREE.Vector3(-h, 0.6, -h),
    new THREE.Vector3(h, 0.6, -h),
    new THREE.Vector3(-h, 0.6, h),
    new THREE.Vector3(h, 0.6, h),
  ];
})();

/** Vertical placement fallback (the diamond's lowest corner): 84% down. */
const PORTRAIT_BOTTOM_NDC_Y = 1 - 2 * 0.84;

interface PortraitSpec {
  /** Unit vector from the orbit target toward the camera. */
  direction: THREE.Vector3;
  /** Screen-right (world space, orthogonal to the view axis, y = 0). */
  right: THREE.Vector3;
  /** Screen-up (world space, orthogonal to the view axis). */
  up: THREE.Vector3;
  fov: number;
  fovMax: number;
  fovGain: number;
  distanceMax: number;
  /** Polar-angle orbit clamps for this framing. */
  polarMin: number;
  polarMax: number;
  /** How much of the viewport width the board spans (1 = edges touch). */
  widthScale: number;
  /** Vertical placement — exactly one of the two contracts:
   *  · bottomNdcY — the LOWEST board corner rests at this viewport line
   *    (NDC y) just above the bottom gameplay bar (diamond view);
   *  · centerNdcY — the board CENTER rests at this viewport line (NDC y),
   *    the middle of the free area between the HUD bars (top-down). */
  bottomNdcY?: number;
  centerNdcY?: number;
}

/** Builds a portrait view spec from an elevation angle (degrees). */
function portraitSpec(
  elevationDeg: number,
  fovMax: number,
  fovGain: number,
  opts: {
    /** Screen-space rotation of the board: 45° = kids' diamond, 0 = straight. */
    azimuthDeg: number;
    widthScale: number;
    bottomNdcY?: number;
    centerNdcY?: number;
  },
): PortraitSpec {
  const elevation = THREE.MathUtils.degToRad(elevationDeg);
  const azimuth = THREE.MathUtils.degToRad(opts.azimuthDeg);
  const direction = new THREE.Vector3(
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth),
  );
  const horiz = new THREE.Vector3(direction.x, 0, direction.z).normalize();
  const right = new THREE.Vector3(horiz.z, 0, -horiz.x);
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  return {
    direction,
    right,
    up,
    fov: CAMERA_DEFAULTS.fov,
    fovMax,
    fovGain,
    distanceMax: 52,
    // Free vertical orbiting on phones: from straight overhead down to the
    // classic low three-quarter angle.
    polarMin: 0.001,
    polarMax: CAMERA_DEFAULTS.maxPolarAngle,
    widthScale: opts.widthScale,
    bottomNdcY: opts.bottomNdcY,
    centerNdcY: opts.centerNdcY,
  };
}

/** Angled diamond: raised elevation fills the tall screen far better than a
 *  shallow angle (the board's projected height scales with sin(elevation)).
 *  Tuned CLOSER than the first width-fit pass: the board is allowed to run
 *  ~12% past the screen sides (only the empty wooden corner tips crop —
 *  every pawn slot stays fully on screen) and the steeper 56° elevation
 *  gives the diamond more vertical presence. */
const DIAGONAL = portraitSpec(56, 56, 7, {
  azimuthDeg: 45,
  widthScale: 1.12,
  bottomNdcY: 1 - 2 * 0.84,
});
/** Straight top-down: the board reads LEVEL (edges parallel to the screen,
 *  no diamond rotation) and spans exactly 100% of the viewport width — the
 *  board edges butt against the screen sides — centered in the free area
 *  between the top player bar and the bottom gameplay bar. */
const TOPDOWN = portraitSpec(89.5, 60, 11, {
  azimuthDeg: 0,
  widthScale: 1.0,
  centerNdcY: -0.045,
});

/** Landscape / desktop view — the authored axis-aligned three-quarter angle. */
const LANDSCAPE = (() => {
  const direction = DEFAULT_POSITION.clone().sub(BASE_TARGET).normalize();
  const horiz = new THREE.Vector3(direction.x, 0, direction.z).normalize();
  const right = new THREE.Vector3(horiz.z, 0, -horiz.x);
  const corner = new THREE.Vector3();
  let halfWidth = 0;
  let nearDepth = -Infinity;
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      corner.set((sx * BOARD.size) / 2, 0.1, (sz * BOARD.size) / 2);
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
  return {
    direction,
    baseDistance: DEFAULT_POSITION.distanceTo(BASE_TARGET),
    fov: CAMERA_DEFAULTS.fov,
    halfWidth: halfWidth + 0.5,
    nearDepth,
    fitAspect: 1.63,
    fovGain: 8,
    fovMax: 62,
    distanceMax: 32,
    polarMin: CAMERA_DEFAULTS.minPolarAngle,
    polarMax: CAMERA_DEFAULTS.maxPolarAngle,
  };
})();

interface Framing {
  viewId: 'landscape' | MobileViewId;
  fov: number;
  distance: number;
  position: THREE.Vector3;
  target: THREE.Vector3;
  polarMin: number;
  polarMax: number;
}

const tmpVec = new THREE.Vector3();

/**
 * Widest horizontal extent of the board corners for a view direction, plus
 * the view-axis depth of the corner carrying it (the binding one). Ties (the
 * diamond view's two widest corners) resolve to the deepest — the safe one.
 */
function cornerFit(direction: THREE.Vector3, right: THREE.Vector3, margin: number) {
  let halfWidth = 0;
  let nearDepth = -Infinity;
  for (const c of CORNERS) {
    tmpVec.copy(c).sub(BASE_TARGET);
    const r = Math.abs(tmpVec.dot(right));
    const d = tmpVec.dot(direction);
    if (r > halfWidth + 1e-6) {
      halfWidth = r;
      nearDepth = d;
    } else if (r > halfWidth - 1e-6) {
      nearDepth = Math.max(nearDepth, d);
    }
  }
  return { halfWidth: halfWidth + margin, nearDepth };
}

/**
 * Exact portrait framing for one aspect ratio:
 *  1. distance so the widest corners land at NDC ±widthScale (perspective
 *     widens near geometry — each corner uses its own depth);
 *  2. the whole rig slides along the screen-up axis until the view's
 *     vertical contract holds — the lowest corner at its viewport line
 *     (diamond) or the board center at its line (top-down).
 */
function solvePortraitFraming(spec: PortraitSpec, aspect: number, viewId: MobileViewId): Framing {
  const fov = Math.min(spec.fovMax, spec.fov + (1 / aspect - 1) * spec.fovGain);
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const tanH = tanV * aspect;
  const { halfWidth, nearDepth } = cornerFit(spec.direction, spec.right, 0);
  // The fit width divides the scale in, so the widest corners land at
  // NDC ±widthScale — 1.0 puts the board edges exactly against the screen
  // sides, >1 lets them run slightly past (a deliberate closer crop).
  const fitWidth = halfWidth / spec.widthScale;
  // Reference distance at a square aspect keeps the pull-back bounded.
  const baseDistance = nearDepth + fitWidth / Math.tan(THREE.MathUtils.degToRad(spec.fov / 2));
  const distance = THREE.MathUtils.clamp(
    nearDepth + fitWidth / (tanV * aspect),
    baseDistance,
    spec.distanceMax,
  );

  let shift: number;
  if (spec.centerNdcY !== undefined) {
    // Center contract: slide the rig along screen-up until the board CENTER
    // projects exactly onto the contracted viewport line (the offset is
    // orthogonal to the view axis, so the center's depth is the plain
    // view-axis distance).
    shift = -spec.centerNdcY * tanV * distance;
  } else {
    // Corner contract: lowest corner on screen at this distance, then the
    // rig shift that parks it exactly at the contracted viewport height.
    let bottomNdc = Infinity;
    let bottomDepth = distance;
    for (const c of CORNERS) {
      tmpVec.copy(c).sub(BASE_TARGET);
      const depth = distance - tmpVec.dot(spec.direction);
      const ndcY = tmpVec.dot(spec.up) / (tanV * depth);
      if (ndcY < bottomNdc) {
        bottomNdc = ndcY;
        bottomDepth = depth;
      }
    }
    shift = (bottomNdc - (spec.bottomNdcY ?? PORTRAIT_BOTTOM_NDC_Y)) * tanV * bottomDepth;
  }
  const target = BASE_TARGET.clone().addScaledVector(spec.up, shift);
  const position = target.clone().addScaledVector(spec.direction, distance);

  return {
    viewId,
    fov,
    distance,
    position,
    target,
    polarMin: spec.polarMin,
    polarMax: spec.polarMax,
  };
}

function solveLandscapeFraming(aspect: number): Framing {
  if (!Number.isFinite(aspect) || aspect >= LANDSCAPE.fitAspect) {
    return {
      viewId: 'landscape',
      fov: LANDSCAPE.fov,
      distance: LANDSCAPE.baseDistance,
      position: BASE_TARGET.clone().addScaledVector(LANDSCAPE.direction, LANDSCAPE.baseDistance),
      target: BASE_TARGET.clone(),
      polarMin: LANDSCAPE.polarMin,
      polarMax: LANDSCAPE.polarMax,
    };
  }
  const fov = Math.min(LANDSCAPE.fovMax, LANDSCAPE.fov + (LANDSCAPE.fitAspect / aspect - 1) * LANDSCAPE.fovGain);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect;
  const distance = THREE.MathUtils.clamp(
    LANDSCAPE.nearDepth + LANDSCAPE.halfWidth / tanHalf,
    LANDSCAPE.baseDistance,
    LANDSCAPE.distanceMax,
  );
  return {
    viewId: 'landscape',
    fov,
    distance,
    position: BASE_TARGET.clone().addScaledVector(LANDSCAPE.direction, distance),
    target: BASE_TARGET.clone(),
    polarMin: LANDSCAPE.polarMin,
    polarMax: LANDSCAPE.polarMax,
  };
}

function computeFraming(aspect: number, mobileView: MobileViewId): Framing {
  if (aspect >= 1) return solveLandscapeFraming(aspect);
  return solvePortraitFraming(mobileView === 'topdown' ? TOPDOWN : DIAGONAL, aspect, mobileView);
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
  const mobileView = useSettingsStore((s) => s.mobileView);
  const { camera, size } = useThree();
  const fromPos = useRef(new THREE.Vector3());
  const startAt = useRef(0);
  const controls = useRef<OrbitControlsImpl>(null);

  const aspect = size.width / Math.max(1, size.height);
  const fit = useMemo(() => computeFraming(aspect, mobileView), [aspect, mobileView]);

  // Aspect fit — applied before the first paint (so portrait phones never
  // flash a cropped or wrongly angled board), re-applied on every resize /
  // orientation change / view-mode flip. Also re-seats the orbit target.
  useLayoutEffect(() => {
    applyCameraFit(camera, fit.position, fit.fov);
    const c = controls.current;
    if (c) {
      c.target.copy(fit.target);
      c.update();
    }
  }, [camera, fit]);

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
