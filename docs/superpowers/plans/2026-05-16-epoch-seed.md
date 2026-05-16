# Epoch-Seed + Mined-Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive the procgen seed from the CKB chain's current epoch hash (with cached + random fallback), and persist mined-ore remaining-capacity per epoch in localStorage so reloads can't double-mine within the same epoch.

**Architecture:** Two new pure-or-async modules with injected dependencies (`src/chain/epochSeed.js`, `src/mining/minedStore.js`) — testable in Node via the existing browser+Node harness. Boot flow in `main.js` awaits `getProcgenSeed` between asset-load and world-gen, then restores mined positions after `populateOreStates`. `Game._mineOre` writes after every hit via `recordMine`. PerfHUD surfaces the epoch + source line.

**Tech Stack:** Vanilla JS ES modules. JSON-RPC over fetch (POST). CKB testnet RPC default (`https://testnet.ckb.dev`). User can override via `?node=<url>` URL flag → localStorage.

**Spec:** [`docs/superpowers/specs/2026-05-16-epoch-seed-design.md`](../specs/2026-05-16-epoch-seed-design.md)

---

## Task 1: `epochSeed` module + tests

**Files:**
- Create: `src/chain/epochSeed.js`
- Create: `src/chain/epochSeed.test.js`
- Modify: `tests.html`

Pure-or-async functions, injected `fetch` + `storage` for testability. No DOM, no globals.

- [ ] **Step 1: Write the failing tests**

Create `src/chain/epochSeed.test.js`:

