# Durable Objects, not Colyseus, for the game server

Each game of Two-Faced runs in one Cloudflare Durable Object (through PartyServer), written in TypeScript and sharing types with the web-first React client. We chose it over Colyseus, the framework built for game rooms, because a full season must survive server restarts and days with nobody connected: a Durable Object keeps its state in its own SQLite storage, costs nothing while idle, and runs the game's clock on alarms, whereas Colyseus rooms live in memory and would need our own database, rehydration logic and an always-on host.

## Considered Options

- **Colyseus**: best in-game ergonomics (`@view()` per-guest filtering, room clock, seat-holding reconnects), but in-memory rooms, reconnect tokens that don't survive a restart, an always-on host, and pre-1.0 breaking minors.
- **Nakama**: two services to host, per-guest sends written by hand anyway, and most of its features (accounts, matchmaker, leaderboards) are out of scope.
- **ASP.NET Core SignalR**: no state model or room lifecycle, no official client for every stack considered, and it would split the rules engine from the TypeScript client.
- **boardgame.io**: the cleanest hidden-state model, but no release since November 2022 and no wall-clock timers.
- **Supabase, Firebase, SpacetimeDB**: free tiers pause after a week idle or exclude server functions, and give little game-loop structure.

## Consequences

- Nothing filters hidden information for us. Every guest receives only the output of one pure function, `viewFor(state, guest)`; the server never sends raw state. That function is where leaks are tested.
- The server runs only on Cloudflare's runtime and its local emulator.
- In-memory fields are lost when an object hibernates or is evicted, so state is always reloaded from storage.
