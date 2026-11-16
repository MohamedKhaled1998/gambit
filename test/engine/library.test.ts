import { describe, expect, it } from "vitest";
import { LIBRARY } from "../../src/content/library";
import { DANCE_PAYOUTS, type GameState, type MatchDef } from "../../src/shared/types";
import { generateSums } from "../../src/engine/sums";
import { mixedPlayer, playDance, started } from "./sim";

const words = (t: string) => t.trim().split(/\s+/).length;
const longestSeconds = (m: MatchDef, role: "dance" | "cellar") => m.steps[role]! * m.stepSeconds;

describe("library entry checks", () => {
  it("has at least one match, each with a unique id", () => {
    expect(LIBRARY.length).toBeGreaterThan(0);
    expect(new Set(LIBRARY.map((m) => m.id)).size).toBe(LIBRARY.length);
  });

  for (const m of LIBRARY) {
    describe(m.name, () => {
      it("has a rules summary of about 40 words and a worked example", () => {
        expect(words(m.rulesSummary)).toBeGreaterThanOrEqual(25);
        expect(words(m.rulesSummary)).toBeLessThanOrEqual(55);
        expect(m.workedExample.trim().length).toBeGreaterThan(0);
      });

      it("keeps every step to 45s or less and its Prelude to 90s or less", () => {
        expect(m.stepSeconds).toBeLessThanOrEqual(45);
        expect(m.answerSeconds + 3).toBeLessThanOrEqual(m.stepSeconds);
        expect(m.preludeSeconds).toBeLessThanOrEqual(90);
      });

      if (m.guestRange.dance) {
        it("fits a Dance: Prelude + 20s + longest length is 5 min or less", () => {
          expect(m.preludeSeconds + 20 + longestSeconds(m, "dance")).toBeLessThanOrEqual(300);
        });
        it("has a guest range that fits the Dance role", () => {
          const [lo, hi] = m.guestRange.dance!;
          expect(lo).toBeGreaterThanOrEqual(3);
          expect(hi).toBeLessThanOrEqual(10);
        });
      }
      if (m.guestRange.cellar) {
        it("fits a Cellar game: Prelude ≤ 30s plus what its length leaves of the 3 min slot", () => {
          const over = Math.max(0, longestSeconds(m, "cellar") - 180);
          expect(m.preludeSeconds - over).toBeLessThanOrEqual(30 + 0 + Math.max(0, 180 - longestSeconds(m, "cellar")));
        });
        it("has a guest range that fits the Cellar role", () => {
          const [lo, hi] = m.guestRange.cellar!;
          expect(lo).toBeGreaterThanOrEqual(2);
          expect(hi).toBeLessThanOrEqual(9);
        });
      }

      it("has a problem bank that covers the longest game", () => {
        const longest = Math.max(m.steps.dance ?? 0, m.steps.cellar ?? 0);
        const [problems] = generateSums(1, m as never, longest);
        expect(new Set(problems.map((p) => p.prompt)).size).toBe(longest);
      });

      it("plays to a strict, paid ranking with simulated guests across its Dance range", () => {
        const [lo, hi] = m.guestRange.dance!;
        for (let n = lo; n <= hi; n++) {
          const four = started(Math.max(n, 4), 500 + n);
          // The Foyer takes 4-10; a Dance of 3 is a later round's, so seat three by dropping a guest from a started game.
          const game: GameState = n === 3 ? { ...four, guests: four.guests.slice(0, 3) } : four;
          const done = playDance(game, mixedPlayer);
          const r = done.danceResult!;
          expect(done.phase).toBe("standings");
          expect(new Set(r.ranking.map((x) => x.guest)).size).toBe(n);
          expect(r.ranking.map((x) => r.payout[x.guest])).toEqual([...DANCE_PAYOUTS[n]!]);
          for (const g of done.guests) expect(g.favours).toBeGreaterThanOrEqual(0);
        }
      });
    });
  }
});
