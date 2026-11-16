import type { Along, AlongMatch, AlongView, GuestId, MatchDef, RankingEntry } from "../shared/types";
import { advanceAuction, auctionView, rankAuction, startAuction } from "./auction";
import { advanceBluff, bluffView, rankBluff, startBluff } from "./bluff";
import { advanceRace, rankRace, startRace, stepView } from "./race";

/**
 * Unmasked guests' play-along. It is a second run of the running match among the unmasked guests only,
 * on a clock of its own, started from the seed the real match started from (so a solo match has the
 * same problems) and never writing to the real match, the real seed or the real deadline.
 */

/**
 * The play-along for a match that is starting: a solo match always has one; an interactive match has
 * a shadow copy only when the unmasked count fits its guest range, else the unmasked guests watch.
 * `seed` is the seed the real match started from; the seed the copy leaves behind is dropped.
 */
export function startAlong(def: MatchDef, role: "dance" | "cellar", unmasked: GuestId[], seed: number, at: number): Along | null {
  if (unmasked.length === 0) return null;
  if (def.type === "race") {
    const steps = def.steps[role];
    return steps === null ? null : { match: startRace(seed, def, unmasked, at, steps)[0], done: false };
  }
  const range = def.guestRange[role];
  if (role !== "dance" || !range || unmasked.length < range[0] || unmasked.length > range[1]) return null;
  return { match: (def.type === "sealedBid" ? startAuction(seed, def, unmasked, at) : startBluff(seed, def, unmasked, at))[0], done: false };
}

/** When the play-along next needs the clock, or null when it has nothing left. */
export const alongDeadline = (along: Along | null): number | null => (along && !along.done ? along.match.deadline : null);

/** Moves the play-along's clock to `at`, its own deadline. */
export function advanceAlong(along: Along, at: number): void {
  const m = along.match;
  const more = m.def.type === "race" ? advanceRace(m as Parameters<typeof advanceRace>[0], at) : m.def.type === "sealedBid" ? advanceAuction(m as Parameters<typeof advanceAuction>[0], at) : advanceBluff(m as Parameters<typeof advanceBluff>[0], at);
  if (!more) along.done = true;
}

function rank(m: AlongMatch): RankingEntry[] {
  return m.def.type === "race" ? rankRace(m as Parameters<typeof rankRace>[0]) : m.def.type === "sealedBid" ? rankAuction(m as Parameters<typeof rankAuction>[0]) : rankBluff(m as Parameters<typeof rankBluff>[0]);
}

/** What an unmasked guest sees of the play-along: everyone's ranking, and only their own step. */
export function alongView(along: Along, guest: GuestId): AlongView {
  const m = along.match;
  const playing = Object.hasOwn(m.points, guest);
  return {
    name: m.def.name,
    done: along.done,
    ranking: rank(m),
    step: playing && m.def.type === "race" ? stepView(m as Parameters<typeof stepView>[0], guest) : null,
    auction: playing && m.def.type === "sealedBid" ? auctionView(m as Parameters<typeof auctionView>[0], guest) : null,
    bluff: playing && m.def.type === "bluff" ? bluffView(m as Parameters<typeof bluffView>[0], guest) : null,
  };
}
