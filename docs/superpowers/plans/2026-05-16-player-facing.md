# Player Facing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-direction (right / left) player facing that flips the PNG sprite horizontally when the player walks left-on-screen.

**Architecture:** New `facing` field on `Player`, updated once per step in `_advanceTarget()`. Renderer wraps the existing PNG-draw call with a `ctx.scale(-1, 1)` branch when `facing === 'left'`. Cube placeholder unchanged (symmetric). Logic is unit-tested; visual smoke deferred until PNGs land (separate kanban item).

**Tech Stack:** Vanilla JS ES modules, the browser test harness from `tests.html`.

**Spec:** [`docs/superpowers/specs/2026-05-16-player-facing-design.md`](../specs/2026-05-16-player-facing-design.md)

---

## Task 1: `Player.facing` field + tests

**Files:**
- Create: `src/core/Player.test.js`
- Modify: `src/core/Player.js`
- Modify: `tests.html`

Add the runtime state and the test coverage. No render changes yet.

- [ ] **Step 1: Write the failing tests**

Create `src/core/Player.test.js`:

```js
import { describe, it, expect } from '../test/harness.js';
import { Player } from './Player.js';

describe('Player.facing', () => {
    it('defaults to right on a freshly-spawned player', () => {
        const p = new Player({ gx: 5, gy: 5 });
        expect(p.facing).toBe('right');
    });

    it('flips to left when the next step heads west or south', () => {
        const p = new Player({ gx: 5, gy: 5 });
        p.setPath([{ gx: 4, gy: 5 }]);   // west step
        expect(p.facing).toBe('left');
    });

    it('flips back to right when the next step heads east or north', () => {
        const p = new Player({ gx: 5, gy: 5 });
        p.setPath([{ gx: 4, gy: 5 }]);   // west — facing becomes left
        p.gx = 4;                         // simulate arrival
        p.setPath([{ gx: 5, gy: 4 }]);   // north step — should flip right
        expect(p.facing).toBe('right');
    });

    it('preserves last facing while idle', () => {
        const p = new Player({ gx: 5, gy: 5 });
        p.setPath([{ gx: 4, gy: 5 }]);   // west — facing becomes left
        expect(p.facing).toBe('left');
        p.setPath([]);                    // stop
        expect(p.facing).toBe('left');
    });
});
```

- [ ] **Step 2: Add the test import to tests.html**

Find the alphabetised import block in `tests.html` and add:

```diff
        import './src/characters/catalog.test.js';
+       import './src/core/Player.test.js';
        import './src/lib/safeStorage.test.js';
        import './src/test/sanity.test.js';
        import './src/ui/CharacterPicker.test.js';
```

The new line goes between `characters/` and `lib/` (alphabetised by full path).

- [ ] **Step 3: Run tests, confirm they fail**

```
node --input-type=module -e "
  import('./src/test/harness.js').then(async harness => {
    await import('./src/core/Player.test.js');
    const r = await harness.runAll();
    const passed = r.filter(x => x.ok).length;
    const failed = r.length - passed;
    console.log(passed, 'passed,', failed, 'failed');
    for (const x of r.filter(y => !y.ok)) console.error(x.describe, '>', x.name, x.err.message);
  })
"
```

Expected: 4 failures (no `facing` field yet — all four tests assert against `undefined`).

- [ ] **Step 4: Add the `facing` field + heading update**

In `src/core/Player.js`, find the constructor:

```js
    constructor({ gx, gy, speedCellsPerSec = 3.5, assetId = null } = { gx: 0, gy: 0 }) {
        this.gx = gx;
        this.gy = gy;
        const c = cellCenter(gx, gy);
        this.x = c.x;
        this.y = c.y;
        this.speed = speedCellsPerSec; // cells per second
        this.path = [];                 // remaining cells to visit
        this._target = null;            // current step target {gx, gy, x, y}
        this.inventory = new Inventory();
        // Optional asset id for the player skin. When set AND the asset
        // is loaded, the renderer draws the PNG; otherwise it falls
        // back to the cobalt-cube placeholder. Lets us wire all three
        // character slots before the PNGs land.
        this.assetId = assetId;
    }
```

