import { LIBRARY } from "../content/library";
import {
  COLOURS,
  DANCE_PAYOUTS,
  MINGLE_MS,
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
} from "../shared/types";
import { draw } from "./random";
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
    deadline: null,
    danceDef: null,
    match: null,
    danceResult: null,
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
      if (!state.guests.some((g) => g.id === action.guest)) return reject("no such guest");
      if (state.phase !== "dance" || !state.match) return reject("no Dance is running");
      const next = structuredClone(state);
      const why = answerRace(next.match!, action.guest, action.position, now);
      if (why) return reject(why);
      next.deadline = next.match!.deadline;
      return { ok: true, state: next };
    }
    case "buyPoints": {
      const me = state.guests.find((g) => g.id === action.guest);
      if (!me) return reject("no such guest");
      if (state.phase !== "dance" || !state.match) return reject("no Dance is running");
      if (!Number.isInteger(action.favours) || action.favours < 1) return reject("bad amount");
      if (action.favours > me.favours) return reject("not enough favours");
      const next = structuredClone(state);
      next.guests.find((g) => g.id === action.guest)!.favours -= action.favours;
      buyPoints(next.match!, action.guest, action.favours);
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
      const danceDef = LIBRARY.find((m) => {
        const range = m.guestRange.dance;
        return range && state.guests.length >= range[0] && state.guests.length <= range[1];
      });
      if (!danceDef) return reject("need 4-10 guests to start");
      return { ok: true, state: { ...state, phase: "mingle", round: 1, deadline: now + MINGLE_MS, danceDef: structuredClone(danceDef) } };
    }
  }
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
  const s = structuredClone(state);
  while (s.deadline !== null && now >= s.deadline) {
    const at = s.deadline;
    if (s.phase === "mingle") {
      const def = s.danceDef as MatchDef;
      const [race, seed] = startRace(s.seed, def, s.guests.map((g) => g.id), at, def.steps.dance!);
      s.seed = seed;
      s.match = race;
      s.phase = "dance";
      s.deadline = race.deadline;
    } else if (s.phase === "dance") {
      const race = s.match!;
      if (advanceRace(race, at)) s.deadline = race.deadline;
      else finishDance(s);
    } else s.deadline = null;
  }
  return s;
}

/** The match's strict ranking sets the payout; favours never go below 0. */
function finishDance(s: GameState): void {
  const ranking = rankRace(s.match!);
  const table = DANCE_PAYOUTS[s.guests.length]!;
  const payout: Record<GuestId, number> = {};
  ranking.forEach((r, i) => {
    payout[r.guest] = table[i]!;
    const g = s.guests.find((x) => x.id === r.guest)!;
    g.favours = Math.max(0, g.favours + table[i]!);
  });
  s.danceResult = { ranking, payout };
  s.phase = "standings";
  s.deadline = null;
}

/** Everything a guest may see; null for someone who has no seat. */
export function viewFor(state: GameState, guest: GuestId): GuestView | null {
  const me = state.guests.find((g) => g.id === guest);
  if (!me || state.host === null) return null;
  const guests = state.guests.map(({ id, name, mask }) => ({ id, name, mask: { ...mask } }));
  const seated = { you: guest, host: state.host, guests };
  const def = state.danceDef;
  const announcement = def && { name: def.name, rulesSummary: def.rulesSummary, workedExample: def.workedExample };
  switch (state.phase) {
    case "mingle":
      return { ...seated, phase: "mingle", round: state.round, deadline: state.deadline!, favours: me.favours, announcement: announcement! };
    case "dance":
      return {
        ...seated,
        phase: "dance",
        round: state.round,
        favours: me.favours,
        announcement: announcement!,
        buyRate: def!.buyRate,
        step: stepView(state.match!, guest),
        ranking: rankRace(state.match!),
      };
    case "standings":
      return {
        ...seated,
        phase: "standings",
        round: state.round,
        danceRanking: state.danceResult!.ranking,
        payout: state.danceResult!.payout,
        favours: Object.fromEntries(state.guests.map((g) => [g.id, g.favours])),
      };
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
