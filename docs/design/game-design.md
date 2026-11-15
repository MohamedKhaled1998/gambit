# Two-Faced: game design document

Two-Faced is a social strategy party game for a friend group, set at a masquerade. Guests trade favours, talk in private and betray each other between short skill matches, and are unmasked round by round until two remain for the Last Dance. Trading, private talk and betrayal are the core; the matches are the arena.

This document gathers every decision on the wayfinder map [Gambit (social strategy party game)](https://app.clickup.com/t/1241uyj4r39) into one place. Each section links the ticket that holds the reasoning. Terms follow [`GLOSSARY.md`](../../GLOSSARY.md); match specs are in [`match-library.md`](match-library.md); the server choice is [ADR 0001](../adr/0001-durable-objects-over-colyseus.md). "Gambit" is the repo codename only.

Building the prototype is the hand-off. What the prototype cuts is listed in [The prototype's cut](#the-prototypes-cut).

## At a glance

- **Guests:** 4-10, balanced for 6-8. Same-room, remote or mixed. Text chat only; groups use the call they already have. English only.
- **Joining:** a web link, an Invitation code and a display name. No install, no account.
- **Formats:**
  - **Quick game:** 3 rounds and the Last Dance, 4-10 guests, about 54-56 minutes, played in one sitting.
  - **Full season:** 5-7 rounds and the Last Dance, 6-10 guests, pausing after every round and resumable across days.
- **Winning:** be the last mask: the finalist who wins the Last Dance. There is no prize pool of any kind.
- **Name and mood:** a masquerade manor party, playful and wry, with real tension at being sent down, the Unmasking vote and unmasking. Nothing is taken from any TV show; briefs for music, voice and art describe the feel in our own words.

## The core loop

Decided in [Core loop and round structure](https://app.clickup.com/t/1241uyj4r3a).

A game opens in the **Foyer**, plays its rounds, and ends with the **Last Dance**. Each **round** runs:

1. **Mingle** (4 min): guests make deals, give gifts and talk in Rooms. The round's Dance is announced at the start, so deals can be about it, and its Prelude can be watched on demand.
2. **Dance** (5 min): every remaining guest plays one match. Its ranking pays or takes favours by the payout table.
3. **Sent down** (1 min): the guests holding the fewest favours go to the Cellar. The Cellar game is announced, the round's unmasking count is revealed, and the Cellar game's Prelude plays.
4. **Cellar game** (3 min): only guests in the Cellar play. The lowest-ranked are unmasked, as many as the round's count.
5. **Unmasking** (1 min): each unmasked guest's mask floats off and their name is written in.

A round takes 14 minutes, or about 15 with an Unmasking vote. Round 1 opens with the Mingle. The Last Dance is not a round.

### Who is sent down

- The Cellar holds the **lower half by favours, rounded up**, and always **at least one more guest than the round unmasks**: Cellar size = max(⌈remaining ÷ 2⌉, unmaskings + 1). So someone in the Cellar always survives, and a heavy last round can send down all but one guest.
- On equal favours, the guest placed higher in that round's Dance stays free. Rankings never tie, so being sent down never meets a tie.

### How many are unmasked

The total unmasked over a game is always starting guests − 2, so exactly two reach the Last Dance. How it splits across rounds is the **Unmasking schedule**, hidden from guests and recomputed after every round. Guests see how many rounds are left and that the Last Dance has two guests, never the schedule.

- **Schedule rule (a round with no vote):** if fewer unmaskings remain than rounds remain, the round unmasks 0 (a **warm-up round**); otherwise it unmasks remaining unmaskings ÷ remaining rounds, rounded up.
- **The last round** unmasks everyone above two. It never holds a vote.
- **When the count is known:** a round's count is revealed when guests are sent down, or earlier by the Unmasking vote's ballot.

Quick game with no votes:

| Starting guests | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|
| Unmasked R1 / R2 / R3 | 0/1/1 | 1/1/1 | 2/1/1 | 2/2/1 | 2/2/2 | 3/2/2 | 3/3/2 |

Full season: min(max(starting guests − 2, 5), 7) rounds. With no votes, one unmasking per round; 6 guests open with a warm-up round, 10 guests unmask two in round 1.

| Starting guests | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|
| Rounds | 5 | 5 | 6 | 7 | 7 |
| Unmasked per round | 0,1,1,1,1 | 1 each | 1 each | 1 each | 2,1,1,1,1,1,1 |

**Warm-up rounds** are played in full. Only the Dance's payout is at stake; the Cellar game is played for practice with nothing at stake.

### The Unmasking vote

Decided in [Core loop and round structure](https://app.clickup.com/t/1241uyj4r3a), [Three-guest Dance payout and the forced Unmasking vote](https://app.clickup.com/t/1241uyj4t5c) and [Time budget: the Unmasking vote and Prelude lengths](https://app.clickup.com/t/1241uyj4t5e).

The group-versus-self dilemma of the game. It replaces co-op rounds, which are removed from both formats ([Co-op rounds: replace or remove](https://app.clickup.com/t/1241uyj4r3b)).

- **When:** in any round before the last, with a chance of (remaining guests − 2) ÷ 8 (10 → 100%, 8 → 75%, 6 → 50%, 4 → 25%). Every game holds at least one: if none has happened by the second-to-last round, that round holds one. It comes unannounced, at the start of the round or partway through its Dance, with equal odds. A Dance pauses for it only between steps; this is the only freeze in the game.
- **Ballot:** secret. **Mercy** = the lower count k (remaining unmaskings ÷ remaining rounds, rounded down); **Greed** = k + 1. Mercy wins only with a strict majority; a tie goes to greed. An absent guest's ballot counts as mercy.
- **Mercy delays, never cancels:** the total stays fixed, so mercy now means more unmaskings later.
- **Greed pays:** every greed voter gets **+2 favours** at the reveal, whatever the outcome, usable at once, including in the Dance the vote paused. If everyone votes greed, nobody gains on anyone and one more guest is unmasked.
- **Shifted ballot:** if k + 1 would leave a later round unplayable, the ballot shifts down one (mercy k − 1, greed k). If mercy wins on 0, the round becomes a warm-up round.
- **No vote:** a round holds a vote only if it can offer two counts that leave every later round playable. The guaranteed vote never hits this case.
- **Reveal:** every ballot at once, each with the voter's name.
- **Time:** about 1 minute the first time (Narrator's line ~20s, ballot 25s, reveal ~10s), about 40s after that. It never comes out of the Mingle or the Dance.

## Favours

Decided in [Favour economy](https://app.clickup.com/t/1241uyj4r3j).

Favours are the game's single currency and its standing: guests are sent down by them.

- **Every guest starts with 10.** Totals never go below 0. **Zero never unmasks anyone**; a guest on 0 can't spend or give. An unmasked guest's favours vanish.
- **Public totals.** Exact totals show in the Salon standings and are announced after every Dance and every Cellar game. During the Mingle each guest sees only their own live balance, so several gifts don't show who gave to whom; a single gift can still be worked out.
- **Favours change only four ways:** the Dance payout (or The Pledge's award in its place), the greed reward, buying points, and gifts. The greed reward and The Pledge are the only sources of new favours.
- **No catch-up rule.** A ±3 zero-sum payout, a flat greed reward, spending that can't profitably buy a Dance, public totals and gifts between allies keep a lead from becoming safe and let a weak start recover. Watched in playtests (see [Playtest watch-list](#playtest-watch-list)).

### Dance payout

Zero-sum, by guests remaining. A match may set its own table instead (only The Pledge does).

| Guests | Payout by place, 1st → last |
|---|---|
| 3 | +2, 0, −2 |
| 4 | +2, +1, −1, −2 |
| 5 | +2, +1, 0, −1, −2 |
| 6 | +3, +2, +1, −1, −2, −3 |
| 7 | +3, +2, +1, 0, −1, −2, −3 |
| 8 | +3, +2, +1, 0, 0, −1, −2, −3 |
| 9 | +3, +2, +1, 0, 0, 0, −1, −2, −3 |
| 10 | +3, +2, +1, +1, 0, 0, −1, −1, −2, −3 |

One Dance can swing two guests 6 apart; from 10 it takes four last places to reach 0. With three guests, two are sent down and one goes free to the Last Dance, so the three-guest row decides who takes the free seat.

**Cellar games pay nothing.** Surviving is the reward.

### Spending

- **Buy points** in any Dance, Cellar game or the Last Dance's match, at a rate each match sets: about half a correct step per favour (5 points in Race, Gilded Auction and The Pledge; 3 in Liar's Toast and Wallflower). No limit; spent favours vanish.
- Because guests are sent down by favours after the Dance, spending more than the payout wins leaves a guest worse off. Going all in pays mainly in the Cellar game.
- **A match's own awards and stakes:** what a guest loses without choosing to is at most the match's worst payout place (−3 by default); a game-paid bonus is at most +3; what a guest chooses to risk is limited only by what they hold, and pots move favours without creating any. The first library uses none of this beyond The Pledge: bids and bets are in points.

## Deals and talk

Decided in [Trading and private talk](https://app.clickup.com/t/1241uyj4r3c), with changes from [The Cellar and the Cellar game](https://app.clickup.com/t/1241uyj4r3k) and [Unmasked guests' role](https://app.clickup.com/t/1241uyj4r3m).

- **Deals are never enforced.** No escrow, no contract object. Anything not paid on the spot is only a promise; betrayal is always possible, and trust is the game.
- **Gifts:** whole favours, one direction, **in the Mingle only** (never during a match, so a skill match can't become a contest of friends). Instant and final; known only to the giver and the receiver. No cap on amount or count; a guest may give away their last favour. A swap is two gifts, so someone sends first. A full-season pause holds gifts until the next Mingle.
- **The Table:** the public chat in the Salon for every remaining guest.
- **Rooms:** any guest opens one with any set of others, from one-to-one up to everyone but one. Rooms last the whole game, with no limit on how many a guest is in. Only invited guests join; a guest can leave but can't be removed, except that an unmasked guest leaves every Room at unmasking.
- **Chat is open all game,** during matches too, except while a Cellar game runs (below). No forwarding or quoting across chats: nobody can prove what was said in private. Screenshots can't be blocked and stay part of the game.
- **What others see:** who is in which Room is public, on a live "who's talking" screen; what is said is not. No announcements on the Table, no typing indicators, no message counts.
- **Same-room discretion:** no sound or vibration for a chat message; no previews, only an unread dot per chat; every screen looks alike during the Mingle; a one-tap cover switches to a neutral screen.

## The Cellar and the Cellar game

Decided in [The Cellar and the Cellar game](https://app.clickup.com/t/1241uyj4r3k).

- **Shape:** a ranked free-for-all. Every guest in the Cellar plays at once, and the lowest-ranked are unmasked, as many as the round's count. It works for any Cellar size (2-9); a Cellar of two is a duel.
- **Where it comes from:** the shared match library. A match can serve as a Cellar game if it fits the 3-minute slot and plays with 2-9 guests. It is drawn when guests are sent down ([Drawing matches](#drawing-matches)).
- **No ties, ever,** in any match.
- **Talk while it runs:** guests in the Cellar and free guests can't talk to each other. The Table and every Room that mixes the two go read-only for those 3 minutes. Free guests keep their free-only Rooms; Cellar-only Rooms stay live. Guests in the Cellar get **Cellar talk**, a chat for exactly them that free guests can't read; it closes at unmasking and stays readable to its members. Guests sitting together may whisper; the rule is on screen and the group enforces it.
- **Free guests** watch live (each guest's running score and rank, not their private problems) and have no mechanical influence: no spending, sabotage or betting. They influence the Cellar only through earlier deals.
- **Guests in the Cellar** see the live ranking (unless a match hides it) and can buy points as in a Dance. There's no bail.

## Unmasked guests

Decided in [Unmasked guests' role](https://app.clickup.com/t/1241uyj4r3m).

Unmasked guests stay at the party until the Last Dance ends.

- **They see public information only:** standings, the Table, the who's-talking screen, live scores. No Room or Cellar talk, no gifts. Full information was rejected: over the group's call it would make every unmasked guest a spy.
- **Talk:** they leave every Room, keeping read-only history; the Table is read-only for them. They talk on the **Balcony**, which no remaining guest can read.
- **No influence on rounds:** no gifts, no Unmasking vote, no bets that touch the game.
- **Play along:** in every later match they answer the same problems, ranked separately by raw points with nothing at stake, shown only on the Balcony and to themselves. In interactive matches they play a shadow copy among themselves when their number fits the match's range, otherwise they watch.
- **Predictions:** for each Cellar game, a pick of who it unmasks (one pick per unmasking that round, 1 point per correct pick); for the Last Dance, a pick of who wins its **match** (3 points), so a juror never votes on what they predicted. Picks open when guests are sent down (or the Last Dance is announced), lock when the match starts, show live on the Balcony and are revealed to everyone at the end. Best score earns the **Oracle** title; ties share it.
- **The Jury:** every unmasked guest, 2-8 jurors (4-8 in a full season).

## The Last Dance

Decided in [The Last Dance](https://app.clickup.com/t/1241uyj4r78), with lengths from [Time budget: the Unmasking vote and Prelude lengths](https://app.clickup.com/t/1241uyj4t5e).

It follows the last unmasking directly, with no Mingle, and runs about 8½ minutes at most.

1. **The match** (Narrator's first-time line 20s, Prelude 45s, then up to 2.7 min): one Race match played head to head at its Cellar game length. It is an unused Race match if one is left; otherwise a Race encore, drawn by the usual rule (the Race match drawn longest ago, never one drawn in the last round). It pays no favours. Favours carry in only as bought points; leftover favours count for nothing. Jurors play along on the Balcony.
2. **Addresses** (3.5 min): the Table opens to the whole party. The match winner has the floor alone for 60s, then the loser for 60s (the last word), then 90s of open questions. The Balcony stays the Jury's private room.
3. **The Jury vote** (45s): a secret ballot naming a finalist, no abstain button. **The match loser wins only with two-thirds of the jurors present when the vote opens** (rounded up); otherwise the match winner wins. A present juror who doesn't vote counts as not backing the loser; absent jurors don't count; with no juror present the match decides alone. It never ties. The screen shows the bar when the match ends ("Ana won the match. Ben needs 4 of 6 votes").

   | Jurors present | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
   |---|---|---|---|---|---|---|---|
   | Votes the loser needs | 2 | 2 | 3 | 4 | 4 | 5 | 6 |

4. **The reveal** (~20s): ballots one at a time with names, in random order, then the winner, crowned **the last mask**. The end screen reveals every prediction, names the Oracle and shows final favours.

## Leaving and absent guests

Decided in [Dropouts after the game starts](https://app.clickup.com/t/1241uyj4t5d) and [Architecture on Durable Objects](https://app.clickup.com/t/1241uyj4rtq).

- **Absent guests play on.** Seats are held all game and the clock never waits. An absent guest plays as "no answer" (the worst result of each step), counts as mercy in an Unmasking vote, shows a "disconnected" marker, and sinks under the normal rules. Nobody, and no timer, declares them gone.
- **Only the guest can leave,** with a button behind a confirmation. "Ana left the party." Leaving is an unmasking: it uses one of the current round's unmaskings, or the next round's that has one, and their favours vanish. During a match they rank last in it and are unmasked when it ends (in a Dance they take the bottom payout and are gone before guests are sent down). With no match running, they are unmasked at once. A ballot already cast still counts. Returning on their seat, they come back as an unmasked guest.
- **A round whose unmaskings a leaver has used up** plays on as a warm-up round. If a guest leaves with three remaining before the Last Dance, the other two are the finalists.
- **In the Last Dance,** a finalist who leaves hands the other the win at once (Jury vote skipped, predictions still revealed). An absent finalist gets no special rules.
- **The Host role** passes to the earliest-joined guest still in the game (unmasked counts) when the Host leaves; during a full-season pause, any guest present can take it after the Host has been offline 10 minutes.

## Joining, the Host and same-room play

Decided in [Architecture on Durable Objects](https://app.clickup.com/t/1241uyj4rtq), [Same-room sound switch and a name for the pre-start space](https://app.clickup.com/t/1241uyj4t5j) and [A room speaker for guests together without the Host](https://app.clickup.com/t/1241uyj4twb).

- **Foyer:** guests arrive by web link and **Invitation code** (5 letters, no look-alikes), set a display name and their in-person pick, and wait while the Host picks the format. The Host starts once the count fits (4-10 quick game, 6-10 full season). Starting closes the doors and fixes the seats; the Overture plays as they close.
- **Host:** the guest who created the game. Powers: pick the format, remove a guest before the start, start, show a re-join link, resume a full season, end the game early. Nothing touches play; the Host keeps the role if unmasked. Ending early shows the end screen with no last mask crowned.
- **Seats:** joining issues a seat token kept in the browser. It takes back the same seat from any tab; a second tab takes over. A lost token is a lost seat unless the Host shows a re-join link.
- **Full-season pause:** automatic after every round's unmasking, never mid-round. The Salon stays open (Table, Rooms, Balcony); gifts wait for the Mingle. The Host resumes with an announced countdown of about 60s, with no minimum present. A quick game never pauses.
- **In person:** each phone has a picker, "I'm in person with: nobody / ‹guest›", set in the Foyer and changeable any time. The picked guest's phone is the **Speaker** for everyone who picked them; a game can have any number of Speakers. The picker lists only guests who haven't picked someone, so a Speaker never has a Speaker; if a Speaker picks someone, their group moves with them.
  - **A Speaker** plays the public narration, the music and the public cues aloud, and never a private cue, not even its own guest's.
  - **An In-person guest's phone** shows captions, plays no music, and plays cues at about 40%.
  - **Remote guests** play everything on their own phone.
  - **A Speaker who leaves** passes the role to the earliest-joined guest of their group. **A Speaker who goes offline** changes nothing automatically; their group sees "Your Speaker is offline" with a one-tap **Play sound here**.
  - Game text says "in person" or "together", never "room".

## Matches

Decided in [Match definition model](https://app.clickup.com/t/1241uyj4r3d), [First match library](https://app.clickup.com/t/1241uyj4r3p) and [Match repeats in the full season](https://app.clickup.com/t/1241uyj4t5f). Full specs: [`match-library.md`](match-library.md).

### The model

- **Match types are code; matches and problem banks are data.** A match is a match type plus settings (name, rules summary of about 40 words, worked example and Prelude script, guest range, steps, difficulty, settings per band of guest counts, problem bank, buy-points rate, tie-break chain, and whether it serves as a Dance, a Cellar game or both). A problem bank is a written list or a generator with data settings. A new match on an existing type, or new problems, is data only.
- **Steps on the game's clock.** A match is a sequence of steps of 45s or less. The clock never waits; a guest who doesn't act scores that step's worst result. It can pause only between steps.
- **Same problems for everyone,** in the same order. No problem repeats within a game. Options and layouts are shuffled per guest against copying.
- **Every match ends in a strict ranking.** Default tie-break: points, then lower total answer time, then an on-screen draw. A match never sends down or unmasks anyone itself.
- **Points** live within one match; favours are all that carry over.
- **Hidden information:** each match type defines what each guest sees at each step and what a reveal makes public.
- **Fit checks** (library entry): as a Dance, Prelude + 20s + longest length ≤ 5 min; as a Cellar game, Prelude ≤ 30s + what its length leaves of the 3-minute slot; guest range fits the role; rules summary and worked example present; the bank covers the longest game; one run by simulated guests across the guest range.
- **Shared play screens:** question and answer, choice grid, bid entry, card or tile grid, reveal. A match type needing a new screen is a rare, deliberate cost.

### The first library

Ten matches on five match types, sized for the quick game: 8 Dance options (4 interactive), 7 Cellar options (6 solo). At least 3 Dances fit every count from 3 to 10, and at least 4 Cellar games every count from 2 to 9.

| Match | Match type | Family | Dance | Cellar game | Prelude |
|---|---|---|---|---|---|
| The Tally | Race | maths | 3-10 | 2-9 | 45s |
| All That Glitters | Race | counting | 3-10 | 2-9 | 45s |
| Seating Plan | Race | memory | 3-10 | 2-9 | 45s |
| Arrivals | Race | memory | – | 2-9 | 45s |
| The Procession | Race | logic | – | 2-9 | 45s |
| Odd Mask Out | Race | logic | 3-10 | 2-9 | 45s |
| Gilded Auction | Sealed bid | bidding | 3-10 | – | 60s |
| Liar's Toast | Bluff | bluffing | 3-10 | – | 70s |
| The Pledge | Group target | group target | 3-10 | – | 60s |
| Wallflower | Unique pick | counting and guessing | 3-10 | 3-9 | 50s |

The Pledge replaces the payout table with its own award (+2 each if all share, +3 to a lone pocket, nothing if two or more pocket or the pot misses), so no guest loses favours in it.

### Drawing matches

One rule for both formats. Each Dance and Cellar game is drawn at random from the first of these that holds a match fitting the guest count: (1) matches not yet drawn this game; (2) matches not yet drawn in this role; (3) the match drawn longest ago. Never the match already drawn this round or one drawn in the previous round; The Pledge at most once a game. A match drawn a second time is an **Encore**: fresh problems, no Prelude, rules card still available. A quick game never needs an Encore for its Dances and Cellar games; a 7-round season needs at most one or two Cellar Encores.

## Teaching the rules

Decided in [Teaching the rules: an explainer video with narration for each match](https://app.clickup.com/t/1241uyj4t20), drawing on [How phone party games teach rules and survive dropouts](https://app.clickup.com/t/1241uyj4r3h).

Teach less, just before it applies, in full only once.

- **The Narrator:** an unseen, unnamed voice of the house, playful and wry, speaking to the guest as "you". It never speaks a guest's name and never gives away hidden information; names appear only on screen and in captions.
- **Overture** (~30s, as the Foyer's doors close): sets the scene only.
- **First-time lines** (up to ~20s each) for the Mingle, the Dance, being sent down and the Cellar (one combined line of ≤25s in round 1's sent-down reveal), the Unmasking vote, an unmasking, and the Last Dance. Later: one short announcement. Each line's time comes out of its own phase. Lines meant for some guests only (guests in the Cellar, a newly unmasked guest on the Balcony) play on those guests' own phones; a Speaker plays only the lines every guest hears, and an In-person guest reads their own lines as captions.
- **Quiet at tense moments:** it speaks before the stage dims, never over the Unmasking vote's reveal or an unmasking.
- **Prelude for every match:** its worked example played on its real screens with made-up guests (Ana, Ben, Cy), under captions and narration, scripted in the match's data with speech generated at content build. A Dance's Prelude plays at the start of its slot (and on demand in the Mingle); a Cellar game's plays in the second half of the sent-down reveal. Any guest can skip to the **Rules card**; the match starts early once everyone in it has skipped.
- **One copy per phone,** started together by the game's clock, captions always on. A rules button opens the Rules card and can replay the Prelude at any time, though the clock doesn't wait. No practice turn.

## Look and sound

Decided in [Look and sound of the Salon, a Dance and the Cellar](https://app.clickup.com/t/1241uyj4r53), [Art direction for Two-Faced](https://app.clickup.com/t/1241uyj4t1z), [Colour-blind guests and colour-only mask traits](https://app.clickup.com/t/1241uyj4t37), [Colour-blind check of the mask palette on real phones](https://app.clickup.com/t/1241uyj4t5h), [Score and sound cues](https://app.clickup.com/t/1241uyj4t1y) and [Choose the Narrator's voice by ear](https://app.clickup.com/t/1241uyj4t5g).

### Layout: Spotlight stage

- The **stage** fills the screen: the phase, the match, the masks. A thin rail at the top shows the round's phases; a candle burning down is the timer.
- **Talk** is a sheet under the stage on phone and a column beside it on desktop. In the Cellar the sheet holds only Cellar talk.
- **Tension is light.** Being sent down, the Unmasking vote, a memory match's lights-out and an unmasking dim the stage to a soft spotlight on the masks involved (closing over about 2.4s); on phone the talk sheet hides then. The Cellar turns the light plum.
- **Guests are their masks** everywhere: line-up, standings, choices, 20px chat avatars.

### Art direction: Etched invitation

- **Type:** Bodoni Moda for headings (italic for kickers: "Sent *down*"); Inter for everything else, with tabular figures for favours and standings.
- **Masks:** one shared generator drawn as an engraving: flat trait colour, ink outline in the colour's own shade, fine diagonal hatching. Traits are colour, shape (fox, cat, owl, plain…), trim (pearls, lace, ribbons, in cream) and feather count (0-3 quills, countable at about 48px).
- **Palette:** gold `#d6a823`, silver `#c3c9d6`, red `#c8352c`, sapphire `#2f60cc`, emerald `#1d9a6b`, onyx `#45454f`, one palette for everyone. Every pair, and each colour against the background, at least ΔE 20 under simulated protan, deutan and tritan vision; a deutan friend told all six apart on a real phone on ink and plum. A question naming a mask shows its picture; Rules cards for mask matches carry a named colour strip.
- **Surface:** warm paper grain over midnight ink, an antique-gold hairline frame and accent (`#c9a24a`), a candle glow from the timer's corner.
- **Motion:** slow and inky; things blur in and out rather than slide or pop. At an unmasking the mask floats up and fades, then the name is written in.

### Sound

- **Now:** edited free sound effects (the Sonniss GDC bundle) and temporary AI or library music. Web Audio loop points, Opus with an AAC fallback, audio unlocked on the first tap, the iOS silent switch respected.
- **Cues:** public cues (Dance start, lights out, sent down, the vote, unmasking) and private cues (a right answer, favours received) that play only on that guest's own phone, never where a group can hear. The gift cue is visual-only for everyone. The moment the music stops is shown on screen too.
- **The Narrator's voice:** Fish Audio's "Master Computer" voice on Drama 3, with bracket directions in the script. Keep lossless WAV masters and a manifest (script, model, voice, settings) per file from the first take, and credit the voice as AI-generated.

## Stack and architecture

Decided in [Stack decision](https://app.clickup.com/t/1241uyj4r3n) and [Architecture on Durable Objects](https://app.clickup.com/t/1241uyj4rtq), from [Client stack options for web, iOS and Android](https://app.clickup.com/t/1241uyj4r3f) and [Real-time server-authoritative backend options](https://app.clickup.com/t/1241uyj4r3g). Why Durable Objects: [ADR 0001](../adr/0001-durable-objects-over-colyseus.md).

- **Client:** web-first React + TypeScript, built with Vite, served as Workers static assets. A web link only; a Capacitor wrapper only if store builds are ever needed.
- **Server:** one Cloudflare Durable Object per game, through PartyServer, TypeScript end to end, with types shared with the client. Hibernatable WebSockets; nothing kept in memory between wakes. All on one Cloudflare account, within about $5 a month.
- **Rules engine:** one pure function, `apply(state, action, now) → state`, with randomness from a seed in the state and timeouts as `tick` actions. The Durable Object is a thin shell: load, apply, save, send views, set the alarm. The same engine runs simulated guests for library checks, replays games and runs leak tests without the Cloudflare runtime.
- **Hidden information:** each guest receives only `viewFor(state, guest)`, built from each match type's own `viewFor(matchState, viewer)`, as a whole view re-sent when its hash changes. Leak tests are property tests: changing only guest B's private data never changes guest A's view. Chat goes only to members of its chat.
- **Storage:** per-object SQLite. `game` holds the whole state as one JSON row with a `stateVersion` and migrations on load; `actions` and `messages` are append-only. A finished game deletes its storage 30 days after the end.
- **Messages:** typed JSON envelopes. Server → client: `view`, `message`, `history`, `error`. Client → server: `action` (with a client id, so a resend isn't applied twice), `loadHistory`. A client that sees a new build id reloads.
- **Clock:** absolute deadlines in the state, one alarm on the earliest. An action counts only if it arrives before the deadline by server time. Clients draw countdowns corrected by a server-time offset.
- **Content:** matches, problem-bank settings, Prelude scripts and generated narration are files in the repo, bundled into the Worker at deploy; library entry checks run in CI. A game copies a match's definition into its state when drawn, so a deploy never changes a running game.

## The prototype's cut

The prototype builds this design with these cuts:

- **Quick game only.** No full season, so no pause and resume and no Encores.
- **The Host-only switch** "I'm with the Host in person" instead of the Speaker picker: the Host's phone is the only Speaker, and guests together without the Host turn their own volume down.
- **Temporary music** and the Narrator's community voice, both fine for friends and both to replace before any public release.

## Playtest watch-list

Balance risks that are not decisions. Watch for them in playtests before changing any rule.

- **A runaway favour leader:** a lead bought by early Dances and gifts that makes a guest safe from being sent down for the rest of the game.
- **Favour inflation:** greed rewards (+2 per greed voter) and The Pledge (up to +2 per guest) adding favours faster than buying points removes them, so totals drift up and the payout table matters less.
- **Guests stuck on 0:** a guest who can't spend or give, sent down every round, and with nothing to trade but promises.
- **A rich finalist buying the Last Dance's match:** 1 favour buys 5 points against 10 per correct step, so a large stack can outbuy a better player, leaving only the Jury's two-thirds bar against it.

## Before a public release

Out of scope for this design, recorded so they aren't lost:

- Accounts, monetisation, store builds, other languages and built-in voice chat.
- Check the name Two-Faced for clashes.
- Commission one indie composer on a licence covering web delivery and stems (about $2.4k-3.6k).
- Confirm the Narrator's voice rights, or recreate it as our own voice, on a paid zero-retention account with Fish Audio's written OK to serve the files.
- A phone remembering which Preludes it has played across games.
