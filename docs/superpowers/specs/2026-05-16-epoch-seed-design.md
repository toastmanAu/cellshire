# Epoch-Hash Procgen Seed + Mined-Ore Persistence — Design Spec

**Status:** approved 2026-05-16

## Goal

Drive the procgen seed from the CKB chain tip's current epoch hash
instead of `Math.random()`. Every player who loads cellshire within
the same epoch window sees the same world. Sets up the planned
"high-value-epoch trigger mechanic" by making the world a function of
the chain state. Must support user-configurable RPC endpoints (so
players can point at their own light client / fiber node / public
RPC).

**Anti-cheat sub-goal:** persist mined-ore state per epoch in
localStorage so a page reload mid-epoch cannot re-mine already-mined
ores. Acknowledged limitation: a player who clears localStorage CAN
reset their mined-state — but that also wipes their inventory,
character choice, and any future wallet binding, so it's a
self-punishing cheat. The cheat-proof version lands when on-chain
mining (separate kanban item "Mining tx") ships; this spec is the
off-chain best-effort layer that aligns with that future model.

## Non-goals

- Mainnet vs testnet UI switcher. Default is testnet; change the URL
  to point elsewhere.
- Settings-panel UI for node config. URL flag is enough for v0.
- The epoch-modifier yield mechanic. Separate kanban item.
- The high-value-epoch trigger. Separate kanban item.
- Re-fetching the seed mid-session (only fetched once per page load).
- Validating that the endpoint is actually CKB (not, say, a Bitcoin
  RPC). If you point at the wrong server you get a parse error and
  fall through to cached / random.

## Approved decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Seed source | Current epoch hash (block at epoch boundary) |
| Cadence | One fetch per page load |
| Fallback | live → cached last-known → `Math.random()` |
| Node config UX | `?node=<url>` URL flag + localStorage persistence |
| Default endpoint | `https://testnet.ckb.dev` (public CKB testnet RPC) |
| Determinism scope | Per-epoch (same epoch → same world for all players) |
| PerfHUD surface | Yes — show `epoch 14523 (live)` |
| Mined-state persistence | Per-epoch localStorage map of `pos → remainingCapacity` |
| Cheat-proofness | Best-effort: reload-safe, clear-cache-bypassable, on-chain authoritative later |

## Architecture

### New module: `src/chain/epochSeed.js`

Four small exports, all individually testable:

```js
/**
 * Resolve which RPC endpoint to call.
 *   URL flag (?node=...)  >  localStorage  >  defaultUrl
 * URL flag *also* writes to localStorage so the next load remembers it.
 * Empty URL flag ("?node=") clears the stored value.
 */
export function resolveNodeEndpoint({ url, storage, defaultUrl }) → string

/**
 * Fetch the current epoch's anchor block hash. Two JSON-RPC calls:
 *   1. get_current_epoch → { number, start_number, length, compact_target }
 *   2. get_block_hash(start_number) → '0x...'
 * Returns { hash: '0x...', number: <decimal string, e.g. "14455"> }.
 *
 * The CKB RPC returns epoch number as a hex string ("0x3877"); we
 * convert to decimal here so consumers (storage, PerfHUD) see one
 * consistent format. The hash stays as a 0x-prefixed hex string.
 *
 * Throws on network error, HTTP non-2xx, or RPC error body.
 */
export async function getCurrentEpochHash(endpoint, { fetch }) → { hash, number }

/**
 * Pure: derive a uint32 procgen seed from a hex hash string.
 * Takes the first 8 hex chars (32 bits), parses as uint32.
 * Matches the existing `Math.floor(Math.random() * 1e9)` shape — the
 * worldgen mulberry32 already does `seed >>> 0`.
 */
export function seedFromHash(hash) → number

/**
 * Top-level coordinator used by main.js. Tries live, falls back to
 * cached, falls back to Math.random(). Always succeeds.
 *
 * Returns { seed, source: 'live'|'cached'|'random', epoch: string|null }.
 * `epoch` is the epoch number string when source is live or cached;
 * null when source is random.
 */
export async function getProcgenSeed({
    url,
    storage,
    fetch,
    defaultUrl,
}) → { seed, source, epoch }
```

### Boot-flow change in `src/main.js`

Today:

```js
const seed = Math.floor(Math.random() * 1e9);
const stats = generateWorld(game.tileMap, seed);
```

New:

```js
const { seed, source, epoch } = await getProcgenSeed({
    url: params.get('node'),
    storage: safeStorage,
    fetch: window.fetch.bind(window),
    defaultUrl: 'https://testnet.ckb.dev',
});
const stats = generateWorld(game.tileMap, seed);
// pass {source, epoch} through to installPerfHUD so it can render the
// 'epoch 14523 (live)' line.
```

The fetch is awaited between `loadAssets()` and `generateWorld()`.
Typical wall time: ~200ms on a healthy RPC. The loading screen is
visible throughout — no extra UX work needed.

### Storage schema

| Key | Value | Written by | Read by |
|---|---|---|---|
| `cellshire:node` | endpoint string (e.g. `"https://testnet.ckb.dev"`) | `resolveNodeEndpoint` when URL flag is present | `resolveNodeEndpoint` at boot |
| `cellshire:lastEpoch` | JSON `{ hash, number }` | `getProcgenSeed` after a successful live fetch | `getProcgenSeed` on a failed live fetch |
| `cellshire:mined:<epoch_number>` | JSON `{ "5,5": 0, "12,8": 2 }` — position → remaining capacity | `_mineOre` after every hit | boot, after `populateOreStates` |

All stored via the existing `safeStorage` wrapper. The `<epoch_number>`
suffix is the decimal epoch number (e.g. `cellshire:mined:14455`).
When the epoch changes, the storage key changes; the old key becomes
stale but is left in place (small storage cost, ~1KB per stale entry,
GC is a future task).

### Mined-ore persistence

**Goal:** a page reload inside the same epoch must not let the player
re-mine ores that were already mined (fully or partially). Cross-epoch
reloads correctly re-seed the world and start with fresh mined-state.

**Position identity.** The pair `(gx, gy)` is the stable identity. The
world is procgen'd from the deterministic epoch seed, so the SAME
ores appear at the SAME positions across reloads in the same epoch.
`PlacedObject.id` is NOT stable (assigned by `_nextId`) so we don't
use it.

**Data shape.** `{ "<gx>,<gy>": <remainingCapacity>, ... }`. Missing
position = full capacity (never mined). Value `0` = depleted. The
position string uses `${gx},${gy}` to match the existing key convention
in `InputManager._lastBrushKey`.

**New module: `src/mining/minedStore.js`.** Three small exports:

```js
/**
 * Build the storage key for the current epoch. Pure.
 * Returns 'cellshire:mined:14455' or null if epoch is null
 * (source === 'random' — we don't persist mining state in that case;
 * the world is non-deterministic so persistence is meaningless).
 */
export function minedStoreKey(epochNumber) → string | null

/**
 * Read the persisted mined-state for an epoch.
 * Returns a plain object: { "<gx>,<gy>": remainingCapacity, ... }
 * Returns {} if the key is missing, malformed, or epochNumber is null.
 */
export function loadMinedState(storage, epochNumber) → object

/**
 * Write a single position's remaining capacity. Read-modify-write
 * on the JSON blob. Called after every mining hit.
 * No-op if epochNumber is null (random seed path).
 */
export function recordMine(storage, epochNumber, gx, gy, remainingCapacity)
```

**Boot-flow integration.** After `populateOreStates(...)` in `main.js`:

```js
// Restore mined-ore state for this epoch.
const mined = loadMinedState(safeStorage, epoch);
for (const [posKey, remaining] of Object.entries(mined)) {
    const [gx, gy] = posKey.split(',').map(Number);
    const obj = game.tileMap.objectAt(gx, gy);
    if (!obj) continue;                       // ore not at this position
    const state = game.oreStates.get(obj.id);
    if (!state) continue;                     // not an ore
    state.capacityRemaining = remaining;
    if (remaining <= 0) {
        // Depleted in a prior session — remove the obj outright. No
        // crumble anim (it already played last session).
        game.tileMap.removeObjectAt(gx, gy);
        game.oreStates.delete(obj.id);
    }
}
game.renderer.markDirty();
```

**Mining-side write.** Inside `Game._mineOre` after the existing
`state.mine()` call:

```js
recordMine(safeStorage, this.currentEpoch, obj.gx, obj.gy,
    state.capacityRemaining);
```

`this.currentEpoch` is a new field on `Game`, set from `main.js`
after `getProcgenSeed`. When `source === 'random'`, `currentEpoch`
is `null` and `recordMine` is a no-op (no persistence on random
worlds).

**Edge cases:**

- **Cross-epoch reload.** Epoch number changes → storage key changes
  → new (empty) mined-state is loaded → fresh world. Old key
  ignored (correct).
- **Stale storage entry for a position that no longer has an ore.**
  Procgen drift, theoretically impossible if seed is identical, but
  guarded by the `if (!obj) continue` check. Defensive.
