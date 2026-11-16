import { describe, expect, it } from "vitest";
import { apply, viewFor } from "../../src/engine/game";
import type { GuestView } from "../../src/shared/types";
import { intoDance, must, playDance, playMatch, started, tickToDeadline } from "./sim";

const mingle = (s: ReturnType<typeof started>, id: string) => viewFor(s, id) as Extract<GuestView, { phase: "mingle" }>;

describe("Gifts", () => {
  it("move whole favours at once in the Mingle, to any other remaining guest", () => {
    const s = must(started(5), { type: "gift", guest: "g0", to: "g1", favours: 4 });
    expect(mingle(s, "g0").favours).toBe(6);
    expect(mingle(s, "g1").favours).toBe(14);
  });

  it("let a guest give away their last favour, leaving them on 0 and still in the game", () => {
    let s = must(started(5), { type: "gift", guest: "g0", to: "g1", favours: 10 });
    expect(mingle(s, "g0").favours).toBe(0);
    expect(apply(s, { type: "gift", guest: "g0", to: "g1", favours: 1 }, 0)).toEqual({ ok: false, reason: "not enough favours" });
    expect(apply(s, { type: "buyPoints", guest: "g0", favours: 1 }, 0).ok).toBe(false);
    s = playDance(s, () => null);
    expect(s.guests.find((g) => g.id === "g0")!.unmaskedIn).toBeUndefined();
  });

  it("are rejected with a reason above the giver's balance, to oneself, to nobody, or for a bad amount", () => {
    const s = started(5);
    const why = (a: { to: string; favours: number }) => apply(s, { type: "gift", guest: "g0", ...a }, 0);
    expect(why({ to: "g1", favours: 11 })).toEqual({ ok: false, reason: "not enough favours" });
    expect(why({ to: "g0", favours: 1 })).toEqual({ ok: false, reason: "can't gift yourself" });
    expect(why({ to: "nobody", favours: 1 })).toEqual({ ok: false, reason: "no such guest" });
    expect(why({ to: "g1", favours: 0 })).toEqual({ ok: false, reason: "bad amount" });
    expect(why({ to: "g1", favours: 1.5 })).toEqual({ ok: false, reason: "bad amount" });
  });

  it("are rejected outside the Mingle", () => {
    const gift = { type: "gift", guest: "g0", to: "g1", favours: 1 } as const;
    expect(apply(intoDance(started(5)), gift, 0)).toEqual({ ok: false, reason: "gifts are given in the Mingle only" });
    const down = playDance(started(5), () => null);
    expect(down.phase).toBe("sentDown");
    expect(apply(down, gift, 0)).toEqual({ ok: false, reason: "gifts are given in the Mingle only" });
  });

  it("can't go to an unmasked guest", () => {
    let s = started(5);
    while (s.phase !== "mingle" || s.round !== 2) s = s.phase === "dance" || s.phase === "cellar" ? playMatch(s, () => null) : tickToDeadline(s);
    const gone = s.guests.find((g) => g.unmaskedIn !== undefined);
    if (!gone) return;
    expect(apply(s, { type: "gift", guest: "g0", to: gone.id, favours: 1 }, 0).ok).toBe(false);
  });

  it("show only to the giver and the receiver", () => {
    const s = must(started(5), { type: "gift", guest: "g0", to: "g1", favours: 3 });
    expect(mingle(s, "g0").gifts).toEqual([{ from: "g0", to: "g1", favours: 3 }]);
    expect(mingle(s, "g1").gifts).toEqual([{ from: "g0", to: "g1", favours: 3 }]);
    for (const other of ["g2", "g3", "g4"]) expect(mingle(s, other)).toEqual(mingle(started(5), other));
  });

  it("leave the standings at the totals as they stood at the Mingle's start", () => {
    const s = must(started(5), { type: "gift", guest: "g0", to: "g1", favours: 3 });
    expect(mingle(s, "g2").standings).toEqual({ g0: 10, g1: 10, g2: 10, g3: 10, g4: 10 });
    expect(mingle(s, "g0").standings).toEqual(mingle(s, "g2").standings);
  });
});

describe("Totals", () => {
  it("are announced after every Dance and every Cellar game, with the gifts in them", () => {
    let s = must(started(5), { type: "gift", guest: "g0", to: "g1", favours: 3 });
    s = playDance(s, () => null);
    const v = viewFor(s, "g4") as Extract<GuestView, { phase: "sentDown" }>;
    expect(v.favours.g1! - v.payout.g1!).toBe(13);
    while (s.phase !== "unmasking") s = tickToDeadline(s);
    expect(Object.keys((viewFor(s, "g4") as Extract<GuestView, { phase: "unmasking" }>).favours).length).toBeGreaterThan(0);
  });

  it("show the next Mingle's standings as they stood when it began", () => {
    let s = must(started(5), { type: "gift", guest: "g0", to: "g1", favours: 10 });
    while (!(s.phase === "mingle" && s.round === 2)) s = s.phase === "dance" || s.phase === "cellar" ? playMatch(s, () => null) : tickToDeadline(s);
    const v = mingle(s, "g2");
    expect(v.standings).toEqual(Object.fromEntries(s.guests.filter((g) => g.unmaskedIn === undefined).map((g) => [g.id, g.favours])));
    expect(v.gifts).toEqual([]);
  });
});
