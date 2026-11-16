import { describe, expect, it } from "vitest";
import { LIBRARY } from "../../src/content/library";
import { apply, nextDeadline, viewFor } from "../../src/engine/game";
import { MINGLE_MS, OVERTURE_MS, PRELUDE_GUESTS, SENT_DOWN_LINES_MS, SENT_DOWN_MS, type GameState, type GuestView, type MatchDef } from "../../src/shared/types";
import { mixedPlayer, must, playMatch, started, tickToDeadline } from "./sim";

const length = (m: MatchDef) => m.prelude.reduce((t, b) => t + b.seconds, 0) * 1000;
const view = (s: GameState, id: string) => viewFor(s, id) as Exclude<GuestView, { phase: "foyer" }>;

/** A game at the first moment of round 1's Dance slot. */
function atDance(n = 5, seed = 7): GameState {
  const s = started(n, seed, 0);
  return must(s, { type: "tick" }, s.deadline!);
}

/** Plays on to the sent-down screen of round 1, then returns it. */
function atSentDown(n = 5, seed = 7): GameState {
  let s = atDance(n, seed);
  while (s.phase === "dance") s = tickToDeadline(s);
  return s;
}

describe("the Overture and the Narrator's first-time lines", () => {
  it("plays the Overture as the doors close, then the Mingle's first-time line, and the Mingle keeps its four minutes", () => {
    const s = started(5, 7, 1000);
    const v = view(s, "g0");
    expect(v.phase === "mingle" && v.overtureUntil).toBe(1000 + OVERTURE_MS);
    expect(s.deadline).toBe(1000 + OVERTURE_MS + MINGLE_MS);
    expect(v.narrator).toMatchObject({ id: "mingle", first: true, startedAt: 1000 + OVERTURE_MS });
  });

  it("tells the Dance line in full the first time, then only a short announcement", () => {
    const first = atDance();
    expect(view(first, "g1").narrator).toMatchObject({ id: "dance", first: true });
    let s = first;
    while (s.phase !== "mingle") s = tickToDeadline(s);
    const mingle2 = view(s, "g1");
    expect(mingle2.narrator).toMatchObject({ id: "mingle", first: false });
    expect(mingle2.narrator!.seconds).toBeLessThan(10_000);
    expect(mingle2.phase === "mingle" && mingle2.overtureUntil).toBeNull();
    while (s.phase !== "dance") s = tickToDeadline(s);
    expect(view(s, "g1").narrator).toMatchObject({ id: "dance", first: false });
  });

  it("never names a guest in a line", () => {
    const s = atSentDown();
    for (const g of s.guests) {
      const text = view(s, g.id).narrator?.text ?? "";
      for (const other of s.guests) expect(text).not.toContain(other.name);
    }
  });

  it("plays the sent-down and Cellar line only on the phones of the guests sent down", () => {
    const s = atSentDown();
    const down = s.cellar!.guests;
    expect(down.length).toBeLessThan(s.guests.length);
    for (const g of s.guests) {
      const n = view(s, g.id).narrator;
      if (down.includes(g.id)) expect(n).toMatchObject({ id: "sentDown", first: true, seconds: expect.any(Number) });
      else expect(n).toBeNull();
    }
    expect(view(s, down[0]!).narrator!.seconds).toBeLessThanOrEqual(25_000);
  });

  it("plays the unmasking line only to the newly unmasked, once, then a short announcement", () => {
    let s = atSentDown();
    while (s.phase !== "unmasking") s = tickToDeadline(s);
    const out = s.cellar!.unmasked;
    for (const g of s.guests) {
      const n = view(s, g.id).narrator;
      if (out.includes(g.id)) expect(n).toMatchObject({ id: "unmasking", first: true });
      else expect(n).toBeNull();
    }
  });

  it("tells each line once per game", () => {
    let s = started(5, 7, 0);
    const told: string[] = [];
    while (s.phase !== "lastDance") {
      const n = s.narration;
      if (n?.first) told.push(n.id);
      s = tickToDeadline(s);
    }
    expect(new Set(told).size).toBe(told.length);
    expect(s.narration).toMatchObject({ id: "lastDance", first: true });
    expect(told).toEqual(expect.arrayContaining(["mingle", "dance", "sentDown", "unmasking"]));
  });
});

