import { DICE_FACES, type DiceFaceId } from '@/config/gameConfig';

/** Deterministic, seedable RNG (mulberry32) so games are replayable. */
export function nextRandom(state: number): { value: number; next: number } {
  let t = (state + 0x6d2b79f5) | 0;
  let r = t;
  r = Math.imul(r ^ (r >>> 15), r | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return { value, next: t };
}

export function rollDieFace(rngState: number): { face: DiceFaceId; next: number } {
  const { value, next } = nextRandom(rngState);
  const face = DICE_FACES[Math.floor(value * DICE_FACES.length)]!;
  return { face, next };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31) | 0;
}
