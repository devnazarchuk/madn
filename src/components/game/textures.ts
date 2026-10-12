import * as THREE from 'three';
import { BOARD_SKINS, type BoardSkinId } from '@/config/theme';

/**
 * ============================================================================
 * PROCEDURAL HIGH-QUALITY TEXTURES (canvas-based, zero external assets)
 * ============================================================================
 * Wood grain for the board foundation, a fine linen weave for the playing
 * surface, felt for the table — all drawn deterministically (seeded PRNG, so
 * every device renders the identical texture) and cached by key+resolution.
 * `sharp` selects 1024² (high) vs 256² (low) so weak devices can opt out.
 *
 * The same canvas texture doubles as a bump map (luminance → height) for a
 * tactile, premium feel at no extra memory.
 */

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

/** Tiny seeded PRNG (mulberry32) — stable across reloads/devices. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mix a hex color toward white (t=0 → original, t=1 → white). */
function towardWhite(hex: string, t: number): string {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color('#FFFFFF'), t);
  return `#${c.getHexString()}`;
}

/** Mix a hex color toward black. */
function towardBlack(hex: string, t: number): string {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color('#000000'), t);
  return `#${c.getHexString()}`;
}

// ---------------------------------------------------------------------------
// Cache + factory
// ---------------------------------------------------------------------------

const cache = new Map<string, THREE.Texture>();

function cachedCanvasTexture(
  key: string,
  size: number,
  repeat: number,
  draw: (ctx: CanvasRenderingContext2D, size: number, rnd: () => number) => void,
): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for procedural textures');
  draw(ctx, size, mulberry32(hashString(key)));
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Wood grain — layered wavy streaks + subtle rings
// ---------------------------------------------------------------------------

function drawWoodGrain(
  base: string,
  deep: string,
): (ctx: CanvasRenderingContext2D, size: number, rnd: () => number) => void {
  return (ctx, size, rnd) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    // Long wavy grain streaks (alternating light/dark, low alpha).
    const streaks = Math.max(24, Math.floor(size / 12));
    for (let i = 0; i < streaks; i++) {
      const y = rnd() * size;
      const light = rnd() > 0.45;
      const alpha = 0.035 + rnd() * 0.085;
      ctx.strokeStyle = light
        ? `rgba(255, 238, 205, ${alpha})`
        : hexAlpha(deep, alpha);
      ctx.lineWidth = 0.8 + rnd() * 2.2;
      ctx.beginPath();
      let x = -size * 0.05;
      ctx.moveTo(x, y);
      const segs = 6;
      for (let s = 1; s <= segs; s++) {
        const nx = (s / segs) * size * 1.1 - size * 0.05;
        const ny = y + (rnd() - 0.5) * size * 0.035;
        ctx.quadraticCurveTo(
          (x + nx) / 2,
          y + (rnd() - 0.5) * size * 0.05,
          nx,
          ny,
        );
        x = nx;
      }
      ctx.stroke();
    }

    // Subtle growth rings on a couple of plank knots.
    const knots = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < knots; k++) {
      const kx = rnd() * size;
      const ky = rnd() * size;
      const rings = 3 + Math.floor(rnd() * 3);
      for (let r = 1; r <= rings; r++) {
        ctx.strokeStyle = hexAlpha(deep, 0.05 + 0.03 * (rings - r));
        ctx.lineWidth = 1 + rnd();
        ctx.beginPath();
        ctx.ellipse(kx, ky, r * size * 0.012, r * size * 0.008, rnd() * Math.PI, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Fine speckle for tooth.
    const specks = Math.floor(size * size * 0.0008);
    for (let i = 0; i < specks; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,246,225,0.05)' : 'rgba(20,12,6,0.05)';
      ctx.fillRect(rnd() * size, rnd() * size, 1.5, 1.5);
    }
  };
}

