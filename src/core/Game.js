/**
 * Game.js
 *
 * Top-level game controller. Owns the world (TileMap), camera, renderer,
 * input manager, placement system, and UI. Exposes a small intent API
 * (setTool, selectAsset, save, reset, …) consumed by the UI.
 */

import { CONFIG } from '../config.js';
import { Camera } from './Camera.js';
import { Renderer } from './Renderer.js';
import { InputManager } from './InputManager.js';
import { Player } from './Player.js';
import { TileMap } from '../grid/TileMap.js';
import { PlacementSystem } from '../building/PlacementSystem.js';
import { ASSET_INDEX, ASSET_MANIFEST } from '../assets/assetManifest.js';
import { SaveSystem } from '../storage/SaveSystem.js';
import { cellToScreen } from '../grid/IsoGrid.js';
import { findPath } from '../grid/Pathfinder.js';
import { isWalkable, isInteractable, findAdjacentWalkable } from '../grid/walkability.js';
import { OreState } from '../mining/OreState.js';
import { isOre, oreConfig, oreDisplayName } from '../mining/oreCatalog.js';
import { playPlacementFor, playMineHit, playMineDeplete } from '../ui/Audio.js';
import { recordMine } from '../mining/minedStore.js';
import { LocalMiningAdapter } from '../mining/miningAdapter.js';
import { safeStorage } from '../lib/safeStorage.js';

export class Game {
    constructor(canvas, ui = null) {
        this.canvas = canvas;
        this.tileMap = new TileMap();
        this.camera = new Camera();
        this.renderer = new Renderer(canvas, this.camera, this.tileMap);
        this.placement = new PlacementSystem(this.tileMap);
        this.input = new InputManager(canvas, this.camera, this);

        // Any camera mutation (pan/zoom/recenter) needs the next frame
        // re-rendered. The renderer itself is otherwise idle.
        this.camera.onChange(() => this.renderer.markDirty());

        // 'play' = walking miner game, click-to-walk/interact.
        // 'build' = legacy Mykonos builder, kept for property-zone work.
        // Main.js flips to 'build' when ?dev=1 is set.
        this.mode = 'play';

        // Player avatar — created lazily by main.js once procgen has run
        // and a walkable spawn cell exists. Game still functions without
        // one (build-mode hover/preview do not need a player).
        this.player = null;

        // Mining state keyed by PlacedObject.id. Populated by
        // populateOreStates() after procgen — kept side-band so the
        // renderer / save / placement systems stay mining-agnostic.
        this.oreStates = new Map();

        // Set by main.js after the chain-derived procgen seed is
        // resolved. String form of the epoch number (e.g. "14455"), or
        // null when the seed source was 'random' — in which case
        // recordMine no-ops because persistence is meaningless on a
        // non-deterministic world.
        this.currentEpoch = null;
        this.epochYieldModifier = 1;

        this.miningAdapter = new LocalMiningAdapter();
        this._pendingChainMines = new Set();

        // Ores currently mid-depletion. Entry value is the absolute ms
        // timestamp at which the obj should actually be removed from
        // the tilemap. Scheduling removal one frame *before* the anim
        // ends prevents a flicker where the static cache rebuilds and
        // briefly redraws the ore on the same frame it disappears.
        this._pendingDepletions = new Map();

        // Default selection
        this.tool = 'place';                  // 'place' | 'erase' | 'pan'
        this.category = 'terrain';
        this.selectedAssetId = ASSET_MANIFEST.find(a => a.category === 'terrain').id;
        this.ui = ui;

        // Frame-loop dt clock for player interpolation.
        this._lastFrameMs = performance.now();

        // Preview-only flip state for the current selection. Toggled by the
        // user (H / V) before commit; the values are baked into the
        // PlacedObject when the asset is placed.
        this.flipH = false;
        this.flipV = false;

        // Center camera over grid
        this._centerCamera();

        // Animation loop
        this._loop = this._loop.bind(this);
        requestAnimationFrame(this._loop);
    }

    _centerCamera() {
        const c = cellToScreen(this.tileMap.width / 2, this.tileMap.height / 2);
        const { innerWidth: w, innerHeight: h } = window;
        this.camera.centerOn(c.x, c.y, w, h);
    }

