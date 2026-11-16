import { describe, expect, it } from "vitest";
import type { GuestView, ServerMessage } from "../../src/shared/types";
import { Client, startedGame } from "./helpers";

const rejoinOf = (c: Client) => c.messages.find((m): m is Extract<ServerMessage, { type: "rejoin" }> => m.type === "rejoin");

describe("a re-join link", () => {
  it("gives a guest a fresh seat token and invalidates the old one", async () => {
    const { code, guests } = await startedGame(4);
    const [host, bo] = guests as [(typeof guests)[0], (typeof guests)[0]];
    host.client.send({ type: "action", id: "rj", action: { type: "rejoinLink", target: bo.guest } });
    await host.client.until(() => !!rejoinOf(host.client));
    const fresh = rejoinOf(host.client)!;
    expect(fresh.guest).toBe(bo.guest);
    expect(fresh.token).not.toBe(bo.token);

    const old = await Client.connect(code, bo.token);
    await old.until(() => old.closed !== null);
    expect(old.closed!.code).toBe(4002);

    const back = await Client.connect(code, fresh.token);
    await back.until(() => back.views().length > 0);
    expect(back.lastView()).toMatchObject({ you: bo.guest });
  });

  it("is the Host's alone", async () => {
    const { guests } = await startedGame(4);
    const [, bo, cy] = guests as [(typeof guests)[0], (typeof guests)[0], (typeof guests)[0]];
    bo.client.send({ type: "action", id: "rj", action: { type: "rejoinLink", target: cy.guest } });
    await bo.client.until(() => bo.client.errors().includes("only the Host can do that"));
    expect(rejoinOf(bo.client)).toBeUndefined();
  });
});

describe("leaving, absence and ending early over the socket", () => {
  it("marks a guest whose socket closed as disconnected, and clears it when they return", async () => {
    const { code, guests } = await startedGame(4);
    const [host, bo] = guests as [(typeof guests)[0], (typeof guests)[0]];
    const flag = () => (host.client.lastView() as GuestView).guests.find((g) => g.id === bo.guest)!.disconnected;
    expect(flag()).toBe(false);
    bo.client.ws.close();
    await host.client.until(() => flag());
    const back = await Client.connect(code, bo.token);
    await host.client.until(() => !flag());
    back.ws.close();
  });

  it("tells everyone a guest left the party and passes the Host role on when the Host leaves", async () => {
    const { guests } = await startedGame(4);
    const [host, bo] = guests as [(typeof guests)[0], (typeof guests)[0]];
    host.client.send({ type: "action", id: "bye", action: { type: "leave" } });
    await bo.client.until(() => (bo.client.lastView() as GuestView).guests.find((g) => g.id === host.guest)!.left);
    expect(bo.client.lastView()).toMatchObject({ host: bo.guest });
    // The same action id never applies twice.
    host.client.send({ type: "action", id: "bye", action: { type: "leave" } });
  });

  it("lets the Host end the game early", async () => {
    const { guests } = await startedGame(4);
    const [host, bo] = guests as [(typeof guests)[0], (typeof guests)[0]];
    bo.client.send({ type: "action", id: "end", action: { type: "endGame" } });
    await bo.client.until(() => bo.client.errors().includes("only the Host can do that"));
    host.client.send({ type: "action", id: "end", action: { type: "endGame" } });
    await bo.client.until(() => bo.client.lastView()?.phase === "ended");
    expect(bo.client.lastView()).toMatchObject({ phase: "ended", lastMask: null });
  });
});
