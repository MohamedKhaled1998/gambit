import type { MatchDef } from "../shared/types";
import { THE_PROCESSION } from "./the-procession";
import { THE_TALLY } from "./the-tally";

/** Every match the game can draw. */
export const LIBRARY: readonly MatchDef[] = [THE_TALLY, THE_PROCESSION];