```js
import { describe, it, expect } from '../test/harness.js';
import {
    resolveNodeEndpoint,
    getCurrentEpochHash,
    seedFromHash,
    getProcgenSeed,
} from './epochSeed.js';

function fakeStorage(initial = {}) {
    const m = new Map(Object.entries(initial));
    return {
        get: k => (m.has(k) ? m.get(k) : null),
        set: (k, v) => m.set(k, String(v)),
        remove: k => m.delete(k),
    };
}

const DEFAULT = 'https://testnet.ckb.dev';

describe('resolveNodeEndpoint', () => {
    it('returns the default when URL and storage are both empty', () => {
        const s = fakeStorage();
        expect(resolveNodeEndpoint({ url: null, storage: s, defaultUrl: DEFAULT })).toBe(DEFAULT);
    });

    it('returns and persists the URL flag when present', () => {
        const s = fakeStorage();
        const out = resolveNodeEndpoint({
            url: 'http://my-node:8114', storage: s, defaultUrl: DEFAULT,
        });
        expect(out).toBe('http://my-node:8114');
        expect(s.get('cellshire:node')).toBe('http://my-node:8114');
    });

    it('returns stored value when URL flag is missing', () => {
        const s = fakeStorage({ 'cellshire:node': 'http://stored:8114' });
        expect(resolveNodeEndpoint({ url: null, storage: s, defaultUrl: DEFAULT }))
            .toBe('http://stored:8114');
    });

    it('clears storage and returns default when URL flag is empty string', () => {
        const s = fakeStorage({ 'cellshire:node': 'http://stored:8114' });
        const out = resolveNodeEndpoint({ url: '', storage: s, defaultUrl: DEFAULT });
        expect(out).toBe(DEFAULT);
        expect(s.get('cellshire:node')).toBeNull();
    });
});

describe('seedFromHash', () => {
    it('derives a uint32 from the first 8 hex chars after 0x', () => {
        // 0xdeadbeef = 3735928559
        expect(seedFromHash('0xdeadbeefcafe1234')).toBe(0xdeadbeef >>> 0);
    });

    it('works without the 0x prefix', () => {
        expect(seedFromHash('deadbeefcafe1234')).toBe(0xdeadbeef >>> 0);
    });

    it('is deterministic — same hash → same seed', () => {
        const a = seedFromHash('0x1234567890abcdef');
        const b = seedFromHash('0x1234567890abcdef');
        expect(a).toBe(b);
    });
});

function makeFakeFetch(responses) {
    // responses: array of either { ok, json } objects or thunks that throw
    let i = 0;
    return async () => {
        const r = responses[i++];
        if (typeof r === 'function') return r();
        return {
            ok: r.ok ?? true,
            status: r.status ?? 200,
            json: async () => r.json,
        };
    };
}

describe('getCurrentEpochHash', () => {
    it('returns { hash, number } on the happy path', async () => {
        const fetch = makeFakeFetch([
            { json: { result: { number: '0x3877', start_number: '0xe10510' } } },
            { json: { result: '0xabcdef1234567890' } },
        ]);
        const out = await getCurrentEpochHash(DEFAULT, { fetch });
        expect(out.hash).toBe('0xabcdef1234567890');
        expect(out.number).toBe('14455');  // 0x3877 = 14455 decimal
    });

    it('throws on HTTP non-2xx', async () => {
        const fetch = makeFakeFetch([{ ok: false, status: 500, json: {} }]);
        let threw = false;
        try { await getCurrentEpochHash(DEFAULT, { fetch }); } catch { threw = true; }
        expect(threw).toBe(true);
    });

    it('throws on RPC error body', async () => {
        const fetch = makeFakeFetch([
            { json: { error: { code: -32000, message: 'nope' } } },
        ]);
        let threw = false;
        try { await getCurrentEpochHash(DEFAULT, { fetch }); } catch { threw = true; }
        expect(threw).toBe(true);
    });

    it('throws on network error', async () => {
        const fetch = makeFakeFetch([() => { throw new Error('connection refused'); }]);
        let threw = false;
        try { await getCurrentEpochHash(DEFAULT, { fetch }); } catch { threw = true; }
        expect(threw).toBe(true);
    });
});

describe('getProcgenSeed', () => {
    it('happy path: source=live, seed derived from hash, caches result', async () => {
        const storage = fakeStorage();
        const fetch = makeFakeFetch([
            { json: { result: { number: '0x3877', start_number: '0xe10510' } } },
            { json: { result: '0xdeadbeef00000000' } },
        ]);
        const out = await getProcgenSeed({
            url: null, storage, fetch, defaultUrl: DEFAULT,
        });
        expect(out.source).toBe('live');
        expect(out.seed).toBe(0xdeadbeef >>> 0);
        expect(out.epoch).toBe('14455');
        const cached = JSON.parse(storage.get('cellshire:lastEpoch'));
        expect(cached.hash).toBe('0xdeadbeef00000000');
    });

    it('falls back to cached when fetch fails', async () => {
        const storage = fakeStorage({
            'cellshire:lastEpoch': JSON.stringify({
                hash: '0xcafef00d00000000', number: '14400',
            }),
        });
        const fetch = makeFakeFetch([() => { throw new Error('network'); }]);
        const out = await getProcgenSeed({
            url: null, storage, fetch, defaultUrl: DEFAULT,
        });
        expect(out.source).toBe('cached');
        expect(out.seed).toBe(0xcafef00d >>> 0);
        expect(out.epoch).toBe('14400');
    });

    it('falls back to random when fetch fails AND cache is cold', async () => {
        const storage = fakeStorage();
        const fetch = makeFakeFetch([() => { throw new Error('network'); }]);
        const out = await getProcgenSeed({
            url: null, storage, fetch, defaultUrl: DEFAULT,
        });
        expect(out.source).toBe('random');
        expect(out.epoch).toBeNull();
        expect(typeof out.seed).toBe('number');
    });

    it('falls through to random when cached value is malformed', async () => {
        const storage = fakeStorage({ 'cellshire:lastEpoch': 'not json' });
        const fetch = makeFakeFetch([() => { throw new Error('network'); }]);
        const out = await getProcgenSeed({
            url: null, storage, fetch, defaultUrl: DEFAULT,
        });
        expect(out.source).toBe('random');
        expect(out.epoch).toBeNull();
    });
});
```

- [ ] **Step 2: Add the test import to tests.html**

In `tests.html`, in the alphabetised import block, add:

```diff
        import './src/characters/catalog.test.js';
+       import './src/chain/epochSeed.test.js';
        import './src/core/Player.test.js';
```

`chain/` sorts after `characters/` and before `core/`.

- [ ] **Step 3: Run tests, confirm they fail**

