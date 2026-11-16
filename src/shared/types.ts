/** Types shared by the rules engine, the game server and the client. */

export const COLOURS = ["gold", "silver", "red", "sapphire", "emerald", "onyx"] as const;
export type Colour = (typeof COLOURS)[number];
export const SHAPES = ["fox", "cat", "owl", "plain"] as const;
export type Shape = (typeof SHAPES)[number];

export const TRIMS = ["pearls", "lace", "ribbons"] as const;
export type Trim = (typeof TRIMS)[number];
/** Feathers run 0 to this many, so they stay countable at about 48px. */
export const FEATHER_MAX = 3;

/** A mask is data: its traits. The client draws it; problem banks only pick traits. */
export interface Mask {
  colour: Colour;
  shape: Shape;
  /** In cream; null for none. */
  trim: Trim | null;
  /** 0 to FEATHER_MAX. */
  feathers: number;
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
  /** The match shows masks, so its Rules card carries the strip of the six colours. */
  masks?: boolean;
  generator:
    | { kind: "oddmask"; bands: { fromStep: number; decoys: boolean }[] }
    /** A crowd growing from `crowd[0]` to `crowd[1]` masks; steps from `secondFrom` (0-1 of the way) ask for a second trait. */
    | { kind: "glitters"; crowd: [number, number]; secondFrom: number }
    /** A grid of side `sizes[i]`, each size taking an equal share of the steps. */
    | { kind: "seating"; sizes: number[] }
    /** Sequences growing from `length[0]` to `length[1]` masks. */
    | { kind: "arrivals"; length: [number, number] }
    | { kind: "sums"; bands: { fromStep: number; kind: "addsub" | "mul" | "twoOps" }[] }
    | { kind: "sequences"; bands: { fromStep: number; rules: 1 | 2 }[] };
}
/** A match on the Sealed bid match type: one lot a step goes to the highest sealed bid. Data only. */
export interface SealedBidMatchDef {
  id: string;
  name: string;
  type: "sealedBid";
  rulesSummary: string;
  workedExample: string;
  guestRange: { dance: [number, number] | null; cellar: [number, number] | null };
  /** The most steps any band plays; the longest the match runs. */
  steps: { dance: number | null; cellar: number | null };
  /** Every guest's points at the start. */
  startingPoints: number;
  /** Lots by guest count: the first band whose `upTo` reaches the guests. */
  lotBands: { upTo: number; lots: number }[];
  /** A lot's value runs from `lotValue[0]` to `lotValue[1]`; the values sum to about `meanValue` × lots. */
  lotValue: [number, number];
  meanValue: number;
  studySeconds: number;
  /** The bid phase. */
  answerSeconds: number;
  /** Bid, then the reveal. */
  stepSeconds: number;
  preludeSeconds: number;
  buyRate: number;
  tieBreak: ("points" | "lots" | "draw")[];
  oncePerGame?: boolean;
  masks?: boolean;
}
/** A match on the Group target match type: guests pledge to one pot, then each shares or pockets. Data only. */
export interface GroupTargetMatchDef {
  id: string;
  name: string;
  type: "groupTarget";
  rulesSummary: string;
  workedExample: string;
  guestRange: { dance: [number, number] | null; cellar: [number, number] | null };
  /** Pledge steps plus the reckoning. */
  steps: { dance: number | null; cellar: number | null };
  pledgeSteps: number;
  /** Points each guest is handed at every pledge step. */
  pointsPerStep: number;
  /** The pot must reach this × guests. */
  targetPerGuest: number;
  /** Favours for everyone when the pot reached the target and nobody pockets. */
  allShareAward: number;
  /** Favours for a lone pocket when the pot reached the target. */
  lonePocketAward: number;
  studySeconds: number;
  /** The pledge phase, and the reckoning's choice phase. */
  answerSeconds: number;
  /** Pledge, then the reveal. */
  stepSeconds: number;
  preludeSeconds: number;
  buyRate: number;
  tieBreak: ("points" | "draw")[];
  oncePerGame?: boolean;
  masks?: boolean;
}
/** A match on the Unique pick match type: every guest secretly picks a number a step; numbers nobody else picked score. Data only. */
export interface UniquePickMatchDef {
  id: string;
  name: string;
  type: "uniquePick";
  rulesSummary: string;
  workedExample: string;
  guestRange: { dance: [number, number] | null; cellar: [number, number] | null };
  steps: { dance: number | null; cellar: number | null };
  /** The highest number to pick, by guest count: the first band whose `upTo` reaches the guests. */
  rangeBands: { upTo: number; max: number }[];
  /** Extra points for the highest unique number. */
  topBonus: number;
  studySeconds: number;
  /** The pick phase. */
  answerSeconds: number;
  /** Pick, then the reveal. */
  stepSeconds: number;
  preludeSeconds: number;
  buyRate: number;
  tieBreak: ("points" | "uniques" | "draw")[];
  oncePerGame?: boolean;
  masks?: boolean;
}
export type MatchDef = RaceMatchDef | SealedBidMatchDef | GroupTargetMatchDef | UniquePickMatchDef;