Add the `facing` field after `assetId`:

```js
        this.assetId = assetId;
        // Two-way facing for the PNG render path. 'right' is the
        // canonical PNG orientation; 'left' triggers a horizontal flip
        // in the renderer. Updated once per step in _advanceTarget.
        this.facing = 'right';
```

Then find the existing `_advanceTarget()`:

```js
    _advanceTarget() {
        if (this.path.length === 0) {
            this._target = null;
            return;
        }
        const next = this.path.shift();
        const c = cellCenter(next.gx, next.gy);
        this._target = { gx: next.gx, gy: next.gy, x: c.x, y: c.y };
    }
```

Replace with:

```js
    _advanceTarget() {
        if (this.path.length === 0) {
            this._target = null;
            return;
        }
        const next = this.path.shift();
        const c = cellCenter(next.gx, next.gy);
        // Derive screen-x heading from the grid step. In iso projection
        // screenX = (gx - gy) * (TW/2), so sign(dgx - dgy) is the screen-x
        // sign of the move. Cardinals map: east/north → right, west/south
        // → left. dgx === dgy is the no-op case (same cell) — guard
        // against clobbering facing with a meaningless update.
        const dgx = next.gx - this.gx;
        const dgy = next.gy - this.gy;
        if (dgx !== dgy) {
            this.facing = (dgx - dgy) >= 0 ? 'right' : 'left';
        }
        this._target = { gx: next.gx, gy: next.gy, x: c.x, y: c.y };
    }
```

- [ ] **Step 5: Run tests, confirm they pass**

```
node --input-type=module -e "
  import('./src/test/harness.js').then(async harness => {
    await import('./src/core/Player.test.js');
    const r = await harness.runAll();
    const passed = r.filter(x => x.ok).length;
    const failed = r.length - passed;
    console.log(passed, 'passed,', failed, 'failed');
    for (const x of r.filter(y => !y.ok)) console.error(x.describe, '>', x.name, x.err.message);
  })
"
```

Expected: `4 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add src/core/Player.js src/core/Player.test.js tests.html
git commit -m "feat(player): add facing field, updated per step in _advanceTarget"
```

**Stage only those three files by name.** Do not `git add -A`.

---

## Task 2: Renderer flip-when-left

**Files:**
- Modify: `src/core/Renderer.js`

Wrap the PNG `drawImage` call in `_drawPlayer` with a left-facing horizontal flip. Cube branch unchanged (symmetric). No tests — pure rendering, can't unit-test without a canvas; visual smoke happens when a PNG lands per `docs/CHARACTER-PROMPTS.md`.

- [ ] **Step 1: Find and replace the PNG draw block**

In `src/core/Renderer.js`, find the existing PNG branch inside `_drawPlayer` (around line 954–971):

```js
        if (player.assetId) {
            const asset = getAsset(player.assetId);
            if (asset) {
                const feetY = player.y + TH / 2;
                const drawX = player.x - asset.anchorX;
                const drawY = feetY - asset.height;
                // Contact shadow first (under the feet, scales with sprite).
                ctx.save();
                ctx.globalAlpha *= 0.32;
                ctx.fillStyle = 'rgba(30, 22, 8, 1)';
                ctx.beginPath();
                ctx.ellipse(player.x, feetY, asset.width * 0.32, TH * 0.18, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                const src = asset.displayCanvas || asset.canvas;
                ctx.drawImage(src, drawX, drawY, asset.width, asset.height);
                return;
            }
            // Asset id set but PNG not loaded → drop through to the cube
            // fallback. Keeps `?character=miner` working even before the
            // PNG has been generated.
        }
```

Replace with:

