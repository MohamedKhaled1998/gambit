import { afterEach, describe, expect, it, vi } from "vitest";
import type { GuestView } from "../../src/shared/types";
import { LIBRARY } from "../../src/content/library";
import { env } from "cloudflare:workers";
import { abortAllDurableObjects, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { createGame } from "../../src/server/create";
import { Client, createGameOverHttp } from "./helpers";

describe("creating a game", () => {
  it("gives the Host an Invitation code and a seat", async () => {
    const grant = await createGameOverHttp("Ana");
    expect(grant.code).toMatch(/^[ACDEFGHJKMNPQRTUVWXY]{5}$/);
    const host = await Client.connect(grant.code, grant.token);
    await host.until(() => host.views().length > 0);
    expect(host.lastView()).toMatchObject({ phase: "foyer", you: grant.guest, host: grant.guest });
  });

  it("tries another code when the code's Durable Object already holds a game", async () => {
    const first = await createGame(env, "Ana", () => 0);
    const again = await createGame(env, "Bo", sequence([0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5]));
    expect(first).toMatchObject({ code: "AAAAA" });
    expect(again).toMatchObject({ code: "NNNNN" });
  });
});

function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

describe("the Foyer over WebSockets", () => {
  it("shows an arriving guest to everyone without a reload", async () => {
    const grant = await createGameOverHttp("Ana");
    const host = await Client.connect(grant.code, grant.token);
    await host.until(() => host.views().length > 0);
    const guest = await (await Client.connect(grant.code)).join(grant.code, "Bo");
    await host.until(() => (host.lastView()?.guests.length ?? 0) === 2);
    expect(host.lastView()!.guests.map((g) => g.name)).toEqual(["Ana", "Bo"]);
    expect(guest.client.lastView()!.guests).toHaveLength(2);
  });

  it("closes the doors when the Host starts, and refuses a late guest", async () => {
    const grant = await createGameOverHttp("Ana");
    const host = await Client.connect(grant.code, grant.token);
    for (const n of ["Bo", "Cy", "Di"]) await (await Client.connect(grant.code)).join(grant.code, n);
    await host.until(() => (host.lastView()?.guests.length ?? 0) === 4);
    host.send({ type: "action", id: "s1", action: { type: "start" } });
    await host.until(() => host.lastView()?.phase === "mingle");
    const late = await Client.connect(grant.code);
    await late.until(() => late.errors().includes("doors are closed"));
    expect(late.lastView()).toBeUndefined();
  });

  it("lets only the Host remove a guest, and closes the removed guest's socket", async () => {
    const grant = await createGameOverHttp("Ana");
    const host = await Client.connect(grant.code, grant.token);
    const bo = await (await Client.connect(grant.code)).join(grant.code, "Bo");
    const cy = await (await Client.connect(grant.code)).join(grant.code, "Cy");
    bo.client.send({ type: "action", id: "r0", action: { type: "removeGuest", target: cy.guest } });
    await bo.client.until(() => bo.client.errors().includes("only the Host can do that"));
    host.send({ type: "action", id: "r1", action: { type: "removeGuest", target: cy.guest } });
    await cy.client.until(() => cy.client.closed !== null);
    await host.until(() => host.lastView()?.guests.length === 2);
    const back = await Client.connect(grant.code, cy.token);
    await back.until(() => back.closed !== null);
    expect(back.lastView()).toBeUndefined();
  });
});

describe("seats", () => {
  it("takes back the same seat from another tab and closes the old socket", async () => {
    const grant = await createGameOverHttp("Ana");
    const tab1 = await Client.connect(grant.code, grant.token);
    await tab1.until(() => tab1.views().length > 0);
    const tab2 = await Client.connect(grant.code, grant.token);
    await tab2.until(() => tab2.views().length > 0);
    await tab1.until(() => tab1.closed !== null);
    expect(tab1.closed!.code).toBe(4001);
    expect(tab2.lastView()).toMatchObject({ you: grant.guest });
  });

  it("gives no seat to a guest without a token, or with a wrong one", async () => {
    const grant = await createGameOverHttp("Ana");
    const anon = await Client.connect(grant.code);
    anon.send({ type: "action", id: "x", action: { type: "start" } });
    await anon.until(() => anon.errors().includes("no seat"));
    expect(anon.views()).toHaveLength(0);
    const wrong = await Client.connect(grant.code, "nope");
    await wrong.until(() => wrong.closed !== null);
    expect(wrong.views()).toHaveLength(0);
  });

  it("keeps the same guest across a reconnect with the token", async () => {
    const grant = await createGameOverHttp("Ana");
    const bo = await (await Client.connect(grant.code)).join(grant.code, "Bo");
    bo.client.ws.close();
    const again = await Client.connect(grant.code, bo.token);
    await again.until(() => again.views().length > 0);
    expect(again.lastView()).toMatchObject({ you: bo.guest });
    expect(again.lastView()!.guests).toHaveLength(2);
  });

  it("rejects a game that doesn't exist", async () => {
    const c = await Client.connect("ZZZZZ");
    await c.until(() => c.closed !== null);
    expect(c.errors()).toContain("no such game");
  });
});

describe("the loop", () => {
  it("applies an action with the same client id only once", async () => {
    const grant = await createGameOverHttp("Ana");
    const host = await Client.connect(grant.code, grant.token);
    const bo = await (await Client.connect(grant.code)).join(grant.code, "Bo");
    const cy = await (await Client.connect(grant.code)).join(grant.code, "Cy");
    await host.until(() => host.lastView()?.guests.length === 3);
    host.send({ type: "action", id: "same", action: { type: "removeGuest", target: bo.guest } });
    await host.until(() => host.lastView()?.guests.length === 2);
    host.send({ type: "action", id: "same", action: { type: "removeGuest", target: cy.guest } });
    host.send({ type: "action", id: "other", action: { type: "removeGuest", target: "nobody" } });
    await host.until(() => host.errors().includes("no such guest"));
    expect(host.lastView()!.guests.map((g) => g.name)).toEqual(["Ana", "Cy"]);
  });

  it("sends a view again only when its hash changes", async () => {
    const grant = await createGameOverHttp("Ana");
    const host = await Client.connect(grant.code, grant.token);
    await host.until(() => host.views().length > 0);
    const bo = await (await Client.connect(grant.code)).join(grant.code, "Bo");
    await host.until(() => host.views().length === 2);
    // Bo's second tab runs the send loop again; Ana's view is unchanged, so she gets nothing new.
    const boTab2 = await Client.connect(grant.code, bo.token);
    await boTab2.until(() => boTab2.views().length > 0);
    await bo.client.until(() => bo.client.closed !== null);
    expect(host.views()).toHaveLength(2);
    expect(boTab2.views()).toHaveLength(1);
  });

  it("stamps every view with the server's build id", async () => {
    const grant = await createGameOverHttp("Ana");
    const host = await Client.connect(grant.code, grant.token);
    await host.until(() => host.views().length > 0);
    expect(host.views()[0]!.build).toBe("test-build");
  });

  it("reloads the state and seats from storage after the object is evicted", async () => {
    const grant = await createGameOverHttp("Ana");
    const bo = await (await Client.connect(grant.code)).join(grant.code, "Bo");
    await abortAllDurableObjects();
    const host = await Client.connect(grant.code, grant.token);
    await host.until(() => host.views().length > 0);
    expect(host.lastView()!.guests.map((g) => g.name)).toEqual(["Ana", "Bo"]);
    const boBack = await Client.connect(grant.code, bo.token);
    await boBack.until(() => boBack.views().length > 0);
    expect(boBack.lastView()).toMatchObject({ you: bo.guest });
    // A connection that came back from storage can still be taken over, and still acts.
    const boAgain = await Client.connect(grant.code, bo.token);
    await boBack.until(() => boBack.closed !== null);
    expect(boBack.closed!.code).toBe(4001);
    host.send({ type: "action", id: "after", action: { type: "removeGuest", target: bo.guest } });
    await host.until(() => host.lastView()?.guests.length === 1);
    await boAgain.until(() => boAgain.closed !== null);
  });

  it("refuses a tick sent by a client", async () => {
    const grant = await createGameOverHttp("Ana");
    const host = await Client.connect(grant.code, grant.token);
    host.send({ type: "action", id: "t", action: { type: "tick" } });
    await host.until(() => host.errors().includes("unknown action"));
  });
});

describe("the clock", () => {
  async function startedGame() {
    const grant = await createGameOverHttp("Ana");
    const host = await Client.connect(grant.code, grant.token);
    const others = [];
    for (const n of ["Bo", "Cy", "Di"]) others.push(await (await Client.connect(grant.code)).join(grant.code, n));
    await host.until(() => (host.lastView()?.guests.length ?? 0) === 4);
    host.send({ type: "action", id: "s", action: { type: "start" } });
    await host.until(() => host.lastView()?.phase === "mingle");
    return { grant, host, others };
  }
  /** A started game whose Dance is a Race match: these tests answer choices, and the Dance is drawn at random. */
  async function startedRaceGame() {
    for (;;) {
      const game = await startedGame();
      const name = (game.host.lastView() as Extract<GuestView, { phase: "mingle" }>).announcement.name;
      if (LIBRARY.find((m) => m.name === name)?.type === "race") return game;
    }
  }
  const alarmOf = (code: string) =>
    runInDurableObject(env.Game.get(env.Game.idFromName(code)), async (_i, state) => state.storage.getAlarm());

  afterEach(() => vi.useRealTimers());

  it("keeps one alarm on the Mingle's deadline and stamps views with the server's time", async () => {
    const { grant, host } = await startedGame();
    const view = host.views().at(-1)!;
    const mingle = view.view as Extract<GuestView, { phase: "mingle" }>;
    expect(await alarmOf(grant.code)).toBe(mingle.deadline);
    expect(Math.abs(view.now - Date.now())).toBeLessThan(5000);
  });

  it("fires a tick at the earliest deadline that moves the Mingle into the Dance and re-sets the alarm", async () => {
    const { grant, host } = await startedRaceGame();
    const mingle = host.lastView() as Extract<GuestView, { phase: "mingle" }>;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(mingle.deadline + 10);
    await runDurableObjectAlarm(env.Game.get(env.Game.idFromName(grant.code)));
    await host.until(() => host.lastView()?.phase === "dance");
    const dance = host.lastView() as Extract<GuestView, { phase: "dance" }>;
    expect(dance.step!.index).toBe(0);
    expect(await alarmOf(grant.code)).toBe(dance.step!.deadline);
  });

  it("accepts an answer before the deadline by server time, once, and rejects one after it", async () => {
    const { grant, host, others } = await startedRaceGame();
    const mingle = host.lastView() as Extract<GuestView, { phase: "mingle" }>;
    const stub = env.Game.get(env.Game.idFromName(grant.code));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(mingle.deadline + 10);
    await runDurableObjectAlarm(stub);
    await host.until(() => host.lastView()?.phase === "dance");
    // A match with a study phase takes answers only once the prompt is hidden.
    const study = (host.lastView() as Extract<GuestView, { phase: "dance" }>).step!;
    if (study.stage === "study") {
      vi.setSystemTime(study.deadline + 10);
      await runDurableObjectAlarm(stub);
      await host.until(() => (host.lastView() as Extract<GuestView, { phase: "dance" }>).step?.stage === "answer");
    }
    host.send({ type: "action", id: "a1", action: { type: "answer", position: 1 } });
    await host.until(() => (host.lastView() as { step?: { yourAnswer: number | null } }).step?.yourAnswer === 1);
    // Another guest's view never carries it.
    expect((others[0]!.client.lastView() as Extract<GuestView, { phase: "dance" }>).step!.yourAnswer).toBeNull();
    host.send({ type: "action", id: "a2", action: { type: "answer", position: 2 } });
    await host.until(() => host.errors().includes("already answered"));
    vi.setSystemTime(mingle.deadline + 40_000);
    others[1]!.client.send({ type: "action", id: "late", action: { type: "answer", position: 0 } });
    await others[1]!.client.until(() => others[1]!.client.errors().includes("too late"));
  });

  it("buys points with favours over the socket", async () => {
    const { grant, host } = await startedGame();
    const mingle = host.lastView() as Extract<GuestView, { phase: "mingle" }>;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(mingle.deadline + 10);
    await runDurableObjectAlarm(env.Game.get(env.Game.idFromName(grant.code)));
    await host.until(() => host.lastView()?.phase === "dance");
    const before = host.lastView() as Extract<GuestView, { phase: "dance" }>;
    const was = before.ranking.find((r) => r.guest === grant.guest)!.points;
    host.send({ type: "action", id: "b", action: { type: "buyPoints", favours: 2 } });
    await host.until(() => (host.lastView() as { favours?: number }).favours === 8);
    // The Dance is drawn at random, so the rate is whatever its match sets.
    expect((host.lastView() as Extract<GuestView, { phase: "dance" }>).ranking.find((r) => r.guest === grant.guest)!.points).toBe(was + 2 * before.buyRate);
  });
});