/** A Unique pick match running: picks hidden until the step's reveal. */
export interface PickState {
  def: UniquePickMatchDef;
  /** Highest number a guest may pick. */
  range: number;
  total: number;
  step: number;
  stage: "pick" | "reveal";
  stepStartedAt: number;
  pickDeadline: number;
  /** End of the current stage. */
  deadline: number;
  drawKeys: Record<GuestId, number>;
  /** This step's picks; hidden until the reveal. */
  picks: Record<GuestId, number>;
  points: Record<GuestId, number>;
  /** Unique picks so far. */
  uniques: Record<GuestId, number>;
  /** The step just revealed: every pick, and what each guest scored. */
  last: { picks: { guest: GuestId; number: number; unique: boolean }[]; scored: Record<GuestId, number> } | null;
}

export type ReckoningChoice = "share" | "pocket";

/** A Group target match running. Pledges, points and choices stay hidden until the final reveal. */
export interface PledgeState {
  def: GroupTargetMatchDef;
  /** 0 to `pledgeSteps - 1` are pledge steps; `pledgeSteps` is the reckoning. */
  step: number;
  stage: "pledge" | "reveal" | "reckon" | "final";
  stepStartedAt: number;
  /** End of the phase where guests act. */
  actDeadline: number;
  /** End of the current stage. */
  deadline: number;
  drawKeys: Record<GuestId, number>;
  /** Points a guest may pledge at the open step: handed points plus any bought. */
  stock: Record<GuestId, number>;
  /** This step's pledges, until the step's reveal. */
  current: Record<GuestId, number>;
  /** Pledges of the steps revealed, per guest. */
  pledges: Record<GuestId, number[]>;
  /** Kept points. */
  points: Record<GuestId, number>;
  choices: Record<GuestId, ReckoningChoice>;
  /** Favours awarded per guest, set at the final reveal. */
  award: Record<GuestId, number> | null;
}

/** A Sealed bid match running: one lot a step, bids hidden until the reveal. */
export interface AuctionState {
  def: SealedBidMatchDef;
  /** Public values of the lots, in the order they are sold. */
  lots: number[];
  step: number;
  stage: "bid" | "reveal";
  stepStartedAt: number;
  bidDeadline: number;
  /** End of the current stage. */
  deadline: number;
  drawKeys: Record<GuestId, number>;
  /** This step's bids; hidden until the reveal. `order` is when each was submitted, 0 first. */
  bids: Record<GuestId, { amount: number; order: number }>;
  points: Record<GuestId, number>;
  /** Lots won so far. */
  won: Record<GuestId, number>;
  /** The step just revealed: who won the lot and what they paid; null while bidding or when nobody bid. */
  sale: { winner: GuestId; price: number } | null;
}

export interface Problem {
  prompt: string;
  /** Canonical order; index 0 is the right answer. Never sent as is. */
  choices: string[];
  /** Masks named in the question, shown as pictures beside the words. */
  promptMasks?: Mask[];
  /** When the choices are masks: one per choice, in the same order. */
  choiceMasks?: Mask[];
  /** Shown during the study phase only; the prompt and choices stay hidden until the answer phase. */
  study?: Study;
  /** Seconds this step's study lasts when it isn't the match's `studySeconds`. */
  studySeconds?: number;
}

/**
 * What the study phase shows. A crowd flashes all at once; a grid (cells in the problem's canonical
 * order, which is the order of its choices) is laid out in each guest's own order; a sequence arrives
 * one mask a second.
 */
export interface Study {
  kind: "crowd" | "grid" | "sequence";
  masks: Mask[];
  /** Cells per row of a grid. */
  cols?: number;
}