    /**
     * Place the player at (gx, gy) with an optional skin assetId. The
     * renderer will draw the asset PNG when loaded and fall back to
     * the placeholder cobalt cube when the asset isn't (yet) present.
     * No-op if the cell isn't walkable; the caller (main.js) is
     * expected to find a walkable spawn first.
     */
    spawnPlayer(gx, gy, opts = {}) {
        if (!isWalkable(this.tileMap, gx, gy)) return false;
        this.player = new Player({ gx, gy, assetId: opts.assetId ?? null });
        this.renderer.player = this.player;
        this.renderer.markDirty();
        // Recentre the camera on the player so first-frame UX is "you are
        // here" rather than "where is the map".
        const c = cellToScreen(gx + 0.5, gy + 0.5);
        const { innerWidth: w, innerHeight: h } = window;
        this.camera.centerOn(c.x, c.y, w, h);
        return true;
    }

    /* ── Intents from UI / input ──────────────────────────────── */

    setTool(t) {
        this.tool = t;
        this.renderer.eraseMode = (t === 'erase');
        this.canvas.style.cursor = t === 'pan' ? 'grab'
                                  : t === 'erase' ? 'crosshair'
                                  : 'crosshair';
        this.renderer.markDirty();
        this.ui?.update();
    }

    setCategory(cat) {
        if (this.category === cat) return;
        this.category = cat;
        // Auto-select first asset of that category.
        const first = ASSET_MANIFEST.find(a => a.category === cat);
        if (first) this.selectedAssetId = first.id;
        this._resetFlip();
        this.renderer.markDirty();
        this.ui?.update();
    }

    selectAsset(id) {
        const a = ASSET_INDEX[id];
        if (!a) return;
        const changed = this.selectedAssetId !== id;
        this.selectedAssetId = id;
        this.category = a.category;
        if (changed) this._resetFlip();
        // Picking an asset implies "place" mode.
        if (this.tool === 'erase') this.setTool('place');
        this.renderer.markDirty();
        this.ui?.update();
    }

    toggleFlipH() {
        this.flipH = !this.flipH;
        this._syncPreviewFlip();
        this.renderer.markDirty();
        this.ui?.showToast(`Flip horizontal: ${this.flipH ? 'on' : 'off'}`);
        this.ui?.update();
    }

    toggleFlipV() {
        this.flipV = !this.flipV;
        this._syncPreviewFlip();
        this.renderer.markDirty();
        this.ui?.showToast(`Flip vertical: ${this.flipV ? 'on' : 'off'}`);
        this.ui?.update();
    }

    _resetFlip() {
        this.flipH = false;
        this.flipV = false;
        this._syncPreviewFlip();
    }

    _syncPreviewFlip() {
        this.renderer.previewFlipH = this.flipH;
        this.renderer.previewFlipV = this.flipV;
    }

    toggleGrid() {
        this.renderer.showGrid = !this.renderer.showGrid;
        this.renderer.markDirty();
        this.ui?.hud?.syncToggles();
        this.ui?.update();
    }

    save() {
        const ok = SaveSystem.save(this.tileMap, this.camera);
        this.ui?.showToast(ok ? 'Saved your island' : 'Save failed');
    }

    load() {
        const ok = SaveSystem.load(this.tileMap, this.camera);
        if (ok) this.renderer.markDirty();
        return ok;
    }

    reset() {
        this.tileMap.clearAll();
        SaveSystem.clear();
        this._centerCamera();
        this.renderer.markDirty();
        this.ui?.showToast('World reset');
    }

    /**
     * Carpet the entire grid with grass in one click. Empty cells get a
     * fresh grass tile; cells whose terrain is already something else
     * (path, sand, water) are left alone so the user doesn't lose any
     * intentional terrain work. Each tile is queued through the same
     * staggered animation pipeline as the starter scene so the fill
     * ripples diagonally across the island instead of snapping in flat.
     *
     * Returns the number of cells that were actually filled.
     */
    fillGrass() {
        const W = this.tileMap.width;
        const H = this.tileMap.height;
        // Same wave timing as the starter scene reveal so the two feel
        // like one consistent visual language.
        const STEP_MS = 32;
        let filled = 0;
        for (let gy = 0; gy < H; gy++)
        for (let gx = 0; gx < W; gx++) {
            if (this.tileMap.getTerrain(gx, gy)) continue;
            if (this.placeAndAnimate('grass', gx, gy, { delay: (gx + gy) * STEP_MS })) {
                filled++;
            }
        }
        if (filled > 0) {
            // One sound at the start; the per-tile placement audio path
            // would fire ~196 times in a fraction of a second otherwise.
            playPlacementFor('grass');
            this.ui?.showToast(`Filled ${filled} ${filled === 1 ? 'tile' : 'tiles'} with grass`);
        } else {
            this.ui?.showToast('Grid already covered');
        }
        return filled;
    }