/** rgba() string from a hex + alpha. */
function hexAlpha(hex: string, alpha: number): string {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${alpha})`;
}

// ---------------------------------------------------------------------------
// Linen weave — the playing surface fabric
// ---------------------------------------------------------------------------

function drawLinenWeave(
  base: string,
  deep: string,
): (ctx: CanvasRenderingContext2D, size: number, rnd: () => number) => void {
  return (ctx, size, rnd) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    // Woven threads: alternating over/under blocks with a slight slub.
    const thread = Math.max(4, Math.floor(size / 64));
    const cols = Math.ceil(size / thread);
    for (let y = 0; y < cols; y++) {
      for (let x = 0; x < cols; x++) {
        const over = (x + y) % 2 === 0;
        ctx.fillStyle = over
          ? hexAlpha(towardWhite(base, 0.5), 0.1 + rnd() * 0.05)
          : hexAlpha(deep, 0.08 + rnd() * 0.05);
        ctx.fillRect(x * thread, y * thread, thread, thread);
      }
    }

    // Horizontal & vertical thread highlights (stitched edges).
    ctx.strokeStyle = hexAlpha(towardWhite(base, 0.65), 0.22);
    ctx.lineWidth = 1;
    for (let x = 0; x <= cols; x++) {
      ctx.beginPath();
      ctx.moveTo(x * thread + 0.5, 0);
      ctx.lineTo(x * thread + 0.5, size);
      ctx.stroke();
    }
    for (let y = 0; y <= cols; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * thread + 0.5);
      ctx.lineTo(size, y * thread + 0.5);
      ctx.stroke();
    }

    // Soft fiber noise.
    const fibers = Math.floor(size * size * 0.0012);
    for (let i = 0; i < fibers; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,250,235,0.06)' : 'rgba(90,70,45,0.05)';
      const fx = rnd() * size;
      const fy = rnd() * size;
      ctx.fillRect(fx, fy, 1 + rnd() * 2, 1);
    }
  };
}

// ---------------------------------------------------------------------------
// Felt — the table floor (theme-tinted)
// ---------------------------------------------------------------------------

function drawFelt(
  base: string,
): (ctx: CanvasRenderingContext2D, size: number, rnd: () => number) => void {
  return (ctx, size, rnd) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    // Dense micro-noise = felted fibers.
    const dots = Math.floor(size * size * 0.02);
    for (let i = 0; i < dots; i++) {
      const light = rnd() > 0.5;
      ctx.fillStyle = light
        ? hexAlpha(towardWhite(base, 0.4), 0.05 + rnd() * 0.06)
        : hexAlpha(towardBlack(base, 0.35), 0.05 + rnd() * 0.06);
      ctx.fillRect(rnd() * size, rnd() * size, 1.6, 1.6);
    }
  };
}

// ---------------------------------------------------------------------------
// Public API (all cached; resolution follows the sharpTextures toggle)
// ---------------------------------------------------------------------------

const RES = { sharp: 1024, soft: 256 } as const;

/** Wood grain for the board foundation, per skin. */
export function woodTexture(skin: BoardSkinId, sharp: boolean): THREE.Texture {
  const { foundation, foundationDeep } = BOARD_SKINS[skin];
  return cachedCanvasTexture(
    `wood:${skin}:${sharp ? 'hi' : 'lo'}`,
    sharp ? RES.sharp : RES.soft,
    2,
    drawWoodGrain(foundation, foundationDeep),
  );
}

/** Fine linen weave for the cream playing surface, per skin. */
export function linenTexture(skin: BoardSkinId, sharp: boolean): THREE.Texture {
  const { surface, surfaceDeep } = BOARD_SKINS[skin];
  return cachedCanvasTexture(
    `linen:${skin}:${sharp ? 'hi' : 'lo'}`,
    sharp ? RES.sharp : RES.soft,
    7,
    drawLinenWeave(surface, surfaceDeep),
  );
}

/** Felt floor in a theme color. */
export function feltTexture(color: string, sharp: boolean): THREE.Texture {
  return cachedCanvasTexture(
    `felt:${color}:${sharp ? 'hi' : 'lo'}`,
    sharp ? RES.sharp : RES.soft,
    5,
    drawFelt(color),
  );
}

/** Soft round sprite for weather particles. */
export function softDotSprite(): THREE.Texture {
  return cachedCanvasTexture('sprite:soft-dot', 64, 1, (ctx, size) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}