```js
        if (player.assetId) {
            const asset = getAsset(player.assetId);
            if (asset) {
                const feetY = player.y + TH / 2;
                const drawX = player.x - asset.anchorX;
                const drawY = feetY - asset.height;
                // Contact shadow first (under the feet, scales with sprite).
                // The shadow is symmetric so it doesn't flip with facing.
                ctx.save();
                ctx.globalAlpha *= 0.32;
                ctx.fillStyle = 'rgba(30, 22, 8, 1)';
                ctx.beginPath();
                ctx.ellipse(player.x, feetY, asset.width * 0.32, TH * 0.18, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                const src = asset.displayCanvas || asset.canvas;
                if (player.facing === 'left') {
                    // Mirror around player.x. After scale(-1,1) the image's
                    // anchor pixel (originally anchorX from the left) is now
                    // (width - anchorX) from the visible left edge. To land
                    // it on player.x we draw at -(player.x + width - anchorX).
                    ctx.save();
                    ctx.scale(-1, 1);
                    ctx.drawImage(
                        src,
                        -(player.x + asset.width - asset.anchorX),
                        drawY,
                        asset.width,
                        asset.height,
                    );
                    ctx.restore();
                } else {
                    ctx.drawImage(src, drawX, drawY, asset.width, asset.height);
                }
                return;
            }
            // Asset id set but PNG not loaded → drop through to the cube
            // fallback. Keeps `?character=miner` working even before the
            // PNG has been generated.
        }
```

- [ ] **Step 2: Verify the file still parses**

```
node --check src/core/Renderer.js
```

Expected: silent success.

- [ ] **Step 3: Re-run the full test suite to make sure nothing else broke**

```
node --input-type=module -e "
  import('./src/test/harness.js').then(async harness => {
    await import('./src/characters/catalog.test.js');
    await import('./src/core/Player.test.js');
    await import('./src/lib/safeStorage.test.js');
    const r = await harness.runAll();
    const passed = r.filter(x => x.ok).length;
    const failed = r.length - passed;
    console.log(passed, 'passed,', failed, 'failed');
    for (const x of r.filter(y => !y.ok)) console.error(x.describe, '>', x.name, x.err.message);
  })
"
```

Expected: `14 passed, 0 failed` (10 catalog/storage from before + 4 new Player tests). DOM-dependent picker tests are skipped here — they need a real browser, which Phill will exercise via `tests.html`.

- [ ] **Step 4: Manual smoke (deferred to Phill once a PNG exists)**

We can't visually verify without a character PNG. The manual smoke when one lands:

1. Generate `player_miner.png` per `docs/CHARACTER-PROMPTS.md` and process it via `python3 tools/process_assets.py --pending`.
2. Open the app with `?character=miner` (or click Miner in the picker).
3. Click a tile to the west of the player. As the player walks left-on-screen, the sprite should appear horizontally mirrored.
4. Click a tile to the east. The sprite should un-mirror.
5. Confirm the player stays anchored at their grid position during the flip — no jump or drift sideways at the moment of direction change.

- [ ] **Step 5: Commit**

```bash
git add src/core/Renderer.js
git commit -m "feat(renderer): horizontally flip player sprite when facing left"
```

**Stage only `src/core/Renderer.js` by name.** Do not `git add -A`.

---

## Self-review notes

**Spec coverage:**
- §Heading projection / four-cardinals table → Task 1 Step 4 (the `(dgx - dgy) >= 0` formula). ✓
- §`Player.facing` default + per-step update → Task 1. ✓
- §Four focused tests → Task 1 Step 1. ✓
- §Renderer flip with anchor math → Task 2 Step 1. ✓
- §Cube branch unchanged → Task 2 leaves the cube path untouched. ✓
- §tests.html import → Task 1 Step 2. ✓
- §Edge case: PNG not loaded → existing fallthrough preserved in Task 2. ✓
- §Manual smoke after PNG generation → Task 2 Step 4. ✓

**Placeholder scan:** every code step has the full code. Every command step has the exact command and expected output. No TODO / TBD / "similar to" references.

**Type consistency:** `facing` is `'right' | 'left'` everywhere. `Player.setPath()` is the entry point used in tests and is the existing public method on Player. `_advanceTarget` is called by `setPath` (existing behaviour) and by `tick` on snap (also existing).
