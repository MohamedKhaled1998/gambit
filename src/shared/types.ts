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
  /** Whole favours; starts at 10, never below 0. */
  favours: number;
}

export const START_FAVOURS = 10;
export const MINGLE_MS = 4 * 60_000;
export const DANCE_MS = 5 * 60_000;

/** Dance payout by guests remaining, 1st to last; zero-sum. */
export const DANCE_PAYOUTS: Record<number, readonly number[]> = {
  3: [2, 0, -2],
  4: [2, 1, -1, -2],
  5: [2, 1, 0, -1, -2],
  6: [3, 2, 1, -1, -2, -3],
  7: [3, 2, 1, 0, -1, -2, -3],
  8: [3, 2, 1, 0, 0, -1, -2, -3],
  9: [3, 2, 1, 0, 0, 0, -1, -2, -3],
  10: [3, 2, 1, 1, 0, 0, -1, -1, -2, -3],
};

/** A match on the Race match type: data only. */
export interface RaceMatchDef {
  id: string;
  name: string;
  type: "race";
  /** About 40 words, speaking to the guest as "you". */
  rulesSummary: string;
  workedExample: string;
  guestRange: { dance: [number, number] | null; cellar: [number, number] | null };
  steps: { dance: number | null; cellar: number | null };
  studySeconds: number;
  answerSeconds: number;
  /** Answer, then the step reveal. */
  stepSeconds: number;
  preludeSeconds: number;
  pointsPerCorrect: number;
  /** Points one favour buys. */
  buyRate: number;
  tieBreak: ("points" | "time" | "draw")[];
  generator: { kind: "sums"; bands: { fromStep: number; kind: "addsub" | "mul" | "twoOps" }[] };
}
export type MatchDef = RaceMatchDef;

export interface Problem {
  prompt: string;
  /** Canonical order; index 0 is the right answer. Never sent as is. */
  choices: string[];
}

export interface RaceState {
  def: RaceMatchDef;
  problems: Problem[];
  /** layouts[guest][step][position] = index into the problem's canonical choices. */
  layouts: Record<GuestId, number[][]>;
  step: number;
  stage: "answer" | "reveal";
  stepStartedAt: number;
  answerDeadline: number;
  /** End of the current stage. */
  deadline: number;
  /** A fixed random order per guest, the last tie-break; never shown. */
  drawKeys: Record<GuestId, number>;
  /** This step's answers by position chosen; hidden until the reveal. */
  answers: Record<GuestId, { position: number; at: number }>;
  points: Record<GuestId, number>;
  /** Total answer time in ms over revealed steps. */
  time: Record<GuestId, number>;
  /** The step just revealed, per guest. */
  results: Record<GuestId, "right" | "wrong" | "none">;
}

export interface RankingEntry {
  guest: GuestId;
  points: number;
  /** Total answer time in ms. */
  time: number;
  /** True when the draw, not points or time, put this guest ahead of or behind a neighbour. */
  drawn: boolean;
}

export interface DanceResult {
  ranking: RankingEntry[];
  payout: Record<GuestId, number>;
}

export interface GameState {
  phase: "foyer" | "mingle" | "dance" | "standings";
  format: Format;
  /** Seed state for every random draw; advances as draws are made. */
  seed: number;
  host: GuestId | null;
  guests: GuestRecord[];
  round: number;
  /** When the current phase ends; null in the Foyer and at the standings. */
  deadline: number | null;
  /** The round's Dance, copied from the library when the game starts. */
  danceDef: MatchDef | null;
  match: RaceState | null;
  danceResult: DanceResult | null;
}

export type Action =
  | { type: "join"; guest: GuestId; name: string }
  | { type: "removeGuest"; guest: GuestId; target: GuestId }
  | { type: "start"; guest: GuestId }
  | { type: "answer"; guest: GuestId; position: number }
  | { type: "buyPoints"; guest: GuestId; favours: number }
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
  | "the game has started"
  | "no Dance is running"
  | "too late"
  | "already answered"
  | "no such choice"
  | "not enough favours"
  | "bad amount";

export type ApplyResult = { ok: true; state: GameState } | { ok: false; reason: Rejection };

export interface PublicGuest {
  id: GuestId;
  name: string;
  mask: Mask;
}

export interface StepView {
  index: number;
  total: number;
  stage: "answer" | "reveal";
  startedAt: number;
  answerDeadline: number;
  deadline: number;
  prompt: string;
  /** In this guest's own order. */
  choices: string[];
  /** The position this guest chose, if any; never anyone else's. */
  yourAnswer: number | null;
  /** Only once the step is revealed. */
  reveal: { correct: number; yourResult: "right" | "wrong" | "none" } | null;
}

export interface Announcement {
  name: string;
  rulesSummary: string;
  workedExample: string;
}

interface Seated {
  you: GuestId;
  host: GuestId;
  guests: PublicGuest[];
}

export type GuestView =
  | (Seated & { phase: "foyer"; format: Format; canStart: boolean; canRemove: boolean })
  | (Seated & { phase: "mingle"; round: number; deadline: number; favours: number; announcement: Announcement })
  | (Seated & {
      phase: "dance";
      round: number;
      favours: number;
      announcement: Announcement;
      buyRate: number;
      step: StepView;
      /** Public running ranking, from revealed steps only. */
      ranking: RankingEntry[];
    })
  | (Seated & {
      phase: "standings";
      round: number;
      danceRanking: RankingEntry[];
      payout: Record<GuestId, number>;
      /** Public after the Dance. */
      favours: Record<GuestId, number>;
    });

/** Chats a guest can read and post in; none exist yet. */
export type ChatAccess = never[];

/** Message envelope. */
export type ServerMessage =
  | { type: "view"; view: GuestView; version: number; build: string; /** Server time when sent, for the client's clock offset. */ now: number }
  | { type: "seat"; guest: GuestId; token: string }
  | { type: "error"; reason: string };

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "action"; id: string; action: ClientAction };

/** An action as a client sends it; the server fills in the acting guest. */
export type ClientAction =
  | { type: "removeGuest"; target: GuestId }
  | { type: "start" }
  | { type: "answer"; position: number }
  | { type: "buyPoints"; favours: number };

const CLIENT_ACTION_TYPES: readonly string[] = ["removeGuest", "start", "answer", "buyPoints"] satisfies ClientAction["type"][];

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
