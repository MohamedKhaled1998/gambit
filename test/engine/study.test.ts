import { describe, expect, it } from "vitest";
import { ALL_THAT_GLITTERS } from "../../src/content/all-that-glitters";
import { ARRIVALS } from "../../src/content/arrivals";
import { LIBRARY } from "../../src/content/library";
import { SEATING_PLAN } from "../../src/content/seating-plan";
import { apply, viewFor } from "../../src/engine/game";
import { maskKey } from "../../src/engine/masks";
import { generateProblems } from "../../src/engine/problems";
import { startRace } from "../../src/engine/race";
import { COLOURS, type GameState, type Mask, type StepView } from "../../src/shared/types";
import { intoDance, must, started, tickToDeadline } from "./sim";

/** A Dance of `def` for n guests, at its first step. */
function danceOf(def: typeof ALL_THAT_GLITTERS, n = 4, seed = 9): GameState {
  const game = started(n, seed);
  const guests = game.guests.map((g) => g.id);
  const [race] = startRace(seed, def, guests, 1000, def.steps.dance!);
  return { ...game, phase: "dance", danceDef: def, match: race, deadline: race.deadline };
}
const stepOf = (s: GameState, id: string) => (viewFor(s, id) as { step: StepView }).step;

describe("the Race study phase", () => {
  it("shows the prompt for the set time, then hides it from every view", () => {
    let s = danceOf(SEATING_PLAN);
    for (const g of s.guests) {
      const v = stepOf(s, g.id);
      expect(v.stage).toBe("study");
      expect(v.study!.masks.length).toBeGreaterThan(0);
      expect(v.deadline).toBe(1000 + 5000);
      expect(v.choices).toEqual([]);
    }
    s = tickToDeadline(s);
    for (const g of s.guests) {
      const v = stepOf(s, g.id);
      expect(v.stage).toBe("answer");
      expect(v.study).toBeUndefined();
      expect(v.answerDeadline).toBe(1000 + 5000 + 8000);
      expect(JSON.stringify(v)).not.toContain('"masks"');
      expect(v.choices).toHaveLength(9);
      expect(new Set(v.choices).size).toBe(9);
    }
  });

  it("takes no answers while the prompt shows", () => {
    const s = danceOf(ALL_THAT_GLITTERS);
    expect(apply(s, { type: "answer", guest: "g0", position: 0 }, 2000)).toEqual({ ok: false, reason: "wait for the answer phase" });
  });

  it("times answers from the start of the answer phase", () => {
    let s = danceOf(ALL_THAT_GLITTERS);
    s = tickToDeadline(s);
    s = must(s, { type: "answer", guest: "g0", position: 0 }, 1000 + 3000 + 2500);
    expect(s.match!.answers.g0!.at - s.match!.answerStartedAt).toBe(2500);
    for (const g of ["g1", "g2", "g3"]) s = must(s, { type: "answer", guest: g, position: 1 }, 1000 + 3000 + 2600);
    expect(s.match!.time.g0).toBe(2500);
  });

  it("dims the stage when the lights go out, in a memory match only", () => {
    let seat = tickToDeadline(danceOf(SEATING_PLAN));
    expect(stepOf(seat, "g0").lightsOut).toBe(true);
    let gl = tickToDeadline(danceOf(ALL_THAT_GLITTERS));
    expect(stepOf(gl, "g0").lightsOut).toBe(false);
    expect(stepOf(danceOf(SEATING_PLAN), "g0").lightsOut).toBe(false);
  });

  it("runs every step as study, answer and a 3s reveal", () => {
    let s = danceOf(ALL_THAT_GLITTERS);
    const m = () => s.match!;
    s = tickToDeadline(s);
    expect(m().stage).toBe("answer");
    s = tickToDeadline(s);
    expect(m().stage).toBe("reveal");
    s = tickToDeadline(s);
    expect(m().step).toBe(1);
    expect(m().stage).toBe("study");
    expect(m().stepStartedAt).toBe(1000 + 16_000);
  });
});

