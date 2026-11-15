# Match library

The first match library for Two-Faced: five match types carrying ten matches, sized for the quick game. Terms follow `GLOSSARY.md`. Decided in the ClickUp ticket [First match library](https://app.clickup.com/t/1241uyj4r3p); the model it fills in is [Match definition model](https://app.clickup.com/t/1241uyj4r3d), and the favour limits it respects are [Favour economy](https://app.clickup.com/t/1241uyj4r3j).

## The library at a glance

| Match | Match type | Family | Dance | Cellar game | Play |
|---|---|---|---|---|---|
| The Tally | Race | maths | 3-10 | 2-9 | solo |
| All That Glitters | Race | counting | 3-10 | 2-9 | solo |
| Seating Plan | Race | memory | 3-10 | 2-9 | solo |
| Arrivals | Race | memory | – | 2-9 | solo |
| The Procession | Race | logic | – | 2-9 | solo |
| Odd Mask Out | Race | logic | 3-10 | 2-9 | solo |
| Gilded Auction | Sealed bid | bidding | 3-10 | – | interactive |
| Liar's Toast | Bluff | bluffing | 3-10 | – | interactive |
| The Pledge | Group target | group target | 3-10 | – | interactive |
| Wallflower | Unique pick | counting and guessing | 3-10 | 3-9 | interactive |

- **Coverage.** 8 Dance options, 4 of them interactive; 7 Cellar options, 6 of them solo. At least 3 Dances fit every guest count from 3 to 10, and at least 4 Cellar games fit every count from 2 to 9 (6 at a Cellar of two).
- **Sized for the quick game.** A quick game draws 3 Dances and up to 3 Cellar games, and the draw rule below never needs an encore to fill it (a match used as a Dance doesn't return as the Cellar game). A full season draws up to 7 of each, so it plays a few encores.
- **Favours move only three ways:** the Dance payout, buying points, and The Pledge's own award. No match charges real favours as part of play; bids and bets are in points.

## Library-wide rules

These apply to every match unless its spec says otherwise.

- **Buy-points rate.** 1 favour buys about half the points of one correctly solved step. Interactive matches state their rate against the same yardstick.
- **Tie-break.** More points, then lower total answer time across all steps, then a random draw shown on screen. Matches with no answer times state their own middle rule.
- **Step length.** 45 seconds at most, in both places, so an unmasking vote never waits long for a step to end.
- **Prelude length.** Each match states its Prelude's target length; its script may come in shorter, never longer. Ceiling 90s. Two checks every match passes, decided in [Time budget: the Unmasking vote and Prelude lengths](https://app.clickup.com/t/1241uyj4t5e):
  - **As a Dance:** Prelude + 20s (the Narrator's first-time Dance line, in round 1) + longest length ≤ 5 min.
  - **As a Cellar game:** Prelude ≤ 30s + whatever its length leaves of the 3-minute Cellar slot. In round 1 the first-time lines for being sent down and the Cellar play as one line (≤25s) in the first half of the sent-down reveal, so they cost the Cellar slot nothing.
- **Copying in same-room play.** Answer options and grid layouts are shuffled per guest wherever the match type allows; the problem is the same, its layout differs. Nothing else; the rest is group honour.
- **Live ranking.** Running points and ranks are public to guests in the match, free guests and the Balcony, unless a match hides them (only The Pledge does).
- **Unmasked guests play along.** In solo matches they answer the same problems and are ranked on the Balcony. In interactive matches they play a **shadow copy** among unmasked guests only, when their number fits the match's guest range; otherwise they watch.
- **Names and rules voice.** Masquerade names, playful and wry; rules summaries speak to the guest as "you", in about 40 words.
- **Masks.** Every mask in every problem comes from one shared mask generator with a fixed set of traits: colour (including gold, silver and red), shape (fox, cat, owl, plain…), trim and feather count. Problem banks pick traits; they never draw their own masks.
- **Colour-blind guests.** Every match is playable without telling colours apart by hue alone. Decided in [Colour-blind guests and colour-only mask traits](https://app.clickup.com/t/1241uyj4t37).
  - **One palette for everyone,** no colour-blind setting and no second cue per colour: gold `#d6a823`, silver `#c3c9d6`, red `#c8352c`, sapphire `#2f60cc`, emerald `#1d9a6b`, onyx `#45454f`. Nothing else, so no amber, bronze or ivory.
  - **The bar:** every pair of palette colours, and each colour against the midnight-ink background, at least ΔE 20 under simulated protan, deutan and tritan vision, at avatar size. Any colour added later must pass it. A colour-blind friend confirms it on real phones before the prototype is handed off.
  - **Show the mask, not just its name.** A question that names a target mask ("the silver fox") shows its picture beside the words, so no problem depends on knowing what the game calls a colour.
  - **Rules cards** of matches with masks carry a strip of the six colours with their names.

## Drawing matches and encores

Decided in [Match repeats in the full season](https://app.clickup.com/t/1241uyj4t5f). One rule for both formats; the first prototype plays only the quick game, so it never draws an encore.

- **Draw rule.** Every Dance and Cellar game is drawn at random from the first of these that holds a match fitting the guest count:
  1. matches not yet drawn this game;
  2. matches not yet drawn **in this role** (Dance or Cellar game) this game;
  3. the match drawn longest ago.
- **Hard limits at every level.** Never the match already drawn this round, never one drawn in the previous round, and **The Pledge at most once a game** (it is the only match that adds favours).
- **Encores.** A match drawn a second time is an **encore**. It generates fresh problems from its problem bank like any draw; The Pledge and Wallflower, with no bank, repeat as they are, and the guests' memory of the first time is part of the play. Its Prelude isn't played again: the match starts as if every guest had skipped it, and the rules card stays available.
- **With this library.** A 7-round season needs no Dance encores (8 options) and at most one or two Cellar encores. The Last Dance keeps its own rule: an unused Race match, else a Race encore.
- **Out of scope.** A phone remembering which Preludes it has played across games, to offer skipping them: Preludes are already skippable, and serving returning players belongs with public release.

## Match type: Race

Solo. Every guest answers the same problem at once; one answer per step.

- **Steps.** Each step is:
  1. an optional **study phase**: the prompt shows for a time the match sets, then hides (card or tile grid screen);
  2. an **answer phase**: a choice grid of 4 shuffled per guest, or a tile grid whose layout is permuted per guest (question and answer, choice grid, card or tile grid screens);
  3. a **step reveal** of about 3 seconds: the right answer, each guest's own ✓ or ✗, everyone's running points and ranks (reveal screen).
  The step ends when every guest has answered or its time runs out. Problems get harder through the match.
- **What each guest sees.** Their own problem and answer; after each step, the right answer and the public running ranking.
- **Scoring.** Correct: 10 points. Wrong or no answer: 0. Locked in after one answer.
- **Spends.** Buy-points only, at **1 favour = 5 points**. No hint, skip or peek.
- **Awards.** Default payout table; nothing of its own.
- **Charges.** None.
- **Tie-break.** Default.
- **Screens.** Existing only.

Longest length = steps × (study + answer + 3s reveal).

### The Tally (maths)

*Sums flash up. Tap the right answer before the music stops. Ten points each, and the quickest wins ties.*

- **Problem bank.** Generator: sums with four choices; the wrong choices are near-misses (off by 1 or 10, or the wrong operation).
- **Difficulty.** Two-digit + and −, then two-digit × one-digit, then two operations.
- **Timing.** No study; answer 15s; step 18s.
- **Dance:** 12 steps, 3.6 min. **Cellar game:** 8 steps, 2.4 min.
- **Prelude.** 45s.
- **Worked example.** Step 5 shows `34 × 6`, choices 204, 194, 214, 240. Ana taps 204 in 4.1s (+10), Ben taps 194 (0), Cy doesn't answer (0). The reveal shows 204 and the running ranking.

### All That Glitters (counting)

*A crowd of masks appears for a moment. How many were gold?*

- **Problem bank.** Generator: a crowd of masks, then a question and four near-consecutive counts to choose from.
- **Difficulty.** The crowd grows from 12 to 30 masks. Early steps ask "How many were gold?"; later steps ask for gold masks with a second trait ("How many gold foxes?", "How many gold masks wore feathers?"), so the gold masks without it are the decoys. Never near-gold colours: see Colour-blind guests.
- **Timing.** Study 3s; answer 10s; step 16s.
- **Dance:** 12 steps, 3.2 min. **Cellar game:** 8 steps, 2.1 min.
- **Prelude.** 45s.
- **Worked example.** 18 masks flash for 3 seconds, 7 of them gold: 5 gold foxes and 2 gold owls. "How many gold foxes?" Choices 4, 5, 6, 7. Ana picks 7, counting the owls (0); Ben picks 5 (+10).

### Seating Plan (memory)

*The guests take their seats, then the lights go out. Tap where the named mask was sitting.*

- **Problem bank.** Generator: a grid of masks, then one target named by its traits ("the silver fox") and shown as a picture beside the words; it is the only mask in the grid with that colour and shape.
- **Difficulty.** Grid grows 3×3 → 4×4 → 5×5.
- **Timing.** Study 5s; answer 8s by tapping a cell on the tile grid (layout permuted per guest); step 16s.
- **Dance:** 12 steps, 3.2 min. **Cellar game:** 8 steps, 2.1 min.
- **Prelude.** 45s.
- **Worked example.** A 4×4 grid shows for 5 seconds and goes dark. "Where was the silver fox?" Ben saw it top-right on his layout and taps there (+10); Ana's layout had it bottom-left and she taps the cell beside it (0).

### Arrivals (memory, Cellar only)

*Masks arrive one by one. Who came in just before the red one?*

- **Problem bank.** Generator: a sequence of 4 to 8 masks shown one at a time for 1s each, then one question with four mask choices; a mask the question names is shown as a picture beside the words. Question forms vary: just before, just after, first to arrive, how many came before.
- **Timing.** Study up to 8s; answer 10s; step 21s.
- **Cellar game:** 7 steps, 2.45 min.
- **Prelude.** 45s.
- **Worked example.** Owl, cat, red fox, plain, gold owl arrive. "Who came in just before the red fox?" Choices: owl, cat, plain, gold owl. Cat is right.

### The Procession (logic, Cellar only)

*The guests walk in a pattern. Who comes next?*

- **Problem bank.** Generator: number sequences (steady steps, doubling, alternating, adding the last two) and mask sequences (colour, shape or feather count changing by a rule), each with four choices.
- **Difficulty.** One rule, then two rules interleaved.
- **Timing.** No study; answer 20s; step 23s.
- **Cellar game:** 7 steps, 2.7 min.
- **Prelude.** 45s.
- **Worked example.** `3, 5, 9, 17, ?` with choices 25, 31, 33, 34. Each gap doubles (+2, +4, +8), so 33.

### Odd Mask Out (logic)

*Four masks, one doesn't belong. Find it.*

- **Problem bank.** Generator: four masks, three sharing a rule and one breaking it; the choice grid is the masks themselves.
- **Difficulty.** One obvious difference, then several differences where only one forms the pattern.
- **Timing.** No study; answer 12s; step 15s.
- **Dance:** 14 steps, 3.5 min. **Cellar game:** 9 steps, 2.25 min.
- **Prelude.** 45s.
- **Worked example.** A red cat with 3 feathers, a gold owl with 3, a silver fox with 3, a red fox with 2. Colours and shapes vary freely; feather count is the rule, so the red fox with 2 is out.

## Match type: Sealed bid

### Gilded Auction (bidding, Dance)

*Lots go under the hammer. Bid in secret from your points; the highest bid wins the lot's value. Spend too much and you're poorer than when you came.*

- **Guests.** 3-10.
- **Steps.** Every guest starts with **50 points**. Each step one lot with a public value (10-40) goes to sealed bids: bid 20s (bid entry screen), then a 5s reveal. The highest bid pays its bid and gains the lot's value; losing bidders pay nothing. Bids are whole points, from 0 up to the guest's current points.
- **Bands.** 6 lots at 3-5 guests, 8 at 6-10. Longest: 8 × 25s = 3.3 min.
- **Prelude.** 60s.
- **What each guest sees.** Lot value, everyone's points and ranks (public), their own bid. The reveal shows **every bid with names**.
- **Equal bids.** The bid submitted first wins the lot.
- **Spends.** Buy-points at **1 favour = 5 points**; bought points also add to bidding power.
- **Awards.** Default payout table.
- **Charges.** None in favours; bids are in points.
- **Tie-break.** Points, then more lots won, then an on-screen draw.
- **Alliances and betrayals.** In the Mingle, guests split lots ("you take the 40, I take the 30") and pay for it with gifts. Sniping a promised lot is the betrayal, and the named reveal exposes it.
- **Problem bank.** Generator: a sequence of lot values summing to about 25 × lots, ordered to mix high and low.
- **Worked example.** A 30-point lot. Ana bids 12, Ben 18, Cy 0. Ben pays 18 and gains 30: 50 → 62. Ana stays at 50, having promised Cy she'd stay off this lot and kept it.
- **Screens.** Bid entry, reveal.

## Match type: Bluff

### Liar's Toast (bluffing, Dance)

*You're dealt a secret card and raise a toast claiming its value. Others may call you a liar. Caught bluffing, you get nothing; wrongly accused, you're paid for the insult.*

- **Guests.** 3-10. No band settings.
- **Prelude.** 70s.
- **Steps.** 6 steps of 35s (claim 15s, call 15s, reveal 5s); 3.5 min. Each step every guest is dealt a secret card from 1 to 9 and publicly claims a value from 1 to 9 (bid entry). Then each guest may secretly call **one** other guest, or no one (choice grid of guests).
- **Scoring.**
  - Not called: the claimed value.
  - Called and honest (card ≥ claim): the claimed value **+5 per caller**.
  - Called and lying (card < claim): 0; **each caller scores the claimed value**.
  - No claim: 0, the worst result. Points never go down.
- **What each guest sees.** Their own card; everyone's claims once the claim phase closes; the public running ranking. The reveal shows who called whom and the cards of called guests only. Uncalled cards stay hidden for good.
- **Spends.** Buy-points at **1 favour = 3 points**.
- **Awards.** Default payout table.
- **Charges.** None.
- **Tie-break.** Points, then more correct calls, then an on-screen draw.
- **Alliances and betrayals.** "We never call each other." The betrayal is calling your ally on the step they bluff big.
- **Problem bank.** Generator: an independent card from 1 to 9 per guest per step.
- **Worked example.** Ana holds 4 and claims 8; Ben holds 7 and claims 6; Cy holds 2 and claims 3. Ben calls Ana, Cy calls Ben. Ana was lying: she scores 0, Ben scores 8. Ben was honest: he scores 6 + 5 = 11 more, Cy scores nothing for that call. Nobody called Cy, so Cy scores 3 and her card stays hidden.
- **Screens.** Card grid (own card), bid entry, choice grid, reveal.

## Match type: Group target

### The Pledge (group target, Dance only)

*Each round you're handed points. Pledge some to the pot and keep the rest. If the pot reaches the target, everyone is rewarded, unless somebody pockets it.*

- **Guests.** 3-10. No band settings; the target scales with guests.
- **Steps.**
  - **5 pledge steps** of 25s (pledge 20s, reveal 5s): each guest privately receives 10 points and secretly pledges 0-10 to the pot (bid entry); the rest is kept.
  - **The reckoning**, the last step (20s, then a 10s final reveal): each guest secretly chooses **Share** or **Pocket** (choice grid).
  - About 2.6 min.
- **Prelude.** 60s.
- **Target.** 30 × guests (60% of all points handed out).
- **Award (replaces the payout table).** If the pot reached the target:
  - nobody pockets: every guest **+2 favours**;
  - exactly one guest pockets: that guest **+3 favours**, nobody else anything;
  - two or more pocket: nobody gets anything.
  If the pot missed the target, nobody gets anything. No guest loses favours in this Dance. All within [Favour economy](https://app.clickup.com/t/1241uyj4r3j)'s +3 cap on game-paid bonuses.
- **Ranking.** More kept points first. It pays nothing here, but it still breaks ties in favours when guests are sent down.
- **What each guest sees.** Their own stock, pledges and kept points; the **pot total** after each step. Individual pledges, points and ranks stay **hidden until the final reveal**, because kept points would expose pledges. The final reveal shows every pledge and every reckoning choice, with names.
- **Spends.** Buy-points at **1 favour = 5 points**; bought points can be pledged.
- **Charges.** None.
- **Tie-break.** Kept points, then an on-screen draw.
- **Alliances and betrayals.** Promises to pledge can't be checked until the end; the reckoning is the one-shot defection, and a lone pocket beats the group.
- **Problem bank.** None; the steps are fixed.
- **Worked example.** Six guests, target 180. After five steps the pot holds 186. At the reckoning five choose Share and Dee chooses Pocket. Dee gets +3; the other five get nothing. Dee also kept the most points, so she tops the ranking.
- **Screens.** Bid entry, choice grid, reveal.

## Match type: Unique pick

### Wallflower (counting and guessing, Dance and Cellar game)

*Everyone picks a number in secret. Numbers nobody else picked score their value; clash with someone and you both stand alone. The highest wallflower earns a bonus.*

- **Guests.** 3-10 as a Dance, 3-9 as a Cellar game.
- **Steps.** Each step every guest secretly picks a number (choice grid), 15s, then a 5s reveal of every pick with names.
- **Bands.** Numbers 1-6 at 3-5 guests, 1-9 at 6-8, 1-12 at 9-10.
- **Scoring.** Every **unique** number scores its value; the highest unique number scores **+5** more. Numbers picked by two or more score nothing. No pick: 0.
- **Dance:** 10 steps, 3.3 min. **Cellar game:** 7 steps, 2.3 min.
- **Prelude.** 50s.
- **What each guest sees.** Their own pick; after each reveal, every pick with names and the public running ranking.
- **Spends.** Buy-points at **1 favour = 3 points**.
- **Awards.** Default payout table.
- **Charges.** None.
- **Tie-break.** Points, then more unique picks, then an on-screen draw.
- **Alliances and betrayals.** In a Dance, allies spread out across the numbers; jumping onto your ally's number is the betrayal. In the Cellar, Cellar talk lets guests gang up and crowd one guest's favourite number. That's the library's deliberate interactive Cellar game.
- **Problem bank.** None; the steps are fixed.
- **Worked example.** Five guests, numbers 1-6. Picks: Ana 6, Ben 6, Cy 5, Dee 2, Eve 1. The sixes clash and score nothing. Cy scores 5 + 5 (highest unique), Dee 2, Eve 1.
- **Screens.** Choice grid, reveal.

## Handed elsewhere

- **Mask art.** The shared mask generator's traits are a requirement for [Look and sound of the Salon, a Dance and the Cellar](https://app.clickup.com/t/1241uyj4r53).
- **Balance.** The Pledge can add up to +2 favours per guest to the game; watch it with the other balance risks.
