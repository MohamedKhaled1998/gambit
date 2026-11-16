import { env } from "cloudflare:workers";
import type { SeatGrant, ServerMessage } from "../../src/shared/types";

export async function createGameOverHttp(name: string): Promise<SeatGrant> {
  const { default: worker } = await import("../../src/server/worker");
  const response = await worker.fetch(
    new Request("https://example.com/api/games", { method: "POST", body: JSON.stringify({ name }) }),
    env,
  );
  return (await response.json()) as SeatGrant;
}

export class Client {
  messages: ServerMessage[] = [];
  closed: { code: number } | null = null;
  private waiters: Array<() => void> = [];
  private constructor(readonly ws: WebSocket) {
    ws.addEventListener("message", (e) => {
      this.messages.push(JSON.parse(String(e.data)) as ServerMessage);
      this.wake();
    });
    ws.addEventListener("close", (e) => {
      this.closed = { code: e.code };
      this.wake();
    });
  }
  private wake() {
    const w = this.waiters;
    this.waiters = [];
    w.forEach((f) => f());
  }
  static async connect(code: string, token?: string): Promise<Client> {
    const { default: worker } = await import("../../src/server/worker");
    const url = `https://example.com/parties/game/${code}${token ? `?token=${token}` : ""}`;
    const res = await worker.fetch(new Request(url, { headers: { Upgrade: "websocket" } }), env);
    const ws = res.webSocket!;
    ws.accept();
    return new Client(ws as unknown as WebSocket);
  }
  async until(pred: () => boolean): Promise<void> {
    const deadline = Date.now() + 3000;
    while (!pred()) {
      if (Date.now() > deadline) throw new Error(`timed out; got ${JSON.stringify(this.messages)} closed=${JSON.stringify(this.closed)}`);
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }
  send(message: unknown) {
    this.ws.send(JSON.stringify(message));
  }
  views() {
    return this.messages.filter((m): m is Extract<ServerMessage, { type: "view" }> => m.type === "view");
  }
  lastView() {
    return this.views().at(-1)?.view;
  }
  errors() {
    return this.messages.filter((m) => m.type === "error").map((m) => (m as { reason: string }).reason);
  }
  async join(code: string, name: string): Promise<{ client: Client; guest: string; token: string }> {
    this.send({ type: "join", name });
    await this.until(() => this.messages.some((m) => m.type === "seat"));
    const seat = this.messages.find((m) => m.type === "seat") as { guest: string; token: string };
    await this.until(() => this.views().length > 0);
    return { client: this, guest: seat.guest, token: seat.token };
  }
}

export type Seated = { client: Client; guest: string; token: string };

/** A started game of `n` guests, every one connected; the Host is first. */
export async function startedGame(n: number): Promise<{ code: string; guests: Seated[] }> {
  const grant = await createGameOverHttp("Ana");
  const host = await Client.connect(grant.code, grant.token);
  await host.until(() => host.views().length > 0);
  const guests: Seated[] = [{ client: host, guest: grant.guest, token: grant.token }];
  for (let i = 1; i < n; i++) guests.push(await (await Client.connect(grant.code)).join(grant.code, `Guest${i}`));
  await host.until(() => host.lastView()?.guests.length === n);
  host.send({ type: "action", id: "start", action: { type: "start" } });
  await Promise.all(guests.map((g) => g.client.until(() => g.client.lastView()?.phase === "mingle")));
  return { code: grant.code, guests };
}

export const chatMessages = (c: Client, chat?: string) =>
  c.messages.flatMap((m) => (m.type === "message" ? [m.message] : m.type === "history" ? m.messages : [])).filter((m) => !chat || m.chat === chat);