    /* ── Mouse callbacks (called by InputManager) ─────────────── */

    onHover(cell) {
        const prev = this.renderer.hoverCell;
        const sameCell = prev && prev.gx === cell.gx && prev.gy === cell.gy;
        this.renderer.hoverCell = cell;
        if (this.tool === 'erase') {
            this.renderer.previewAssetId = null;
            this.renderer.previewValid = !!this.tileMap.objectAt(cell.gx, cell.gy)
                || !!this.tileMap.getTerrain(cell.gx, cell.gy);
        } else if (this.tool === 'place') {
            this.renderer.previewAssetId = this.selectedAssetId;
            this.renderer.previewValid = this.placement.canPlace(this.selectedAssetId, cell.gx, cell.gy);
        } else {
            this.renderer.previewAssetId = null;
            this.renderer.previewValid = true;
        }
        // Only invalidate the next frame when the highlighted cell or its
        // validity actually changed. Hover events fire on every mousemove
        // pixel, so this matters.
        if (!sameCell) this.renderer.markDirty();
    }

    onPrimaryClick(gx, gy) {
        if (!this.tileMap.inBounds(gx, gy)) return;

        if (this.mode === 'play') {
            this._handlePlayClick(gx, gy);
            return;
        }

        if (this.tool === 'erase') {
            // Capture what's about to be removed so we can pick the right
            // SFX (water erase splashes, everything else thuds).
            const objHere = this.tileMap.objectAt(gx, gy);
            const terrainHere = this.tileMap.getTerrain(gx, gy);
            const targetId = objHere ? objHere.assetId : terrainHere;
            if (this.placement.erase(gx, gy)) {
                this.renderer.markDirty();
                playPlacementFor(targetId);
            }
        } else if (this.tool === 'place') {
            const result = this.placement.place(this.selectedAssetId, gx, gy, {
                flipH: this.flipH,
                flipV: this.flipV,
            });
            if (result?.kind === 'object') {
                const o = result.object;
                this.renderer.spawnAnim(`obj-${o.id}`, {
                    gx: o.gx,
                    gy: o.gy,
                    w: o.footprint?.w ?? 1,
                    d: o.footprint?.d ?? 1,
                });
                playPlacementFor(o.assetId);
            } else if (result?.kind === 'terrain') {
                this.renderer.spawnAnim(`t-${result.gx},${result.gy}`, {
                    gx: result.gx,
                    gy: result.gy,
                    w: 1,
                    d: 1,
                });
                playPlacementFor(result.assetId);
            }
        }
    }

    onSecondaryClick(gx, gy) {
        // In play mode the right-click / long-press has no use yet —
        // reserved for context actions (item swap, cancel walk). Block
        // the erase path so a stray right-click can't damage the world.
        if (this.mode === 'play') return;

        // Right click always erases.
        if (!this.tileMap.inBounds(gx, gy)) return;
        const objHere = this.tileMap.objectAt(gx, gy);
        const terrainHere = this.tileMap.getTerrain(gx, gy);
        const targetId = objHere ? objHere.assetId : terrainHere;
        if (this.placement.erase(gx, gy)) {
            this.renderer.markDirty();
            playPlacementFor(targetId);
        }
    }

    /* ── Play mode click handling ─────────────────────────────── */

    /**
     * Decide what a primary click in play mode means:
     *   - empty walkable tile → start walking there.
     *   - interactable object (ore, vendor) → walk to the closest
     *     adjacent walkable tile, then fire onInteract on arrival.
     *   - anything else (water, cypress, off-grid) → ignore.
     */
    _handlePlayClick(gx, gy) {
        if (!this.player) return;
        const p = this.player;

        if (isInteractable(this.tileMap, gx, gy)) {
            const adj = findAdjacentWalkable(this.tileMap, gx, gy, p.gx, p.gy);
            if (!adj) return;
            const path = findPath(this.tileMap, p.gx, p.gy, adj.gx, adj.gy);
            if (!path) return;
            p.setPath(path);
            this._pendingInteract = { gx, gy };
            this.renderer.markDirty();
            return;
        }

        if (!isWalkable(this.tileMap, gx, gy)) return;
        const path = findPath(this.tileMap, p.gx, p.gy, gx, gy);
        if (!path) return;
        p.setPath(path);
        this._pendingInteract = null;
        this.renderer.markDirty();
    }

