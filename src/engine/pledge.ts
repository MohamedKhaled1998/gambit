import type { GroupTargetMatchDef, GuestId, PledgeState, PledgeView, RankingEntry, ReckoningChoice, Rejection } from "../shared/types";
import { draw } from "./random";

/** The Group target match type: pledges to one pot, then a reckoning. Everything stays hidden until the final reveal. */

const REVEAL_MS = 5000;
const FINAL_MS = 10_000;

export function startPledge(seed: number, def: GroupTargetMatchDef, guests: GuestId[], at: number): [PledgeState, number] {
  const drawKeys: PledgeState["drawKeys"] = {};
  const points: PledgeState["points"] = {};
  const pledges: PledgeState["pledges"] = {};
  for (const g of guests) {
    [drawKeys[g], seed] = draw(seed);
    points[g] = 0;
    pledges[g] = [];
  }
  const p: PledgeState = { def, step: 0, stage: "pledge", stepStartedAt: at, actDeadline: at, deadline: at, drawKeys, stock: {}, current: {}, pledges, points, choices: {}, award: null };
  openStep(p, at);
  return [p, seed];
}

const guestsOf = (p: PledgeState) => Object.keys(p.points);
/** The pot as revealed so far. */
const potOf = (p: PledgeState) => Object.values(p.pledges).reduce((sum, list) => sum + list.reduce((a, b) => a + b, 0), 0);
export const targetOf = (p: PledgeState) => p.def.targetPerGuest * guestsOf(p).length;

function openStep(p: PledgeState, at: number): void {
  p.stage = "pledge";
  p.stepStartedAt = at;
  p.actDeadline = at + p.def.answerSeconds * 1000;
  p.deadline = p.actDeadline;
  p.current = {};
  for (const g of guestsOf(p)) p.stock[g] = p.def.pointsPerStep;
}

/** Closes the pledges: they join the pot, what each guest didn't pledge is kept, and the reveal opens at `at`. */
function revealStep(p: PledgeState, at: number): void {
  for (const g of guestsOf(p)) {
    const amount = p.current[g] ?? 0;
    p.pledges[g]!.push(amount);
    p.points[g]! += p.stock[g]! - amount;
    p.stock[g] = 0;
  }
  p.current = {};
  p.stage = "reveal";
  p.deadline = at + REVEAL_MS;
}

/** The award of the final reveal: a guest who didn't choose shares. */
function finish(p: PledgeState, at: number): void {
  const guests = guestsOf(p);
  for (const g of guests) p.choices[g] ??= "share";
  const award: Record<GuestId, number> = Object.fromEntries(guests.map((g) => [g, 0]));
  if (potOf(p) >= targetOf(p)) {
    const pockets = guests.filter((g) => p.choices[g] === "pocket");
    if (pockets.length === 0) for (const g of guests) award[g] = p.def.allShareAward;
    else if (pockets.length === 1) award[pockets[0]!] = p.def.lonePocketAward;
  }
  p.award = award;
  p.stage = "final";
  p.deadline = at + FINAL_MS;
}

/** Moves the clock to `at` (a deadline); returns false once the final reveal is over. */
export function advancePledge(p: PledgeState, at: number): boolean {
  if (p.stage === "pledge") revealStep(p, at);
  else if (p.stage === "reveal") {
    p.step += 1;
    if (p.step < p.def.pledgeSteps) openStep(p, at);
    else {
      p.stage = "reckon";
      p.stepStartedAt = at;
      p.actDeadline = at + p.def.answerSeconds * 1000;
      p.deadline = p.actDeadline;
    }
  } else if (p.stage === "reckon") finish(p, at);
  else return false;
  return true;
}

export function pledgeTo(p: PledgeState, guest: GuestId, amount: number, now: number): Rejection | null {
  if (p.step >= p.def.pledgeSteps) return "no pledge is running";
  if (p.stage !== "pledge" || now >= p.actDeadline) return "too late";
  if (guest in p.current) return "already pledged";
  if (!Number.isInteger(amount) || amount < 0 || amount > p.stock[guest]!) return "pledges are whole points up to your stock";
  p.current[guest] = amount;
  if (Object.keys(p.current).length === guestsOf(p).length) revealStep(p, now);
  return null;
}

export function reckonTo(p: PledgeState, guest: GuestId, choice: ReckoningChoice, now: number): Rejection | null {
  if (p.step < p.def.pledgeSteps) return "wait for the reckoning";
  if (p.stage !== "reckon" || now >= p.actDeadline) return "too late";
  if (choice !== "share" && choice !== "pocket") return "no such choice";
  if (guest in p.choices) return "already chose";
  p.choices[guest] = choice;
  if (Object.keys(p.choices).length === guestsOf(p).length) finish(p, now);
  return null;
}

/** Bought points join the open step's stock while pledging is open, and are kept otherwise. */
export function buyPledgePoints(p: PledgeState, guest: GuestId, favours: number): void {
  const points = favours * p.def.buyRate;
  if (p.stage === "pledge") p.stock[guest]! += points;
  else p.points[guest]! += points;
}

/** Kept points, then the draw: a strict ranking. */
export function rankPledge(p: PledgeState): RankingEntry[] {
  const entries = guestsOf(p).map((guest) => ({ guest, points: p.points[guest]! }));
  entries.sort((x, y) => y.points - x.points || p.drawKeys[x.guest]! - p.drawKeys[y.guest]!);
  return entries.map((e, i) => {
    const tiedWith = (o?: typeof e) => !!o && o.points === e.points;
    return { guest: e.guest, points: e.points, time: 0, drawn: tiedWith(entries[i - 1]) || tiedWith(entries[i + 1]) };
  });
}

/** Ranks are public only at the final reveal. */
export const publicRanking = (p: PledgeState): RankingEntry[] => (p.stage === "final" ? rankPledge(p) : []);

/** Everything one guest may see: their own pledge, stock, kept points and choice, and the pot total; the rest at the final reveal. */
export function pledgeView(p: PledgeState, guest: GuestId): PledgeView {
  const final = p.stage === "final";
  return {
    index: p.step,
    total: p.def.pledgeSteps + 1,
    stage: p.stage,
    startedAt: p.stepStartedAt,
    actDeadline: p.actDeadline,
    deadline: p.deadline,
    stock: p.stock[guest]!,
    yourPledge: p.stage === "pledge" ? (p.current[guest] ?? null) : (p.pledges[guest]![p.step] ?? null),
    kept: p.points[guest]!,
    pot: potOf(p),
    target: targetOf(p),
    yourChoice: p.choices[guest] ?? null,
    final: final
      ? {
          pledges: guestsOf(p).map((g) => ({ guest: g, amounts: [...p.pledges[g]!] })),
          choices: { ...p.choices },
          award: { ...p.award! },
          reached: potOf(p) >= targetOf(p),
        }
      : null,
  };
}
