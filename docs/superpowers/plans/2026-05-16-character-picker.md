# Character Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `?character=` URL flag with a first-load modal picker that persists the player's choice and leaves a clean seam for future unique/common character units.

**Architecture:** Pure-DOM modal overlay (no canvas) installed onto `document.body` while the world renders behind it. Player spawns with a placeholder cube; on confirm we mutate `player.assetId`, write to localStorage, and trigger a redraw. New domain module `src/characters/catalog.js` owns the list of available characters and the precedence resolver (`URL > storage > picker`). Tests run in a browser via a tiny self-rolled harness — no npm, no build step (preserves cellshire's zero-tooling property).

**Tech Stack:** Vanilla JS ES modules, native DOM, plain CSS. No dependencies added. Test runner = `tests.html` + `src/test/harness.js`.

**Spec:** [`docs/superpowers/specs/2026-05-16-character-picker-design.md`](../specs/2026-05-16-character-picker-design.md)

---

## Task 1: Test harness foundation

**Files:**
- Create: `src/test/harness.js`
- Create: `src/test/sanity.test.js`
- Create: `tests.html`

Build the minimum surface area needed to run unit tests in any browser. Every subsequent task adds its test file to `tests.html`.

- [ ] **Step 1: Write the test harness**

Create `src/test/harness.js`:

```js
/**
 * Tiny self-running test harness. No deps. Used by tests.html.
 *
 *   describe('group', () => { it('does X', () => { expect(a).toBe(b); }); });
 *
 * tests.html imports the *.test.js files (which register cases via
 * describe/it) and then calls runAll() to execute them.
 */

const suite = [];
let currentDescribe = null;

export function describe(name, fn) {
    const prev = currentDescribe;
    currentDescribe = name;
    try { fn(); } finally { currentDescribe = prev; }
}

export function it(name, fn) {
    suite.push({ describe: currentDescribe, name, fn });
}

export function expect(actual) {
    return {
        toBe(expected) {
            if (actual !== expected) {
                throw new Error(`expected ${j(actual)} to be ${j(expected)}`);
            }
        },
        toEqual(expected) {
            const a = j(actual), b = j(expected);
            if (a !== b) throw new Error(`expected ${a} to equal ${b}`);
        },
        toBeNull() {
            if (actual !== null) throw new Error(`expected ${j(actual)} to be null`);
        },
        toBeTruthy() {
            if (!actual) throw new Error(`expected truthy, got ${j(actual)}`);
        },
    };
}

function j(v) {
    try { return JSON.stringify(v); } catch { return String(v); }
}

export async function runAll() {
    const results = [];
    for (const t of suite) {
        try {
            await t.fn();
            results.push({ ...t, ok: true });
        } catch (err) {
            results.push({ ...t, ok: false, err });
        }
    }
    return results;
}
```

- [ ] **Step 2: Write the sanity test**

Create `src/test/sanity.test.js`:

```js
import { describe, it, expect } from './harness.js';

describe('test harness', () => {
    it('runs and reports a pass', () => {
        expect(1 + 1).toBe(2);
    });
});
```

- [ ] **Step 3: Write the runner page**

Create `tests.html` at the repo root:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>cellshire tests</title>
    <style>
        body { font-family: ui-monospace, monospace; padding: 24px;
               background: #0d1117; color: #e6edf3; }
        h1 { color: #f0f6fc; margin-top: 0; }
        .pass { color: #3fb950; }
        .fail { color: #f85149; }
        .summary { margin: 16px 0 24px; font-size: 1.2em; }
        .case { margin: 2px 0; }
        pre { background: #161b22; padding: 10px 14px; border-radius: 4px;
              overflow-x: auto; border-left: 3px solid #f85149; }
    </style>
</head>
<body>
    <h1>cellshire tests</h1>
    <div id="results"></div>

    <script type="module">
        import { runAll } from './src/test/harness.js';
        // Test imports — keep alphabetised, one per line.
        import './src/test/sanity.test.js';

        const out = document.getElementById('results');
        const results = await runAll();
        const passed = results.filter(r => r.ok).length;
        const failed = results.length - passed;

        const summary = document.createElement('div');
        summary.className = 'summary ' + (failed === 0 ? 'pass' : 'fail');
        summary.textContent = `${passed} passed, ${failed} failed`;
        out.appendChild(summary);

        for (const r of results) {
            const line = document.createElement('div');
            line.className = 'case ' + (r.ok ? 'pass' : 'fail');
            line.textContent = `${r.ok ? 'PASS' : 'FAIL'}  ${r.describe || ''} > ${r.name}`;
            out.appendChild(line);
            if (!r.ok) {
                const pre = document.createElement('pre');
                pre.textContent = r.err.stack || String(r.err);
                out.appendChild(pre);
            }
        }

        console.log(`tests: ${passed} passed, ${failed} failed`);
        for (const r of results.filter(x => !x.ok)) {
            console.error(r.describe, '>', r.name, '\n', r.err);
        }
    </script>
</body>
</html>
```

- [ ] **Step 4: Verify it runs**

Serve the repo (any static server works) and open `/tests.html`.

Expected on page:
```
1 passed, 0 failed
PASS  test harness > runs and reports a pass
```

If you don't already have a server running, the quickest one-liner:
```bash
python3 -m http.server 8766
```
then visit `http://127.0.0.1:8766/tests.html`.

- [ ] **Step 5: Commit**

```bash
git add src/test/harness.js src/test/sanity.test.js tests.html
git commit -m "test: add browser-based test harness + sanity test"
```

---

## Task 2: safeStorage wrapper

**Files:**
- Create: `src/lib/safeStorage.js`
- Create: `src/lib/safeStorage.test.js`
- Modify: `tests.html` (add one import line)

Wrap `localStorage` so the picker survives Safari private mode (`SecurityError`), quota errors, and Node-like environments (no `window`). On any backend failure we demote to an in-memory `Map` for the session.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/safeStorage.test.js`:

```js
import { describe, it, expect } from '../test/harness.js';
import { makeSafeStorage } from './safeStorage.js';

describe('safeStorage', () => {
    function fakeBackend() {
        const m = new Map();
        return {
            getItem: k => (m.has(k) ? m.get(k) : null),
            setItem: (k, v) => m.set(k, String(v)),
            removeItem: k => m.delete(k),
        };
    }

    it('round-trips a value through a normal backend', () => {
        const s = makeSafeStorage(fakeBackend());
        s.set('hello', 'world');
        expect(s.get('hello')).toBe('world');
    });

    it('falls back to in-memory when setItem throws', () => {
        const throwing = {
            getItem: () => null,
            setItem: () => { throw new Error('quota'); },
            removeItem: () => {},
        };
        const s = makeSafeStorage(throwing);
        s.set('k', 'v');
        expect(s.get('k')).toBe('v');
    });

    it('returns null for missing keys', () => {
        const s = makeSafeStorage(fakeBackend());
        expect(s.get('nope')).toBeNull();
    });

    it('works when given no backend (null)', () => {
        const s = makeSafeStorage(null);
        s.set('k', 'v');
        expect(s.get('k')).toBe('v');
    });
});
```

- [ ] **Step 2: Add the test file to tests.html**

In `tests.html`, in the alphabetised import block, add the new line:

```diff
        // Test imports — keep alphabetised, one per line.
+       import './src/lib/safeStorage.test.js';
        import './src/test/sanity.test.js';
```

- [ ] **Step 3: Run tests, confirm they fail**

Reload `/tests.html`. Expected: 4 new FAIL entries citing `makeSafeStorage` not defined / import error.

- [ ] **Step 4: Write the implementation**

Create `src/lib/safeStorage.js`:

```js
/**
 * Tiny wrapper around localStorage that survives Safari private mode,
 * quota errors, and Node test environments. Falls back to an in-memory
 * Map on any backend failure for the session.
 */

function makeMemoryBackend() {
    const m = new Map();
    return {
        getItem: k => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: k => m.delete(k),
    };
}

const defaultBackend = () =>
    (typeof window !== 'undefined' && window.localStorage) || null;

/**
 * Build a safe-storage instance. Pass a custom backend for tests.
 */
export function makeSafeStorage(backend = defaultBackend()) {
    let active = backend || makeMemoryBackend();
    const fallback = makeMemoryBackend();

    function tryWith(fn) {
        try {
            return fn(active);
        } catch (_err) {
            active = fallback;
            return fn(active);
        }
    }

    return {
        get(key) { return tryWith(b => b.getItem(key)); },
        set(key, value) { tryWith(b => b.setItem(key, value)); },
        remove(key) { tryWith(b => b.removeItem(key)); },
    };
}

/** Default singleton wrapping the real localStorage (or memory). */
export const safeStorage = makeSafeStorage();
```

- [ ] **Step 5: Run tests, confirm they pass**

Reload `/tests.html`. Expected: `5 passed, 0 failed` (sanity + 4 new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/safeStorage.js src/lib/safeStorage.test.js tests.html
git commit -m "feat: add safeStorage wrapper with in-memory fallback"
```

---

## Task 3: Character catalog (getAvailableCharacters)

**Files:**
- Create: `src/characters/catalog.js`
- Create: `src/characters/catalog.test.js`
- Modify: `tests.html`

Defines the v0 list of three starter characters. Hard-coded for now; the function shape is the seam where future unique/common units will be appended.

- [ ] **Step 1: Write the failing tests**

Create `src/characters/catalog.test.js`:

```js
import { describe, it, expect } from '../test/harness.js';
import { getAvailableCharacters, TIERS } from './catalog.js';
import { PLAYER_SKIN_IDS } from '../assets/assetManifest.js';

describe('getAvailableCharacters', () => {
    it('returns three default characters', () => {
        expect(getAvailableCharacters().length).toBe(3);
    });

    it('each entry has the required shape', () => {
        for (const c of getAvailableCharacters()) {
            expect(typeof c.id).toBe('string');
            expect(typeof c.name).toBe('string');
            expect(typeof c.tagline).toBe('string');
            expect(typeof c.accent).toBe('string');
            expect(TIERS.includes(c.tier)).toBe(true);
        }
    });

    it('all default ids exist in PLAYER_SKIN_IDS', () => {
        for (const c of getAvailableCharacters()) {
            expect(PLAYER_SKIN_IDS.includes(c.id)).toBe(true);
        }
    });

    it('returns a fresh array each call (caller cannot mutate internals)', () => {
        const a = getAvailableCharacters();
        a.push({ id: 'rogue' });
        expect(getAvailableCharacters().length).toBe(3);
    });
});
```

- [ ] **Step 2: Add to tests.html**

In `tests.html`, in the alphabetised import block, add:

```diff
        // Test imports — keep alphabetised, one per line.
+       import './src/characters/catalog.test.js';
        import './src/lib/safeStorage.test.js';
        import './src/test/sanity.test.js';
```

- [ ] **Step 3: Run tests, confirm they fail**

Reload `/tests.html`. Expected: 4 new FAIL entries on catalog tests.

- [ ] **Step 4: Write the implementation**

Create `src/characters/catalog.js`:

```js
/**
 * Character catalog — the list of characters the player can choose
 * from. v0 returns the three starter defaults. Future versions append
 * player-owned extras (tier: 'unique' | 'common' | 'locked').
 *
 * Note: `tier` here is the availability/source tier. Don't confuse it
 * with the asset manifest's `kind` field, which is the render-layer
 * type (terrain | object). Same characters, different field, different
 * meaning.
 *
 * Keeping this in its own module so the picker UI never hard-codes
 * the slot list, and on-chain wallet/cell sources have a clean home.
 */

const DEFAULTS = [
    { id: 'player_miner',  name: 'Miner',  tagline: 'Stout Prospector',     accent: '#F2C744', tier: 'default' },
    { id: 'player_seeker', name: 'Seeker', tagline: 'Robed Crystalwright',  accent: '#5BD5E8', tier: 'default' },
    { id: 'player_tinker', name: 'Tinker', tagline: 'Goggled Engineer',     accent: '#C77A3B', tier: 'default' },
];

export const TIERS = ['default', 'unique', 'common', 'locked'];

export function getAvailableCharacters() {
    return DEFAULTS.slice();
}

export function isEnabled(character) {
    return character.tier !== 'locked';
}
```

- [ ] **Step 5: Run tests, confirm they pass**

Reload `/tests.html`. Expected: `9 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add src/characters/catalog.js src/characters/catalog.test.js tests.html
git commit -m "feat: add character catalog with three v0 defaults"
```

---

## Task 4: resolveCharacterChoice (URL > storage > null)

**Files:**
- Modify: `src/characters/catalog.js`
- Modify: `src/characters/catalog.test.js`

Adds the pure precedence resolver alongside `getAvailableCharacters` (same domain). Replaces the inline `resolveCharacterAsset` that's currently in `src/main.js:250` — that helper will be removed in Task 7.

- [ ] **Step 1: Append failing tests to the catalog test file**

In `src/characters/catalog.test.js`, append:

```js
import { resolveCharacterChoice } from './catalog.js';

describe('resolveCharacterChoice', () => {
    const catalog = getAvailableCharacters();

    function fakeStorage(initial = {}) {
        const m = new Map(Object.entries(initial));
        return {
            get: k => (m.has(k) ? m.get(k) : null),
            set: (k, v) => m.set(k, v),
            remove: k => m.delete(k),
        };
    }

    it('returns null when URL and storage are both empty', () => {
        expect(resolveCharacterChoice({
            url: null, storage: fakeStorage(), catalog,
        })).toBeNull();
    });

    it('returns the URL choice when valid (full id)', () => {
        expect(resolveCharacterChoice({
            url: 'player_miner', storage: fakeStorage(), catalog,
        })).toBe('player_miner');
    });

    it('returns the URL choice when valid (short form)', () => {
        expect(resolveCharacterChoice({
            url: 'seeker', storage: fakeStorage(), catalog,
        })).toBe('player_seeker');
    });

    it('URL beats storage when both are valid', () => {
        const s = fakeStorage({ 'cellshire:character': 'player_tinker' });
        expect(resolveCharacterChoice({
            url: 'miner', storage: s, catalog,
        })).toBe('player_miner');
    });

    it('falls through to storage when URL is invalid', () => {
        const s = fakeStorage({ 'cellshire:character': 'player_tinker' });
        expect(resolveCharacterChoice({
            url: 'banana', storage: s, catalog,
        })).toBe('player_tinker');
    });

    it('returns null when storage points to an id no longer in catalog', () => {
        const s = fakeStorage({ 'cellshire:character': 'player_obsolete' });
        expect(resolveCharacterChoice({
            url: null, storage: s, catalog,
        })).toBeNull();
    });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Reload `/tests.html`. Expected: 6 new FAIL entries.

- [ ] **Step 3: Add the resolver to catalog.js**

Append to `src/characters/catalog.js`:

```js
/**
 * Resolve which character to spawn as, given a URL param value and a
 * safeStorage instance. Precedence:
 *
 *     URL (?character=...)  >  storage  >  null (caller shows picker)
 *
 * Accepts the short form ('miner') or the full id ('player_miner').
 * Returns null when nothing valid is available. Pure — does not write
 * to storage; the picker is the only thing that writes.
 */
export function resolveCharacterChoice({
    url, storage, catalog = getAvailableCharacters(),
}) {
    const validIds = new Set(
        catalog.filter(isEnabled).map(c => c.id),
    );

    if (url) {
        const candidate = url.startsWith('player_') ? url : `player_${url}`;
        if (validIds.has(candidate)) return candidate;
        console.warn('[cellshire] unknown ?character=', url,
            '— ignoring. Valid:', [...validIds].join(' | '));
    }

    if (storage) {
        const stored = storage.get('cellshire:character');
        if (stored && validIds.has(stored)) return stored;
    }

    return null;
}
```

- [ ] **Step 4: Run tests, confirm they pass**

Reload `/tests.html`. Expected: `15 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/characters/catalog.js src/characters/catalog.test.js
git commit -m "feat: add resolveCharacterChoice precedence resolver"
```

---

## Task 5: CharacterPicker — mount + click selection (no keyboard yet)

**Files:**
- Create: `src/ui/CharacterPicker.js`
- Create: `src/ui/CharacterPicker.test.js`
- Modify: `tests.html`

Pure DOM overlay. Self-installs to `document.body`. Single export `installCharacterPicker({ catalog, onConfirm })`. Keyboard support comes in Task 6.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/CharacterPicker.test.js`:

```js
import { describe, it, expect } from '../test/harness.js';
import { installCharacterPicker } from './CharacterPicker.js';
import { getAvailableCharacters } from '../characters/catalog.js';

function cleanup() {
    document.querySelectorAll('.char-picker').forEach(n => n.remove());
}

describe('CharacterPicker (mount + selection)', () => {
    it('mounts a dialog to document.body', () => {
        cleanup();
        installCharacterPicker({
            catalog: getAvailableCharacters(),
            onConfirm: () => {},
        });
        const root = document.querySelector('.char-picker');
        expect(root !== null).toBe(true);
        expect(root.getAttribute('role')).toBe('dialog');
        cleanup();
    });

    it('renders one card per catalog entry', () => {
        cleanup();
        installCharacterPicker({
            catalog: getAvailableCharacters(),
            onConfirm: () => {},
        });
        expect(document.querySelectorAll('.char-card').length).toBe(3);
        cleanup();
    });

    it('confirm button is disabled until a card is selected', () => {
        cleanup();
        installCharacterPicker({
            catalog: getAvailableCharacters(),
            onConfirm: () => {},
        });
        const btn = document.querySelector('.char-picker__confirm');
        expect(btn.disabled).toBe(true);
        document.querySelector('.char-card').click();
        expect(btn.disabled).toBe(false);
        cleanup();
    });

    it('selecting a card sets aria-checked on that card only', () => {
        cleanup();
        installCharacterPicker({
            catalog: getAvailableCharacters(),
            onConfirm: () => {},
        });
        const cards = document.querySelectorAll('.char-card');
        cards[1].click();
        expect(cards[0].getAttribute('aria-checked')).toBe('false');
        expect(cards[1].getAttribute('aria-checked')).toBe('true');
        expect(cards[2].getAttribute('aria-checked')).toBe('false');
        cleanup();
    });

    it('confirm fires onConfirm with the selected id and unmounts', async () => {
        cleanup();
        let fired = null;
        installCharacterPicker({
            catalog: getAvailableCharacters(),
            onConfirm: id => { fired = id; },
        });
        document.querySelector('.char-card').click();
        document.querySelector('.char-picker__confirm').click();
        expect(fired).toBe('player_miner');
        // Wait past the 320ms leaving animation before checking unmount.
        await new Promise(r => setTimeout(r, 400));
        expect(document.querySelector('.char-picker')).toBeNull();
    });
});
```

- [ ] **Step 2: Add to tests.html**

In `tests.html`, in the alphabetised import block, add:

```diff
        import './src/characters/catalog.test.js';
        import './src/lib/safeStorage.test.js';
        import './src/test/sanity.test.js';
+       import './src/ui/CharacterPicker.test.js';
```

- [ ] **Step 3: Run tests, confirm they fail**

Reload `/tests.html`. Expected: 5 new FAIL entries.

- [ ] **Step 4: Write the implementation**

Create `src/ui/CharacterPicker.js`:

```js
/**
 * Character-picker modal overlay.
 *
 *   installCharacterPicker({ catalog, onConfirm }):
 *     Mounts the picker to document.body. Returns { dismiss, root }.
 *     onConfirm(assetId) is called when the user confirms a selection;
 *     the picker fades out and unmounts itself afterwards.
 *
 * No canvas. No globals. The world keeps rendering behind via the
 * scrim (see styles.css :: .char-picker__scrim).
 */

export function installCharacterPicker({ catalog, onConfirm }) {
    const root = document.createElement('div');
    root.className = 'char-picker';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'char-picker-title');

    const scrim = document.createElement('div');
    scrim.className = 'char-picker__scrim';
    root.appendChild(scrim);

    const panel = document.createElement('div');
    panel.className = 'char-picker__panel';
    root.appendChild(panel);

    const title = document.createElement('h1');
    title.id = 'char-picker-title';
    title.textContent = 'CELLSHIRE';
    panel.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'char-picker__subtitle';
    subtitle.textContent = 'Choose your start';
    panel.appendChild(subtitle);

    const cards = document.createElement('ul');
    cards.className = 'char-picker__cards';
    cards.setAttribute('role', 'radiogroup');
    panel.appendChild(cards);

    const enabled = catalog.filter(c => c.tier !== 'locked');
    let selectedId = null;
    const cardButtons = [];

    enabled.forEach((c, idx) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'char-card';
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', 'false');
        btn.dataset.assetId = c.id;
        btn.dataset.tier = c.tier;
        btn.dataset.index = String(idx + 1);

        const preview = document.createElement('div');
        preview.className = 'char-card__preview';
        preview.style.setProperty('--accent', c.accent);

        const img = document.createElement('img');
        img.src = `assets/${c.id}.png`;
        img.alt = '';
        img.onerror = () => {
            img.remove();
            const cube = document.createElement('div');
            cube.className = 'char-card__cube';
            preview.appendChild(cube);
        };
        preview.appendChild(img);
        btn.appendChild(preview);

        const name = document.createElement('h2');
        name.className = 'char-card__name';
        name.textContent = c.name;
        btn.appendChild(name);

        const tagline = document.createElement('p');
        tagline.className = 'char-card__tagline';
        tagline.textContent = c.tagline;
        btn.appendChild(tagline);

        const keyHint = document.createElement('span');
        keyHint.className = 'char-card__key';
        keyHint.textContent = String(idx + 1);
        btn.appendChild(keyHint);

        btn.addEventListener('click', () => select(c.id));
        li.appendChild(btn);
        cards.appendChild(li);
        cardButtons.push(btn);
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'char-picker__confirm';
    confirmBtn.textContent = 'Enter the world';
    confirmBtn.disabled = true;
    confirmBtn.addEventListener('click', confirm);
    panel.appendChild(confirmBtn);

    function select(id) {
        selectedId = id;
        for (const b of cardButtons) {
            b.setAttribute('aria-checked', String(b.dataset.assetId === id));
        }
        confirmBtn.disabled = false;
    }

    let confirmed = false;
    function confirm() {
        if (confirmed || !selectedId) return;
        confirmed = true;
        confirmBtn.disabled = true;
        onConfirm(selectedId);
        root.classList.add('char-picker--leaving');
        setTimeout(dismiss, 320);
    }

    function dismiss() {
        root.remove();
    }

    document.body.appendChild(root);
    return { dismiss, root };
}
```

- [ ] **Step 5: Run tests, confirm they pass**

Reload `/tests.html`. Expected: `20 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/CharacterPicker.js src/ui/CharacterPicker.test.js tests.html
git commit -m "feat: add CharacterPicker DOM overlay with click selection"
```

---

## Task 6: CharacterPicker — keyboard (1/2/3, arrows, Enter)

**Files:**
- Modify: `src/ui/CharacterPicker.js`
- Modify: `src/ui/CharacterPicker.test.js`

Numeric keys select by display index, arrows cycle with wrap, Enter confirms when a selection exists. Escape is deliberately ignored — this is a gate.

- [ ] **Step 1: Append failing keyboard tests**

Append to `src/ui/CharacterPicker.test.js`:

```js
function key(name) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
}

describe('CharacterPicker (keyboard)', () => {
    it('pressing 2 selects the second card', () => {
        cleanup();
        installCharacterPicker({
            catalog: getAvailableCharacters(), onConfirm: () => {},
        });
        key('2');
        const cards = document.querySelectorAll('.char-card');
        expect(cards[1].getAttribute('aria-checked')).toBe('true');
        cleanup();
    });

    it('ArrowRight cycles forward and wraps at the end', () => {
        cleanup();
        installCharacterPicker({
            catalog: getAvailableCharacters(), onConfirm: () => {},
        });
        key('3');               // select last
        key('ArrowRight');      // wraps to first
        const cards = document.querySelectorAll('.char-card');
        expect(cards[0].getAttribute('aria-checked')).toBe('true');
        cleanup();
    });

    it('ArrowLeft cycles backward and wraps at the start', () => {
        cleanup();
        installCharacterPicker({
            catalog: getAvailableCharacters(), onConfirm: () => {},
        });
        key('1');               // select first
        key('ArrowLeft');       // wraps to last
        const cards = document.querySelectorAll('.char-card');
        expect(cards[2].getAttribute('aria-checked')).toBe('true');
        cleanup();
    });

    it('Enter confirms when a card is selected', async () => {
        cleanup();
        let fired = null;
        installCharacterPicker({
            catalog: getAvailableCharacters(),
            onConfirm: id => { fired = id; },
        });
        key('1');
        key('Enter');
        expect(fired).toBe('player_miner');
        await new Promise(r => setTimeout(r, 400));
        cleanup();
    });

    it('Enter is ignored when nothing is selected', () => {
        cleanup();
        let fired = null;
        installCharacterPicker({
            catalog: getAvailableCharacters(),
            onConfirm: id => { fired = id; },
        });
        key('Enter');
        expect(fired).toBeNull();
        cleanup();
    });

    it('keydown listener is removed on dismiss', () => {
        cleanup();
        let fired = null;
        const { dismiss } = installCharacterPicker({
            catalog: getAvailableCharacters(),
            onConfirm: id => { fired = id; },
        });
        dismiss();
        key('1');                    // should no longer be intercepted
        key('Enter');
        expect(fired).toBeNull();
    });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Reload `/tests.html`. Expected: 6 new FAIL entries — numeric-key presses don't change selection yet.

- [ ] **Step 3: Add the keyboard handler to CharacterPicker.js**

In `src/ui/CharacterPicker.js`, just before the `document.body.appendChild(root)` line, insert:

```js
    function onKey(e) {
        const n = parseInt(e.key, 10);
        if (Number.isFinite(n) && n >= 1 && n <= cardButtons.length) {
            e.preventDefault();
            const target = cardButtons[n - 1];
            select(target.dataset.assetId);
            target.focus();
            return;
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const dir = e.key === 'ArrowRight' ? 1 : -1;
            const idx = cardButtons.findIndex(b => b.dataset.assetId === selectedId);
            const start = idx < 0 ? (dir > 0 ? -1 : cardButtons.length) : idx;
            const next = (start + dir + cardButtons.length) % cardButtons.length;
            select(cardButtons[next].dataset.assetId);
            cardButtons[next].focus();
            return;
        }
        if (e.key === 'Enter' && selectedId) {
            e.preventDefault();
            confirm();
        }
    }
    window.addEventListener('keydown', onKey);
```

Then update `dismiss` to remove the listener — replace the existing `dismiss` with:

```js
    function dismiss() {
        window.removeEventListener('keydown', onKey);
        root.remove();
    }
```

- [ ] **Step 4: Run tests, confirm they pass**

Reload `/tests.html`. Expected: `26 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/CharacterPicker.js src/ui/CharacterPicker.test.js
git commit -m "feat: CharacterPicker keyboard support (1/2/3, arrows, Enter)"
```

---

## Task 7: Wire into main.js — boot flow change

**Files:**
- Modify: `src/main.js`

Replace the existing `resolveCharacterAsset(...)` call with the new precedence resolver. When the resolver returns null, spawn with the placeholder cube AND install the picker. On confirm, mutate the player's assetId, write to storage, redraw.

Picker mounts AFTER `loadingScreen` hides and `app` shows, so the world is visible and rendering behind it.

- [ ] **Step 1: Update the imports**

In `src/main.js`, find the existing imports near the top and replace the relevant block:

```diff
 import { loadAssets } from './assets/assetLoader.js';
 import { Game } from './core/Game.js';
 import { UIManager } from './ui/UIManager.js';
 import { loadUiAudio } from './ui/Audio.js';
 import { generateWorld } from './worldgen/procgen.js';
 import { installPerfHUD } from './ui/PerfHUD.js';
 import { installInventoryHUD } from './ui/InventoryHUD.js';
 import { isWalkable } from './grid/walkability.js';
+import { getAvailableCharacters, resolveCharacterChoice } from './characters/catalog.js';
+import { safeStorage } from './lib/safeStorage.js';
+import { installCharacterPicker } from './ui/CharacterPicker.js';
```

- [ ] **Step 2: Replace the spawn block with the new boot flow**

In `src/main.js`, find this existing block (currently lines ~94–104):

```js
    if (game.mode === 'play') {
        const spawn = findSpawnCell(game.tileMap);
        if (spawn) {
            game.spawnPlayer(spawn.gx, spawn.gy, {
                assetId: resolveCharacterAsset(params.get('character')),
            });
            installInventoryHUD(game.player);
        } else {
            console.warn('[cellshire] no walkable spawn found — seed:', seed);
        }
    }
```

Replace with:

```js
    if (game.mode === 'play') {
        const spawn = findSpawnCell(game.tileMap);
        if (spawn) {
            const catalog = getAvailableCharacters();
            const chosen = resolveCharacterChoice({
                url: params.get('character'),
                storage: safeStorage,
                catalog,
            });
            game.spawnPlayer(spawn.gx, spawn.gy, { assetId: chosen });
            installInventoryHUD(game.player);

            // No stored / URL choice — show the first-load gate. World
            // is already rendering, so the picker overlays on top of it.
            if (chosen === null) {
                installCharacterPicker({
                    catalog,
                    onConfirm: (assetId) => {
                        game.player.assetId = assetId;
                        safeStorage.set('cellshire:character', assetId);
                        game.renderer.markDirty();
                    },
                });
            }
        } else {
            console.warn('[cellshire] no walkable spawn found — seed:', seed);
        }
    }
```

- [ ] **Step 3: Delete the old `resolveCharacterAsset` helper**

In `src/main.js`, find and delete this function (currently lines ~244–259):

```js
/**
 * Resolve a short `?character=<key>` URL param into a manifest asset id.
 * Accepts the short form (`miner`) or the full id (`player_miner`).
 * Returns null when the param is missing or unrecognised — caller
 * spawns with the placeholder cube in that case.
 */
function resolveCharacterAsset(param) {
    if (!param) return null;
    const VALID = ['player_miner', 'player_seeker', 'player_tinker'];
    if (VALID.includes(param)) return param;
    const short = `player_${param}`;
    if (VALID.includes(short)) return short;
    console.warn('[cellshire] unknown ?character=', param,
        '— falling back to placeholder. Valid: miner | seeker | tinker');
    return null;
}
```

- [ ] **Step 4: Manual smoke — fresh visit**

Open a private/incognito window (or clear `localStorage`) and visit the app's root URL.

Expected:
1. Loading screen shows, then world fades in.
2. Picker appears centered over the dimmed world.
3. Three cards visible (Miner / Seeker / Tinker), each with a fallback cube (PNGs don't exist yet).
4. Click a card → its border highlights, confirm button enables.
5. Click "Enter the world" → picker fades, player on the canvas swaps from the cobalt placeholder to the same-tinted cube (same fallback, but now driven by `player.assetId`).
6. Open devtools → Application → Local Storage. Confirm `cellshire:character` = the chosen id.

- [ ] **Step 5: Manual smoke — returning visit**

Reload the page.

Expected: no picker, world loads straight in, player spawns with the previously-chosen skin.

- [ ] **Step 6: Manual smoke — URL override + invalid URL**

1. Visit `?character=seeker`. Expected: no picker (URL wins), player spawns as seeker, localStorage value unchanged.
2. Visit `?character=banana`. Expected: console warns, falls back to storage → player spawns with the stored character, no picker.
3. Clear localStorage, then visit `?character=banana`. Expected: console warns, picker appears.

- [ ] **Step 7: Run tests one more time**

Reload `/tests.html`. Expected: still `26 passed, 0 failed`.

- [ ] **Step 8: Commit**

```bash
git add src/main.js
git commit -m "feat: wire CharacterPicker into boot flow, replace URL-only resolver"
```

---

## Task 8: CSS polish — scrim, panel, cards, tinted-cube fallback

**Files:**
- Modify: `styles.css`

No tests. Pure visual work. Open the running app between iterations and tweak.

- [ ] **Step 1: Append the picker styles**

Append to `styles.css`:

```css
/* ── Character picker ───────────────────────────────────────────── */

.char-picker {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 1;
    transition: opacity 300ms ease;
}

.char-picker--leaving {
    opacity: 0;
    pointer-events: none;
}

.char-picker__scrim {
    position: absolute;
    inset: 0;
    background: rgba(8, 12, 20, 0.7);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
}

.char-picker__panel {
    position: relative;
    width: min(720px, 92vw);
    padding: 32px 36px 28px;
    background: #1a2030;
    border: 1px solid #2c3550;
    border-radius: 12px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
    color: #f5e9c8;
    text-align: center;
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
}

.char-picker__panel h1 {
    margin: 0 0 4px;
    font-size: 1.6rem;
    letter-spacing: 0.18em;
    color: #f5e9c8;
}

.char-picker__subtitle {
    margin: 0 0 24px;
    font-size: 0.95rem;
    color: #9aa4bf;
    letter-spacing: 0.04em;
}

.char-picker__cards {
    list-style: none;
    padding: 0;
    margin: 0 0 24px;
    display: flex;
    gap: 16px;
    justify-content: center;
}

.char-picker__cards > li { display: contents; }

.char-card {
    position: relative;
    flex: 1 1 0;
    max-width: 200px;
    min-height: 260px;
    padding: 20px 12px 16px;
    background: #232a3d;
    border: 2px solid transparent;
    border-radius: 10px;
    color: inherit;
    font: inherit;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    transition: transform 200ms ease, border-color 200ms ease,
                box-shadow 200ms ease, background 200ms ease;
}

.char-card:hover {
    transform: translateY(-4px);
    background: #29314a;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.char-card[aria-checked="true"] {
    border-color: var(--accent);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent),
                0 8px 24px rgba(0, 0, 0, 0.4);
}

.char-card__preview {
    width: 96px;
    height: 96px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.char-card__preview img {
    max-width: 100%;
    max-height: 100%;
    image-rendering: pixelated;
}

/* Tinted-cube fallback when the PNG is missing. */
.char-card__cube {
    width: 56px;
    height: 56px;
    background: var(--accent);
    transform: rotateX(55deg) rotateZ(45deg);
    box-shadow:
        4px 4px 0 color-mix(in srgb, var(--accent) 70%, #000 30%),
        8px 8px 0 color-mix(in srgb, var(--accent) 50%, #000 50%);
}

.char-card__name {
    margin: 0;
    font-size: 1.05rem;
    color: #f5e9c8;
}

.char-card__tagline {
    margin: 0;
    font-size: 0.8rem;
    color: #9aa4bf;
    letter-spacing: 0.02em;
}

.char-card__key {
    position: absolute;
    top: 8px;
    right: 10px;
    font-size: 0.75rem;
    color: #6b7592;
    border: 1px solid #3a4361;
    border-radius: 4px;
    padding: 1px 6px;
    font-family: ui-monospace, monospace;
}

.char-picker__confirm {
    appearance: none;
    background: #f5b340;
    border: none;
    color: #1a2030;
    padding: 12px 28px;
    border-radius: 8px;
    font: inherit;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: background 150ms ease, transform 150ms ease;
}

.char-picker__confirm:disabled {
    background: #3a4361;
    color: #6b7592;
    cursor: not-allowed;
}

.char-picker__confirm:not(:disabled):hover {
    background: #f7c25c;
    transform: translateY(-1px);
}
```

- [ ] **Step 2: Manual smoke — visual check**

Clear localStorage and reload the app.

Expected visuals:
1. Dimmed/blurred world behind a centered dark-slate panel.
2. Three cards in a row, each with a small tinted-cube preview in the character's accent color (yellow / cyan / brass).
3. Hover lifts a card slightly and adds a soft shadow.
4. Clicking a card draws an accent-colored ring around it; the confirm button turns from grey to amber.
5. Number badge (1/2/3) in each card's top-right corner.
6. Confirm button click: picker fades smoothly to nothing over ~300ms.

- [ ] **Step 3: Run tests once more**

Reload `/tests.html`. Expected: still `26 passed, 0 failed`.

- [ ] **Step 4: Update the kanban**

In `/home/phill/Documents/loacal-vault/Kanban/Cellshire.md`, find the line under `## Backlog`:

```
- [ ] Character select UI — replace `?character=` URL flag with picker (first-load or vendor dialog)
```

Move it to `## Done` as:

```
- [x] Character select UI — first-load gate, localStorage persistence, keyboard support (2026-05-16)
```

- [ ] **Step 5: Commit**

```bash
git add styles.css
git commit -m "style: character picker polish — panel, cards, tinted cubes, animations"
```

---

## Self-review notes

**Spec coverage:**
- §Architecture / file layout → Tasks 2, 3, 5 (create files); Task 7 (edit main.js); Task 8 (edit styles.css). ✓
- §Catalog model + extensibility seam → Task 3. ✓
- §Boot flow change → Task 7. ✓
- §`resolveCharacterChoice` precedence → Task 4. ✓
- §`safeStorage` → Task 2. ✓
- §DOM structure → Task 5. ✓
- §Styling + accent colors → Task 8. ✓
- §Keyboard handling → Task 6. ✓
- §Storage schema (`cellshire:character`) → Task 4 (resolver reads), Task 7 (picker writes). ✓
- §Edge cases — asset 404 fallback → Task 5 (img.onerror handler). ✓
- §Edge cases — localStorage disabled → Task 2 (safeStorage fallback). ✓
- §Edge cases — catalog change → Task 4 (resolver returns null for unknown stored id). ✓
- §Edge cases — double-click on confirm → Task 5 (`confirmed` flag + disabled). ✓
- §Edge cases — clicks through scrim → Task 8 (scrim is `position: absolute` over canvas with the panel above it; canvas pointer events blocked because the scrim is opaque to events). ✓
- §Tests — three unit suites + manual smoke → Tasks 2, 3, 4, 5, 6 (suites); Task 7 (manual smoke). ✓
- §Migration / cleanup → Task 7 (deletes old `resolveCharacterAsset`). ✓

**No placeholders or TODOs in any task.** Every code step contains the complete code; every command step contains the exact command and expected output.

**Type / name consistency:** `installCharacterPicker`, `getAvailableCharacters`, `resolveCharacterChoice`, `safeStorage`, `cellshire:character` — referenced identically across all tasks.
