import type { MatchDef } from "../shared/types";
import { drawInt } from "./random";

/** One draw already made this game. */
export interface Drawn {
  round: number;
  role: "dance" | "cellar";
  id: string;
}

export interface DrawnMatch {
  match: MatchDef;
  /** Drawn a second time this game: fresh problems, no Prelude. */
  encore: boolean;
  seed: number;
}

/**
 * The full draw rule. From the matches fitting the role and guest count, never the
 * round's own or the previous round's: pick at random from the first non-empty level of
 * (1) not yet drawn this game, (2) not yet drawn in this role, (3) drawn longest ago.
 * A match marked `oncePerGame` is never drawn twice.
 *
 * With a small library those limits can leave nothing. Rather than stall the clock,
 * the previous round's limit is lifted first, then every limit but the guest count.
 */
export function drawMatch(input: { library: readonly MatchDef[]; role: "dance" | "cellar"; count: number; round: number; history: readonly Drawn[]; seed: number }): DrawnMatch | null {
  const { library, role, count, round, history } = input;
  const fits = library.filter((m) => {
    const range = m.guestRange[role];
    return !!range && count >= range[0] && count <= range[1] && !(m.oncePerGame && history.some((h) => h.id === m.id));
  });
  const recent = (lastRound: number) => new Set(history.filter((h) => h.round >= lastRound).map((h) => h.id));
  const attempts = [recent(round - 1), recent(round), new Set<string>()];
  for (const barred of attempts) {
    const pool = fits.filter((m) => !barred.has(m.id));
    const level =
      [pool.filter((m) => !history.some((h) => h.id === m.id)), pool.filter((m) => !history.some((h) => h.id === m.id && h.role === role))].find((l) => l.length > 0) ??
      longestAgo(pool, history);
    if (level.length === 0) continue;
    const [i, seed] = drawInt(input.seed, 0, level.length - 1);
    const match = level[i]!;
    return { match, encore: history.some((h) => h.id === match.id), seed };
  }
  return null;
}

/** The matches whose latest draw is the earliest (history is in draw order). */
function longestAgo(pool: MatchDef[], history: readonly Drawn[]): MatchDef[] {
  if (pool.length === 0) return [];
  const last = (m: MatchDef) => history.map((h) => h.id).lastIndexOf(m.id);
  const oldest = Math.min(...pool.map(last));
  return pool.filter((m) => last(m) === oldest);
}