export interface RaceState {
  def: RaceMatchDef;
  problems: Problem[];
  /** layouts[guest][step][position] = index into the problem's canonical choices. */
  layouts: Record<GuestId, number[][]>;
  step: number;
  stage: "study" | "answer" | "reveal";
  stepStartedAt: number;
  /** When the answer phase opens: the step's start plus its study. */
  answerStartedAt: number;
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
  /** Total answer time in ms; 0 in a Sealed bid match. */
  time: number;
  /** Lots won, in a Sealed bid match. */
  lots?: number;
  /** Unique picks, in a Unique pick match. */
  uniques?: number;
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
  /** Set when the Cellar game starts, if it is on the Race match type. */
  race: RaceState | null;
  /** Set when the Cellar game starts, if it is on the Unique pick match type. */
  pick: PickState | null;
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
  /** The Dance when it is on the Sealed bid match type; `match` is then null. */
  auction: AuctionState | null;
  /** The Dance when it is on the Group target match type. */
  pledge: PledgeState | null;
  /** The Dance when it is on the Unique pick match type. */
  pick: PickState | null;
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
  | { type: "bid"; guest: GuestId; amount: number }
  | { type: "pledge"; guest: GuestId; amount: number }
  | { type: "pick"; guest: GuestId; number: number }
  | { type: "reckon"; guest: GuestId; choice: ReckoningChoice }
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
  | "wait for the answer phase"
  | "already answered"
  | "already bid"
  | "no auction is running"
  | "no pledge is running"
  | "no pick is running"
  | "picks are whole numbers in the range"
  | "already pledged"
  | "already picked"
  | "already chose"
  | "pledges are whole points up to your stock"
  | "wait for the reckoning"
  | "bids are whole points up to what you hold"
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
  stage: "study" | "answer" | "reveal";
  startedAt: number;
  answerStartedAt: number;
  answerDeadline: number;
  deadline: number;
  /** The prompt, empty while the study shows. */
  prompt: string;
  /** During the study only: what to show, in this guest's own layout. */
  study?: Study;
  /** The lights are out: a memory match's answer phase. The stage dims. */
  lightsOut: boolean;
  /** Set when the choices are the cells of a tile grid (no masks shown) rather than a choice grid. */
  grid?: { cols: number };
  /** In this guest's own order. */
  choices: string[];
  promptMasks?: Mask[];
  /** The masks to draw for the choices, in this guest's own order. */
  choiceMasks?: Mask[];
  /** The position this guest chose, if any; never anyone else's. */
  yourAnswer: number | null;
  /** Only once the step is revealed. */
  reveal: { correct: number; yourResult: "right" | "wrong" | "none" } | null;
}

/** A Sealed bid step as one guest sees it. */
export interface AuctionView {
  index: number;
  total: number;
  stage: "bid" | "reveal";
  startedAt: number;
  bidDeadline: number;
  deadline: number;
  /** The lot's public value. */
  lot: number;
  /** Your own live points: the most you can bid. */
  points: number;
  /** Your own bid, if made; never anyone else's before the reveal. */
  yourBid: number | null;
  /** Only once the lot is revealed: every bid with names, highest first (the first submitted ahead on equal bids). */
  reveal: { bids: { guest: GuestId; amount: number }[]; winner: GuestId | null; price: number } | null;
}

/** A Unique pick step as one guest sees it. */
export interface PickView {
  index: number;
  total: number;
  stage: "pick" | "reveal";
  startedAt: number;
  pickDeadline: number;
  deadline: number;
  /** Numbers run 1 to this. */
  range: number;
  /** Your own pick, if made; never anyone else's before the reveal. */
  yourPick: number | null;
  /** Only once the step is revealed: every pick with names, highest number first, and what each guest scored. */
  reveal: { picks: { guest: GuestId; number: number; unique: boolean }[]; scored: Record<GuestId, number> } | null;
}

/** A Group target step as one guest sees it. */
export interface PledgeView {
  index: number;
  total: number;
  stage: "pledge" | "reveal" | "reckon" | "final";
  startedAt: number;
  actDeadline: number;
  deadline: number;
  /** The most you can pledge now. */
  stock: number;
  /** Your own pledge to the open step, if made. */
  yourPledge: number | null;
  /** Your own kept points. */
  kept: number;
  /** The pot after the steps revealed so far: the only shared number before the final reveal. */
  pot: number;
  target: number;
  yourChoice: ReckoningChoice | null;
  /** Only at the final reveal: every pledge and choice with names, and the award. */
  final: { pledges: { guest: GuestId; amounts: number[] }[]; choices: Record<GuestId, ReckoningChoice>; award: Record<GuestId, number>; reached: boolean } | null;
}

export interface Announcement {
  name: string;
  /** Drawn a second time this game: fresh problems, no Prelude. */
  encore: boolean;
  rulesSummary: string;
  workedExample: string;
  /** Show the strip of the six colours with their names. */
  masks: boolean;
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
      /** Null for a guest who isn't playing (unmasked), and in a Sealed bid or Group target match. */
      step: StepView | null;
      /** The Sealed bid step; null in other matches and for a guest who isn't playing. */
      auction: AuctionView | null;
      /** The Group target step; null in other matches and for a guest who isn't playing. */
      pledge: PledgeView | null;
      /** The Unique pick step; null in other matches and for a guest who isn't playing. */
      pick: PickView | null;
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
      /** The Unique pick step, when the Cellar game is one. */
      pick: PickView | null;
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
  | { type: "bid"; amount: number }
  | { type: "pledge"; amount: number }
  | { type: "pick"; number: number }
  | { type: "reckon"; choice: ReckoningChoice }
  | { type: "buyPoints"; favours: number }
  | { type: "gift"; to: GuestId; favours: number }
  | { type: "openRoom"; members: GuestId[] }
  | { type: "leaveRoom"; room: string };

const CLIENT_ACTION_TYPES: readonly string[] = ["removeGuest", "start", "answer", "bid", "pledge", "pick", "reckon", "buyPoints", "gift", "openRoom", "leaveRoom"] satisfies ClientAction["type"][];

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
