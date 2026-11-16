import { describe, expect, it, vi } from "vitest";

// Interactive Dances: Gilded Auction and Liar's Toast, both for 3-10 guests; The Procession as every Cellar game.
vi.mock("../../src/content/library", async () => {
  const { GILDED_AUCTION } = await import("../../src/content/gilded-auction");
  const { LIARS_TOAST } = await import("../../src/content/liars-toast");
  const { THE_PROCESSION } = await import("../../src/content/the-procession");
  return { LIBRARY: [GILDED_AUCTION, LIARS_TOAST, THE_PROCESSION] };
});
import { apply, viewFor } from "../../src/engine/game";
import type { GameState, GuestId, GuestView } from "../../src/shared/types";
import { intoMatch, mixedPlayer, must, playMatch, started, tickToDeadline } from "./sim";

type V<P extends GuestView["phase"]> = Extract<GuestView, { phase: P }>;
const remaining = (s: GameState) => s.guests.filter((g) => g.unmaskedIn === undefined).map((g) => g.id);
const unmasked = (s: GameState) => s.guests.filter((g) => g.unmaskedIn !== undefined).map((g) => g.id);

function roundTwoDance(n: number, seed: number): GameState {
  let s = started(n, seed);
  while (!(s.phase === "mingle" && s.round === 2)) s = s.phase === "dance" || s.phase === "cellar" ? playMatch(s, mixedPlayer) : tickToDeadline(s);
  return intoMatch(tickToDeadline(s));
}

/** A seed whose round 2 Dance is the given match. */
function withDance(n: number, id: string): GameState {
  for (let seed = 1; seed < 40; seed++) {
    const s = roundTwoDance(n, seed);
    if (s.danceDef!.id === id) return s;
  }
  throw new Error(`no seed plays ${id} in round 2`);
}

describe("a shadow copy of an interactive Dance", () => {
  it("plays among the unmasked guests alone when their number fits the match's range", () => {
    let s = withDance(10, "gilded-auction");
    expect(unmasked(s)).toHaveLength(3);
    const [a, b, c] = unmasked(s) as [GuestId, GuestId, GuestId];
    const view = (viewFor(s, a) as V<"dance">).along!;
    expect(view.auction).not.toBeNull();
    expect(view.ranking.map((r) => r.guest).sort()).toEqual([a, b, c].sort());
    s = must(s, { type: "bid", guest: a, amount: 5 }, s.along!.match.stepStartedAt + 1);
    expect((viewFor(s, b) as V<"dance">).along!.auction!.yourBid).toBeNull();
    expect(s.auction!.bids).toEqual({});
  });

  it("plays a shadow Liar's Toast with cards of its own, hiding each unmasked guest's card from the others", () => {
    let s = withDance(10, "liars-toast");
    const [a, b] = unmasked(s) as [GuestId, GuestId];
    const t = s.along!.match.stepStartedAt + 1;
    s = must(s, { type: "claim", guest: a, value: 3 }, t);
    const va = (viewFor(s, a) as V<"dance">).along!.bluff!;
    const vb = (viewFor(s, b) as V<"dance">).along!.bluff!;
    expect(va.yourClaim).toBe(3);
    expect(vb.yourClaim).toBeNull();
    expect(s.bluff!.claims).toEqual({});
  });

  it("lets unmasked guests watch when their number doesn't fit the match's range", () => {
    // Seven guests unmask two in round 1: two unmasked guests, and the match wants at least three.
    const s = withDance(7, "gilded-auction");
    expect(unmasked(s)).toHaveLength(2);
    const [a] = unmasked(s) as [GuestId];
    const v = viewFor(s, a) as V<"dance">;
    expect(v.along).toBeNull();
    expect(v.auction).toBeNull();
    expect(apply(s, { type: "bid", guest: a, amount: 1 }, s.deadline! - 1)).toEqual({ ok: false, reason: "not playing in this match" });
    expect(s.along).toBeNull();
  });

  it("leaves the real Dance's state and views as they would be if the unmasked guests only watched", () => {
    const s = withDance(10, "gilded-auction");
    const run = (act: boolean) => {
      let x = s;
      while (x.phase === "dance") {
        const a = x.auction!;
        if (act && x.along && !x.along.done) for (const g of unmasked(x)) { const r = apply(x, { type: "bid", guest: g, amount: 4 }, a.stepStartedAt + 500); if (r.ok) x = r.state; }
        for (const g of remaining(x)) { const r = apply(x, { type: "bid", guest: g, amount: 2 }, a.stepStartedAt + 1000); if (r.ok) x = r.state; }
        x = tickToDeadline(x);
      }
      return x;
    };
    const quiet = run(false);
    const loud = run(true);
    expect({ ...loud, along: null }).toEqual({ ...quiet, along: null });
    for (const g of remaining(s)) expect(viewFor(loud, g)).toEqual(viewFor(quiet, g));
  });
});