- **Cache-clear bypass.** Player can clear localStorage to reset
  mined-state — but loses inventory, character, etc. simultaneously.
  Accepted limitation; full anti-cheat is on-chain (separate kanban
  item).
- **Source = 'random'.** No persistence. The world is already
  non-deterministic, so persisting mining state is meaningless and
  would corrupt the next session if the player came back to a 'live'
  fetch. `recordMine` no-ops on null epoch.

### Source ladder

```
1. Try resolveNodeEndpoint(...)   ← always succeeds (default fallback)
2. Try getCurrentEpochHash(endpoint, { fetch })
   ├─ success → cache hash + number, source = 'live'
   └─ throw   → console.warn, continue
3. Try storage.get('cellshire:lastEpoch')
   ├─ parses + hash present → use cached, source = 'cached'
   └─ missing / malformed   → console.warn, continue
4. Math.floor(Math.random() * 1e9), source = 'random', epoch = null
```

Every step logs to console at fallback boundaries so debug sessions
can trace which path the player landed on.

### PerfHUD surface

`installPerfHUD(game, { seed, genMs, source, epoch, ...stats })` — add
two new args. The HUD shows a new line:

- `epoch 14523 (live)` — green
- `epoch 14522 (cached — node unreachable)` — amber
- `random — no chain` — red

Tap/click on the line does nothing for v0 (future: opens a settings
panel to swap endpoints).

## CKB RPC details

CKB's JSON-RPC is a POST with body:

```json
{ "jsonrpc": "2.0", "id": 1, "method": "get_current_epoch", "params": [] }
```

Response (per the CKB RPC docs):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "number": "0x3877",
    "start_number": "0xe10510",
    "length": "0x708",
    "compact_target": "0x1d00ffff"
  }
}
```

All numeric fields are hex strings (CKB convention). Pass
`start_number` to `get_block_hash`:

```json
{ "jsonrpc": "2.0", "id": 2, "method": "get_block_hash", "params": ["0xe10510"] }
```

Response:

```json
{ "jsonrpc": "2.0", "id": 2, "result": "0xabcdef..." }
```

`hash` is the 32-byte (64 hex chars + "0x" prefix) block hash. We
take the first 8 hex chars after "0x" as the seed.

**CORS:** `https://testnet.ckb.dev` returns the standard
`Access-Control-Allow-Origin: *` headers, so browser fetch works
directly. Users pointing at their own node need to configure CORS on
the node side — `ckb.toml` `rpc.cors-allowed-origins`. Out of scope
to document beyond this note.

## Tests

Use the existing browser-and-Node harness (`src/test/harness.js`).
Module under test is `src/chain/epochSeed.js`; tests live alongside.

1. **`resolveNodeEndpoint`**:
   - URL flag set → returns URL, writes to storage
   - URL flag empty string → clears storage, returns default
   - URL flag missing + storage has value → returns stored value
   - URL flag missing + storage empty → returns default

2. **`seedFromHash`**:
   - Hash with known prefix → known uint32
   - Hash without `0x` prefix → still works
   - Same hash always returns same seed (determinism guard)

3. **`getProcgenSeed`** (with injected fake `fetch`):
   - Happy path: fetch succeeds → `source: 'live'`, seed derived
   - Network error: fetch throws → falls to cached, `source: 'cached'`
   - Cold cache + network error: → `source: 'random'`, epoch null
   - Cached value malformed: → falls through to random

4. **`getCurrentEpochHash`** (with fake fetch):
   - Success path: returns `{ hash, number }`
   - HTTP 500: throws
   - JSON-RPC error body: throws
   - Network error: throws

5. **`minedStoreKey`**:
   - epochNumber `"14455"` → `"cellshire:mined:14455"`
   - epochNumber `null` → `null` (random seed path → no persistence)

6. **`loadMinedState`** (with fake storage):
   - Missing key → `{}`
   - Malformed JSON → `{}` (defensive parse)
   - Valid JSON → returns the parsed object
   - epochNumber `null` → `{}` regardless of storage contents

7. **`recordMine`** (with fake storage):
   - First write to a fresh epoch creates the entry
   - Second write to a different position adds without clobbering
   - Re-write to the same position updates the value (decrement path)
   - epochNumber `null` → no-op (storage untouched)

Manual smoke flow (Phill, in a browser):

1. Clear localStorage. Load app. PerfHUD shows `epoch <N> (live)` in
   green. Note the seed in console.
