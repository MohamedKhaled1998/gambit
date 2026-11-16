/** mulberry32; returns the draw in [0, 1) and the advanced seed. */
export function draw(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** A whole number in [lo, hi]. */
export function drawInt(seed: number, lo: number, hi: number): [number, number] {
  const [r, next] = draw(seed);
  return [lo + Math.floor(r * (hi - lo + 1)), next];
}

/** Fisher-Yates over a copy. */
export function shuffle<T>(seed: number, items: readonly T[]): [T[], number] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    let j: number;
    [j, seed] = drawInt(seed, 0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return [out, seed];
}
