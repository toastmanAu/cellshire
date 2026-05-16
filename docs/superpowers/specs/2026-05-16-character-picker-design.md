# Character Picker — Design Spec

**Status:** approved 2026-05-16
**Replaces:** the `?character=miner|seeker|tinker` URL flag as the primary
selection mechanism. URL flag survives as a dev / QA override.

## Goal

Give first-time players a clear "choose your start" moment that selects
between the three v0 character slots (Miner, Seeker, Tinker). The choice
must persist across reloads, and the selection list must be designed to
accept additional characters later (unique / common units acquired via
future on-chain mechanics) without restructuring the picker.

## Non-goals

- 4-direction player sprites (separate backlog item).
- Generating the three character PNGs (separate backlog item; picker
  works without them via tinted-cube fallback cards).
- Persisting *owned* extras (future on-chain work — character cells,
  wallet integration).
- A mid-game settings/vendor dialog to swap character (separate backlog
  item; this spec covers the first-load gate only).

## Approved decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Trigger | First-load gate (modal, world dimmed behind) |
| Persistence | localStorage; URL flag overrides for dev |
| Card preview | PNG-or-tinted-cube fallback per slot |
| Polish | Keyboard (1/2/3/Enter, arrows) + subtle hover/select anim |
| Telemetry | None |

## Architecture

### File layout

| Path | Purpose | New? |
|---|---|---|
| `src/ui/CharacterPicker.js` | Self-installing DOM overlay | new |
| `src/characters/catalog.js` | `getAvailableCharacters()` + `resolveCharacterChoice()` — all character-domain logic | new |
| `src/lib/safeStorage.js` | localStorage wrapper that survives private mode / quota errors | new |
| `src/main.js` | Boot flow: read choice, conditionally show picker; old `resolveCharacterAsset` removed | edit |
| `src/core/Player.js` | Confirm `assetId` is mutable post-construct (already is — line 46 sets `this.assetId = assetId`, plain field) | verify only |
| `styles.css` | Picker + card styles | edit |

The picker mounts as a sibling of `#app` in `document.body`. Pure DOM,
no canvas — the world keeps rendering behind it through the scrim.

### Catalog model — the extensibility seam

`getAvailableCharacters()` returns an array of character descriptors:

```js
{
  id:      'player_miner',        // matches assetManifest entry
  name:    'Miner',
  tagline: 'Stout Prospector',
  accent:  '#F2C744',             // CSS color for card border/cube tint
  kind:    'default',             // 'default' | 'unique' | 'common' | 'locked'
}
```

v0 implementation returns the three defaults hard-coded. Future
implementations append extras after the defaults:

- **unique** — player-owned NFT-like cells (badge on the card)
- **common** — purchased from a future store
- **locked** — visible but not selectable (teaser UX; dimmed + lock icon)

The picker iterates whatever the catalog returns and respects `kind`
for visual treatment and selectability (`enabled = kind !== 'locked'`).

**Why a new `src/characters/` directory:** defaults today come from the
asset manifest, but extras will come from wallet / cell-graph sources
later. `src/characters/` is the domain layer; the catalog module hides
where the data comes from.

### Boot flow change in `src/main.js`

Current flow:

```
world generates → spawnPlayer({ assetId: resolveCharacterAsset(URL) })
                → install HUDs
```

New flow:

```
world generates  (unchanged)
       │
       ▼
resolveCharacterChoice({ url, storage, catalog })
       │
       ├── valid id → spawnPlayer({ assetId })
       │             → install HUDs → done
       │
       └── null     → spawnPlayer({ assetId: null })   (cobalt cube)
                      install HUDs
                      installCharacterPicker({ catalog, onConfirm })
                          ↓ world renders behind, scrim dims it
                      user confirms:
                          player.assetId = chosenId
                          storage.set('cellshire:character', chosenId)
                          renderer.markDirty()
                          picker fades out (300ms) and unmounts
```

**Precedence rule:** URL `?character=` > localStorage > show picker.

