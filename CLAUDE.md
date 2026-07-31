# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the repo root (npm workspaces):

- `npm run server` — dev server with reload (`tsx watch`, port 3000). Serves the game over WebSocket; also serves `packages/client/dist` if it exists.
- `npm run client` — Vite dev client (port 5173), talks to the server on 3000.
- `npm test` — runs engine + server + client test suites (Vitest). The client suite runs in `jsdom` (see `packages/client/vite.config.ts` and `test/setup.ts`, which stubs `scrollTo` and forces `getContext` to return `null` so tests exercise the 2D fallback).
- `npm run typecheck` — `tsc --noEmit` across all workspaces. Do this after changes; nothing emits JS, everything runs from TS source via `tsx`/Vite.
- `npm run build` — production client build only (`packages/client/dist`).
- `npm start` — production server (`tsx`, reads `PORT` env; serves the built client + game).

Single test: run it from inside the workspace — `cd packages/engine && npx vitest run -t "<name>"`. Running `npx vitest --workspace @pcf/engine` from the repo root fails: vitest reads `--workspace` as a config-file path. Tests live in `packages/<pkg>/test/*.test.ts` (client also `*.test.tsx`).

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

`resolveCombat`/`applyAction` mutate state to the post-combat result in one step, but each attack/death is also appended to `state.log` as a `LogEntry` carrying a structured `event` (`AttackEvent` | `DeathEvent` | `CheerleaderSacrificeEvent` | `SpellEvent` | `SchildEvent`). The server sends the final state plus this log. The client (`GameScreen.tsx`) keeps showing the *old* board (`shownView`) and replays the events lane-by-lane — projectile → damage → death → next lane — before switching to the server's new state. Consequence: if you add a combat mechanic in the engine, emit a matching `LogEvent` or the client will silently jump instead of animating it. New event kinds must be handled in the `runReplay` loop, which dispatches on `ev.kind` through an `else if` chain with **no catch-all `else`** — a kind nobody claims is silently dropped from the animation (the state still jumps, so this fails quietly).

Because the client applies `AttackEvent.damage` directly to its own displayed state, that field must always carry the **effective** damage, not the raw roll — see the shield below.

### The bench IS the base shield (`schild.ts` + `cheerleader.ts`)

Every hit on a base goes through `basisSchaden(state, ziel, menge)` — the single funnel that owns `player.base`. It charges the defender's shield by a random 1–3 segments; on reaching `config.schild.abschnitte` (7) it blocks that hit entirely and resets to 0. It returns the damage that actually landed, so callers must use the return value for both `base` bookkeeping and telemetry. Deliberate exception: attrition (`zermuerbung` in `endRound`) writes `base` directly and stays unblockable.

The shield has no powers of its own. **A block is paid for with a cheerleader**: it is the one and only trigger (`CheerleaderAusloeser = 'schildBlock'`), the defender picks *which* bench slot sacrifices itself, and declining is impossible — the block already happened. The flip side is `schildAktiv()`: an empty bench means no shield at all, so the meter stops charging and hits go straight through. Three bench slots = at most three blocks per game.

Two consequences for the code:

