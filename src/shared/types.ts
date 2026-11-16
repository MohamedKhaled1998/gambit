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
  /** Whole favours; starts at 10, never below 0, and 0 once unmasked (they vanish). */
  favours: number;
  /** The round this guest was unmasked in; absent while they remain. */
  unmaskedIn?: number;
}

export const START_FAVOURS = 10;
export const MINGLE_MS = 4 * 60_000;
export const DANCE_MS = 5 * 60_000;
export const SENT_DOWN_MS = 60_000;
export const CELLAR_MS = 3 * 60_000;
export const UNMASKING_MS = 60_000;
/** A quick game's rounds, before the Last Dance. */
export const QUICK_ROUNDS = 3;

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
  /** Drawn at most once a game. */
  oncePerGame?: boolean;
  generator:
    | { kind: "sums"; bands: { fromStep: number; kind: "addsub" | "mul" | "twoOps" }[] }
    | { kind: "sequences"; bands: { fromStep: number; rules: 1 | 2 }[] };
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

/** The guests sent down after a Dance, and the Cellar game they play. */
export interface CellarState {
  def: MatchDef;
  encore: boolean;
  /** The guests sent down, in no public order. */
  guests: GuestId[];
  /** How many this round's Cellar game unmasks; 0 in a warm-up round. */
  unmaskings: number;
  /** Set when the Cellar game starts. */
  race: RaceState | null;
  /** Set when the Cellar game ends. */
  ranking: RankingEntry[] | null;
  unmasked: GuestId[];
}

/** One match drawn this game, in draw order. */
export interface DrawnRecord {
  round: number;
  role: "dance" | "cellar";
  id: string;
}

/** Whole favours one guest gave another in a Mingle; known only to the two of them. */
export interface Gift {
  round: number;
  from: GuestId;
  to: GuestId;
  favours: number;
}

/** A private chat some guests share; who is in it is public, what is said is not. */
export interface Room {
  id: string;
  members: GuestId[];
  /** Guests unmasked out of this chat: they keep its history, read-only. Never in a view. */
  unmasked?: GuestId[];
}

export interface GameState {
  phase: "foyer" | "mingle" | "dance" | "sentDown" | "cellar" | "unmasking" | "lastDance";
  format: Format;
  /** Seed state for every random draw; advances as draws are made. */
  seed: number;
  host: GuestId | null;
  guests: GuestRecord[];
  round: number;
  /** Rounds in this game before the Last Dance. */
  rounds: number;
  /** Every match drawn so far, for the draw rule. */
  drawn: DrawnRecord[];
  /** When the current phase ends; null in the Foyer and at the Last Dance. */
  deadline: number | null;
  /** The round's Dance, copied from the library when the game starts. */
  danceDef: MatchDef | null;
  danceEncore: boolean;
  match: RaceState | null;
  danceResult: DanceResult | null;
  cellar: CellarState | null;
  /** Every gift given this game. */
  gifts: Gift[];
  /** Each remaining guest's total as the current Mingle began: the standings shown during it. */
  mingleStandings: Record<GuestId, number>;
  /** Every Room opened this game, in the order opened. */
  rooms: Room[];
  /** One Cellar talk per Cellar game that has started, for exactly the guests sent down; never in a view. */
  cellarTalks: Room[];
}

export type Action =
  | { type: "join"; guest: GuestId; name: string }
  | { type: "removeGuest"; guest: GuestId; target: GuestId }
  | { type: "start"; guest: GuestId }
  | { type: "answer"; guest: GuestId; position: number }
  | { type: "buyPoints"; guest: GuestId; favours: number }
  | { type: "gift"; guest: GuestId; to: GuestId; favours: number }
  | { type: "openRoom"; guest: GuestId; members: GuestId[] }
  | { type: "leaveRoom"; guest: GuestId; room: string }
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
  | "not playing in this match"
  | "too late"
  | "already answered"
  | "no such choice"
  | "not enough favours"
  | "gifts are given in the Mingle only"
  | "can't gift yourself"
  | "bad amount"
  | "the game hasn't started"
  | "a Room needs another guest"
  | "a Room can't hold everyone"
  | "no such Room"
  | "not in that Room";

export type ApplyResult = { ok: true; state: GameState } | { ok: false; reason: Rejection };

export interface PublicGuest {
  id: GuestId;
  name: string;
  mask: Mask;
  /** Unmasked: the mask floats off and the name is written in. */
  unmasked: boolean;
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
  /** Drawn a second time this game: fresh problems, no Prelude. */
  encore: boolean;
  rulesSummary: string;
  workedExample: string;
}

