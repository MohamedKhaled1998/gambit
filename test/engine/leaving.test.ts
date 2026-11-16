import { describe, expect, it } from "vitest";
import { apply, chatAccess, nextDeadline, viewFor } from "../../src/engine/game";
import { isDeleted } from "../../src/engine/last-dance";
import { DELETE_AFTER_MS, type GameState, type GuestId, type GuestView } from "../../src/shared/types";
import { mixedPlayer, must, playGame, playMatch, started, tickToDeadline } from "./sim";

const remaining = (s: GameState) => s.guests.filter((g) => g.unmaskedIn === undefined).map((g) => g.id);
const guest = (s: GameState, id: GuestId) => s.guests.find((g) => g.id === id)!;
const leave = (s: GameState, id: GuestId, at = 0) => must(s, { type: "leave", guest: id }, at);
const toPhase = (s: GameState, phase: GameState["phase"]) => {
  while (s.phase !== phase) s = s.phase === "dance" || s.phase === "cellar" ? playMatch(s, mixedPlayer) : tickToDeadline(s);
  return s;
};
/** Ticks (without answering) until the phase begins. */
const tickTo = (s: GameState, phase: GameState["phase"]) => {
  while (s.phase !== phase) s = tickToDeadline(s);
  return s;
};

describe("leaving in the Mingle", () => {
  it("unmasks the guest at once, wiping their favours and taking them out of their Rooms", () => {
    let s = started(6, 3);
    s = must(s, { type: "openRoom", guest: "g1", members: ["g2", "g3"] });
    s = leave(s, "g2");
    expect(guest(s, "g2")).toMatchObject({ unmaskedIn: 1, favours: 0, left: true });
    expect(s.rooms[0]!.members).toEqual(["g1", "g3"]);
    expect(remaining(s)).toHaveLength(5);
    const v = viewFor(s, "g1")!;
    expect(v.guests.find((g) => g.id === "g2")).toMatchObject({ unmasked: true, left: true });
  });

  it("uses one of the round's unmaskings: six guests unmask two in round 1, so the Cellar game then unmasks one", () => {
    const before = started(6, 3);
    expect(before.planned).toBe(2);
    let s = leave(before, "g2");
    expect(guest(s, "g2").unmaskedIn).toBe(1); // the current round's unmasking
    s = tickTo(s, "sentDown");
    expect(s.cellar!.unmaskings).toBe(1);
  });

  it("uses the next round's unmasking when its own round has none, so round 1 stays a warm-up and round 2 turns into one", () => {
    const before = started(4, 3); // 4 guests unmask 0 / 1 / 1
    expect(before.planned).toBe(0);
    let s = leave(before, "g2");
    expect(guest(s, "g2").unmaskedIn).toBe(1); // recorded as leaving in round 1; the cost falls on round 2 below
    s = tickTo(s, "sentDown");
    expect(s.cellar!.unmaskings).toBe(0);
    s = toPhase(s, "mingle");
    expect(s.round).toBe(2);
    s = tickTo(s, "sentDown");
    expect(s.cellar!.unmaskings).toBe(0); // round 2's unmasking went to the leaver
    s = toPhase(s, "mingle");
    s = tickTo(s, "sentDown");
    expect(s.round).toBe(3);
    expect(s.cellar!.unmaskings).toBe(1);
  });

  it("hands the Last Dance to the other two when a guest leaves with three remaining", () => {
    let s = leave(started(4, 3), "g3");
    expect(s.phase).toBe("mingle");
    s = leave(s, "g2");
    expect(s.phase).toBe("lastDance");
    expect(s.lastDance!.finalists.sort()).toEqual(["g0", "g1"]);
  });

  it("redraws a Dance that no longer fits the guests left", () => {
    for (let seed = 0; seed < 40; seed++) {
      let s = started(5, seed);
      s = leave(s, "g4");
      s = tickToDeadline(s);
      expect(s.phase).toBe("dance");
      expect(Object.keys((s.match ?? s.auction ?? s.bluff)!.points).sort()).toEqual(remaining(s).sort());
    }
  });
});