describe("the Prelude before a Dance", () => {
  it("starts after round 1's Dance line and holds the match until the script is over", () => {
    const s = atDance();
    const def = s.danceDef!;
    const line = s.narration!.seconds;
    expect(s.match ?? s.auction ?? s.bluff).toBeNull();
    expect(s.prelude).toMatchObject({ kind: "dance", startsAt: s.narration!.startedAt + line, skipped: [] });
    expect(s.prelude!.endsAt - s.prelude!.startsAt).toBe(length(def));
    expect(nextDeadline(s)).toBe(s.prelude!.endsAt);
    const v = view(s, "g0");
    expect(v.prelude).toEqual({ startsAt: s.prelude!.startsAt, endsAt: s.prelude!.endsAt, skipped: false });
    const playing = tickToDeadline(s);
    expect(playing.phase).toBe("dance");
    expect(playing.prelude).toBeNull();
    expect(playing.match ?? playing.auction ?? playing.bluff).not.toBeNull();
    expect((playing.match ?? playing.auction ?? playing.bluff)!.stepStartedAt).toBe(s.prelude!.endsAt);
    expect(view(playing, "g0").prelude).toBeNull();
  });

  it("is the same script on every phone, in sync by the game's clock", () => {
    const s = atDance();
    const a = view(s, "g0");
    const b = view(s, "g3");
    if (a.phase !== "dance" || b.phase !== "dance") throw new Error("expected the Dance");
    expect(a.prelude!.startsAt).toBe(b.prelude!.startsAt);
    expect(a.announcement.prelude).toEqual(b.announcement.prelude);
    expect(a.announcement.prelude).toEqual(s.danceDef!.prelude);
  });

  it("doesn't take answers while the Prelude plays", () => {
    const s = atDance();
    expect(apply(s, { type: "answer", guest: "g0", position: 0 }, s.prelude!.startsAt + 1).ok).toBe(false);
  });

  it("starts the match early once every guest in it has skipped, and not before", () => {
    let s = atDance();
    const at = s.prelude!.startsAt + 3000;
    const ids = s.guests.map((g) => g.id);
    for (const id of ids.slice(0, -1)) {
      s = must(s, { type: "skipPrelude", guest: id }, at);
      expect(s.prelude).not.toBeNull();
    }
    expect(view(s, ids[0]!).prelude!.skipped).toBe(true);
    expect(view(s, ids.at(-1)!).prelude!.skipped).toBe(false);
    s = must(s, { type: "skipPrelude", guest: ids.at(-1)! }, at);
    expect(s.prelude).toBeNull();
    const m = (s.match ?? s.auction ?? s.bluff)!;
    expect(m.stepStartedAt).toBe(at);
    expect(nextDeadline(s)).toBe(m.deadline);
  });

  it("rejects a second skip, and a skip when no Prelude is playing", () => {
    let s = atDance();
    const at = s.prelude!.startsAt + 1000;
    s = must(s, { type: "skipPrelude", guest: "g1" }, at);
    expect(apply(s, { type: "skipPrelude", guest: "g1" }, at)).toEqual({ ok: false, reason: "already skipped" });
    expect(apply(s, { type: "skipPrelude", guest: "nobody" }, at)).toEqual({ ok: false, reason: "no such guest" });
    expect(apply(started(5, 7, 0), { type: "skipPrelude", guest: "g1" }, 5)).toEqual({ ok: false, reason: "no Prelude is playing" });
    // Not before the Prelude begins (the Narrator is speaking).
    expect(apply(atDance(), { type: "skipPrelude", guest: "g1" }, 0).ok).toBe(false);
  });

  it("keeps guests who skip on the clock: the match still starts when the script ends", () => {
    let s = atDance();
    s = must(s, { type: "skipPrelude", guest: "g0" }, s.prelude!.startsAt + 1);
    const end = s.prelude!.endsAt;
    s = must(s, { type: "tick" }, end);
    expect(s.prelude).toBeNull();
    expect((s.match ?? s.auction ?? s.bluff)!.stepStartedAt).toBe(end);
  });

  it("plays a whole game through with Preludes and still ends in strict rankings", () => {
    let s = atDance();
    s = playMatch(tickToDeadline(s), mixedPlayer);
    expect(s.phase).toBe("sentDown");
    expect(new Set(s.danceResult!.ranking.map((r) => r.guest)).size).toBe(5);
  });
});

