import type { MatchDef } from "../shared/types";
import { ALL_THAT_GLITTERS } from "./all-that-glitters";
import { ARRIVALS } from "./arrivals";
import { SEATING_PLAN } from "./seating-plan";
import { GILDED_AUCTION } from "./gilded-auction";
import { ODD_MASK_OUT } from "./odd-mask-out";
import { THE_PLEDGE } from "./the-pledge";
import { THE_PROCESSION } from "./the-procession";
import { THE_TALLY } from "./the-tally";

/** Every match the game can draw. */
export const LIBRARY: readonly MatchDef[] = [THE_TALLY, ALL_THAT_GLITTERS, SEATING_PLAN, ARRIVALS, THE_PROCESSION, ODD_MASK_OUT, GILDED_AUCTION, THE_PLEDGE];
