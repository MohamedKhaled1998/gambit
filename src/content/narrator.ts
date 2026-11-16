import type { LineId } from "../shared/types";

/**
 * The Narrator's lines: an unseen, unnamed voice of the house, playful and wry, speaking to the guest
 * as "you". It never speaks a guest's name and never gives away hidden information, so every line is
 * fixed text. A line plays in full the first time and as a short announcement after.
 */
export interface NarratorLineDef {
  /** The full line, with the seconds it takes (up to 20; 25 for the combined sent-down and Cellar line). */
  first: string;
  seconds: number;
  /** The short announcement that replaces it later. */
  short: string;
}

export const OVERTURE = {
  text: "The doors close behind you. Candles gutter, masks glint, and somewhere a quartet tunes up. Tonight everyone is charming, and nobody is quite what they seem. Do enjoy yourself. Do keep an eye on your friends.",
  seconds: 30,
};

export const NARRATOR: Record<LineId, NarratorLineDef> = {
  mingle: {
    first:
      "The Mingle. Four minutes to talk, trade and scheme. Slip a favour to a friend, whisper in a Room, or promise something you never intend to pay. Deals are never enforced; trust is the game. Tonight's Dance is announced below, so make your deals about it.",
    seconds: 20,
    short: "The Mingle is open. Talk while you can.",
  },
  dance: {
    first:
      "The Dance. Every guest plays the same match, and the ranking pays favours: the best gain, the worst pay. Favours decide who is sent down, so a good night on the floor is a good night's insurance. The music is starting.",
    seconds: 20,
    short: "The Dance begins.",
  },
  sentDown: {
    first:
      "Sent down. The guests holding the fewest favours go to the Cellar, and the Cellar plays a match of its own, with nothing paid and everything to lose: the lowest are unmasked. You will talk only to those down here, and the party can't hear you. Count how many go, and mind the clock.",
    seconds: 25,
    short: "Down to the Cellar. Play well.",
  },
  unmasking: {
    first:
      "You are unmasked. Your mask floats off and your favours go with it, but you are not out. Take a seat on the Balcony: you can play along with every match, call who goes next, and sit on the Jury at the end. Everyone here is rooting for somebody.",
    seconds: 20,
    short: "Unmasked. Welcome to the Balcony.",
  },
  lastDance: {
    first:
      "The Last Dance. Two masks remain. They play one match head to head; the winner then faces the Table, and the Balcony votes. The loser takes the crown only with two-thirds of the Jury. Speak well, and choose carefully who you wound.",
    seconds: 20,
    short: "The Last Dance.",
  },
};