```
node --input-type=module -e "
  import('./src/test/harness.js').then(async harness => {
    try { await import('./src/chain/epochSeed.test.js'); }
    catch (e) { console.log('expected fail:', e.message); return; }
    console.log('unexpected: imported');
  })
"
```

Expected: import-failure error mentioning `epochSeed.js` (doesn't exist yet).

- [ ] **Step 4: Write the implementation**

Create `src/chain/epochSeed.js`:

```js
/**
 * epochSeed.js
 *
 * Derives the procgen seed from the CKB chain's current epoch hash.
 * Source ladder: live RPC → cached last-known → Math.random().
 *
 * All functions take their dependencies (fetch, storage) as parameters
 * so the module is testable in Node without DOM mocking.
 */

const NODE_KEY = 'cellshire:node';
const LAST_EPOCH_KEY = 'cellshire:lastEpoch';

/**
 * Resolve which RPC endpoint to call.
 *   URL flag (?node=...) > localStorage > defaultUrl
 * URL flag with a value writes to storage. Empty string clears it.
 */
export function resolveNodeEndpoint({ url, storage, defaultUrl }) {
    if (url === '') {
        storage.remove(NODE_KEY);
        return defaultUrl;
    }
    if (url) {
        storage.set(NODE_KEY, url);
        return url;
    }
    const stored = storage.get(NODE_KEY);
    return stored || defaultUrl;
}

/**
 * Derive a uint32 procgen seed from a 0x-prefixed hex hash. Takes the
 * first 8 hex chars (32 bits) after the optional prefix.
 */
export function seedFromHash(hash) {
    const hex = hash.startsWith('0x') ? hash.slice(2) : hash;
    return parseInt(hex.slice(0, 8), 16) >>> 0;
}

/**
 * Fetch the current epoch's anchor block hash via two JSON-RPC calls:
 *   1. get_current_epoch → { number, start_number, ... }
 *   2. get_block_hash(start_number) → '0x...'
 *
 * Returns { hash, number } where number is the decimal-string form of
 * the hex epoch number (e.g. "0x3877" → "14455"). Throws on network
 * error, HTTP non-2xx, or RPC error body.
 */
export async function getCurrentEpochHash(endpoint, { fetch }) {
    const epoch = await rpc(endpoint, fetch, 'get_current_epoch', []);
    const startNumberHex = epoch.start_number;
    const hash = await rpc(endpoint, fetch, 'get_block_hash', [startNumberHex]);
    return {
        hash,
        number: String(parseInt(epoch.number, 16)),
    };
}

async function rpc(endpoint, fetch, method, params) {
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${method}`);
    const body = await res.json();
    if (body.error) {
        throw new Error(`RPC error from ${method}: ${body.error.message || body.error.code}`);
    }
    return body.result;
}

/**
 * Top-level coordinator. Tries live → cached → random. Always succeeds.
 * Returns { seed, source: 'live'|'cached'|'random', epoch: string|null }.
 */
export async function getProcgenSeed({ url, storage, fetch, defaultUrl }) {
    const endpoint = resolveNodeEndpoint({ url, storage, defaultUrl });

    try {
        const { hash, number } = await getCurrentEpochHash(endpoint, { fetch });
        storage.set(LAST_EPOCH_KEY, JSON.stringify({ hash, number }));
        return { seed: seedFromHash(hash), source: 'live', epoch: number };
    } catch (err) {
        console.warn('[cellshire] live epoch fetch failed:', err.message);
    }

    const cachedRaw = storage.get(LAST_EPOCH_KEY);
    if (cachedRaw) {
        try {
            const cached = JSON.parse(cachedRaw);
            if (cached && typeof cached.hash === 'string') {
                console.warn('[cellshire] using cached epoch', cached.number);
                return { seed: seedFromHash(cached.hash), source: 'cached', epoch: cached.number };
            }
        } catch {
            console.warn('[cellshire] cached epoch malformed; discarding');
        }
    }

    console.warn('[cellshire] no chain available; falling back to Math.random()');
    return {
        seed: Math.floor(Math.random() * 1e9),
        source: 'random',
        epoch: null,
    };
}
```

- [ ] **Step 5: Run tests, confirm they pass**

```
node --input-type=module -e "
  import('./src/test/harness.js').then(async harness => {
    await import('./src/chain/epochSeed.test.js');
    const r = await harness.runAll();
    const passed = r.filter(x => x.ok).length;
    const failed = r.length - passed;
    console.log(passed, 'passed,', failed, 'failed');
    for (const x of r.filter(y => !y.ok)) console.error(x.describe, '>', x.name, x.err.message);
  })