describe("All That Glitters", () => {
  it("is a Race match with a study phase: 12 steps as a Dance, 8 as a Cellar game, study 3s, answer 10s", () => {
    expect(LIBRARY).toContain(ALL_THAT_GLITTERS);
    expect(ALL_THAT_GLITTERS).toMatchObject({ type: "race", studySeconds: 3, answerSeconds: 10, stepSeconds: 16, preludeSeconds: 45 });
    expect(ALL_THAT_GLITTERS.steps).toEqual({ dance: 12, cellar: 8 });
    expect(ALL_THAT_GLITTERS.guestRange).toEqual({ dance: [3, 10], cellar: [2, 9] });
  });

  const count = (masks: Mask[], f: (m: Mask) => boolean) => masks.filter(f).length;
  it("flashes a crowd growing from 12 to 30 masks and asks for the right count among four near-consecutive choices", () => {
    for (let seed = 0; seed < 60; seed++)
      for (const n of [12, 8]) {
        const ps = generateProblems(seed, ALL_THAT_GLITTERS, n)[0];
        const sizes = ps.map((p) => p.study!.masks.length);
        expect(sizes[0]).toBe(12);
        expect(sizes[n - 1]).toBe(30);
        expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
        for (const p of ps) {
          const nums = p.choices.map(Number).sort((a, b) => a - b);
          expect(nums).toHaveLength(4);
          expect(nums[3]! - nums[0]!).toBe(3);
          expect(nums[0]).toBeGreaterThanOrEqual(0);
          expect(p.choices).toContain(p.choices[0]);
        }
      }
  });

  it("asks only for gold at first, then gold masks with a second trait, so gold masks without it are decoys", () => {
    for (let seed = 0; seed < 80; seed++) {
      const ps = generateProblems(seed, ALL_THAT_GLITTERS, 12)[0];
      expect(ps[0]!.prompt).toBe("How many were gold?");
      const second = ps.filter((p) => p.prompt !== "How many were gold?");
      expect(second.length).toBeGreaterThan(3);
      expect(ps.slice(-3).every((p) => p.prompt !== "How many were gold?")).toBe(true);
      for (const p of ps) {
        const crowd = p.study!.masks;
        const answer = Number(p.choices[0]);
        const gold = (m: Mask) => m.colour === "gold";
        if (p.prompt === "How many were gold?") expect(count(crowd, gold)).toBe(answer);
        else {
          const has = p.prompt.includes("foxes") ? (m: Mask) => m.shape === "fox" : (m: Mask) => m.feathers > 0;
          expect(p.prompt).toMatch(/^How many gold (foxes|masks wore feathers)\?$/);
          expect(count(crowd, (m) => gold(m) && has(m))).toBe(answer);
          expect(answer).toBeGreaterThanOrEqual(1);
          expect(count(crowd, (m) => gold(m) && !has(m))).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("draws every crowd mask from the six-colour palette: no near-gold colours", () => {
    for (let seed = 0; seed < 30; seed++)
      for (const p of generateProblems(seed, ALL_THAT_GLITTERS, 12)[0]) for (const m of p.study!.masks) expect(COLOURS).toContain(m.colour);
  });
});

describe("Seating Plan", () => {
  it("is a Race match: 12 steps as a Dance, 8 as a Cellar game, study 5s, answer 8s", () => {
    expect(LIBRARY).toContain(SEATING_PLAN);
    expect(SEATING_PLAN).toMatchObject({ studySeconds: 5, answerSeconds: 8, stepSeconds: 16, preludeSeconds: 45 });
    expect(SEATING_PLAN.steps).toEqual({ dance: 12, cellar: 8 });
  });

  it("grows its grid 3×3, 4×4, then 5×5, and the target is the only mask with its colour and shape", () => {
    for (let seed = 0; seed < 60; seed++)
      for (const n of [12, 8]) {
        const ps = generateProblems(seed, SEATING_PLAN, n)[0];
        const sizes = ps.map((p) => p.study!.masks.length);
        expect(sizes[0]).toBe(9);
        expect(sizes[n - 1]).toBe(25);
        expect(new Set(sizes)).toEqual(new Set([9, 16, 25]));
        expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
        for (const p of ps) {
          const grid = p.study!.masks;
          expect(p.study!.cols! ** 2).toBe(grid.length);
          const target = p.promptMasks![0]!;
          const same = grid.filter((m) => m.colour === target.colour && m.shape === target.shape);
          expect(same).toHaveLength(1);
          expect(maskKey(same[0]!)).toBe(maskKey(target));
          expect(grid.indexOf(same[0]!)).toBe(0);
          expect(p.prompt).toContain(`${target.colour} ${target.shape}`);
        }
      }
  });

  it("permutes each guest's grid and scores their tap against their own layout", () => {
    let s = danceOf(SEATING_PLAN, 5);
    const p = s.match!.problems[0]!;
    const studies = s.guests.map((g) => stepOf(s, g.id).study!.masks.map(maskKey));
    expect(new Set(studies.map((x) => x.join())).size).toBeGreaterThan(1);
    s = tickToDeadline(s);
    // g0 taps where the target sat on g0's own layout; g1 taps the same position as g0 but on their layout.
    const right = (id: string) => s.match!.layouts[id]![0]!.indexOf(0);
    expect(right("g0")).not.toBe(right("g1"));
    s = must(s, { type: "answer", guest: "g0", position: right("g0") }, 7000);
    s = must(s, { type: "answer", guest: "g1", position: right("g0") }, 7000);
    s = tickToDeadline(s);
    expect(s.match!.results.g0).toBe("right");
    expect(s.match!.results.g1).toBe("wrong");
    // The study grid in g0's order has the target where g0 must tap.
    const shown = studies[0]!;
    expect(shown[right("g0")]).toBe(maskKey(p.promptMasks![0]!));
    expect(stepOf(s, "g0").reveal!.correct).toBe(right("g0"));
  });
});

describe("Arrivals", () => {
  it("is a Cellar-only Race match: 7 steps, study up to 8s, answer 10s", () => {
    expect(LIBRARY).toContain(ARRIVALS);
    expect(ARRIVALS).toMatchObject({ studySeconds: 8, answerSeconds: 10, stepSeconds: 21, preludeSeconds: 45 });
    expect(ARRIVALS.steps).toEqual({ dance: null, cellar: 7 });
    expect(ARRIVALS.guestRange).toEqual({ dance: null, cellar: [2, 9] });
  });

  it("brings 4 to 8 distinct masks one at a time for 1s each, then asks about their order", () => {
    const forms = new Set<string>();
    for (let seed = 0; seed < 150; seed++)
      for (const p of generateProblems(seed, ARRIVALS, 7)[0]) {
        const seq = p.study!.masks;
        expect(p.study!.kind).toBe("sequence");
        expect(seq.length).toBeGreaterThanOrEqual(4);
        expect(seq.length).toBeLessThanOrEqual(8);
        expect(p.studySeconds).toBe(seq.length);
        expect(new Set(seq.map((m) => `${m.colour}/${m.shape}`)).size).toBe(seq.length);
        expect(p.choices).toHaveLength(4);
        expect(new Set(p.choices).size).toBe(4);
        const at = (m: Mask) => seq.findIndex((x) => maskKey(x) === maskKey(m));
        const named = p.promptMasks?.[0];
        if (p.prompt.startsWith("Who came in just before")) {
          forms.add("before");
          expect(at(p.choiceMasks![0]!)).toBe(at(named!) - 1);
        } else if (p.prompt.startsWith("Who came in just after")) {
          forms.add("after");
          expect(at(p.choiceMasks![0]!)).toBe(at(named!) + 1);
        } else if (p.prompt === "Who arrived first?") {
          forms.add("first");
          expect(at(p.choiceMasks![0]!)).toBe(0);
        } else {
          forms.add("count");
          expect(p.prompt).toMatch(/^How many came in before/);
          expect(Number(p.choices[0])).toBe(at(named!));
          expect(p.choiceMasks).toBeUndefined();
        }
        if (p.choiceMasks) expect(new Set(p.choiceMasks.map(maskKey)).size).toBe(4);
      }
    expect(forms).toEqual(new Set(["before", "after", "first", "count"]));
  });

  it("lets the study last as long as the sequence", () => {
    const game = started(4, 3);
    const down = ["g0", "g1"];
    const [race] = startRace(3, ARRIVALS, down, 0, 7);
    const len = race.problems[0]!.study!.masks.length;
    expect(race.deadline).toBe(len * 1000);
    expect(race.answerDeadline).toBe(len * 1000 + 10_000);
    void game;
  });
});
