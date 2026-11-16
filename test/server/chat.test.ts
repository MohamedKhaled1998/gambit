import { describe, expect, it } from "vitest";
import { Client, chatMessages, startedGame } from "./helpers";

const settle = () => new Promise((r) => setTimeout(r, 150));

describe("The Table over WebSockets", () => {
  it("reaches every remaining guest's socket, tagged with its author", async () => {
    const { guests } = await startedGame(4);
    guests[1]!.client.send({ type: "post", chat: "table", body: "good evening" });
    for (const g of guests) await g.client.until(() => chatMessages(g.client, "table").length === 1);
    expect(chatMessages(guests[3]!.client, "table")[0]).toMatchObject({ chat: "table", guest: guests[1]!.guest, body: "good evening" });
  });

  it("rejects a post to a chat that doesn't exist, an empty body or a guest with no seat", async () => {
    const { code, guests } = await startedGame(4);
    const a = guests[0]!.client;
    a.send({ type: "post", chat: "nowhere", body: "hi" });
    await a.until(() => a.errors().includes("no such chat"));
    a.send({ type: "post", chat: "table", body: "   " });
    await a.until(() => a.errors().includes("empty message"));
    const stranger = await Client.connect(code, "bad-token");
    stranger.send({ type: "post", chat: "table", body: "hi" });
    await settle();
    expect(chatMessages(a)).toEqual([]);
  });
});

describe("Rooms over WebSockets", () => {
  it("deliver a message to the Room's members only", async () => {
    const { guests } = await startedGame(5);
    const [a, b, c, d, e] = guests as [typeof guests[0], typeof guests[0], typeof guests[0], typeof guests[0], typeof guests[0]];
    a.client.send({ type: "action", id: "o1", action: { type: "openRoom", members: [b.guest, c.guest] } });
    await e.client.until(() => e.client.lastView()?.rooms.length === 1);
    await a.client.until(() => a.client.lastView()?.rooms.length === 1);
    const room = a.client.lastView()!.rooms[0]!;
    expect(room.members).toEqual([a.guest, b.guest, c.guest]);
    b.client.send({ type: "post", chat: room.id, body: "psst" });
    for (const g of [a, b, c]) await g.client.until(() => chatMessages(g.client, room.id).length === 1);
    await settle();
    for (const g of [d, e]) expect(chatMessages(g.client, room.id)).toEqual([]);
    d.client.send({ type: "post", chat: room.id, body: "let me in" });
    await d.client.until(() => d.client.errors().includes("no such chat"));
    await settle();
    expect(chatMessages(a.client, room.id)).toHaveLength(1);
  });

  it("never put what was said in any view", async () => {
    const { guests } = await startedGame(4);
    guests[0]!.client.send({ type: "action", id: "o1", action: { type: "openRoom", members: [guests[1]!.guest] } });
    await guests[3]!.client.until(() => guests[3]!.client.lastView()?.rooms.length === 1);
    guests[0]!.client.send({ type: "post", chat: "r1", body: "SECRETWORD" });
    await guests[1]!.client.until(() => chatMessages(guests[1]!.client, "r1").length === 1);
    for (const g of guests) expect(g.client.views().every((v) => !JSON.stringify(v).includes("SECRETWORD"))).toBe(true);
  });

  it("stop reaching a guest who left, while the others keep talking", async () => {
    const { guests } = await startedGame(5);
    const [a, b, c] = guests as [typeof guests[0], typeof guests[0], typeof guests[0]];
    a.client.send({ type: "action", id: "o1", action: { type: "openRoom", members: [b.guest, c.guest] } });
    await c.client.until(() => c.client.lastView()?.rooms.length === 1);
    c.client.send({ type: "action", id: "l1", action: { type: "leaveRoom", room: "r1" } });
    await a.client.until(() => a.client.lastView()?.rooms[0]?.members.length === 2);
    a.client.send({ type: "post", chat: "r1", body: "after" });
    await b.client.until(() => chatMessages(b.client, "r1").length === 1);
    await settle();
    expect(chatMessages(c.client, "r1")).toEqual([]);
    c.client.send({ type: "post", chat: "r1", body: "still here?" });
    await c.client.until(() => c.client.errors().includes("no such chat"));
  });
});