describe("leaving in the Dance", () => {
  it("ranks the leaver last, pays them the bottom payout and unmasks them before guests are sent down", () => {
    let s = tickTo(started(6, 5), "dance");
    s = leave(s, "g0");
    expect(guest(s, "g0").unmaskedIn).toBeUndefined();
    expect(guest(s, "g0").left).toBe(true);
    const dance = viewFor(s, "g1") as Extract<GuestView, { phase: "dance" }>;
    expect(dance.ranking.at(-1)!.guest).toBe("g0");
    s = playMatch(s, (g, _step, right) => (g === "g0" ? { position: right, ms: 100 } : null));
    expect(s.phase).toBe("sentDown");
    expect(s.danceResult!.ranking.at(-1)!.guest).toBe("g0");
    expect(s.danceResult!.payout["g0"]).toBe(-3);
    expect(guest(s, "g0")).toMatchObject({ unmaskedIn: 1, favours: 0 });
    expect(s.cellar!.guests).not.toContain("g0");
    expect(s.cellar!.unmaskings).toBe(1); // six guests unmask two in round 1; the leaver used one
  });

  it("ignores what the leaver does after leaving", () => {
    let s = tickTo(started(5, 5), "dance");
    s = leave(s, "g1");
    const r = apply(s, { type: "buyPoints", guest: "g1", favours: 1 }, 1);
    expect(r.ok).toBe(false);
  });

  it("goes straight to the Last Dance when the Dance leaves two", () => {
    let s = leave(started(4, 5), "g3");
    s = tickTo(s, "dance");
    s = leave(s, "g2");
    s = playMatch(s, mixedPlayer);
    expect(s.phase).toBe("lastDance");
    expect(s.lastDance!.finalists.sort()).toEqual(["g0", "g1"]);
  });
});

describe("leaving once guests are sent down", () => {
  it("unmasks a free guest at once and takes one off the Cellar game's count", () => {
    let s = tickTo(started(6, 5), "sentDown");
    expect(s.cellar!.unmaskings).toBe(2);
    const free = remaining(s).find((g) => !s.cellar!.guests.includes(g))!;
    s = leave(s, free);
    expect(guest(s, free).unmaskedIn).toBe(1);
    expect(s.cellar!.unmaskings).toBe(1);
    expect(s.predictions.at(-1)!.unmaskings).toBe(1);
  });

  it("takes a guest in the Cellar out of it and a prediction round off the board when nobody is left to unmask", () => {
    let s = tickTo(started(5, 5), "sentDown");
    expect(s.cellar!.unmaskings).toBe(1);
    const down = s.cellar!.guests[0]!;
    s = leave(s, down);
    expect(s.cellar!.guests).not.toContain(down);
    expect(s.cellar!.unmaskings).toBe(0);
    expect(s.predictions.filter((p) => p.round === 1)).toHaveLength(0);
  });
});

