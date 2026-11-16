import { LIBRARY } from "../content/library";
import {
    COLOURS,
  DANCE_PAYOUTS,
  MINGLE_MS,
  QUICK_ROUNDS,
  SENT_DOWN_MS,
  UNMASKING_MS,
  type CellarState,
  type GuestRecord,
  type RaceState,
  START_FAVOURS,
  type MatchDef,
  MAX_GUESTS,
  MAX_NAME_LENGTH,
  MIN_GUESTS,
  SHAPES,
  type Action,
  type ApplyResult,
  type ChatAccess,
  type GameState,
  type GuestId,
  type GuestView,
  type Mask,
  type Rejection,
} from "../shared/types";
import { drawMatch } from "./draw-match";
import { draw } from "./random";
import { cellarSize, unmaskingsFor } from "./schedule";
import { advanceRace, answerRace, buyPoints, rankRace, startRace, stepView } from "./race";

/** The rules engine: pure, with no clock, no Math.random and no platform imports. */

export function newGame(seed: number): GameState {
  return {
    phase: "foyer",
    format: "quick",
    seed: seed >>> 0,
    host: null,
    guests: [],
    round: 1,
    rounds: QUICK_ROUNDS,
    drawn: [],
    deadline: null,
    danceDef: null,
    danceEncore: false,
    match: null,
    danceResult: null,
    cellar: null,
    gifts: [],
    mingleStandings: {},
  };
}

/** A mask no other guest in the Foyer wears. */
function drawMask(seed: number, taken: Mask[]): [Mask, number] {
  const free: Mask[] = [];
  for (const colour of COLOURS)
    for (const shape of SHAPES) if (!taken.some((m) => m.colour === colour && m.shape === shape)) free.push({ colour, shape });
  const [r, next] = draw(seed);
  return [free[Math.floor(r * free.length)]!, next];
}

const reject = (reason: Extract<ApplyResult, { ok: false }>["reason"]): ApplyResult => ({ ok: false, reason });

export function apply(state: GameState, action: Action, now: number): ApplyResult {
  switch (action.type) {
    case "tick":
      return { ok: true, state: tick(state, now) };
    case "answer": {
      const found = findPlayer(state, action.guest);
      if (typeof found === "string") return reject(found);
      const next = structuredClone(state);
      const why = answerRace(activeRace(next)!, action.guest, action.position, now);
      if (why) return reject(why);
      next.deadline = activeRace(next)!.deadline;
      return { ok: true, state: next };
    }
    case "buyPoints": {
      const found = findPlayer(state, action.guest);
      if (typeof found === "string") return reject(found);
      if (!Number.isInteger(action.favours) || action.favours < 1) return reject("bad amount");
      if (action.favours > found.favours) return reject("not enough favours");
      const next = structuredClone(state);
      next.guests.find((g) => g.id === action.guest)!.favours -= action.favours;
      buyPoints(activeRace(next)!, action.guest, action.favours);
      return { ok: true, state: next };
    }
    case "gift": {
      const giver = state.guests.find((g) => g.id === action.guest);
      if (!giver) return reject("no such guest");
      if (state.phase !== "mingle") return reject("gifts are given in the Mingle only");
      if (giver.unmaskedIn !== undefined) return reject("no such guest");
      if (action.to === action.guest) return reject("can't gift yourself");
      const receiver = remaining(state).find((g) => g.id === action.to);
      if (!receiver) return reject("no such guest");
      if (!Number.isInteger(action.favours) || action.favours < 1) return reject("bad amount");
      if (action.favours > giver.favours) return reject("not enough favours");
      const next = structuredClone(state);
      next.guests.find((g) => g.id === action.guest)!.favours -= action.favours;
      next.guests.find((g) => g.id === action.to)!.favours += action.favours;
      next.gifts.push({ round: state.round, from: action.guest, to: action.to, favours: action.favours });
      return { ok: true, state: next };
    }
    case "join": {
      if (state.phase !== "foyer") return reject("doors are closed");
      if (state.guests.some((g) => g.id === action.guest)) return reject("already joined");
      if (state.guests.length >= MAX_GUESTS) return reject("the Foyer is full");
      const name = action.name.trim();
      if (name.length === 0) return reject("name needed");
      if ([...name].length > MAX_NAME_LENGTH) return reject("name too long");
      const [mask, seed] = drawMask(state.seed, state.guests.map((g) => g.mask));
      return {
        ok: true,
        state: {
          ...state,
          seed,
          host: state.host ?? action.guest,
          guests: [...state.guests, { id: action.guest, name, mask, joinedAt: now, favours: START_FAVOURS }],
        },
      };
    }
    case "removeGuest": {
      if (state.phase !== "foyer") return reject("the game has started");
      if (!state.guests.some((g) => g.id === action.guest)) return reject("no such guest");
      if (action.guest !== state.host) return reject("only the Host can do that");
      if (action.target === state.host) return reject("the Host can't be removed");
      if (!state.guests.some((g) => g.id === action.target)) return reject("no such guest");
      return { ok: true, state: { ...state, guests: state.guests.filter((g) => g.id !== action.target) } };
    }
    case "start": {
      if (state.phase !== "foyer") return reject("the game has started");
      if (!state.guests.some((g) => g.id === action.guest)) return reject("no such guest");
      if (action.guest !== state.host) return reject("only the Host can do that");
      if (!fitsFormat(state)) return reject("need 4-10 guests to start");
      const dance = drawDance({ ...state, round: 1 });
      if (!dance) return reject("need 4-10 guests to start");
      return { ok: true, state: openMingle({ ...dance, round: 1 }, now) };
    }
  }
}

