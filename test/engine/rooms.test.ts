import { describe, expect, it } from "vitest";
import { apply, chatAccess, viewFor } from "../../src/engine/game";
import type { GameState } from "../../src/shared/types";
import { foyerWith, intoDance, must, playDance, playMatch, started, tickToDeadline } from "./sim";

const open = (s: GameState, guest: string, members: string[]) => must(s, { type: "openRoom", guest, members });
const roomsOf = (s: GameState, guest: string) => viewFor(s, guest)!.rooms;

describe("The Table", () => {
  it("is open to every remaining guest to read, and to post in outside a Cellar game, in every phase from the Mingle", () => {
    let s = started(5);
    for (;;) {
      for (const g of s.guests.filter((x) => x.unmaskedIn === undefined)) expect(chatAccess(s, g.id)).toContainEqual({ chat: "table", canPost: s.phase !== "cellar" });
      if (s.phase === "lastDance") break;
      s = s.phase === "dance" || s.phase === "cellar" ? playMatch(s, () => null) : tickToDeadline(s);
    }
  });

  it("does not exist in the Foyer", () => {
    expect(chatAccess(foyerWith(4), "g0")).toEqual([]);
  });

  it("is not open to a guest with no seat", () => {
    expect(chatAccess(started(4), "nobody")).toEqual([]);
  });
});

describe("Rooms", () => {
  it("open with any set of one to everyone-but-one other guests, and are public to every guest", () => {
    let s = started(5);
    s = open(s, "g0", ["g1"]);
    s = open(s, "g1", ["g0", "g2", "g3"]);
    for (const g of ["g0", "g4"]) expect(roomsOf(s, g)).toEqual([
      { id: "r1", members: ["g0", "g1"] },
      { id: "r2", members: ["g1", "g0", "g2", "g3"] },
    ]);
  });

  it("can be opened by a guest as many times as they like, even with the same guests", () => {
    let s = open(started(4), "g0", ["g1"]);
    s = open(s, "g0", ["g1"]);
    expect(roomsOf(s, "g0")).toHaveLength(2);
  });

  it("can't include everyone, nobody, oneself, a repeat or an unknown guest", () => {
    const s = started(4);
    const why = (members: string[]) => apply(s, { type: "openRoom", guest: "g0", members }, 0);
    expect(why(["g1", "g2", "g3"])).toEqual({ ok: false, reason: "a Room can't hold everyone" });
    expect(why([])).toEqual({ ok: false, reason: "a Room needs another guest" });
    expect(why(["g0"]).ok).toBe(false);
    expect(why(["g1", "g1"]).ok).toBe(false);
    expect(why(["nobody"])).toEqual({ ok: false, reason: "no such guest" });
  });

  it("count only remaining guests when judging 'everyone'", () => {
    let s = started(5);
    while (!s.guests.some((g) => g.unmaskedIn !== undefined)) s = s.phase === "dance" || s.phase === "cellar" ? playMatch(s, () => null) : tickToDeadline(s);
    const left = s.guests.filter((g) => g.unmaskedIn === undefined).map((g) => g.id);
    const gone = s.guests.find((g) => g.unmaskedIn !== undefined)!.id;
    expect(apply(s, { type: "openRoom", guest: left[0]!, members: [gone] }, 0)).toEqual({ ok: false, reason: "no such guest" });
    expect(apply(s, { type: "openRoom", guest: left[0]!, members: left.slice(1) }, 0)).toEqual({ ok: false, reason: "a Room can't hold everyone" });
  });

  it("can't be opened in the Foyer or by an unmasked guest", () => {
    expect(apply(foyerWith(4), { type: "openRoom", guest: "g0", members: ["g1"] }, 0)).toEqual({ ok: false, reason: "the game hasn't started" });
  });

  it("let members post and read; everyone else can neither", () => {
    const s = open(started(5), "g0", ["g1", "g2"]);
    for (const g of ["g0", "g1", "g2"]) expect(chatAccess(s, g)).toContainEqual({ chat: "r1", canPost: true });
    for (const g of ["g3", "g4"]) expect(chatAccess(s, g).map((c) => c.chat)).toEqual(["table"]);
  });

  it("last the whole game, through every phase", () => {
    let s = open(started(5), "g0", ["g1"]);
    s = playDance(s, () => null);
    expect(roomsOf(s, "g0")).toHaveLength(1);
    expect(chatAccess(s, "g1").map((c) => c.chat)).toContain("r1");
  });

  it("can be left by a member, who then can't read or post, while the others stay", () => {
    let s = open(started(5), "g0", ["g1", "g2"]);
    s = must(s, { type: "leaveRoom", guest: "g1", room: "r1" });
    expect(roomsOf(s, "g4")).toEqual([{ id: "r1", members: ["g0", "g2"] }]);
    expect(chatAccess(s, "g1").map((c) => c.chat)).toEqual(["table"]);
    expect(chatAccess(s, "g0").map((c) => c.chat)).toContain("r1");
  });

  it("can't be left by a non-member or when there is no such Room, and nobody can be removed", () => {
    const s = open(started(5), "g0", ["g1"]);
    expect(apply(s, { type: "leaveRoom", guest: "g3", room: "r1" }, 0)).toEqual({ ok: false, reason: "not in that Room" });
    expect(apply(s, { type: "leaveRoom", guest: "g0", room: "r9" }, 0)).toEqual({ ok: false, reason: "no such Room" });
    expect(apply(s, { type: "removeGuest", guest: "g0", target: "g1" }, 0).ok).toBe(false);
  });

  it("can't be rejoined once left", () => {
    let s = open(started(4), "g0", ["g1"]);
    s = must(s, { type: "leaveRoom", guest: "g1", room: "r1" });
    expect(apply(s, { type: "leaveRoom", guest: "g1", room: "r1" }, 0)).toEqual({ ok: false, reason: "not in that Room" });
  });
});

describe("what a view holds of Rooms", () => {
  it("is membership only, never anything said", () => {
    const s = open(intoDance(started(4)), "g0", ["g1"]);
    expect(Object.keys(roomsOf(s, "g3")[0]!).sort()).toEqual(["id", "members"]);
  });
});