describe("the Prelude before a Cellar game", () => {
  it("plays in the second half of the sent-down reveal, which runs on for a longer script", () => {
    const s = atSentDown();
    const opened = s.narration!.startedAt;
    const def = s.cellar!.def;
    expect(s.prelude).toMatchObject({ kind: "cellar", startsAt: opened + SENT_DOWN_LINES_MS });
    expect(s.prelude!.endsAt - s.prelude!.startsAt).toBe(length(def));
    expect(s.deadline).toBe(opened + SENT_DOWN_LINES_MS + Math.max(SENT_DOWN_MS - SENT_DOWN_LINES_MS, length(def)));
  });

  it("starts the Cellar game early once every guest sent down has skipped; free guests don't count", () => {
    let s = atSentDown();
    const down = s.cellar!.guests;
    const free = s.guests.filter((g) => !down.includes(g.id)).map((g) => g.id);
    const at = s.prelude!.startsAt + 2000;
    s = must(s, { type: "skipPrelude", guest: free[0]! }, at);
    for (const id of down.slice(0, -1)) s = must(s, { type: "skipPrelude", guest: id }, at);
    expect(s.phase).toBe("sentDown");
    s = must(s, { type: "skipPrelude", guest: down.at(-1)! }, at);
    expect(s.phase).toBe("cellar");
    expect(s.cellar!.race!.stepStartedAt).toBe(at);
    expect(s.prelude).toBeNull();
  });

  it("can't be skipped during the Narrator's lines", () => {
    const s = atSentDown();
    const r = apply(s, { type: "skipPrelude", guest: s.cellar!.guests[0]! }, s.prelude!.startsAt - 1);
    expect(r).toEqual({ ok: false, reason: "no Prelude is playing" });
  });
});

describe("the Prelude before the Last Dance's match", () => {
  function atLastDance(): GameState {
    let s = started(4, 11, 0);
    while (s.phase !== "lastDance") s = tickToDeadline(s);
    return s;
  }
  it("follows the Narrator's line, and the finalists' skips start the match early", () => {
    let s = atLastDance();
    const ld = s.lastDance!;
    expect(s.narration).toMatchObject({ id: "lastDance", first: true });
    if (ld.encore) {
      expect(s.prelude).toBeNull();
      return;
    }
    expect(s.prelude).toMatchObject({ kind: "lastDance" });
    const at = s.prelude!.startsAt + 1000;
    s = must(s, { type: "skipPrelude", guest: ld.finalists[0]! }, at);
    expect(s.lastDance!.stage).toBe("intro");
    s = must(s, { type: "skipPrelude", guest: ld.finalists[1]! }, at);
    expect(s.lastDance!.stage).toBe("match");
    expect(s.lastDance!.race!.stepStartedAt).toBe(at);
  });
});

describe("Encores", () => {
  it("skip the Prelude, start the match at once and keep the Rules card in the view", () => {
    const base = atDance();
    // Make this Dance an Encore of the same match: no Prelude plays, the script stays for the rules button.
    const s0 = started(5, 7, 0);
    const encore: GameState = { ...s0, danceEncore: true };
    // The Dance's first-time line holds the slot; with no Prelude the match follows it.
    const lined = must(encore, { type: "tick" }, encore.deadline!);
    expect(lined.prelude).toBeNull();
    const s = must(lined, { type: "tick" }, lined.deadline!);
    expect(s.prelude).toBeNull();
    expect(s.match ?? s.auction ?? s.bluff).not.toBeNull();
    const v = view(s, "g0");
    if (v.phase !== "dance") throw new Error("expected the Dance");
    expect(v.announcement.encore).toBe(true);
    expect(v.announcement.rulesSummary.length).toBeGreaterThan(0);
    expect(v.announcement.prelude.length).toBeGreaterThan(0);
    expect(base.prelude).not.toBeNull();
  });
});

describe("Rules cards", () => {
  it("carry the six-colour strip for matches with masks", () => {
    for (const m of LIBRARY) {
      const s = { ...started(5, 7, 0), danceDef: m };
      const v = view(s, "g0");
      if (v.phase !== "mingle") throw new Error("expected the Mingle");
      expect(v.announcement.masks, m.name).toBe(!!m.masks);
    }
    expect(LIBRARY.filter((m) => m.masks).length).toBeGreaterThan(0);
  });
});

describe("library entry checks for Preludes", () => {
  for (const m of LIBRARY) {
    it(`${m.name}'s script is non-empty, within its target length, captioned and played by Ana, Ben and Cy`, () => {
      const total = m.prelude.reduce((t, b) => t + b.seconds, 0);
      expect(m.prelude.length).toBeGreaterThanOrEqual(3);
      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThanOrEqual(m.preludeSeconds);
      expect(total).toBeGreaterThanOrEqual(m.preludeSeconds * 0.6);
      const ids = new Set(PRELUDE_GUESTS.map((g) => g.id));
      for (const b of m.prelude) {
        expect(b.seconds).toBeGreaterThan(0);
        expect(b.caption.trim().length).toBeGreaterThan(0);
        const s = b.screen;
        if (!s) continue;
        expect(s.kind).toBe(m.type === "race" ? "step" : m.type === "sealedBid" ? "lot" : "toast");
        const named = s.kind === "step" ? Object.keys(s.taps ?? {}) : s.kind === "lot" ? (s.bids ?? []).map((x) => x.guest) : Object.keys(s.claims ?? {});
        for (const id of named) expect(ids.has(id)).toBe(true);
      }
      expect(m.prelude.some((b) => b.screen)).toBe(true);
    });
  }
});