2. Reload. Same epoch → same seed → same world (if within the same
   epoch window).
3. Visit `?node=http://192.168.68.115:8114` (Phill's testnet node).
   Confirm PerfHUD line still says `(live)`. Confirm localStorage has
   the new endpoint.
4. Reload without flag. Stored endpoint still in use.
5. Visit `?node=` (empty). Endpoint cleared. Default reused.
6. Visit `?node=https://broken.example.com`. Confirm PerfHUD shows
   `(cached — node unreachable)`. Console warns.
7. Clear `cellshire:lastEpoch` and repeat (6). Confirm PerfHUD shows
   `random — no chain`. Console warns through the full ladder.

**Mined-state smoke flow** (after the above succeed with `(live)`):

8. Walk to an ore, mine it once (capacity drops by 1). In DevTools:
   `localStorage.getItem('cellshire:mined:' + <epoch>)` shows the
   position with the new remaining capacity.
9. Reload. Walk back to the same ore. Confirm it has the reduced
   capacity (one less hit until depletion).
10. Mine the ore to depletion. Reload. The ore is GONE from the world
    (removed at boot, no crumble anim).
11. Wait until an epoch boundary crosses (or manually flip the cached
    epoch number). Reload. The mined-state key for the OLD epoch is
    ignored; the world re-generates fresh and that ore reappears.
12. Confirm `localStorage` contains both `cellshire:mined:<oldEpoch>`
    (stale) and `cellshire:mined:<newEpoch>` (fresh). Stale entries
    are OK to leave; GC is a future task.

## Edge cases

- **Network slow (5s+).** No explicit timeout in v0 — `fetch` will
  eventually resolve or fail. If this becomes a problem we'll add an
  `AbortController` with a ~3s budget in a follow-up.
- **`fetch` undefined in Node test env.** `getProcgenSeed` takes a
  `fetch` parameter (injected). Tests pass a fake; production passes
  `window.fetch.bind(window)`.
- **Malformed hash response.** Parse fails → `seedFromHash` throws →
  caller treats as network error → falls to cached.
- **`localStorage` disabled.** `safeStorage` already handles this —
  cached fallback effectively becomes "always cold", so the player
  gets a `random` seed each load when the node is unreachable. Not
  ideal but expected. Mined-state persistence ALSO becomes a no-op
  (writes silently go to in-memory fallback, reset on reload). Player
  effectively gets free re-mining; this is the same end-state as the
  cache-clear bypass and is accepted.
- **Stale `cellshire:mined:*` keys.** Old epochs accumulate. Each is
  ~100B-1KB. GC pass is a future task (probably "on boot, delete
  every cellshire:mined:* key whose suffix isn't the current epoch").
- **Per-position depleted state restored at boot.** If an ore was
  mined to depletion last session, the boot-flow integration removes
  the obj outright (no crumble anim — that animation already played).
  The player sees the world the way they left it.

## Files changed

| Path | Change |
|---|---|
| `src/chain/epochSeed.js` | NEW — `resolveNodeEndpoint`, `getCurrentEpochHash`, `seedFromHash`, `getProcgenSeed`. ~100 lines. |
| `src/chain/epochSeed.test.js` | NEW — unit tests for all four. ~80 lines. |
| `src/mining/minedStore.js` | NEW — `minedStoreKey`, `loadMinedState`, `recordMine`. ~40 lines. |
| `src/mining/minedStore.test.js` | NEW — unit tests for all three. ~50 lines. |
| `src/main.js` | MODIFY — `await getProcgenSeed(...)`; after `populateOreStates`, restore mined state for `epoch`. |
| `src/core/Game.js` | MODIFY — `this.currentEpoch = null` field; `_mineOre` calls `recordMine`. |
| `src/ui/PerfHUD.js` | MODIFY — surface `source` + `epoch` in the existing overlay. |
| `tests.html` | MODIFY — two new imports. |

## Migration / cleanup

- `Math.floor(Math.random() * 1e9)` in `src/main.js:80` is replaced.
  The `makeSeededRand(seed ^ 0x70F0)` call at line 91 (ore-state
  seeding) keeps the same `seed` input, so ore distributions stay
  deterministic per-epoch too — bonus alignment, no extra work.
- No backwards compat needed (no existing user state depends on the
  random seed).
- Future-aligned: when on-chain mining lands, `minedStore` becomes a
  cache layer in front of the chain (read the chain for authoritative
  state, write-through to localStorage for offline / fast-read). The
  position-keyed map shape carries over directly. No data migration
  needed when the on-chain version ships.
