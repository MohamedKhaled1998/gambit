import type { Colour, Mask, Shape, Trim } from "../shared/types";

/** A mask for a Prelude's worked example. */
export const mask = (colour: Colour, shape: Shape, trim: Trim | null = null, feathers = 0): Mask => ({ colour, shape, trim, feathers });

/** Eighteen masks for All That Glitters' Prelude: seven gold, five of them foxes and two owls. */
export const DEMO_CROWD: Mask[] = [
  ...Array.from({ length: 5 }, (_, i) => mask("gold", "fox", i % 2 ? "pearls" : null, i % 4)),
  mask("gold", "owl", null, 1),
  mask("gold", "owl", "lace", 2),
  mask("silver", "fox", null, 0),
  mask("red", "cat", "ribbons", 1),
  mask("sapphire", "owl", null, 2),
  mask("emerald", "plain", "pearls", 0),
  mask("onyx", "cat", null, 3),
  mask("red", "fox", "lace", 2),
  mask("silver", "plain", null, 1),
  mask("sapphire", "cat", "ribbons", 0),
  mask("emerald", "owl", null, 3),
];

/** The sixteen cells of Seating Plan's Prelude grid, four by four; the silver fox sits top right. */
export const DEMO_GRID: Mask[] = [
  mask("red", "cat"), mask("gold", "owl", "pearls"), mask("onyx", "plain", null, 2), mask("silver", "fox", null, 1),
  mask("emerald", "fox"), mask("sapphire", "cat", "lace"), mask("gold", "plain"), mask("red", "owl", null, 3),
  mask("onyx", "cat", "ribbons"), mask("silver", "plain", null, 2), mask("gold", "fox"), mask("emerald", "owl", "pearls"),
  mask("sapphire", "fox", null, 1), mask("red", "plain", "lace"), mask("onyx", "owl"), mask("silver", "cat", null, 3),
];