describe("leaving in the Cellar game", () => {
  it("ranks a Cellar guest last and unmasks them when it ends, as one of the unmaskings", () => {
    let s = tickTo(started(6, 5), "cellar");
    const down = s.cellar!.guests;
    const leaver = down[0]!;
    s = leave(s, leaver);
    expect(guest(s, leaver).unmaskedIn).toBeUndefined();
    s = playMatch(s, (g, _st, right) => (g === leaver ? { position: right, ms: 10 } : { position: right, ms: 5000 }));
    expect(s.phase).toBe("unmasking");
    expect(s.cellar!.ranking!.at(-1)!.guest).toBe(leaver);
    expect(s.cellar!.unmasked).toContain(leaver);
    expect(s.cellar!.unmasked).toHaveLength(2);
    expect(guest(s, leaver)).toMatchObject({ unmaskedIn: 1, favours: 0 });
  });

  it("unmasks a free guest at once, using one of the round's unmaskings", () => {
    let s = tickTo(started(6, 5), "cellar");
    const free = remaining(s).find((g) => !s.cellar!.guests.includes(g))!;
    s = leave(s, free);
    expect(guest(s, free).unmaskedIn).toBe(1);
    s = playMatch(s, mixedPlayer);
    expect(s.cellar!.unmasked).toHaveLength(1);
    expect(remaining(s)).toHaveLength(4);
  });

  it("still unmasks a leaver when the round was a warm-up", () => {
    let s = tickTo(started(4, 5), "cellar");
    expect(s.cellar!.unmaskings).toBe(0);
    const leaver = s.cellar!.guests[0]!;
    s = leave(s, leaver);
    s = playMatch(s, mixedPlayer);
    expect(s.cellar!.unmasked).toEqual([leaver]); // the emptied round's Cellar game unmasks nobody else
    expect(remaining(s)).toHaveLength(3);
  });

  it("unmasks both leavers, and nobody more, when two leave from one Cellar game", () => {
    let s = tickTo(started(6, 5), "cellar");
    const [a, b] = s.cellar!.guests as [string, string];
    s = leave(leave(s, a), b);
    s = playMatch(s, mixedPlayer);
    expect([...s.cellar!.unmasked].sort()).toEqual([a, b].sort());
    expect(remaining(s)).toHaveLength(4);
  });
});

describe("leaving while unmasking", () => {
  it("unmasks at once and leaves the next round's unmasking to be used", () => {
    let s = toPhase(started(7, 5), "unmasking"); // 7 guests: 2 / 2 / 1
    expect(remaining(s)).toHaveLength(5);
    const gone = remaining(s)[1]!;
    s = leave(s, gone);
    expect(guest(s, gone).unmaskedIn).toBe(1);
    s = toPhase(s, "lastDance");
    expect(s.lastDance!.finalists).toHaveLength(2);
  });
});

describe("exactly two guests reach the Last Dance", () => {
  it("holds whenever guests leave at any point of any round", () => {
    for (const n of [4, 5, 7, 10]) {
      for (let offset = 0; offset < 14; offset++) {
        let s = started(n, n * 10 + offset);
        let steps = 0;
        let left = 0;
        while (s.phase !== "lastDance") {
          if (steps++ % 14 === offset && remaining(s).filter((g) => !guest(s, g).left).length > 2) {
            const who = remaining(s).filter((g) => !guest(s, g).left).at(-1)!;
            s = leave(s, who);
            left++;
            if (s.phase === "lastDance") break;
          }
          s = s.phase === "dance" || s.phase === "cellar" ? playMatch(s, mixedPlayer) : tickToDeadline(s);
        }
        expect(remaining(s)).toHaveLength(2);
        expect(left).toBeGreaterThan(0);
      }
    }
  }, 60_000);

  it("refuses to let one of the last two leave before the Last Dance", () => {
    let s = tickTo(started(4, 5), "dance");
    s = leave(s, "g3");
    const r = apply(s, { type: "leave", guest: "g2" }, 1);
    expect(r.ok).toBe(true); // three remained; two are left
    s = r.ok ? r.state : s;
    const again = apply(s, { type: "leave", guest: "g1" }, 2);
    expect(again).toEqual({ ok: false, reason: "the last two can't leave before the Last Dance" });
  });
});

describe("who can leave", () => {
  it("is a guest still in the game, once", () => {
    let s = started(6, 5);
    expect(apply(s, { type: "leave", guest: "nobody" }, 0)).toEqual({ ok: false, reason: "no such guest" });
    s = leave(s, "g1");
    expect(apply(s, { type: "leave", guest: "g1" }, 0)).toEqual({ ok: false, reason: "already unmasked" });
  });

  it("is not possible in the Foyer", () => {
    const f = { ...started(4, 1), phase: "foyer" as const };
    expect(apply(f, { type: "leave", guest: "g1" }, 0)).toEqual({ ok: false, reason: "the game hasn't started" });
  });

  it("returns a guest to their seat as an unmasked guest who reads the Balcony", () => {
    let s = leave(started(6, 5), "g2");
    const v = viewFor(s, "g2")!;
    expect(v.phase).toBe("mingle");
    expect(chatAccess(s, "g2").some((c) => c.chat === "balcony" && c.canPost)).toBe(true);
    expect(chatAccess(s, "g1").some((c) => c.chat === "balcony")).toBe(false);
  });
});

