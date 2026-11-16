import { describe, expect, it } from "vitest";
import { chatAccess, viewFor } from "../../src/engine/game";
import type { GameState } from "../../src/shared/types";
import { mixedPlayer, must, playDance, playMatch, started, tickToDeadline } from "./sim";

const access = (s: GameState, g: string) => Object.fromEntries(chatAccess(s, g).map((c) => [c.chat, c.canPost]));

/** Seven guests in round 1, with a mixed Room, a Cellar-only Room and a free-only Room opened in the Mingle. */
function setup() {
  let s = started(7, 3);
  const dance = playDance(s, mixedPlayer);
  const down = dance.cellar!.guests;
  const free = dance.guests.map((g) => g.id).filter((id) => !down.includes(id));
  s = must(s, { type: "openRoom", guest: down[0]!, members: [free[0]!] }); // r1 mixed
  s = must(s, { type: "openRoom", guest: down[0]!, members: [down[1]!] }); // r2 Cellar only
  s = must(s, { type: "openRoom", guest: free[0]!, members: [free[1]!] }); // r3 free only
  const sentDown = playDance(s, mixedPlayer);
  return { sentDown, down: sentDown.cellar!.guests, free: sentDown.guests.map((g) => g.id).filter((id) => !sentDown.cellar!.guests.includes(id)) };
}

describe("talk while a Cellar game runs", () => {
  it("is normal until the Cellar game starts", () => {
    const { sentDown, down, free } = setup();
    expect(access(sentDown, down[0]!)).toEqual({ table: true, r1: true, r2: true });
    expect(access(sentDown, free[0]!)).toEqual({ table: true, r1: true, r3: true });
  });

  it("makes the Table and mixed Rooms read-only, and leaves free-only and Cellar-only Rooms live", () => {
    const { sentDown, down, free } = setup();
    const s = tickToDeadline(sentDown);
    expect(s.phase).toBe("cellar");
    expect(access(s, down[0]!)).toEqual({ table: false, r1: false, r2: true, "cellar-1": true });
    expect(access(s, down[1]!)).toEqual({ table: false, r2: true, "cellar-1": true });
    expect(access(s, free[0]!)).toEqual({ table: false, r1: false, r3: true });
    expect(access(s, free[1]!)).toEqual({ table: false, r3: true });
  });

  it("gives Cellar talk to exactly the Cellar, so free guests can't read it", () => {
    const { sentDown, down, free } = setup();
    const s = tickToDeadline(sentDown);
    for (const g of down) expect(access(s, g)["cellar-1"]).toBe(true);
    for (const g of free) expect(access(s, g)).not.toHaveProperty("cellar-1");
  });
});

describe("talk at the unmasking", () => {
  const unmasking = () => {
    const { sentDown, down, free } = setup();
    const s = playMatch(tickToDeadline(sentDown), mixedPlayer);
    expect(s.phase).toBe("unmasking");
    const out = s.cellar!.unmasked;
    return { s, out, kept: down.filter((g) => !out.includes(g)), free, down };
  };

  it("closes Cellar talk but keeps it readable to its members, unmasked or not", () => {
    const { s, down, free } = unmasking();
    for (const g of down) expect(access(s, g)["cellar-1"]).toBe(false);
    for (const g of free) expect(access(s, g)).not.toHaveProperty("cellar-1");
  });

  it("opens the Table again to remaining guests", () => {
    const { s, kept, free } = unmasking();
    for (const g of [...kept, ...free]) expect(access(s, g).table).toBe(true);
  });

  it("takes an unmasked guest out of every Room, keeping read-only history, and puts them on the Balcony", () => {
    const { s, out } = unmasking();
    for (const g of out) {
      const a = access(s, g);
      expect(a.table).toBe(false);
      expect(a.balcony).toBe(true);
      for (const r of s.rooms) expect(r.members).not.toContain(g);
      for (const r of s.rooms.filter((x) => x.unmasked?.includes(g))) expect(a[r.id]).toBe(false);
    }
  });

  it("shows no remaining guest the Balcony", () => {
    const { s, kept, free } = unmasking();
    for (const g of [...kept, ...free]) expect(access(s, g)).not.toHaveProperty("balcony");
  });

  it("keeps the Balcony and the history for an unmasked guest in every later phase", () => {
    let { s, out } = unmasking();
    while (s.phase !== "lastDance") {
      s = s.phase === "dance" || s.phase === "cellar" ? playMatch(s, mixedPlayer) : tickToDeadline(s);
      for (const g of out) expect(access(s, g)).toMatchObject({ table: false, balcony: true, "cellar-1": false });
    }
  });
});

describe("the talk sheet", () => {
  it("holds only Cellar talk for a guest in a running Cellar game, and everything otherwise", () => {
    const { sentDown, down, free } = setup();
    const s = tickToDeadline(sentDown);
    expect(viewFor(s, down[0]!)!.chats).toEqual([{ chat: "cellar-1", canPost: true }]);
    expect(viewFor(s, free[0]!)!.chats.map((c) => c.chat)).toEqual(["table", "r1", "r3"]);
    expect(viewFor(sentDown, down[0]!)!.chats.map((c) => c.chat)).toEqual(["table", "r1", "r2"]);
    // Access itself is unchanged: the Cellar's Rooms stay live.
    expect(access(s, down[0]!).r2).toBe(true);
  });

  it("copes with a game saved before Cellar talk existed", () => {
    const { sentDown, down } = setup();
    const old = structuredClone(sentDown) as Partial<GameState>;
    delete old.cellarTalks;
    expect(access(old as GameState, down[0]!)).toEqual({ table: true, r1: true, r2: true });
    expect(viewFor(old as GameState, down[0]!)).not.toBeNull();
  });
});
