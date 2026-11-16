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

/** Which guest counts the library can play: the Dance for `dance`, the Cellar game for `cellar`. */
export interface Playable {
  dance(guests: number): boolean;
  cellar(guests: number): boolean;
}

/**
 * Whether a round that unmasks `count` leaves the whole game playable: the round's own Cellar game,
 * then every later round on the Unmasking schedule, which recomputes from whoever remains.
 */
export function playableCount(input: { remaining: number; rounds: number; count: number }, can: Playable): boolean {
  const { remaining, rounds, count } = input;
  if (count < 0 || count > remaining - 2) return false;
  if (!can.cellar(cellarSize(remaining, count))) return false;
  let left = remaining - count;
  for (let r = rounds - 1; r >= 1; r--) {
    if (!can.dance(left)) return false;
    const k = unmaskingsFor({ remaining: left, unmaskings: left - 2, rounds: r });
    if (!can.cellar(cellarSize(left, k))) return false;
    left -= k;
  }
  return true;
}

/**
 * The two counts of an Unmasking vote: Mercy the lower, Greed one more. The lower count k is the
 * remaining unmaskings ÷ the remaining rounds, rounded down. If k + 1 would leave a later round
 * unplayable the ballot shifts down one (k − 1, k); null when neither pair is playable, so the round holds no vote.
 * `rounds` counts the coming round.
 */
export function voteCounts(input: { remaining: number; rounds: number }, can: Playable): { mercy: number; greed: number } | null {
  const k = Math.floor((input.remaining - 2) / input.rounds);
  for (const mercy of [k, k - 1]) {
    if (mercy < 0) continue;
    if ([mercy, mercy + 1].every((count) => playableCount({ ...input, count }, can))) return { mercy, greed: mercy + 1 };
  }
  return null;
}

/** The vote's chance in a round: (remaining guests − 2) ÷ 8. */
export const voteChance = (remaining: number): number => (remaining - 2) / 8;