    /**
     * Build an OreState for every ore PlacedObject currently in the
     * tileMap. Call once after procgen — capacity values are rolled
     * deterministically against the supplied rand fn so the same seed
     * always produces the same per-ore lifespan.
     */
    populateOreStates(rand = Math.random) {
        this.oreStates.clear();
        for (const obj of this.tileMap.objects) {
            if (!isOre(obj.assetId)) continue;
            const state = OreState.fromAsset(obj.assetId, rand);
            if (state) this.oreStates.set(obj.id, state);
        }
    }

    /**
     * Dispatch interaction with the tile the player just walked up to.
     * For ores → mine. For everything else (future: vendors, NPCs) →
     * log + toast stub.
     */
    onInteract(gx, gy) {
        const obj = this.tileMap.objectAt(gx, gy);
        if (obj && isOre(obj.assetId)) {
            this._mineOre(obj);
            return;
        }
        const name = obj ? obj.assetId : this.tileMap.getTerrain(gx, gy);
        // eslint-disable-next-line no-console
        console.log('[interact]', name, 'at', gx, gy);
        this.ui?.showToast?.(`Interact: ${name}`);
    }

    /**
     * One mining hit on an ore PlacedObject. Decrements its OreState,
     * credits the player's inventory, fires the juice (audio + FX),
     * and on depletion starts the crumble anim + schedules the actual
     * removal one frame before the anim ends (see _pendingDepletions).
     */
    _mineOre(obj) {
        const state = this.oreStates.get(obj.id);
        if (!state) return;
        // Suppress re-clicks against an ore that's mid-depletion — its
        // OreState still exists until the anim finishes, but capacity
        // is already 0 and we don't want to double-process.
        if (this._pendingDepletions.has(obj.id)) return;
        if (this._pendingChainMines.has(obj.id)) return;
        const result = state.mine(Math.random, { yieldMultiplier: this.epochYieldModifier });
        if (!result) return;

        if (this.miningAdapter?.canHandle?.(obj)) {
            this._mineOreViaChain(obj, state, result);
            return;
        }

        this._commitMinedOre(obj, state, result);
    }

    async _mineOreViaChain(obj, state, result) {
        const beforeCapacity = state.capacityRemaining + 1;
        this._pendingChainMines.add(obj.id);
        this.ui?.showToast?.('Preparing mining transaction', 1800);
        try {
            let out;
            try {
                out = await this.miningAdapter.mine({
                    game: this,
                    epoch: this.currentEpoch,
                    obj,
                    state,
                    result,
                });
            } catch (err) {
                out = {
                    ok: false,
                    message: err?.message || 'Mining transaction failed',
                };
            }
            if (!out.ok) {
                state.restoreCapacity(beforeCapacity);
                this.ui?.showToast?.(out.message || 'Mining transaction cancelled', 2400);
                this.renderer.markDirty();
                return;
            }
            this.ui?.showToast?.(
                out.txHash ? `Mining tx ${out.txHash.slice(0, 12)}...` : 'Mining transaction submitted',
                2200,
            );
            this._commitMinedOre(obj, state, result);
        } finally {
            this._pendingChainMines.delete(obj.id);
        }
    }

