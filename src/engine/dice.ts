import { diceFacesFor, type DiceFaceId } from '@/config/gameConfig';

/** Deterministic, seedable RNG (mulberry32) so games are replayable. */
export function nextRandom(state: number): { value: number; next: number } {
  let t = (state + 0x6d2b79f5) | 0;
  let r = t;
  r = Math.imul(r ^ (r >>> 15), r | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return { value, next: t };
}

/**
 * Rolls one face of the match's die. Standard mode (starMode OFF): the four
 * player colors + WHITE + BLACK (the platform faces). Star Mode: the four
 * colors + two golden STAR wilds. `diceFacesFor` is the single source of the
 * face list — the engine and the 3D die agree on it by construction.
 */
export function rollDieFace(
  rngState: number,
  starMode: boolean,
): { face: DiceFaceId; next: number } {
  const { value, next } = nextRandom(rngState);
  const faces = diceFacesFor(starMode);
  const face = faces[Math.floor(value * faces.length)]!;
  return { face, next };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31) | 0;
}