/** The guests still in the game: not yet unmasked. */
export const remaining = (state: GameState): GuestRecord[] => state.guests.filter((g) => g.unmaskedIn === undefined);

/** The match running right now, if any: the Dance, or the Cellar game. */
function activeRace(state: GameState): RaceState | null {
  if (state.phase === "dance") return state.match;
  if (state.phase === "cellar") return state.cellar!.race;
  return null;
}

/** The seated guest taking part in the running match, or why they can't. */
function findPlayer(state: GameState, id: GuestId): GuestRecord | Rejection {
  const me = state.guests.find((g) => g.id === id);
  if (!me) return "no such guest";
  const race = activeRace(state);
  if (!race) return "no Dance is running";
  return id in race.points ? me : "not playing in this match";
}

/** Draws the round's Dance and announces it in the state. */
function drawDance(state: GameState): GameState | null {
  const drawn = drawMatch({ library: LIBRARY, role: "dance", count: remaining(state).length, round: state.round, history: state.drawn, seed: state.seed });
  if (!drawn) return null;
  return {
    ...state,
    seed: drawn.seed,
    danceDef: structuredClone(drawn.match),
    danceEncore: drawn.encore,
    match: null,
    danceResult: null,
    cellar: null,
    drawn: [...state.drawn, { round: state.round, role: "dance", id: drawn.match.id }],
  };
}

/** Whether a new guest may still ask to join: only while the Foyer is open. */
export function doorsOpen(state: GameState): boolean {
  return state.phase === "foyer";
}

function fitsFormat(state: GameState): boolean {
  return state.guests.length >= MIN_GUESTS && state.guests.length <= MAX_GUESTS;
}

/** The clock: runs every phase whose deadline has passed, each at its own deadline, not at `now`. */
function tick(state: GameState, now: number): GameState {
  if (state.deadline === null || now < state.deadline) return state;
  let s = structuredClone(state);
  while (s.deadline !== null && now >= s.deadline) {
    const at = s.deadline;
    if (s.phase === "mingle") {
      const def = s.danceDef as MatchDef;
      const [race, seed] = startRace(s.seed, def, remaining(s).map((g) => g.id), at, def.steps.dance!);
      s.seed = seed;
      s.match = race;
      s.phase = "dance";
      s.deadline = race.deadline;
    } else if (s.phase === "dance") {
      const race = s.match!;
      if (advanceRace(race, at)) s.deadline = race.deadline;
      else sendDown(s, at);
    } else if (s.phase === "sentDown") {
      const c = s.cellar!;
      const [race, seed] = startRace(s.seed, c.def, c.guests, at, c.def.steps.cellar!);
      s.seed = seed;
      c.race = race;
      s.match = null;
      s.phase = "cellar";
      s.deadline = race.deadline;
    } else if (s.phase === "cellar") {
      const race = s.cellar!.race!;
      if (advanceRace(race, at)) s.deadline = race.deadline;
      else unmask(s, at);
    } else if (s.phase === "unmasking") {
      s = nextRound(s, at);
    } else s.deadline = null;
  }
  return s;
}

/** The Dance's strict ranking sets the payout (favours never go below 0), then the lower half is sent down. */
function sendDown(s: GameState, at: number): void {
  const ranking = rankRace(s.match!);
  const table = DANCE_PAYOUTS[ranking.length]!;
  const payout: Record<GuestId, number> = {};
  ranking.forEach((r, i) => {
    payout[r.guest] = table[i]!;
    const g = s.guests.find((x) => x.id === r.guest)!;
    g.favours = Math.max(0, g.favours + table[i]!);
  });
  s.danceResult = { ranking, payout };

  const left = remaining(s);
  const unmaskings = unmaskingsFor({ remaining: left.length, unmaskings: left.length - 2, rounds: s.rounds - s.round + 1 });
  const size = cellarSize(left.length, unmaskings);
  // Fewest favours first; on equal favours the lower Dance place goes down first.
  const place = (id: GuestId) => ranking.findIndex((r) => r.guest === id);
  const down = [...left].sort((a, b) => a.favours - b.favours || place(b.id) - place(a.id)).slice(0, size).map((g) => g.id);

  const drawn =
    drawMatch({ library: LIBRARY, role: "cellar", count: size, round: s.round, history: s.drawn, seed: s.seed }) ??
    failNoCellarGame(size);
  s.seed = drawn.seed;
  s.drawn.push({ round: s.round, role: "cellar", id: drawn.match.id });
  s.cellar = { def: structuredClone(drawn.match), encore: drawn.encore, guests: down, unmaskings, race: null, ranking: null, unmasked: [] };
  s.phase = "sentDown";
  s.deadline = at + SENT_DOWN_MS;
}