" 2>&1
```

Expected: `15 passed, 0 failed` (4 resolveNodeEndpoint + 3 seedFromHash + 4 getCurrentEpochHash + 4 getProcgenSeed). The 4 fallback tests will emit console.warn lines — those are expected, not failures.

- [ ] **Step 6: Commit**

```bash
git add src/chain/epochSeed.js src/chain/epochSeed.test.js tests.html
git commit -m "feat(chain): add epochSeed module — CKB epoch hash → procgen seed"
```

**Stage only those three files by name.** Do not `git add -A`.

---

## Task 2: `minedStore` module + tests

**Files:**
- Create: `src/mining/minedStore.js`
- Create: `src/mining/minedStore.test.js`
- Modify: `tests.html`

Three pure functions over the existing `safeStorage` wrapper. No deps.

- [ ] **Step 1: Write the failing tests**

Create `src/mining/minedStore.test.js`:

```js
import { describe, it, expect } from '../test/harness.js';
import { minedStoreKey, loadMinedState, recordMine } from './minedStore.js';

function fakeStorage(initial = {}) {
    const m = new Map(Object.entries(initial));
    return {
        get: k => (m.has(k) ? m.get(k) : null),
        set: (k, v) => m.set(k, String(v)),
        remove: k => m.delete(k),
    };
}

describe('minedStoreKey', () => {
    it('builds the storage key from an epoch number string', () => {
        expect(minedStoreKey('14455')).toBe('cellshire:mined:14455');
    });

    it('returns null when epoch is null', () => {
        expect(minedStoreKey(null)).toBeNull();
    });
});

describe('loadMinedState', () => {
    it('returns {} for a missing key', () => {
        const s = fakeStorage();
        expect(loadMinedState(s, '14455')).toEqual({});
    });

    it('parses a valid JSON entry', () => {
        const s = fakeStorage({
            'cellshire:mined:14455': JSON.stringify({ '5,5': 0, '12,8': 2 }),
        });
        expect(loadMinedState(s, '14455')).toEqual({ '5,5': 0, '12,8': 2 });
    });

    it('returns {} on malformed JSON', () => {
        const s = fakeStorage({ 'cellshire:mined:14455': 'not json' });
        expect(loadMinedState(s, '14455')).toEqual({});
    });

    it('returns {} when epoch is null (no persistence on random seed)', () => {
        const s = fakeStorage({ 'cellshire:mined:14455': JSON.stringify({ '5,5': 0 }) });
        expect(loadMinedState(s, null)).toEqual({});
    });
});

describe('recordMine', () => {
    it('writes a fresh entry for a new epoch', () => {
        const s = fakeStorage();
        recordMine(s, '14455', 5, 5, 2);
        expect(loadMinedState(s, '14455')).toEqual({ '5,5': 2 });
    });

    it('preserves prior positions when adding a new one', () => {
        const s = fakeStorage({
            'cellshire:mined:14455': JSON.stringify({ '5,5': 0 }),
        });
        recordMine(s, '14455', 12, 8, 3);
        expect(loadMinedState(s, '14455')).toEqual({ '5,5': 0, '12,8': 3 });
    });

    it('updates an existing position (decrement path)', () => {
        const s = fakeStorage({
            'cellshire:mined:14455': JSON.stringify({ '5,5': 2 }),
        });
        recordMine(s, '14455', 5, 5, 1);
        expect(loadMinedState(s, '14455')).toEqual({ '5,5': 1 });
    });

    it('no-ops when epoch is null', () => {
        const s = fakeStorage();
        recordMine(s, null, 5, 5, 2);
        expect(s.get('cellshire:mined:null')).toBeNull();
    });
});
```

- [ ] **Step 2: Add the test import to tests.html**

In `tests.html`, in the alphabetised import block, add:

```diff
        import './src/lib/safeStorage.test.js';
