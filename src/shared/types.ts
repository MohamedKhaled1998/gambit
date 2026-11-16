/** Types shared by the rules engine, the game server and the client. */

export const COLOURS = ["gold", "silver", "red", "sapphire", "emerald", "onyx"] as const;
export type Colour = (typeof COLOURS)[number];
export const SHAPES = ["fox", "cat", "owl", "plain"] as const;
export type Shape = (typeof SHAPES)[number];

/** Placeholder mask: a colour from the six-colour palette and a shape. */
export interface Mask {
  colour: Colour;
  shape: Shape;
}

export type GuestId = string;
export type Format = "quick";

export const MIN_GUESTS = 4;
export const MAX_GUESTS = 10;
export const MAX_NAME_LENGTH = 20;
export const CODE_LENGTH = 5;

export interface GuestRecord {
  id: GuestId;
  name: string;
  mask: Mask;
  /** When the guest arrived; bookkeeping that is never shown to anyone. */
  joinedAt: number;
}

export interface GameState {
  phase: "foyer" | "started";
  format: Format;
  /** Seed state for every random draw; advances as draws are made. */
  seed: number;
  host: GuestId | null;
  guests: GuestRecord[];
}

export type Action =
  | { type: "join"; guest: GuestId; name: string }
  | { type: "removeGuest"; guest: GuestId; target: GuestId }
  | { type: "start"; guest: GuestId }
  | { type: "tick" };

export type Rejection =
  | "doors are closed"
  | "the Foyer is full"
  | "name needed"
  | "name too long"
  | "already joined"
  | "no such guest"
  | "only the Host can do that"
  | "the Host can't be removed"
  | "need 4-10 guests to start"
  | "the game has started";

export type ApplyResult = { ok: true; state: GameState } | { ok: false; reason: Rejection };

export interface PublicGuest {
  id: GuestId;
  name: string;
  mask: Mask;
}

export type GuestView =
  | {
      phase: "foyer";
      you: GuestId;
      host: GuestId;
      format: Format;
      guests: PublicGuest[];
      canStart: boolean;
      canRemove: boolean;
    }
  | {
      phase: "started";
      you: GuestId;
      host: GuestId;
      guests: PublicGuest[];
    };

/** Chats a guest can read and post in; none exist yet. */
export type ChatAccess = never[];

/** Message envelope. */
export type ServerMessage =
  | { type: "view"; view: GuestView; version: number; build: string }
  | { type: "seat"; guest: GuestId; token: string }
  | { type: "error"; reason: string };

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "action"; id: string; action: ClientAction };

/** An action as a client sends it; the server fills in the acting guest. */
export type ClientAction =
  | { type: "removeGuest"; target: GuestId }
  | { type: "start" };

const CLIENT_ACTION_TYPES: readonly string[] = ["removeGuest", "start"] satisfies ClientAction["type"][];

/** True only for the actions a client may send; never `tick`, which only the alarm sends. */
export function isClientAction(value: unknown): value is ClientAction {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && CLIENT_ACTION_TYPES.includes(type);
}

/** WebSocket close codes the server uses. */
export const CLOSE_TAKEN_OVER = 4001;
export const CLOSE_NO_SEAT = 4002;
export const CLOSE_REMOVED = 4003;

/** Response of POST /api/games and of the join route. */
export interface SeatGrant {
  code: string;
  guest: GuestId;
  token: string;
}