interface Seated {
  you: GuestId;
  host: GuestId;
  guests: PublicGuest[];
  /** Every Room and who is in it: the "who's talking" screen. */
  rooms: Room[];
  /** This guest's own chats and whether they can post in each: `chatAccess`, so the phone holds no rules. */
  chats: ChatAccess;
}

export type GuestView =
  | (Seated & { phase: "foyer"; format: Format; canStart: boolean; canRemove: boolean })
  | (Seated & {
      phase: "mingle";
      round: number;
      deadline: number;
      /** Your own live balance. */
      favours: number;
      /** Everyone's totals as the Mingle began; gifts never move them. */
      standings: Record<GuestId, number>;
      /** This round's gifts you gave or received; never anyone else's. */
      gifts: { from: GuestId; to: GuestId; favours: number }[];
      announcement: Announcement;
    })
  | (Seated & {
      phase: "dance";
      round: number;
      favours: number;
      announcement: Announcement;
      buyRate: number;
      /** Null for a guest who isn't playing (unmasked). */
      step: StepView | null;
      /** Public running ranking; bought points show at once. */
      ranking: RankingEntry[];
    })
  | (Seated & {
      phase: "sentDown";
      round: number;
      deadline: number;
      danceRanking: RankingEntry[];
      payout: Record<GuestId, number>;
      /** Public after the Dance. */
      favours: Record<GuestId, number>;
      /** The guests sent down. */
      cellar: GuestId[];
      /** How many the Cellar game unmasks; revealed here, never before. */
      unmaskings: number;
      cellarGame: Announcement;
    })
  | (Seated & {
      phase: "cellar";
      round: number;
      deadline: number;
      /** Your own live balance. */
      favours: number;
      cellar: GuestId[];
      unmaskings: number;
      announcement: Announcement;
      buyRate: number;
      /** Only for a guest in the Cellar: the private problem. Free guests watch the ranking alone. */
      step: StepView | null;
      ranking: RankingEntry[];
    })
  | (Seated & {
      phase: "unmasking";
      round: number;
      deadline: number;
      cellarRanking: RankingEntry[];
      unmasked: GuestId[];
      /** Remaining guests' favours, public after the Cellar game. */
      favours: Record<GuestId, number>;
    })
  | (Seated & {
      phase: "lastDance";
      /** Placeholder end screen: the last two. */
      finalists: GuestId[];
      favours: Record<GuestId, number>;
    });

/** A chat's id: "table", "balcony", a Room's id, or a Cellar talk's id ("cellar-" and its round). */
export type ChatId = string;

/** The chats a guest can read; `canPost` is whether they can also post. */
export type ChatAccess = { chat: ChatId; canPost: boolean }[];

export const MESSAGE_PAGE = 30;
export const MAX_MESSAGE_LENGTH = 500;

/** A chat message as the server delivers it, to that chat's members only. */
export interface ChatMessage {
  seq: number;
  chat: ChatId;
  guest: GuestId;
  body: string;
  at: number;
}

/** Message envelope. */
export type ServerMessage =
  | { type: "view"; view: GuestView; version: number; build: string; /** Server time when sent, for the client's clock offset. */ now: number }
  | { type: "seat"; guest: GuestId; token: string }
  | { type: "message"; message: ChatMessage }
  /** A page of one chat, oldest first; `more` says whether older messages remain. */
  | { type: "history"; chat: ChatId; messages: ChatMessage[]; more: boolean }
  | { type: "error"; reason: string };

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "action"; id: string; action: ClientAction }
  | { type: "post"; chat: ChatId; body: string }
  /** The page of `chat` just older than the message `before`. */
  | { type: "loadHistory"; chat: ChatId; before: number };

/** An action as a client sends it; the server fills in the acting guest. */
export type ClientAction =
  | { type: "removeGuest"; target: GuestId }
  | { type: "start" }
  | { type: "answer"; position: number }
  | { type: "buyPoints"; favours: number }
  | { type: "gift"; to: GuestId; favours: number }
  | { type: "openRoom"; members: GuestId[] }
  | { type: "leaveRoom"; room: string };

const CLIENT_ACTION_TYPES: readonly string[] = ["removeGuest", "start", "answer", "buyPoints", "gift", "openRoom", "leaveRoom"] satisfies ClientAction["type"][];

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