**Key design choice:** the world always spawns and renders behind the
picker. The player exists as a placeholder cube during selection; on
confirm we mutate `player.assetId` and trigger a redraw. No re-spawn,
no game restart, no flash of empty canvas.

### `resolveCharacterChoice`

Pure function. No side effects. Easy to unit-test:

```js
resolveCharacterChoice({ url, storage, catalog }) → assetId | null
```

- Parse `url` (the `?character=` param value, or null).
  - Accept short form (`miner`) or full id (`player_miner`).
  - If matches an enabled catalog entry → return that id.
  - If non-empty but doesn't match → `console.warn` (existing behavior),
    fall through to storage.
- Read `storage.get('cellshire:character')`.
  - If matches an enabled catalog entry → return that id.
  - Otherwise (stale, removed, never set) → fall through.
- Return `null` → caller shows the picker.

URL flag never writes to storage. Storage is only ever written by the
picker on confirm.

### `safeStorage`

Tiny wrapper around `window.localStorage`:

- `get(key)` — try `localStorage.getItem`, catch `SecurityError` (Safari
  private mode) and missing-window cases, fall back to an in-memory
  `Map`. Returns `null` when key is absent.
- `set(key, value)` — try `localStorage.setItem`, catch `QuotaExceededError`
  and `SecurityError`, fall back to in-memory map.

Picker doesn't care which backend it lands on. In a fallback session
the picker just re-appears next reload — acceptable.

## DOM structure

Mounted to `document.body` as a sibling of `#app`:

```html
<div class="char-picker" role="dialog" aria-modal="true"
     aria-labelledby="char-picker-title">
  <div class="char-picker__scrim"></div>
  <div class="char-picker__panel">
    <h1 id="char-picker-title">CELLSHIRE</h1>
    <p class="char-picker__subtitle">Choose your start</p>
    <ul class="char-picker__cards" role="radiogroup">
      <li>
        <button class="char-card"
                role="radio"
                aria-checked="false"
                data-asset-id="player_miner"
                data-kind="default"
                data-index="1">
          <div class="char-card__preview" style="--accent: #F2C744">
            <img src="assets/player_miner.png" alt="" onerror="…fallback…" />
          </div>
          <h2 class="char-card__name">Miner</h2>
          <p class="char-card__tagline">Stout Prospector</p>
          <span class="char-card__key">1</span>
        </button>
      </li>
      <!-- …seeker, tinker… -->
    </ul>
    <button class="char-picker__confirm" disabled>Enter the world</button>
  </div>
</div>
```

When the `<img>` fails to load (404 — PNGs not yet generated), the
`onerror` handler swaps in a CSS-only tinted cube using the card's
`--accent` color. Same path the in-game renderer takes.

## Styling (added to `styles.css`)

- Scrim: `position: fixed; inset: 0; background: rgba(8, 12, 20, 0.7);
  backdrop-filter: blur(2px);`
- Panel: centered, max-width ~720px, matches the cream-on-slate
  typography of `InventoryHUD`.
- Cards: flex row, ~200×260px each. Default `2px solid transparent`
  border. Hover: `transform: translateY(-4px)` + soft shadow.
  Selected (`aria-checked="true"`): `2px solid var(--accent)` ring in
  the character's accent color.
- Tinted-cube fallback: a `div` rendered with `transform: rotateX(60deg)
  rotateZ(45deg)` and three pseudo-faces (`::before`, `::after`, one
  child) for faux-3D shading. CSS-only, ~30 lines.
- Transitions: 200ms ease on hover/select; 300ms fade-out on dismiss.