+       import './src/mining/minedStore.test.js';
        import './src/test/sanity.test.js';
```

`mining/` sorts after `lib/` and before `test/`.

- [ ] **Step 3: Run tests, confirm they fail**

```
node --input-type=module -e "
  import('./src/test/harness.js').then(async harness => {
    try { await import('./src/mining/minedStore.test.js'); }
    catch (e) { console.log('expected fail:', e.message); return; }
    console.log('unexpected: imported');
  })
"
```

Expected: import-failure error mentioning `minedStore.js` (doesn't exist).

- [ ] **Step 4: Write the implementation**

Create `src/mining/minedStore.js`:

```js
/**
 * minedStore.js
 *
 * Per-epoch persistence of mined-ore remaining capacity. Lets a reload
 * mid-epoch see ores in the state the player left them (no double-mine
 * exploit). Cross-epoch reloads naturally reset (the storage key
 * includes the epoch number).
 *
 * Cheat-proofness: this is the off-chain best-effort layer. Clearing
 * localStorage bypasses it. Full anti-cheat lands when on-chain mining
 * ships; this module's position-keyed map shape carries over directly
 * as the read-through cache.
 */

/**
 * Returns the storage key for an epoch's mined-state, or null when
 * epoch is null (random-seed boot path — no persistence).
 */
export function minedStoreKey(epochNumber) {
    if (epochNumber === null || epochNumber === undefined) return null;
    return `cellshire:mined:${epochNumber}`;
}

/**
 * Read the persisted mined-state. Returns {} on missing key, malformed
 * JSON, or null epoch.
 */
