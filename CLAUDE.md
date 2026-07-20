# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the repo root (npm workspaces):

- `npm run server` — dev server with reload (`tsx watch`, port 3000). Serves the game over WebSocket; also serves `packages/client/dist` if it exists.
- `npm run client` — Vite dev client (port 5173), talks to the server on 3000.
- `npm test` — runs engine + server test suites (Vitest). There is no client test suite.
- `npm run typecheck` — `tsc --noEmit` across all workspaces. Do this after changes; nothing emits JS, everything runs from TS source via `tsx`/Vite.
- `npm run build` — production client build only (`packages/client/dist`).
- `npm start` — production server (`tsx`, reads `PORT` env; serves the built client + game).

Single test: `npx vitest run -t "<name>" packages/engine/test/engine.test.ts` (or `--workspace @pcf/engine`). Tests live in `packages/<pkg>/test/*.test.ts`.

Production == the server IS the whole app: `npm run build && npm start` has one process serve the built client AND hold game connections (this is what Render runs via `render.yaml`). Locally, client and server are two processes on two ports.

## Architecture

Three workspaces under `packages/`, layered strictly:

- **`@pcf/engine`** — pure game rules + data. No network, no UI, no I/O beyond reading its own JSON at load. This is the source of truth for game logic; the server and client only orchestrate and render it.
- **`@pcf/server`** — room/session management over WebSocket. Owns the *full* `GameState`, drives the engine, and pushes *filtered* per-player views.
- **`@pcf/client`** — React (Vite), mobile-first. Renders the filtered view and replays combat.

Dependencies flow one way: client → engine (types only) and server → engine. Engine depends on nothing internal.

### Server-authoritative model with filtered views

The server holds the complete `GameState`. It never sends it raw. `buildClientView(state, playerIndex)` (engine) produces a `ClientView` that hides the opponent's hand and deck (only counts), so a tampered client can't see hidden information. Clients send `PlayerAction`s; the server validates via `applyAction` and re-broadcasts new views. Treat `ClientView` as the client's entire world — it is deliberately a subset of `GameState`.

### Combat is a state jump + an event stream the client animates

`resolveCombat`/`applyAction` mutate state to the post-combat result in one step, but each attack/death is also appended to `state.log` as a `LogEntry` carrying a structured `event` (`AttackEvent` | `DeathEvent`). The server sends the final state plus this log. The client (`GameScreen.tsx`) keeps showing the *old* board (`shownView`) and replays the events lane-by-lane — projectile → damage → death → next lane — before switching to the server's new state. Consequence: if you add a combat mechanic in the engine, emit a matching `CombatEvent` or the client will silently jump instead of animating it. New event kinds must be handled in the `runReplay` loop.

### Turn phases

`Phase = 'play' | 'fly' | 'ended'`. A round is: both players take play turns (creatures/actions/pass) → automatic combat resolution → an optional `fly` phase (creatures with the flying behavior may relocate to a free lane) → round end (auras/healing recomputed, cards drawn). `game.ts` sequences this; `startRound`/`endRound`/`afterCombat`/`advanceFlyPhase` are the phase transitions.

### Reconnection via tokens

On create/join the server mints a per-player `token` (also persisted to disk so rooms survive a server restart — see `saveRooms`/`loadRooms`). The client stores `{url, code, token}` in `localStorage` and auto-`rejoin`s on socket drop (`useGame.ts`). WebSocket message types: client→server `create`/`join`/`rejoin`/`action`; server→client `created`/`joined`/`rejoined`/`state`/`opponent`/`error`/`dataError`.

### Data-driven content (the core extensibility point)

All cards, factions, topics, and rules are JSON under `packages/engine/src/data/`. `loadGameData` reads **every** `*.json` in `data/cards/` automatically — adding a faction is dropping in a card file plus a `factions.json` entry, no code change. `validateGameData` (Zod, `schema.ts`) checks everything at load and throws `DataError` with German, human-readable file/card/field locations; the server forwards this as a `dataError` message the client shows as a red banner instead of crashing. When touching data shapes, update `schema.ts` and `types.ts` together.

Card art and 3D: a creature's `cardId` drives both. 2D art is `packages/client/public/assets/cards/<id>.png` (missing → emoji fallback, no code). 3D figures are procedural per `cardId` in `packages/client/src/figures3d.ts`; unknown ids fall back to a color-hashed golem. See `Battlefield3D.tsx` for how DOM lane slots are projected into the WebGL scene.

## Conventions & gotchas

- **Engine internal imports use `.js` extensions** on `.ts` files (`from './game.js'`) — ESM/NodeNext resolution. Keep this in new engine files or imports break at runtime.
- **Keyword name ≠ behavior flag.** JSON keywords are German names (`fliegend`, `flink`, `gift`) that are *keys* in the `KEYWORDS` registry (`keywords.ts`); each maps to behavior flags. Engine code checks the **flag**, e.g. `hasKeyword(creature, 'flying')`, not the keyword name `fliegend`. Add a keyword = add a `KEYWORDS` entry (name → flags) AND implement the flag's effect; the schema rejects any keyword not in the registry.
- User-facing strings and comments are **German** — match that in anything players or modders see (log lines, errors, card text).
- Config knobs (`lanes`, `baseHealth`, `roundLimit`, …) live in `data/config.json`; the client renders `lanes` dynamically, so nothing is hardcoded to 3 lanes.

See `README.md` for the (German, non-programmer) guide to adding cards/factions/topics and deploying to Render.
