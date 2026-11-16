import {
  COLOURS,
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

/** The rules engine: pure, with no clock, no Math.random and no platform imports. */

export function newGame(seed: number): GameState {
  return { phase: "foyer", format: "quick", seed: seed >>> 0, host: null, guests: [] };
}

/** mulberry32; returns the draw and the advanced seed. */
function draw(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
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
      return { ok: true, state };
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
          guests: [...state.guests, { id: action.guest, name, mask, joinedAt: now }],
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
      return { ok: true, state: { ...state, phase: "started" } };
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

/** Everything a guest may see; null for someone who has no seat. */
export function viewFor(state: GameState, guest: GuestId): GuestView | null {
  if (!state.guests.some((g) => g.id === guest) || state.host === null) return null;
  const guests = state.guests.map(({ id, name, mask }) => ({ id, name, mask: { ...mask } }));
  if (state.phase === "started") return { phase: "started", you: guest, host: state.host, guests };
  return {
    phase: "foyer",
    you: guest,
    host: state.host,
    format: state.format,
    guests,
    canStart: guest === state.host && fitsFormat(state),
    canRemove: guest === state.host,
  };
}

/** No chats exist before the Overture. */
export function chatAccess(_state: GameState, _guest: GuestId): ChatAccess {
  return [];
}

/** When the next `tick` is due, or null when nothing is waiting on the clock. */
export function nextDeadline(_state: GameState): number | null {
  return null;
}