    _commitMinedOre(obj, state, result) {
        this.player?.inventory.add(result.currency, result.amount);
        // Persist remaining capacity per (epoch, position) so a reload
        // mid-epoch can't reset the ore. No-op when currentEpoch is
        // null (random seed path — non-deterministic world).
        recordMine(safeStorage, this.currentEpoch, obj.gx, obj.gy, state.capacityRemaining);

        const cfg = oreConfig(result.currency);
        const dustColor = cfg?.dustColor ?? '#9d8e74';
        const textColor = cfg?.textColor ?? '#1b5ba8';
        const c = cellToScreen(obj.gx + 0.5, obj.gy + 0.5);

        if (result.depleted) {
            // Bigger burst + the staggered double-thud for the crumble.
            this.renderer.spawnFloatingText(c.x, c.y - 12, `+${result.amount}`, {
                color: textColor,
                durationMs: 1000,
                rise: 36,
                font: 'bold 16px system-ui, sans-serif',
            });
            this.renderer.spawnDustPuff(c.x, c.y, {
                color: dustColor,
                count: 12,
                speed: 90,
                durationMs: 800,
                sizeRange: [2, 5],
            });
            playMineDeplete();
            this._startDepletion(obj);
        } else {
            this.renderer.spawnFloatingText(c.x, c.y - 8, `+${result.amount}`, {
                color: textColor,
            });
            this.renderer.spawnDustPuff(c.x, c.y, { color: dustColor });
            playMineHit();
            this.renderer.markDirty();
        }
    }

    /**
     * Kick off the crumble animation on an ore and queue its actual
     * removal one frame before the anim ends. The renderer treats the
     * obj as "animating" for the whole duration (static cache skips
     * it), so the live overlay's shrink+fade draw is what the player
     * sees; once the anim completes the obj is already gone from
     * `tileMap.objects` and the rebuilt static cache reflects that.
     */
    _startDepletion(obj) {
        const DURATION = 450;
        this.renderer.spawnAnim(`deplete-${obj.id}`, null, DURATION);
        // Schedule the actual tilemap removal ~one RAF tick before the
        // anim end so the cache rebuild triggered by the anim's
        // completion sees the obj already gone.
        this._pendingDepletions.set(obj.id, {
            removeAtMs: performance.now() + DURATION - 16,
            gx: obj.gx,
            gy: obj.gy,
        });
        this.renderer.markDirty();
    }

    /**
     * Place an asset and queue its elastic placement animation, optionally
     * delayed by `opts.delay` milliseconds. Used by the starter-scene
     * reveal to ripple the seeded village in back-to-front so first-run
     * players see the world build itself instead of just appearing.
     *
     * Returns the placement result (or null if the placement was rejected).
     */
    placeAndAnimate(assetId, gx, gy, opts = {}) {
        const result = this.placement.place(assetId, gx, gy, {
            flipH: !!opts.flipH,
            flipV: !!opts.flipV,
        });
        if (!result) return null;
        const startAt = performance.now() + (opts.delay ?? 0);
        const duration = opts.duration ?? 460;
        if (result.kind === 'object') {
            const o = result.object;
            this.renderer.spawnAnim(`obj-${o.id}`, {
                gx: o.gx,
                gy: o.gy,
                w: o.footprint?.w ?? 1,
                d: o.footprint?.d ?? 1,
            }, duration, startAt);
        } else if (result.kind === 'terrain') {
            this.renderer.spawnAnim(`t-${result.gx},${result.gy}`, {
                gx: result.gx,
                gy: result.gy,
                w: 1,
                d: 1,
            }, duration, startAt);
        }
        return result;
    }

    /* ── Frame loop ───────────────────────────────────────────── */

    _loop() {
        // The renderer skips its own work when nothing has changed and
        // there are no animations running, so this loop is effectively
        // free at idle. We still keep `requestAnimationFrame` ticking so
        // we resume instantly when input or animations resume.
        const now = performance.now();
        const dt = Math.min(0.1, (now - this._lastFrameMs) / 1000);
        this._lastFrameMs = now;

        if (this.player) {
            if (this.player.isMoving()) {
                this.player.tick(dt);
                this.renderer.markDirty();
            }
            // Fire pending interact whenever the player is idle — covers
            // both "just arrived from a walk" and "clicked an ore while
            // already standing next to it" (zero-length path).
            if (!this.player.isMoving() && this._pendingInteract) {
                const { gx, gy } = this._pendingInteract;
                this._pendingInteract = null;
                this.onInteract(gx, gy);
            }
        }

        // Process queued ore removals (deplete-anim almost done).
        if (this._pendingDepletions.size > 0) {
            const tNow = now;
            for (const [id, entry] of this._pendingDepletions) {
                if (tNow < entry.removeAtMs) continue;
                this.tileMap.removeObjectAt(entry.gx, entry.gy);
                this.oreStates.delete(id);
                this._pendingDepletions.delete(id);
                this.renderer.markDirty();
            }
        }

        this.renderer.draw();
        requestAnimationFrame(this._loop);
    }
}
