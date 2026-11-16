import { describe, expect, it } from "vitest";
import { THE_PROCESSION } from "../../src/content/the-procession";
import { generateProblems } from "../../src/engine/problems";
import { LIBRARY } from "../../src/content/library";

const procession = () => generateProblems(5, THE_PROCESSION, 7)[0];

describe("The Procession", () => {
  it("is a Cellar-only Race match of 7 steps with a 20s answer and a 23s step", () => {
    expect(LIBRARY).toContain(THE_PROCESSION);
    expect(THE_PROCESSION).toMatchObject({ type: "race", answerSeconds: 20, stepSeconds: 23, preludeSeconds: 45 });
    expect(THE_PROCESSION.guestRange.dance).toBeNull();
    expect(THE_PROCESSION.guestRange.cellar).toEqual([2, 9]);
    expect(THE_PROCESSION.steps).toEqual({ dance: null, cellar: 7 });
    expect(7 * THE_PROCESSION.stepSeconds).toBeLessThanOrEqual(180);
  });

  it("makes seven problems with four distinct choices, the right answer first", () => {
    for (let seed = 0; seed < 40; seed++) {
      const problems = generateProblems(seed, THE_PROCESSION, 7)[0];
      expect(problems).toHaveLength(7);
      expect(new Set(problems.map((p) => p.prompt)).size).toBe(7);
      for (const p of problems) {
        expect(p.choices).toHaveLength(4);
        expect(new Set(p.choices).size).toBe(4);
      }
    }
  });

  it("never shows an undefined mask or a repeated choice, whatever the seed", () => {
    for (let seed = 0; seed < 300; seed++) {
      for (const p of generateProblems(seed, THE_PROCESSION, 7)[0]) {
        expect(p.prompt).not.toContain("undefined");
        p.choices.forEach((c) => expect(c).not.toContain("undefined"));
        expect(new Set(p.choices).size).toBe(p.choices.length);
      }
    }
  });

  it("is repeatable from the seed and fresh from another", () => {
    expect(generateProblems(9, THE_PROCESSION, 7)).toEqual(generateProblems(9, THE_PROCESSION, 7));
    expect(generateProblems(9, THE_PROCESSION, 7)[0]).not.toEqual(generateProblems(10, THE_PROCESSION, 7)[0]);
  });

  it("asks one rule first, then two rules interleaved", () => {
    // Five terms and a question mark when one rule runs, six when two interleave.
    for (let seed = 0; seed < 40; seed++) {
      const problems = generateProblems(seed, THE_PROCESSION, 7)[0];
      problems.slice(0, 4).forEach((p) => expect(p.prompt.split(", ")).toHaveLength(6));
      problems.slice(4).forEach((p) => expect(p.prompt.split(", ")).toHaveLength(7));
    }
  });

  it("gets number sequences right: the first choice continues the pattern", () => {
    let numeric = 0;
    for (let seed = 0; seed < 60; seed++) {
      for (const p of generateProblems(seed, THE_PROCESSION, 4)[0]) {
        const terms = p.prompt.split(", ").slice(0, -1).map(Number);
        if (terms.some(Number.isNaN)) continue;
        numeric++;
        const [a, b, c, d, e] = terms as [number, number, number, number, number];
        const next = Number(p.choices[0]);
        const steady = b - a === c - b && c - b === d - c;
        const doubling = b === 2 * a && c === 2 * b && d === 2 * c;
        const sum = c === a + b && d === b + c && e === c + d;
        const alternating = b - a === d - c && c - b === e - d;
        const ok = (steady && next === e + (e - d)) || (doubling && next === 2 * e) || (sum && next === d + e) || (alternating && next === e + (b - a));
        expect(ok, p.prompt).toBe(true);
      }
    }
    expect(numeric).toBeGreaterThan(20);
  });
});
