import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import { apply, chatAccess, doorsOpen, newGame, nextDeadline, viewFor } from "../engine/game";
import { isDeleted } from "../engine/last-dance";
import {
  CLOSE_NO_SEAT,
  CLOSE_REMOVED,
  CLOSE_TAKEN_OVER,
  type Action,
  type ChatId,
  type ChatMessage,
  type ClientMessage,
  type GameState,
  type GuestId,
  isClientAction,
  MAX_MESSAGE_LENGTH,
  MESSAGE_PAGE,
  type SeatGrant,
  type ServerMessage,
} from "../shared/types";
import { hashSeatToken, hashView, newSeatToken } from "./seats";

interface ConnState {
  /** Null until the connection has a seat. */
  guest: GuestId | null;
  /** Hash of the last view sent, so an unchanged view isn't sent again. */
  viewHash: string | null;
}

/**
 * One Durable Object per game: a thin shell that loads the state, applies the
 * action, saves, sends views and sets the alarm. No game rules live here, and
 * nothing is kept in memory between wakes.
 */
export class Game extends Server<Cloudflare.Env> {
  static options = { hibernate: true };

  onStart(): void {
    this.sql`CREATE TABLE IF NOT EXISTS game (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, state TEXT NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS actions (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL, guest TEXT NOT NULL, action TEXT NOT NULL, at INTEGER NOT NULL, UNIQUE (guest, id))`;
    this.sql`CREATE TABLE IF NOT EXISTS messages (seq INTEGER PRIMARY KEY AUTOINCREMENT, chat TEXT NOT NULL, guest TEXT NOT NULL, body TEXT NOT NULL, at INTEGER NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS seats (guest TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE)`;
  }

  // --- storage ---------------------------------------------------------

  private load(): { state: GameState; version: number } | null {
    const row = this.sql<{ version: number; state: string }>`SELECT version, state FROM game WHERE id = 1`[0];
    return row ? { state: JSON.parse(row.state) as GameState, version: row.version } : null;
  }

  private save(state: GameState, version: number): void {
    const json = JSON.stringify(state);
    this.sql`INSERT INTO game (id, version, state) VALUES (1, ${version}, ${json}) ON CONFLICT (id) DO UPDATE SET version = ${version}, state = ${json}`;
  }

  /** Makes a token and its hash up front, so nothing is awaited between loading and saving the state. */
  private async newSeat(): Promise<{ token: string; hash: string }> {
    const token = newSeatToken();
    return { token, hash: await hashSeatToken(token) };
  }

  private storeSeat(guest: GuestId, hash: string): void {
    this.sql`INSERT INTO seats (guest, token_hash) VALUES (${guest}, ${hash}) ON CONFLICT (guest) DO UPDATE SET token_hash = ${hash}`;
  }

  // --- creating a game -------------------------------------------------

