import { describe, expect, it } from "vitest";
import { isTense } from "../../src/shared/tense";

type V = Parameters<typeof isTense>[0];
const view = (v: object) => v as unknown as V;

describe("the stage dims to a spotlight", () => {
  it("when guests are sent down", () => expect(isTense(view({ phase: "sentDown" }))).toBe(true));
  it("at an unmasking", () => expect(isTense(view({ phase: "unmasking" }))).toBe(true));
  it("at a memory match's lights-out in a Dance", () => expect(isTense(view({ phase: "dance", step: { lightsOut: true } }))).toBe(true));
  it("at a memory match's lights-out in the Cellar", () => expect(isTense(view({ phase: "cellar", step: { lightsOut: true } }))).toBe(true));
  it("not while a Dance step is lit", () => expect(isTense(view({ phase: "dance", step: { lightsOut: false } }))).toBe(false));
  it("not in the Mingle", () => expect(isTense(view({ phase: "mingle" }))).toBe(false));
  it("not at the Jury vote, which is not the Unmasking vote", () => expect(isTense(view({ phase: "lastDance", stage: "vote" }))).toBe(false));
});