describe("chat history", () => {
  async function talk(count: number) {
    const game = await startedGame(4);
    const a = game.guests[0]!.client;
    for (let i = 1; i <= count; i++) a.send({ type: "post", chat: "table", body: `m${i}` });
    await a.until(() => chatMessages(a, "table").length === count);
    return game;
  }

  it("returns older pages in order, newest page first, until none remain", async () => {
    const { code, guests } = await talk(70);
    const b = guests[1]!;
    const fresh = await Client.connect(code, b.token);
    await fresh.until(() => fresh.messages.some((m) => m.type === "history" && m.chat === "table"));
    const first = fresh.messages.find((m) => m.type === "history" && m.chat === "table") as Extract<(typeof fresh.messages)[number], { type: "history" }>;
    expect(first.messages.map((m) => m.body)).toEqual(Array.from({ length: 30 }, (_, i) => `m${41 + i}`));
    expect(first.more).toBe(true);
    fresh.send({ type: "loadHistory", chat: "table", before: first.messages[0]!.seq });
    await fresh.until(() => fresh.messages.filter((m) => m.type === "history").length === 2);
    const second = fresh.messages.filter((m) => m.type === "history")[1] as typeof first;
    expect(second.messages.map((m) => m.body)).toEqual(Array.from({ length: 30 }, (_, i) => `m${11 + i}`));
    fresh.send({ type: "loadHistory", chat: "table", before: second.messages[0]!.seq });
    await fresh.until(() => fresh.messages.filter((m) => m.type === "history").length === 3);
    const third = fresh.messages.filter((m) => m.type === "history")[2] as typeof first;
    expect(third.messages.map((m) => m.body)).toEqual(Array.from({ length: 10 }, (_, i) => `m${1 + i}`));
    expect(third.more).toBe(false);
  });

  it("refuses history of a chat the guest isn't in", async () => {
    const { guests } = await startedGame(5);
    guests[0]!.client.send({ type: "action", id: "o1", action: { type: "openRoom", members: [guests[1]!.guest] } });
    await guests[0]!.client.until(() => guests[0]!.client.lastView()?.rooms.length === 1);
    guests[0]!.client.send({ type: "post", chat: "r1", body: "mine" });
    await guests[0]!.client.until(() => chatMessages(guests[0]!.client, "r1").length === 1);
    const c = guests[2]!.client;
    c.send({ type: "loadHistory", chat: "r1", before: 1000 });
    await c.until(() => c.errors().includes("no such chat"));
    expect(chatMessages(c, "r1")).toEqual([]);
  });

  it("rejects a history request whose chat isn't a string, and keeps serving", async () => {
    const { guests } = await startedGame(4);
    const a = guests[0]!.client;
    a.send({ type: "loadHistory", chat: ["table"], before: 1000 });
    await a.until(() => a.errors().includes("no such chat"));
    a.send({ type: "post", chat: "table", body: "still up" });
    await a.until(() => chatMessages(a, "table").length === 1);
  });

  it("gives a reconnecting guest the latest page of each of their chats, and none of anyone else's", async () => {
    const { code, guests } = await startedGame(5);
    const [a, b, c] = guests as [typeof guests[0], typeof guests[0], typeof guests[0]];
    a.client.send({ type: "action", id: "o1", action: { type: "openRoom", members: [b.guest] } });
    await a.client.until(() => a.client.lastView()?.rooms.length === 1);
    a.client.send({ type: "post", chat: "table", body: "public" });
    a.client.send({ type: "post", chat: "r1", body: "private" });
    await b.client.until(() => chatMessages(b.client).length === 2);
    const again = await Client.connect(code, b.token);
    await again.until(() => chatMessages(again, "r1").length === 1 && chatMessages(again, "table").length === 1);
    const other = await Client.connect(code, c.token);
    await other.until(() => chatMessages(other, "table").length === 1);
    await settle();
    expect(chatMessages(other, "r1")).toEqual([]);
  });
});