  /** POST /create {name}: the Host arrives. 409 when this object already holds a game. */
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || !url.pathname.endsWith("/create")) return new Response("not found", { status: 404 });
    // Everything awaited comes first; nothing is awaited between the check and the save.
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const name = String(body.name ?? "");
    const { token, hash } = await this.newSeat();
    if (this.load()) return Response.json({ error: "code taken" }, { status: 409 });
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    const guest = crypto.randomUUID();
    const result = apply(newGame(seed), { type: "join", guest, name }, Date.now());
    if (!result.ok) return Response.json({ error: result.reason }, { status: 400 });
    this.save(result.state, 1);
    this.storeSeat(guest, hash);
    const grant: SeatGrant = { code: this.name, guest, token };
    return Response.json(grant);
  }

  // --- connections -----------------------------------------------------

  private send(connection: Connection, message: ServerMessage): void {
    try {
      connection.send(JSON.stringify(message));
    } catch {
      // The socket closed under us; nothing to tell it.
    }
  }

  async onConnect(connection: Connection<ConnState>, ctx: ConnectionContext): Promise<void> {
    const loaded = this.load();
    if (!loaded) {
      this.send(connection, { type: "error", reason: "no such game" });
      connection.close(CLOSE_NO_SEAT, "no such game");
      return;
    }
    const token = new URL(ctx.request.url).searchParams.get("token");
    if (!token) {
      // No token, no seat; the connection may only ask to join while the doors are open.
      if (!doorsOpen(loaded.state)) {
        this.send(connection, { type: "error", reason: "doors are closed" });
        connection.close(CLOSE_NO_SEAT, "doors are closed");
        return;
      }
      connection.setState({ guest: null, viewHash: null });
      return;
    }
    const hash = await hashSeatToken(token);
    const seat = this.sql<{ guest: string }>`SELECT guest FROM seats WHERE token_hash = ${hash}`[0];
    if (!seat || !viewFor(loaded.state, seat.guest)) {
      this.send(connection, { type: "error", reason: "no seat for this token" });
      connection.close(CLOSE_NO_SEAT, "no seat");
      return;
    }
    this.takeOver(seat.guest, connection.id);
    connection.setState({ guest: seat.guest, viewHash: null });
    this.sendViews(loaded.state, loaded.version);
    for (const { chat } of chatAccess(loaded.state, seat.guest)) this.sendPage(connection, chat, null);
  }

  // --- chat: outside the game state, delivered to a chat's members only ---

  /** The page of `chat` just older than `before` (the latest page when null), oldest first. */
  private sendPage(connection: Connection, chat: ChatId, before: number | null): void {
    const rows = this.sql<ChatMessage>`SELECT seq, chat, guest, body, at FROM messages WHERE chat = ${chat} AND seq < ${before ?? Number.MAX_SAFE_INTEGER} ORDER BY seq DESC LIMIT ${MESSAGE_PAGE + 1}`;
    this.send(connection, { type: "history", chat, messages: rows.slice(0, MESSAGE_PAGE).reverse(), more: rows.length > MESSAGE_PAGE });
  }

  private canRead(state: GameState, guest: GuestId | null | undefined, chat: ChatId): boolean {
    return !!guest && chatAccess(state, guest).some((c) => c.chat === chat);
  }

  private post(connection: Connection<ConnState>, loaded: { state: GameState }, chat: unknown, body: unknown): void {
    const guest = connection.state?.guest;
    if (!guest) return this.send(connection, { type: "error", reason: "no seat" });
    const access = typeof chat === "string" ? chatAccess(loaded.state, guest).find((c) => c.chat === chat) : undefined;
    if (!access || typeof chat !== "string") return this.send(connection, { type: "error", reason: "no such chat" });
    if (!access.canPost) return this.send(connection, { type: "error", reason: "this chat is read-only" });
    const text = typeof body === "string" ? body.trim() : "";
    if (text === "") return this.send(connection, { type: "error", reason: "empty message" });
    if ([...text].length > MAX_MESSAGE_LENGTH) return this.send(connection, { type: "error", reason: "message too long" });
    const at = Date.now();
    const seq = this.sql<{ seq: number }>`INSERT INTO messages (chat, guest, body, at) VALUES (${chat}, ${guest}, ${text}, ${at}) RETURNING seq`[0]!.seq;
    const message: ServerMessage = { type: "message", message: { seq, chat, guest, body: text, at } };
    for (const c of this.getConnections<ConnState>()) if (this.canRead(loaded.state, c.state?.guest, chat)) this.send(c, message);
  }

  /** A second tab takes the seat and closes the old socket. */
  private takeOver(guest: GuestId, exceptId: string): void {
    for (const other of this.getConnections<ConnState>()) {
      if (other.id !== exceptId && other.state?.guest === guest) other.close(CLOSE_TAKEN_OVER, "seat taken over by another tab");
    }
  }

  async onMessage(connection: Connection<ConnState>, raw: WSMessage): Promise<void> {
    let message: ClientMessage;
    try {
      message = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)) as ClientMessage;
    } catch {
      return this.send(connection, { type: "error", reason: "bad message" });
    }
    const guest = connection.state?.guest ?? null;
    // Hash a would-be seat's token before loading: no await between load and commit.
    const seat = message.type === "join" && !guest ? await this.newSeat() : null;
    const loaded = this.load();
    if (!loaded) return this.send(connection, { type: "error", reason: "no such game" });

    if (message.type === "join") {
      if (guest || !seat) return this.send(connection, { type: "error", reason: "already joined" });
      const id = crypto.randomUUID();
      const result = apply(loaded.state, { type: "join", guest: id, name: String(message.name ?? "") }, Date.now());
      if (!result.ok) {
        this.send(connection, { type: "error", reason: result.reason });
        if (!doorsOpen(loaded.state)) connection.close(CLOSE_NO_SEAT, result.reason);
        return;
      }
      this.storeSeat(id, seat.hash);
      connection.setState({ guest: id, viewHash: null });
      this.send(connection, { type: "seat", guest: id, token: seat.token });
      this.commit(result.state, loaded.version + 1);
      return;
    }

    if (message.type === "post") return this.post(connection, loaded, message.chat, message.body);

    if (message.type === "loadHistory") {
      if (typeof message.chat !== "string" || !this.canRead(loaded.state, guest, message.chat)) return this.send(connection, { type: "error", reason: "no such chat" });
      const before = Number(message.before);
      return this.sendPage(connection, message.chat, Number.isFinite(before) ? before : null);
    }

    if (message.type === "action") {
      if (!guest) return this.send(connection, { type: "error", reason: "no seat" });
      if (typeof message.id !== "string" || message.id === "") return this.send(connection, { type: "error", reason: "bad message" });
      const seen = this.sql`SELECT 1 AS seen FROM actions WHERE guest = ${guest} AND id = ${message.id}`;
      if (seen.length > 0) return; // already applied; never twice
      if (!isClientAction(message.action)) return this.send(connection, { type: "error", reason: "unknown action" });
      const action: Action = { ...message.action, guest };
      const now = Date.now();
      const result = apply(loaded.state, action, now);
      if (!result.ok) return this.send(connection, { type: "error", reason: result.reason });
      this.sql`INSERT INTO actions (id, guest, action, at) VALUES (${message.id}, ${guest}, ${JSON.stringify(action)}, ${now})`;
      this.commit(result.state, loaded.version + 1);
    }
  }

  async onAlarm(): Promise<void> {
    const loaded = this.load();
    if (!loaded) return;
    const now = Date.now();
    // Who is connected is the one thing only the server knows; the Jury is counted from it.
    const present = [...new Set([...this.getConnections<ConnState>()].flatMap((c) => (c.state?.guest ? [c.state.guest] : [])))];
    const result = apply(loaded.state, { type: "tick", present }, now);
    if (!result.ok) return;
    if (isDeleted(result.state)) return this.deleteGame();
    this.sql`INSERT INTO actions (id, guest, action, at) VALUES (${crypto.randomUUID()}, ${""}, ${JSON.stringify({ type: "tick" })}, ${now})`;
    this.commit(result.state, loaded.version + 1);
  }

  /** A finished game's storage goes 30 days after the end: state, actions, messages and seats. */
  private async deleteGame(): Promise<void> {
    for (const c of this.getConnections()) c.close(CLOSE_NO_SEAT, "this game has been deleted");
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    // The tables are gone with it; an empty set keeps a late visitor's "no such game" an answer rather than a crash.
    this.onStart();
  }

  // --- the loop: save, send views, set the alarm -------------------------

  private commit(state: GameState, version: number): void {
    const before = this.load()?.state;
    this.save(state, version);
    this.dropRemovedSeats(state);
    this.sendViews(state, version);
    this.openNewChats(before, state);
    const deadline = nextDeadline(state);
    if (deadline === null) void this.ctx.storage.deleteAlarm();
    else void this.ctx.storage.setAlarm(deadline);
  }

  private dropRemovedSeats(state: GameState): void {
    const seated = new Set(state.guests.map((g) => g.id));
    for (const row of this.sql<{ guest: string }>`SELECT guest FROM seats`) {
      if (seated.has(row.guest)) continue;
      this.sql`DELETE FROM seats WHERE guest = ${row.guest}`;
      for (const c of this.getConnections<ConnState>()) {
        if (c.state?.guest === row.guest) c.close(CLOSE_REMOVED, "removed from the Foyer");
      }
    }
  }

  /** A guest who can now read a chat they couldn't (the Balcony at unmasking, a new Room) is sent its latest page. */
  private openNewChats(before: GameState | undefined, state: GameState): void {
    if (!before) return;
    for (const c of this.getConnections<ConnState>()) {
      const guest = c.state?.guest;
      if (!guest) continue;
      const had = new Set(chatAccess(before, guest).map((a) => a.chat));
      for (const { chat } of chatAccess(state, guest)) if (!had.has(chat)) this.sendPage(c, chat, null);
    }
  }

  /** Each connected guest gets their own view, only when its hash changed. */
  private sendViews(state: GameState, version: number): void {
    for (const c of this.getConnections<ConnState>()) {
      const guest = c.state?.guest;
      if (!guest) continue;
      const view = viewFor(state, guest);
      if (!view) continue;
      const hash = hashView(JSON.stringify(view));
      if (c.state?.viewHash === hash) continue;
      c.setState({ guest, viewHash: hash });
      this.send(c, { type: "view", view, version, build: this.env.BUILD_ID, now: Date.now() });
    }
  }
}
