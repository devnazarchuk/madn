/**
 * One-off search: finds the optimal 4-color track pattern for the 40-field loop.
 * Family: four 10-field segments (owners blue,yellow,red,green in loop order);
 * per segment positions {0,4,8}=owner, {1,5,9}=P, {2,6}=Q, {3,7}=R where
 * {P,Q,R} are the other three colors.
 * Constraints: no adjacent duplicates (P_k != next owner), each color exactly
 * 10 fields (=> each color is P in exactly one segment).
 * Objective: minimize the maximum circular gap between consecutive occurrences
 * of the same color (i.e. the longest possible "move to next field of color").
 */
const SEG_OWNERS = ['blue', 'yellow', 'red', 'green'] as const;
const COLORS = ['red', 'blue', 'green', 'yellow'] as const;
type Color = (typeof COLORS)[number];

function build(pattern: Color[][]): Color[] {
  // Each segment template [O, P, Q, R] fills the 10 slots as
  // [O,P,Q,R, O,P,Q,R, O,P] (positions 0..9).
  const track: Color[] = [];
  for (const [o, p, q, r] of pattern) {
    track.push(o, p, q, r, o, p, q, r, o, p);
  }
  return track;
}

function gapsOf(track: Color[]): number[] {
  const gaps: number[] = [];
  for (const c of COLORS) {
    const positions: number[] = [];
    for (let i = 0; i < 40; i++) if (track[i] === c) positions.push(i);
    for (let j = 0; j < positions.length; j++) {
      gaps.push(
        ((positions[(j + 1) % positions.length]! - positions[j]! + 40) % 40) || 40,
      );
    }
  }
  return gaps;
}

function valid(pattern: Color[][]): boolean {
  // P must not equal the next segment's owner (seam adjacency).
  for (let k = 0; k < 4; k++) {
    const next = SEG_OWNERS[(k + 1) % 4] as Color;
    if (pattern[k]![1] === next) return false;
  }
  // Balance: every color exactly 10 times.
  const counts: Record<string, number> = {};
  for (const c of build(pattern)) counts[c] = (counts[c] ?? 0) + 1;
  return COLORS.every((c) => counts[c] === 10);
}

let best: { track: Color[]; maxGap: number; sumSq: number } | null = null;

// Enumerate all per-segment (P,Q,R) permutations of the other three colors.
function permsOfThree(rest: Color[]): Color[][] {
  const out: Color[][] = [];
  const [a, b, c] = rest;
  out.push([a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]);
  return out;
}

const perSegOptions: Color[][][] = SEG_OWNERS.map((owner) =>
  permsOfThree(COLORS.filter((c) => c !== owner)),
);

for (const s0 of perSegOptions[0]!) {
  for (const s1 of perSegOptions[1]!) {
    for (const s2 of perSegOptions[2]!) {
      for (const s3 of perSegOptions[3]!) {
        // Positions {1,5,9} = P -> index 1 of each option triple.
        const pattern = [
          [SEG_OWNERS[0], ...s0],
          [SEG_OWNERS[1], ...s1],
          [SEG_OWNERS[2], ...s2],
          [SEG_OWNERS[3], ...s3],
        ];
        if (!valid(pattern)) continue;
        const track = build(pattern);
        // no adjacent duplicates overall
        let adjOk = true;
        for (let i = 0; i < 40; i++) {
          if (track[i] === track[(i + 1) % 40]) adjOk = false;
        }
        if (!adjOk) continue;
        const gaps = gapsOf(track);
        const maxGap = Math.max(...gaps);
        const sumSq = gaps.reduce((acc, g) => acc + g * g, 0);
        if (!best || maxGap < best.maxGap || (maxGap === best.maxGap && sumSq < best.sumSq)) {
          best = { track, maxGap, sumSq };
        }
      }
    }
  }
}

if (best) {
  const counts: Record<string, number> = {};
  for (const c of best.track) counts[c] = (counts[c] ?? 0) + 1;
  console.log('max gap:', best.maxGap, '· sum of squared gaps:', best.sumSq);
  console.log('counts:', counts);
  for (let seg = 0; seg < 4; seg++) {
    console.log(`seg ${seg} (${SEG_OWNERS[seg]}):`, best.track.slice(seg * 10, seg * 10 + 10).join(', '));
  }
  // distance profile: for every (position,color) how far to next occurrence
  const distProfile: Record<number, number> = {};
  for (let i = 0; i < 40; i++) {
    for (const c of COLORS) {
      let d = 0;
      for (let ahead = 1; ahead <= 40; ahead++) {
        if (best.track[(i + ahead) % 40] === c) { d = ahead; break; }
      }
      distProfile[d] = (distProfile[d] ?? 0) + 1;
    }
  }
  console.log('distance profile (distance -> count of (pos,color) pairs):', distProfile);
} else {
  console.log('no valid pattern found');
}