describe("a ballot already cast, the Host and absent guests", () => {
  it("counts the ballot of a juror who left the party, in the Jury vote and its reveal", () => {
    let s = leave(started(6, 11), "g5");
    s = playGame(s, mixedPlayer);
    while (s.lastDance!.stage !== "vote") s = tickToDeadline(s);
    const { matchWinner: w, matchLoser: l } = s.lastDance!;
    const jurors = s.guests.filter((g) => g.unmaskedIn !== undefined).map((g) => g.id);
    expect(jurors).toContain("g5");
    // Every juror, the leaver included, backs the loser: with all four jurors' ballots the loser needs the bar.
    for (const j of jurors) s = must(s, { type: "vote", guest: j, finalist: l! }, s.deadline! - 1000);
    while ((s.lastDance!.stage as string) !== "ended") s = tickToDeadline(s);
    expect(s.lastDance!.ballots["g5"]).toBe(l);
    expect(s.lastDance!.lastMask).toBe(l);
    expect(w).not.toBe(l);
  });

  it("keeps a ballot cast before a finalist leaves in the game's record of the vote", () => {
    let s = playGame(started(6, 11), mixedPlayer);
    while (s.lastDance!.stage !== "vote") s = tickToDeadline(s);
    const juror = s.guests.find((g) => g.unmaskedIn !== undefined)!.id;
    const l = s.lastDance!.matchLoser!;
    s = must(s, { type: "vote", guest: juror, finalist: l }, s.deadline! - 1000);
    s = leave(s, l, s.deadline! - 500);
    expect(s.lastDance!.ballots[juror]).toBe(l);
    expect(s.lastDance!.lastMask).toBe(s.lastDance!.matchWinner);
  });

  it("passes the Host role to the earliest-joined guest still in the game when the Host leaves", () => {
    let s = started(6, 5);
    s = leave(s, "g0");
    expect(s.host).toBe("g1");
    expect(viewFor(s, "g1")).toMatchObject({ host: "g1" });
    s = leave(s, "g1");
    expect(s.host).toBe("g2");
  });

  it("counts an unmasked guest as still in the game for the Host role, but not one who left", () => {
    let s = started(6, 5);
    s = { ...s, guests: s.guests.map((g) => (g.id === "g1" ? { ...g, unmaskedIn: 1 } : g)) };
    s = leave(s, "g0");
    expect(s.host).toBe("g1");
    let t = leave(started(6, 5), "g1");
    t = leave(t, "g0");
    expect(t.host).toBe("g2");
  });

  it("marks guests who are not connected as disconnected and plays on without declaring them gone", () => {
    let s = started(5, 5);
    s = must(s, { type: "presence", present: ["g0", "g1", "g2"] });
    const v = viewFor(s, "g0")!;
    expect(v.guests.filter((g) => g.disconnected).map((g) => g.id)).toEqual(["g3", "g4"]);
    s = playGame(s, mixedPlayer);
    expect(s.phase).toBe("lastDance");
    expect(s.guests.filter((g) => g.left)).toEqual([]);
    s = must(s, { type: "presence", present: s.guests.map((g) => g.id) });
    expect(viewFor(s, "g0")!.guests.some((g) => g.disconnected)).toBe(false);
  });
});

describe("absent guests", () => {
  it("score each step's worst result: an absent guest who never answers ends the Dance last", () => {
    let s = tickTo(started(5, 5), "dance");
    s = must(s, { type: "presence", present: ["g0", "g1", "g2", "g3"] });
    s = playMatch(s, (g, _step, right) => (g === "g4" ? null : { position: right, ms: 100 }));
    expect(s.danceResult!.ranking.at(-1)!.guest).toBe("g4");
    expect(s.danceResult!.payout["g4"]).toBe(Math.min(...Object.values(s.danceResult!.payout)));
    expect(s.guests.find((g) => g.id === "g4")!.left).toBeFalsy();
  });
});