- `basisSchaden` must not open the window itself — it runs deep inside a damage pass. It queues an `{ art: 'schildFenster' }` step instead, which `fahreAufloesungFort` picks up. Because `applyAction` always drains that queue, this works for combat *and* for card effects during the play phase.
- No power may reference a "trigger creature": a block happens at the base, so there is no newly played or dying creature to aim at. All five powers act on the board as a whole. `schild.ts` sits *below* `abilities.ts` in the import order (it's used by `game.ts`, `abilities.ts` and `effects.ts`), so neither it nor `cheerleader.ts` may import them — that's why `cheerleader.ts` inlines its own card draw and never calls `getMaxHealth`.

### Randomness lives in the state, not in a closure

`applyAction` does a `structuredClone`, and the server round-trips `GameState` through JSON, so a `random` closure cannot survive either. `createGame` therefore draws one seed from its injected `random` into `state.rngState`, and everything after deck setup uses `wuerfle(state, min, max)` (`rng.ts`), which advances that field in place. Keep new randomness on `wuerfle` — `simulate.ts` calls `applyAction` *without* a `random` argument and would otherwise lose reproducibility. `test/regression.test.ts` is the golden master that catches this.

### Turn phases

`Phase = 'play' | 'fly' | 'ended'`. A round is: both players take play turns (creatures/actions/pass) → automatic combat resolution → an optional `fly` phase (creatures with the flying behavior may relocate to a free lane) → round end (auras/healing recomputed, cards drawn). `game.ts` sequences this; `startRound`/`endRound`/`afterCombat`/`advanceFlyPhase` are the phase transitions.

### Reconnection via tokens

On create/join the server mints a per-player `token` (also persisted to disk so rooms survive a server restart — see `saveRooms`/`loadRooms`). The client stores `{url, code, token}` in `localStorage` and auto-`rejoin`s on socket drop (`useGame.ts`). WebSocket message types: client→server `create`/`join`/`rejoin`/`action`; server→client `created`/`joined`/`rejoined`/`state`/`opponent`/`error`/`dataError`.

### Data-driven content (the core extensibility point)

All cards, factions, topics, and rules are JSON under `packages/engine/src/data/`. `loadGameData` reads **every** `*.json` in `data/cards/` automatically — adding a faction is dropping in a card file plus a `factions.json` entry, no code change. `validateGameData` (Zod, `schema.ts`) checks everything at load and throws `DataError` with German, human-readable file/card/field locations; the server forwards this as a `dataError` message the client shows as a red banner instead of crashing. When touching data shapes, update `schema.ts` and `types.ts` together.

Card art and 3D: a creature's `cardId` drives both. 2D art is `packages/client/public/assets/cards/<id>.png` (missing → emoji fallback, no code). 3D figures are procedural per `cardId` in `packages/client/src/figures3d.ts`; unknown ids fall back to a color-hashed golem. See `Battlefield3D.tsx` for how DOM lane slots are projected into the WebGL scene.

### The arena layout IS the 3D world's coordinate system

`GameScreen.tsx` renders a full-bleed `.arena` layer: the WebGL canvas fills it, the lane grid sits in a middle band, and everything else (base + shield, energy, deck, round, log ticker, hand) floats on top as chips. There are deliberately no header/footer bars — the empty margins they created were the whole point of the rewrite.

`Battlefield3D` never invents positions. `elementAnchor(world, selector)` raycasts a DOM rect onto the ground plane, so **CSS decides where 3D things stand**: `[data-slot="<side>-<lane>"]` for the fighters, `[data-zone="<side>"]` for the cheerleader bench (the base rides behind it in the zone group's local space; the opponent group is rotated 180° so "behind" points the right way). Rename or drop one of those attributes and the corresponding 3D object silently loses its anchor. One exception, documented in place: the *opponent's* zone only takes its x from the anchor. Its anchor sits at the top edge where the ground runs into the horizon, so the raycast would land dozens of units past the field — depth and size come from the lane geometry instead.

### Hand cards: drag to play, tap for the effect

Playing a card means dragging it into a lane. `useKartenZug.ts` does this with pointer events (HTML5 drag-and-drop never fires on touch) and hit-tests the lane rects it collected at drag start — not `document.elementFromPoint`, which jsdom lacks and which the drag ghost would poison anyway. Two traps it exists to avoid: card artwork needs `draggable={false}` (the browser's native image drag fires `pointercancel` and kills the gesture) and `.hand-card` needs `touch-action: none` (otherwise the page scrolls instead).

A short tap opens the detail overlay with the card text. Its `Ausspielen` button falls back into the old tap-a-lane selection, which is still the only way to play cards without a lane target (`summon`) and still drives the fly phase. Both paths end in `karteAufLane(handIndex, lane)` — don't add a second place that turns a card into a `PlayerAction`.

## Conventions & gotchas

- **Engine internal imports use `.js` extensions** on `.ts` files (`from './game.js'`) — ESM/NodeNext resolution. Keep this in new engine files or imports break at runtime.
- **Keyword name ≠ behavior flag.** JSON keywords are German names (`fliegend`, `flink`, `gift`) that are *keys* in the `KEYWORDS` registry (`keywords.ts`); each maps to behavior flags. Engine code checks the **flag**, e.g. `hasKeyword(creature, 'flying')`, not the keyword name `fliegend`. Add a keyword = add a `KEYWORDS` entry (name → flags) AND implement the flag's effect; the schema rejects any keyword not in the registry.
- User-facing strings and comments are **German** — match that in anything players or modders see (log lines, errors, card text).
- Config knobs (`lanes`, `baseHealth`, `roundLimit`, …) live in `data/config.json`; the client renders `lanes` dynamically, so nothing is hardcoded to a lane count. **`lanes` is per room**: the creator picks 3–6 in the start screen, the server stores it on the `Room` (persisted) and feeds `createGame` a `GameData` with that override via `mitLanes()` — the same trick `testGameData()` uses. `config.lanes` is only the default offered in the UI.

See `README.md` for the (German, non-programmer) guide to adding cards/factions/topics and deploying to Render.