function failNoCellarGame(size: number): never {
  throw new Error(`the library has no Cellar game for ${size} guests`);
}

/** The Cellar game's lowest-ranked are unmasked: their mask floats off and their favours vanish. */
function unmask(s: GameState, at: number): void {
  const c = s.cellar!;
  c.ranking = rankRace(c.race!);
  c.unmasked = c.unmaskings === 0 ? [] : c.ranking.slice(-c.unmaskings).map((r) => r.guest);
  for (const g of s.guests) if (c.unmasked.includes(g.id)) Object.assign(g, { unmaskedIn: s.round, favours: 0 });
  s.phase = "unmasking";
  s.deadline = at + UNMASKING_MS;
}

/** After the unmasking: round N+1's Mingle, or the Last Dance once the rounds are done. */
function nextRound(s: GameState, at: number): GameState {
  if (s.round >= s.rounds) return { ...s, phase: "lastDance", deadline: null };
  const next = drawDance({ ...s, round: s.round + 1 });
  if (!next) throw new Error("the library has no Dance for the guests left");
  return openMingle(next, at);
}

/** Opens the round's Mingle; its standings are the totals as they stand now. */
function openMingle(s: GameState, at: number): GameState {
  const mingleStandings = Object.fromEntries(remaining(s).map((g) => [g.id, g.favours]));
  return { ...s, phase: "mingle", deadline: at + MINGLE_MS, mingleStandings };
}

/** Everything a guest may see; null for someone who has no seat. */
export function viewFor(state: GameState, guest: GuestId): GuestView | null {
  const me = state.guests.find((g) => g.id === guest);
  if (!me || state.host === null) return null;
  const guests = state.guests.map(({ id, name, mask, unmaskedIn }) => ({ id, name, mask: { ...mask }, unmasked: unmaskedIn !== undefined }));
  const seated = { you: guest, host: state.host, guests };
  const def = state.danceDef;
  const announcement = def && { name: def.name, encore: state.danceEncore, rulesSummary: def.rulesSummary, workedExample: def.workedExample };
  const publicFavours = () => Object.fromEntries(remaining(state).map((g) => [g.id, g.favours]));
  const cellarGame = () => {
    const d = state.cellar!.def;
    return { name: d.name, encore: state.cellar!.encore, rulesSummary: d.rulesSummary, workedExample: d.workedExample };
  };
  switch (state.phase) {
    case "mingle":
      return { ...seated, phase: "mingle", round: state.round, deadline: state.deadline!, favours: me.favours,
        standings: { ...state.mingleStandings },
        gifts: state.gifts.filter((x) => x.round === state.round && (x.from === guest || x.to === guest)).map(({ from, to, favours }) => ({ from, to, favours })),
        announcement: announcement!,
      };
    case "dance": {
      const race = state.match!;
      return {
        ...seated,
        phase: "dance",
        round: state.round,
        favours: me.favours,
        announcement: announcement!,
        buyRate: def!.buyRate,
        step: guest in race.points ? stepView(race, guest) : null,
        ranking: rankRace(race),
      };
    }
    case "sentDown":
      return {
        ...seated,
        phase: "sentDown",
        round: state.round,
        deadline: state.deadline!,
        danceRanking: state.danceResult!.ranking,
        payout: state.danceResult!.payout,
        favours: publicFavours(),
        cellar: [...state.cellar!.guests],
        unmaskings: state.cellar!.unmaskings,
        cellarGame: cellarGame(),
      };
    case "cellar": {
      const c = state.cellar!;
      return {
        ...seated,
        phase: "cellar",
        round: state.round,
        deadline: state.deadline!,
        favours: me.favours,
        cellar: [...c.guests],
        unmaskings: c.unmaskings,
        announcement: cellarGame(),
        buyRate: c.def.buyRate,
        step: guest in c.race!.points ? stepView(c.race!, guest) : null,
        ranking: rankRace(c.race!),
      };
    }
    case "unmasking":
      return {
        ...seated,
        phase: "unmasking",
        round: state.round,
        deadline: state.deadline!,
        cellarRanking: state.cellar!.ranking!,
        unmasked: [...state.cellar!.unmasked],
        favours: publicFavours(),
      };
    case "lastDance":
      return { ...seated, phase: "lastDance", finalists: remaining(state).map((g) => g.id), favours: publicFavours() };
    case "foyer":
      return { ...seated, phase: "foyer", format: state.format, canStart: guest === state.host && fitsFormat(state), canRemove: guest === state.host };
  }
}

/** No chats exist before the Overture. */
export function chatAccess(_state: GameState, _guest: GuestId): ChatAccess {
  return [];
}

/** When the next `tick` is due, or null when nothing is waiting on the clock. */
export function nextDeadline(state: GameState): number | null {
  return state.deadline;
}
