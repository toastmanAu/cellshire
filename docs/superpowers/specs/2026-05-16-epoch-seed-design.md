# Epoch-Hash Procgen Seed — Design Spec

**Status:** approved 2026-05-16

## Goal

Drive the procgen seed from the CKB chain tip's current epoch hash
instead of `Math.random()`. Every player who loads cellshire within
the same epoch window sees the same world. Sets up the planned
"high-value-epoch trigger mechanic" by making the world a function of
the chain state. Must support user-configurable RPC endpoints (so
players can point at their own light client / fiber node / public
RPC).

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

Both stored via the existing `safeStorage` wrapper.

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
  ideal but expected.

## Migration / cleanup

- `Math.floor(Math.random() * 1e9)` in `src/main.js:80` is replaced.
  The `makeSeededRand(seed ^ 0x70F0)` call at line 91 (ore-state
  seeding) keeps the same `seed` input, so ore distributions stay
  deterministic per-epoch too — bonus alignment, no extra work.
- No backwards compat needed (no existing user state depends on the
  random seed).
