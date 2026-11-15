# Gambit

Gambit is the repo codename for **Two-Faced**, a social strategy party game for a friend group, played on phones from a web link. The game's design is approved; the work now is building the quick-game prototype.

## Read first

- `GLOSSARY.md`: the game's vocabulary. Use its words in code, tests, commits and game text (guest, favour, Salon, Mingle, Dance, Cellar, unmasking, Last Dance…), never the terms it lists under _Avoid_.
- `docs/design/game-design.md`: every rule, number and timing. `docs/design/match-library.md`: every match. When code and these docs disagree, the docs win; if they're silent or contradict each other, stop and ask rather than invent a rule.
- `docs/adr/`: architecture decisions. Don't contradict one silently.
- The spec and tickets live in ClickUp: [[spec] Two-Faced quick-game prototype](https://app.clickup.com/t/1241uyj4twx). A ticket's acceptance criteria are its definition of done.

## Stack

- TypeScript everywhere, `strict`, Node 22, npm.
- **Rules engine:** pure TypeScript, with no Cloudflare, React, DOM, `Date.now()` or `Math.random()`. Its interface is `apply(state, action, now)`, `viewFor(state, guest)`, `chatAccess(state, guest)` and `nextDeadline(state)`. Randomness comes only from the seed in the state; time passes only through `tick` actions.
- **Game server:** one Cloudflare Durable Object per game, through PartyServer, as a thin shell: load, apply, save, send views, set the alarm. No game rules in it.
- **Client:** React + Vite, served as Workers static assets. It draws views and sends actions; no game rules in it.
- **Shared types** (state, actions, views, the message envelope) live in one module that all three import.

## Rules that keep the game fair

- A guest only ever receives `viewFor(state, guest)`. Never send raw state, and never put another guest's hidden data (answers before the reveal, cards, bids, pledges, gifts, ballots, predictions) in a view.
- Match types are code; matches and problem banks are data. A new match on an existing match type must need no code change.
- Every match ends in a strict ranking; no ties, ever.
- The clock never waits for anyone. A guest who doesn't act gets the step's worst result.

## Tests

- Vitest. Test through the public seams only:
  1. **The rules engine** (`apply`, `viewFor`, `chatAccess`) with scripted or simulated guests and a fixed seed. Nearly every behaviour is tested here, including the leak property tests (`fast-check`) and the library entry checks.
  2. **The Durable Object** over WebSockets with `@cloudflare/vitest-pool-workers`, only for what the engine can't see (seats and reconnects, alarms, repeated action ids, chat delivery, history paging).
- The React client has no automated tests; playtests check it.
- Name tests by behaviour, in the glossary's words.

## Commands

- Install: `npm ci`
- Typecheck: `npm run typecheck`
- All tests: `npx vitest run`
- One file or test: `npx vitest run <path>` or `npx vitest run -t "<name>"`

Keep these scripts working. When a ticket adds a workspace or a build step, wire it into the root `typecheck` and `test` so these commands still cover everything.

## Workflow

- The repo is on GitHub. Work lands on `main`, one commit per ticket.
- Tickets run through Sandcastle (`~/Workspace/sandcastle`) in commit delivery: each ticket is built test-first, reviewed, squashed into one commit and pushed to `main`.
- Commit subjects are present-tense sentences about the behaviour; the body names the ClickUp ticket and links it.
