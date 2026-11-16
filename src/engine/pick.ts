import type { GuestId, PickState, PickView, RankingEntry, Rejection, UniquePickMatchDef } from "../shared/types";
import { draw } from "./random";

/** The Unique pick match type: one secret number per guest a step; numbers nobody else picked score. */

const REVEAL_MS = 5000;

/** The highest number a game of `guests` may pick. */
export function rangeFor(def: UniquePickMatchDef, guests: number): number {
  return (def.rangeBands.find((b) => guests <= b.upTo) ?? def.rangeBands[def.rangeBands.length - 1]!).max;
}

export function startPick(seed: number, def: UniquePickMatchDef, guests: GuestId[], at: number, steps: number): [PickState, number] {
  const drawKeys: PickState["drawKeys"] = {};
  const points: PickState["points"] = {};
  const uniques: PickState["uniques"] = {};
  for (const g of guests) {
    [drawKeys[g], seed] = draw(seed);
    points[g] = 0;
    uniques[g] = 0;
  }
  const pick: PickState = { def, range: rangeFor(def, guests.length), total: steps, step: 0, stage: "pick", stepStartedAt: at, pickDeadline: at, deadline: at, drawKeys, picks: {}, points, uniques, last: null };
  openStep(pick, at);
  return [pick, seed];
}

function openStep(p: PickState, at: number): void {
  p.stage = "pick";
  p.stepStartedAt = at;
  p.pickDeadline = at + p.def.answerSeconds * 1000;
  p.deadline = p.pickDeadline;
  p.picks = {};
  p.last = null;
}

/** Scores the step and opens its reveal at `at`. A guest who didn't pick scores nothing. */
function reveal(p: PickState, at: number): void {
  const entries = Object.entries(p.picks).sort(([, a], [, b]) => b - a);
  const count = (n: number) => entries.filter(([, x]) => x === n).length;
  const picks = entries.map(([guest, number]) => ({ guest, number, unique: count(number) === 1 }));
  const top = picks.find((x) => x.unique);
  const scored: Record<GuestId, number> = Object.fromEntries(Object.keys(p.points).map((g) => [g, 0]));
  for (const x of picks) {
    if (!x.unique) continue;
    scored[x.guest] = x.number + (x === top ? p.def.topBonus : 0);
    p.points[x.guest]! += scored[x.guest]!;
    p.uniques[x.guest]! += 1;
  }
  p.last = { picks, scored };
  p.stage = "reveal";
  p.deadline = at + REVEAL_MS;
}

/** Moves the clock to `at` (a deadline); returns false once the last reveal is over. */
export function advancePick(p: PickState, at: number): boolean {
  if (p.stage === "pick") {
    reveal(p, at);
    return true;
  }
  if (p.step + 1 >= p.total) return false;
  p.step += 1;
  openStep(p, at);
  return true;
}

export function pickNumber(p: PickState, guest: GuestId, number: number, now: number): Rejection | null {
  if (p.stage !== "pick" || now >= p.pickDeadline) return "too late";
  if (guest in p.picks) return "already picked";
  if (!Number.isInteger(number) || number < 1 || number > p.range) return "picks are whole numbers in the range";
  p.picks[guest] = number;
  if (Object.keys(p.picks).length === Object.keys(p.points).length) reveal(p, now);
  return null;
}

export function buyPickPoints(p: PickState, guest: GuestId, favours: number): void {
  p.points[guest]! += favours * p.def.buyRate;
}

/** A strict ranking: points, then more unique picks, then the draw. */
export function rankPick(p: PickState): RankingEntry[] {
  const entries = Object.keys(p.points).map((guest) => ({ guest, points: p.points[guest]!, uniques: p.uniques[guest]! }));
  entries.sort((x, y) => y.points - x.points || y.uniques - x.uniques || p.drawKeys[x.guest]! - p.drawKeys[y.guest]!);
  return entries.map((e, i) => {
    const tiedWith = (o?: typeof e) => !!o && o.points === e.points && o.uniques === e.uniques;
    return { guest: e.guest, points: e.points, time: 0, uniques: e.uniques, drawn: tiedWith(entries[i - 1]) || tiedWith(entries[i + 1]) };
  });
}

/** Everything one guest may see of the step; others' picks only once it is revealed. */
export function pickView(p: PickState, guest: GuestId): PickView {
  return {
    index: p.step,
    total: p.total,
    stage: p.stage,
    startedAt: p.stepStartedAt,
    pickDeadline: p.pickDeadline,
    deadline: p.deadline,
    range: p.range,
    yourPick: p.picks[guest] ?? null,
    reveal: p.stage === "reveal" ? { picks: p.last!.picks.map((x) => ({ ...x })), scored: { ...p.last!.scored } } : null,
  };
}