describe("leaving in the Last Dance", () => {
  const atLastDance = (stage: string) => {
    let s = playGame(started(6, 11), mixedPlayer);
    while (s.lastDance!.stage !== stage) s = tickToDeadline(s);
    return s;
  };

  it("hands the other finalist the win at once, skipping the Jury vote", () => {
    let s = atLastDance("match");
    const [a, b] = s.lastDance!.finalists as [string, string];
    s = leave(s, a, 1);
    expect(s.lastDance!.stage).toBe("ended");
    expect(s.lastDance!.lastMask).toBe(b);
    expect(guest(s, a).unmaskedIn).toBeDefined();
    const v = viewFor(s, b) as Extract<GuestView, { phase: "lastDance" }>;
    expect(v.lastMask).toBe(b);
    expect(v.reveal).not.toBeNull();
    expect(v.ballots).toEqual([]);
    expect(nextDeadline(s)).toBe(1 + DELETE_AFTER_MS);
  });

  it("works in the intro, when unmasked guests are still predicting the winner", () => {
    let s = atLastDance("intro");
    const [a, b] = s.lastDance!.finalists as [string, string];
    const juror = s.guests.find((g) => g.unmaskedIn !== undefined)!.id;
    s = must(s, { type: "predict", guest: juror, picks: [b] });
    s = leave(s, a);
    expect(s.lastDance!.lastMask).toBe(b);
    const v = viewFor(s, b) as Extract<GuestView, { phase: "lastDance" }>;
    expect(v.reveal!.scores[juror]).toBeGreaterThan(0);
  });

  it("passes the Host role on when the Host is the finalist who leaves", () => {
    let s = atLastDance("match");
    const host = s.host!;
    if (!s.lastDance!.finalists.includes(host)) return;
    s = leave(s, host);
    expect(s.host).not.toBe(host);
  });

  it("does nothing once the Jury has voted", () => {
    const s = atLastDance("reveal");
    const [a] = s.lastDance!.finalists;
    expect(apply(s, { type: "leave", guest: a! }, 0)).toEqual({ ok: false, reason: "the game has ended" });
  });
});

describe("ending the game early", () => {
  it("lets only the Host end it, and shows an end screen with no last mask", () => {
    const s = tickTo(started(6, 5), "dance");
    expect(apply(s, { type: "endGame", guest: "g1" }, 5)).toEqual({ ok: false, reason: "only the Host can do that" });
    const ended = must(s, { type: "endGame", guest: "g0" }, 5);
    expect(ended.phase).toBe("ended");
    const v = viewFor(ended, "g1") as Extract<GuestView, { phase: "ended" }>;
    expect(v.phase).toBe("ended");
    expect(v.lastMask).toBeNull();
    expect(v.reveal).toBeDefined();
    expect(Object.keys(v.favours).sort()).toEqual(remaining(ended).sort());
    expect(nextDeadline(ended)).toBe(5 + DELETE_AFTER_MS);
    expect(apply(ended, { type: "leave", guest: "g1" }, 6)).toEqual({ ok: false, reason: "the game has ended" });
    expect(apply(ended, { type: "gift", guest: "g1", to: "g2", favours: 1 }, 6).ok).toBe(false);
  });

  it("is deleted once its storage is due", () => {
    let s = must(started(4, 5), { type: "endGame", guest: "g0" }, 5);
    expect(isDeleted(s)).toBe(false);
    s = must(s, { type: "tick" }, 5 + DELETE_AFTER_MS);
    expect(isDeleted(s)).toBe(true);
  });

  it("cannot end a game that hasn't started", () => {
    const f = { ...started(4, 1), phase: "foyer" as const };
    expect(apply(f, { type: "endGame", guest: "g0" }, 0)).toEqual({ ok: false, reason: "the game hasn't started" });
  });
});