export function loadMinedState(storage, epochNumber) {
    const key = minedStoreKey(epochNumber);
    if (!key) return {};
    const raw = storage.get(key);
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

/**
 * Record one position's remaining capacity. Read-modify-write on the
 * JSON blob. No-op when epoch is null.
 */
export function recordMine(storage, epochNumber, gx, gy, remainingCapacity) {
    const key = minedStoreKey(epochNumber);
    if (!key) return;
    const state = loadMinedState(storage, epochNumber);
    state[`${gx},${gy}`] = remainingCapacity;
    storage.set(key, JSON.stringify(state));
}
```

- [ ] **Step 5: Run tests, confirm they pass**

```
node --input-type=module -e "
  import('./src/test/harness.js').then(async harness => {
    await import('./src/mining/minedStore.test.js');
    const r = await harness.runAll();
    const passed = r.filter(x => x.ok).length;
    const failed = r.length - passed;
    console.log(passed, 'passed,', failed, 'failed');
    for (const x of r.filter(y => !y.ok)) console.error(x.describe, '>', x.name, x.err.message);
  })
"
```

Expected: `10 passed, 0 failed` (2 + 4 + 4).

- [ ] **Step 6: Commit**

```bash
git add src/mining/minedStore.js src/mining/minedStore.test.js tests.html
git commit -m "feat(mining): add minedStore for per-epoch mined-ore persistence"
```

**Stage only those three files by name.**

---

## Task 3: Wire `getProcgenSeed` into `main.js` boot flow + PerfHUD surface

**Files:**
- Modify: `src/main.js`
- Modify: `src/ui/PerfHUD.js`

Replace `Math.random()` seed with the chain-derived seed. Pass `source` + `epoch` through to PerfHUD. No mined-state work yet — that's Task 4.

- [ ] **Step 1: Add imports to main.js**

In `src/main.js`, in the existing import block at the top, add:

```diff
 import { getAvailableCharacters, resolveCharacterChoice } from './characters/catalog.js';
 import { safeStorage } from './lib/safeStorage.js';
 import { installCharacterPicker } from './ui/CharacterPicker.js';
+import { getProcgenSeed } from './chain/epochSeed.js';
```

- [ ] **Step 2: Replace the seed line**

In `src/main.js`, find the existing block (around line 78–87):

```js
    // Always procedurally generate. Skip save restore so we measure
    // cold-gen perf every reload — surfaced via PerfHUD, not console.
    const seed = Math.floor(Math.random() * 1e9);
    const t0 = performance.now();
    const stats = generateWorld(game.tileMap, seed);
    const genMs = performance.now() - t0;
    game.renderer.markDirty();
```

Replace with:

```js
    // Procgen seed is derived from the CKB chain's current epoch hash
    // so every player loading inside the same epoch window sees the
    // same world. Source ladder is live → cached → random; see
    // src/chain/epochSeed.js for the full path. Loading screen stays
    // visible during the fetch (~200ms on a healthy RPC).
    const { seed, source: seedSource, epoch } = await getProcgenSeed({
        url: params.get('node'),
        storage: safeStorage,
        fetch: window.fetch.bind(window),
        defaultUrl: 'https://testnet.ckb.dev',
    });
    const t0 = performance.now();
    const stats = generateWorld(game.tileMap, seed);
    const genMs = performance.now() - t0;
    game.renderer.markDirty();
```

- [ ] **Step 3: Pass source + epoch to PerfHUD**

In `src/main.js`, find the existing `installPerfHUD` call (around line 106):

```js
    installPerfHUD(game, { seed, genMs, ...stats });
```

Replace with:

```js
    installPerfHUD(game, { seed, genMs, source: seedSource, epoch, ...stats });
```

- [ ] **Step 4: Render the epoch line in PerfHUD**

In `src/ui/PerfHUD.js`, find the existing `el.textContent = ...` block (lines 66–74):

```js
        el.textContent =
              `grid ${W}×${H}   seed ${genStats.seed}   gen ${genStats.genMs.toFixed(0)} ms\n`
            + `terrain ${genStats.total} (${genStats.water}w ${genStats.sand}s `
            + `${genStats.grass}g ${genStats.stone}r)\n`
            + `ores ${genStats.oresPlaced}   trees ${genStats.treesPlaced}   `
            + `objects-live ${objs}\n`
            + `${dims}\n`
            + `fps ${fps}   frame ${lastFrameMs.toFixed(1)} ms\n`
            + `heap ${heap}`;
```

Replace with:

```js
        const epochLine = genStats.source === 'live'
            ? `epoch ${genStats.epoch} (live)`
            : genStats.source === 'cached'
                ? `epoch ${genStats.epoch} (cached — node unreachable)`
                : 'random — no chain';

        el.textContent =
              `${epochLine}\n`
            + `grid ${W}×${H}   seed ${genStats.seed}   gen ${genStats.genMs.toFixed(0)} ms\n`
            + `terrain ${genStats.total} (${genStats.water}w ${genStats.sand}s `
            + `${genStats.grass}g ${genStats.stone}r)\n`
            + `ores ${genStats.oresPlaced}   trees ${genStats.treesPlaced}   `
            + `objects-live ${objs}\n`
            + `${dims}\n`
            + `fps ${fps}   frame ${lastFrameMs.toFixed(1)} ms\n`
            + `heap ${heap}`;
```

- [ ] **Step 5: Verify both files parse**

```
node --check src/main.js && node --check src/ui/PerfHUD.js && echo "ok"
```

Expected: `ok`.

- [ ] **Step 6: Run the existing test suite to confirm no regression**

```
node --input-type=module -e "
  import('./src/test/harness.js').then(async harness => {
    await import('./src/characters/catalog.test.js');
    await import('./src/chain/epochSeed.test.js');
    await import('./src/core/Player.test.js');
    await import('./src/core/mining-dispatch.test.js');
    await import('./src/lib/safeStorage.test.js');
    await import('./src/mining/minedStore.test.js');
    const r = await harness.runAll();
    const passed = r.filter(x => x.ok).length;
    const failed = r.length - passed;
    console.log(passed, 'passed,', failed, 'failed');
  })
" 2>&1 | tail -3
```

Expected: `47 passed, 0 failed` (existing 22 + 15 epochSeed + 10 minedStore).

- [ ] **Step 7: Manual smoke (Phill, in a browser)**

Cannot run in Node. Note the steps for Phill:

1. Clear localStorage. Load app. PerfHUD shows `epoch <N> (live)` in the first line.
2. Reload. Same epoch → same world (if within the same epoch window).
3. Visit `?node=https://broken.example.com`. PerfHUD shows `epoch <N> (cached — node unreachable)`. Console warns.
4. Clear `cellshire:lastEpoch` in DevTools. Reload with broken node. PerfHUD shows `random — no chain`. Console warns through the full ladder.
5. Visit `?node=` (empty). Endpoint cleared. Default reused.

- [ ] **Step 8: Commit**

```bash
git add src/main.js src/ui/PerfHUD.js
git commit -m "feat: wire epochSeed into boot flow; PerfHUD surfaces epoch + source"
```

**Stage only those two files by name.**

---

## Task 4: Wire `minedStore` into `Game._mineOre` + boot restoration

**Files:**
- Modify: `src/core/Game.js`
- Modify: `src/main.js`

Track the current epoch on `Game`, restore mined positions after `populateOreStates`, write to `minedStore` after every mining hit.

- [ ] **Step 1: Add `currentEpoch` field to Game**

In `src/core/Game.js`, find the constructor (around line 51):

```js
        // Mining state keyed by PlacedObject.id. Populated by
        // populateOreStates() after procgen — kept side-band so the
        // renderer / save / placement systems stay mining-agnostic.
        this.oreStates = new Map();
```

Add after `this.oreStates = new Map();`:

```js
        // Set by main.js after the chain-derived procgen seed is
        // resolved. String form of the epoch number (e.g. "14455"), or
        // null when the seed source was 'random' — in which case
        // recordMine no-ops because persistence is meaningless on a
        // non-deterministic world.
        this.currentEpoch = null;
```

- [ ] **Step 2: Add the import to Game.js**

In `src/core/Game.js`, in the import block at the top, add:

```diff
 import { OreState } from '../mining/OreState.js';
 import { isOre, oreConfig, oreDisplayName } from '../mining/oreCatalog.js';
+import { recordMine } from '../mining/minedStore.js';
+import { safeStorage } from '../lib/safeStorage.js';
```

- [ ] **Step 3: Call `recordMine` inside `_mineOre`**

In `src/core/Game.js`, find the existing `_mineOre` method. After the `state.mine()` call and the inventory-add, add the recordMine line. The relevant existing code (around lines 387–398):

```js
    _mineOre(obj) {
        const state = this.oreStates.get(obj.id);
        if (!state) return;
        if (this._pendingDepletions.has(obj.id)) return;
        const result = state.mine();
        if (!result) return;

        this.player?.inventory.add(result.currency, result.amount);
```

Insert a new line after `this.player?.inventory.add(...)`:

```js
    _mineOre(obj) {
        const state = this.oreStates.get(obj.id);
        if (!state) return;
        if (this._pendingDepletions.has(obj.id)) return;
        const result = state.mine();
        if (!result) return;

        this.player?.inventory.add(result.currency, result.amount);
        // Persist remaining capacity per (epoch, position) so a reload
        // mid-epoch can't reset the ore. No-op when currentEpoch is
        // null (random seed path — non-deterministic world).
        recordMine(safeStorage, this.currentEpoch, obj.gx, obj.gy, state.capacityRemaining);
```

- [ ] **Step 4: Add imports to main.js**

In `src/main.js`, in the import block at the top, add:

```diff
 import { getProcgenSeed } from './chain/epochSeed.js';
+import { loadMinedState } from './mining/minedStore.js';
```

- [ ] **Step 5: Set `currentEpoch` + restore mined state in main.js**

In `src/main.js`, find the existing line `game.populateOreStates(makeSeededRand(seed ^ 0x70F0));` (around line 91).

Replace it with:

```js
    // Build mining state from the procgen output. Same `seed` is mixed
    // in so per-ore capacity is deterministic across reloads.
    game.populateOreStates(makeSeededRand(seed ^ 0x70F0));

    // Tag the Game with the epoch so _mineOre can persist hits to the
    // correct per-epoch storage key. Null on random seed = no
    // persistence (see minedStore.recordMine).
    game.currentEpoch = epoch;

    // Restore any mined-ore state from a prior session in the same
    // epoch. Positions with remainingCapacity > 0 update their
    // OreState; positions at 0 are removed from the world outright (no
    // crumble anim — that already played last session).
    const minedState = loadMinedState(safeStorage, epoch);
    for (const [posKey, remaining] of Object.entries(minedState)) {
        const [gx, gy] = posKey.split(',').map(Number);
        const obj = game.tileMap.objectAt(gx, gy);
        if (!obj) continue;
        const oreState = game.oreStates.get(obj.id);
        if (!oreState) continue;
        oreState.capacityRemaining = remaining;
        if (remaining <= 0) {
            game.tileMap.removeObjectAt(gx, gy);
            game.oreStates.delete(obj.id);
        }
    }
    game.renderer.markDirty();
```

- [ ] **Step 6: Verify both files parse**

```
node --check src/main.js && node --check src/core/Game.js && echo "ok"
```

Expected: `ok`.

- [ ] **Step 7: Run the full test suite**

```
node --input-type=module -e "
  import('./src/test/harness.js').then(async harness => {
    await import('./src/characters/catalog.test.js');
    await import('./src/chain/epochSeed.test.js');
    await import('./src/core/Player.test.js');
    await import('./src/core/mining-dispatch.test.js');
    await import('./src/lib/safeStorage.test.js');
    await import('./src/mining/minedStore.test.js');
    const r = await harness.runAll();
    const passed = r.filter(x => x.ok).length;
    const failed = r.length - passed;
    console.log(passed, 'passed,', failed, 'failed');
  })
" 2>&1 | tail -3
```

Expected: still `47 passed, 0 failed`. No regression.

- [ ] **Step 8: Manual smoke (Phill, in a browser)**

Cannot run in Node. Note the steps for Phill:

1. Clear localStorage. Load app. PerfHUD shows `epoch <N> (live)`.
2. Walk to an ore. Mine it once. In DevTools: `localStorage.getItem('cellshire:mined:' + <epoch>)` shows `{"<gx>,<gy>": <newCapacity>}`.
3. Reload (don't clear storage). Walk to the same ore. Confirm it has the reduced capacity (one less hit to depletion).
4. Mine to depletion. Reload. The ore is GONE from the world (removed at boot, no crumble anim).
5. If/when an epoch boundary crosses, reload. The new epoch's mined-state key is empty; the ore reappears in the new world.

- [ ] **Step 9: Commit**

```bash
git add src/core/Game.js src/main.js
git commit -m "feat: persist mined-ore state per epoch — reload-safe anti-cheat layer"
```

**Stage only those two files by name.**

---

## Self-review notes

**Spec coverage:**
- §Architecture / `epochSeed.js` (4 exports) → Task 1. ✓
- §Boot-flow change in main.js (await getProcgenSeed) → Task 3. ✓
- §Storage schema (`cellshire:node`, `cellshire:lastEpoch`) → Task 1 (write paths). ✓
- §Source ladder (live → cached → random) → Task 1 Step 4 (getProcgenSeed body). ✓
- §PerfHUD surface (epoch + source) → Task 3 Steps 3–4. ✓
- §Mined-ore persistence (`cellshire:mined:<epoch>`) → Task 2 (module) + Task 4 (wire). ✓
- §`minedStore.js` (3 exports) → Task 2. ✓
- §`recordMine` in `_mineOre` → Task 4 Step 3. ✓
- §Boot-flow integration (restore depleted positions) → Task 4 Step 5. ✓
- §Edge cases (null epoch, malformed JSON, missing obj) → covered in test bodies + code guards. ✓
- §CKB RPC details (two-call sequence) → Task 1 Step 4 (`getCurrentEpochHash` body). ✓
- §Tests (7 suites) → Task 1 (suites 1–4) + Task 2 (suites 5–7). ✓
- §Manual smoke flow → Task 3 Step 7 + Task 4 Step 8. ✓
- §Migration / cleanup (Math.random replaced) → Task 3 Step 2. ✓

**Placeholder scan:** every code step has full code, every command has exact expected output. No TODO / TBD / "similar to" references.

**Type consistency:** `epoch` is always a decimal string (e.g. `"14455"`) OR `null`. `hash` is always a 0x-prefixed hex string. `source` is `'live' | 'cached' | 'random'`. `seedFromHash` returns uint32. `recordMine` no-ops on null epoch — same convention as `loadMinedState` and `minedStoreKey`. Consistent across all tasks.
