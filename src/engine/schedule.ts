/** The Unmasking schedule: pure, recomputed after every round, never shown to guests. */

/**
 * How many guests the coming round unmasks. `unmaskings` is how many are still to
 * come over all remaining rounds (remaining − 2 with no leaving or vote); `rounds`
 * counts the coming round. Fewer unmaskings than rounds makes a warm-up round (0);
 * otherwise the rest are spread evenly, rounded up. The last round takes all that remain.
 */
export function unmaskingsFor(input: { remaining: number; unmaskings: number; rounds: number }): number {
  const { remaining, unmaskings, rounds } = input;
  const left = Math.min(unmaskings, remaining - 2);
  if (left < rounds) return 0;
  return Math.ceil(left / rounds);
}

/** Cellar size = max(⌈remaining ÷ 2⌉, unmaskings + 1). */
export function cellarSize(remaining: number, unmaskings: number): number {
  return Math.max(Math.ceil(remaining / 2), unmaskings + 1);
}