**Accent colors** (derived from the character prompts' "one bright
spot" anchors):

- Miner  — `#F2C744` (helmet-lamp yellow)
- Seeker — `#5BD5E8` (crystal cyan)
- Tinker — `#C77A3B` (brass)

## Keyboard handling

Single `keydown` listener attached when the picker mounts, removed on
dismiss.

| Key | Action |
|---|---|
| `1`, `2`, `3`, … | Focus + select the Nth enabled card |
| `ArrowLeft` / `ArrowRight` | Cycle selection through enabled cards (wraps; skips `locked`) |
| `Enter` | Confirm current selection (no-op if nothing selected) |
| `Escape` | Ignored — this is a gate, no cancel. (Dev escape is the URL flag.) |

Numeric keys map to enabled cards in display order, not to hardcoded
ids — so when extras are added, `1/2/3/4/…` keeps working.

## Storage schema

| Key | Value | Written by | Read by |
|---|---|---|---|
| `cellshire:character` | asset id string (e.g. `"player_miner"`) | picker confirm handler | `resolveCharacterChoice` at boot |

Plain string, no JSON envelope. Future namespace neighbors planned:
`cellshire:save`, `cellshire:settings`.

## Edge cases handled

- **Asset 404** — renderer already falls back to the cobalt cube. The
  picker's card uses the same `onerror` → tinted cube path.
- **localStorage disabled / private mode** — `safeStorage` falls back
  to in-memory; picker shows each load but the session works.
- **Catalog change** — stored id no longer enabled in catalog →
  `resolveCharacterChoice` returns `null` → picker shows.
- **Double-click on confirm** — confirm handler removes its own
  listener as its first line.
- **Player walks during picker** — scrim is layered above the canvas
  with `pointer-events: auto`; canvas clicks (which drive
  `pendingInteract` in `Game.js`) never fire while the picker is
  mounted.

## Tests

**Context:** cellshire currently has no `package.json`, no test runner,
no build step — it's served as static JS from `index.html`. Adding a
test runner is a real scope expansion. Three options, in order of
expansion size:

| Option | What it costs | What you get |
|---|---|---|
| **A — Self-running browser test page** | One new file `tests.html` that imports the modules as ES modules, asserts in-page, prints pass/fail. No npm. | Real unit tests, runs in any browser, zero tooling. |
| **B — Add Vitest** | New `package.json`, `npm install`, jsdom for DOM tests. ~3 dev deps. | Industry-standard, watch mode, easy CI later. |
| **C — Manual smoke only (v0)** | Nothing new. | Picker ships fast; regressions on `resolveCharacterChoice` won't be caught automatically. |

**This decision is deferred to Phill's spec-review pass.** The
implementation plan will branch on the answer. Default if undecided:
**option A** (preserves the zero-build property of the repo today).

Once chosen, three focused unit tests plus one manual smoke flow:

1. **`resolveCharacterChoice`** — table-driven:
   - URL valid → URL
   - URL invalid + storage valid → storage
   - URL invalid + storage invalid → `null`
   - URL missing + storage missing → `null`
   - URL missing + storage points to id no longer in catalog → `null`
   - Short form (`miner`) resolves to `player_miner`

2. **`safeStorage`**:
   - Normal read/write round-trip
   - `setItem` throws → caller doesn't see it; subsequent reads return
     the in-memory fallback
   - Missing `window.localStorage` (Node test env) doesn't crash

3. **`getAvailableCharacters`**:
   - Returns three defaults
   - Each entry has the required keys (`id`, `name`, `tagline`,
     `accent`, `kind`)
   - All three default ids exist in `PLAYER_SKIN_IDS` (defends against
     drift between catalog and asset manifest)

**Manual smoke flow** (runs regardless of which test option is picked):
- Fresh browser (`localStorage.clear()`): picker appears, world dims
  behind, click Miner → enters as miner → reload → no picker, spawns
  as miner.
- `?character=seeker` overrides a stored miner choice for that load
  (but doesn't write to storage).
- Invalid `?character=foo`: console warn (existing), localStorage path
  → picker if also empty.

## Migration / cleanup

- `resolveCharacterAsset` in `src/main.js` is replaced by
  `resolveCharacterChoice` (new home: `src/characters/catalog.js`).
  Old function is removed.
- The kanban backlog entry "Character select UI — replace `?character=`
  URL flag with picker (first-load or vendor dialog)" is satisfied by
  this spec.
- No data migration needed (no previous storage usage).
