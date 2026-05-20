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
import { PlacedObject } from '../building/PlacedObject.js';
import { ASSET_MANIFEST } from '../assets/assetManifest.js';
import {
    allAssetDefinitions,
    assetDefinitionFor,
} from '../assets/assetRegistry.js';
import { SaveSystem } from '../storage/SaveSystem.js';
import { cellToScreen } from '../grid/IsoGrid.js';
import { findPath } from '../grid/Pathfinder.js';
import { isWalkable, isInteractable, findAdjacentWalkable } from '../grid/walkability.js';
import { OreState } from '../mining/OreState.js';
import { formatCurrencyAmount, splitUsdBudget } from '../mining/cryptoEconomy.js';
import { isOre, oreConfig } from '../mining/oreCatalog.js';
import { playPlacementFor, playMineHit, playMineDeplete } from '../ui/Audio.js';
import { CELL_CURSORS } from '../ui/cursors.js';
import { recordMine } from '../mining/minedStore.js';
import { LocalMiningAdapter } from '../mining/miningAdapter.js';
import { safeStorage } from '../lib/safeStorage.js';
import {
    addMinePropertyPortal,
    canEditPropertyCell,
    canPlacePropertyAsset,
    createStarterPropertyMap,
    footprintWithinBounds,
    MINE_PROPERTY_PORTAL_ROLE,
    PROPERTY_MINE_PORTAL_ROLE,
    PROPERTY_SPAWN,
    isStarterPropertyAsset,
} from '../property/propertyZone.js';
import {
    clearPropertyZone,
} from '../property/propertyStore.js';
import { LocalPropertySnapshotAdapter } from '../property/propertySnapshotAdapter.js';
import {
    formatPropertySnapshotSaveStatus,
    LocalStoragePropertySnapshotWriter,
    savePropertyZoneWithSnapshotWriter,
} from '../property/propertySnapshotWriter.js';
import {
    canAffordExpansion,
    formatExpansionCost,
    nextPropertyTier,
    propertyBoundsForTier,
    propertyExpansionPreview,
    propertyTierSummary,
    spendExpansionCost,
} from '../property/propertyExpansion.js';
import {
    loadPropInventory,
    savePropInventory,
} from '../property/propInventory.js';
import { LocalInventoryAdapter } from '../inventory/inventoryAdapter.js';
import { propertyVisitLabel } from '../visiting/propertyVisit.js';
import { buildVisitUrl, visitLinkSourceFromSnapshot } from '../visiting/visitLinks.js';
import { loadWalletIdentity } from '../wallet/walletIdentity.js';
import {
    buyStoreItem,
    formatStorePrice,
    generalStoreItem,
} from '../store/generalStoreCatalog.js';
import {
    buyMarketplaceListing,
    cancelMarketplaceListing,
    createMarketplaceListing,
    loadMarketplaceState,
    marketplaceListings,
    saveMarketplaceState,
} from '../marketplace/playerMarketplace.js';
import {
    createMapRegistry,
    entrySpawnForMap,
    mapByKind,
    mapById,
    mineMapIdForEpoch,
    travelTargetForRole,
} from '../maps/mapRegistry.js';

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
        this.mapKind = 'mine';
        this.currentMapId = mineMapIdForEpoch(null);
        this.mapRegistry = createMapRegistry();
        this._mapRuntime = new Map();
        this._mapListeners = new Set();
        this._marketplaceListeners = new Set();
        this.propertyTier = 1;
        this.propertyOwner = 'local';
        this.propertyReadOnly = false;
        this.propertySnapshotSource = 'local';
        this.propertySnapshotStatus = 'missing';
        this.propertySnapshotStale = false;
        this.propertySnapshotAdapter = new LocalPropertySnapshotAdapter({ storage: safeStorage });
        this.propertySnapshotWriter = new LocalStoragePropertySnapshotWriter({ storage: safeStorage });
        this.propertySnapshotSaveResult = null;
        this.propInventory = loadPropInventory(safeStorage);
        this.inventoryAdapter = new LocalInventoryAdapter({
            props: this.propInventory,
        });
        this.marketplaceState = loadMarketplaceState(safeStorage);
        this.propInventory.onChange(() => {
            savePropInventory(safeStorage, this.propInventory);
            this.ui?.update();
            this.renderer.markDirty();
        });

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
        this.priceSnapshot = null;

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

    _centerCameraOnCell(gx, gy) {
        const c = cellToScreen(gx + 0.5, gy + 0.5);
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
        this.inventoryAdapter = new LocalInventoryAdapter({
            currencies: this.player.inventory,
            props: this.propInventory,
        });
        this.renderer.player = this.player;
        this.renderer.markDirty();
        // Recentre the camera on the player so first-frame UX is "you are
        // here" rather than "where is the map".
        const c = cellToScreen(gx + 0.5, gy + 0.5);
        const { innerWidth: w, innerHeight: h } = window;
        this.camera.centerOn(c.x, c.y, w, h);
        return true;
    }

    readInventory() {
        return this.inventoryAdapter.read();
    }

    movePlayerTo(gx, gy) {
        if (!this.player || !isWalkable(this.tileMap, gx, gy)) return false;
        const c = cellToScreen(gx + 0.5, gy + 0.5);
        this.player.gx = gx;
        this.player.gy = gy;
        this.player.x = c.x;
        this.player.y = c.y;
        this.player.setPath([]);
        this.renderer.markDirty();
        this._centerCameraOnCell(gx, gy);
        return true;
    }

    /* ── Intents from UI / input ──────────────────────────────── */

    setTool(t) {
        if (this.isVisitingProperty() && t !== 'pan') t = 'pan';
        this.tool = t;
        this.renderer.eraseMode = (t === 'erase');
        this.canvas.style.cursor = t === 'pan' ? CELL_CURSORS.pan
                                  : t === 'erase' ? CELL_CURSORS.erase
                                  : CELL_CURSORS.place;
        this.renderer.markDirty();
        this.ui?.update();
    }

    setCategory(cat) {
        if (this.category === cat) return;
        this.category = cat;
        // Auto-select first asset of that category.
        const first = allAssetDefinitions().find(a => a.category === cat);
        if (first) this.selectedAssetId = first.id;
        this._resetFlip();
        this.renderer.markDirty();
        this.ui?.update();
    }

    selectAsset(id) {
        const a = assetDefinitionFor(id);
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

    async save() {
        if (this.mapKind === 'property') {
            if (this.propertyReadOnly) {
                this.ui?.showToast('Visited properties are read-only');
                return false;
            }
            const result = await this._savePropertyWithSnapshot();
            const ok = result.ok;
            this.ui?.showToast(formatPropertySnapshotSaveStatus(result), ok ? 2200 : 1800);
            return ok;
        }
        const ok = SaveSystem.save(this.tileMap, this.camera);
        this.ui?.showToast(ok ? 'Saved your map' : 'Save failed');
        return ok;
    }

    load() {
        const ok = SaveSystem.load(this.tileMap, this.camera);
        if (ok) this.renderer.markDirty();
        return ok;
    }

    reset() {
        if (this.mapKind === 'property') {
            if (this.propertyReadOnly) {
                this.ui?.showToast('Visited properties are read-only');
                return;
            }
            clearPropertyZone(safeStorage);
            this._loadPropertyMap(null);
            this.ui?.showToast('Property reset');
            return;
        }
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
            this.ui?.showToast('Claim already covered');
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
            this.renderer.previewValid = this.mapKind === 'property'
                ? this._canErasePropertyAt(cell.gx, cell.gy)
                : !!this.tileMap.objectAt(cell.gx, cell.gy)
                    || !!this.tileMap.getTerrain(cell.gx, cell.gy);
        } else if (this.tool === 'place') {
            this.renderer.previewAssetId = this.selectedAssetId;
            this.renderer.previewValid = this.mapKind === 'property'
                ? this._canPlacePropertyAt(this.selectedAssetId, cell.gx, cell.gy)
                : this.placement.canPlace(this.selectedAssetId, cell.gx, cell.gy);
        } else {
            this.renderer.previewAssetId = null;
            this.renderer.previewValid = true;
        }
        this._syncCursorForCell(cell);
        // Only invalidate the next frame when the highlighted cell or its
        // validity actually changed. Hover events fire on every mousemove
        // pixel, so this matters.
        if (!sameCell) this.renderer.markDirty();
    }

    onPrimaryClick(gx, gy) {
        if (!this.tileMap.inBounds(gx, gy)) return;

        if (this.mapKind === 'property') {
            this._handlePropertyClick(gx, gy);
            return;
        }

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
        if (this.mapKind === 'property' && !this._canErasePropertyAt(gx, gy)) return;
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

    _handlePropertyClick(gx, gy) {
        if (this.propertyReadOnly) {
            this.tool = 'pan';
            this._handlePlayClick(gx, gy);
            return;
        }
        if (this.tool === 'pan') {
            this._handlePlayClick(gx, gy);
            return;
        }
        if (this.tool === 'erase') {
            if (!this._canErasePropertyAt(gx, gy)) return;
            const objHere = this.tileMap.objectAt(gx, gy);
            const terrainHere = this.tileMap.getTerrain(gx, gy);
            const targetId = objHere ? objHere.assetId : terrainHere;
            if (this.placement.erase(gx, gy)) {
                if (objHere && !isStarterPropertyAsset(objHere.assetId)) {
                    this.propInventory.add(objHere.assetId, 1);
                }
                this.renderer.markDirty();
                playPlacementFor(targetId);
                this._autosaveProperty();
            }
            return;
        }

        if (!this._canPlacePropertyAt(this.selectedAssetId, gx, gy)) {
            this.ui?.showToast?.(this._propertyPlacementBlockedMessage(this.selectedAssetId, gx, gy));
            return;
        }
        const result = this.placement.place(this.selectedAssetId, gx, gy, {
            flipH: this.flipH,
            flipV: this.flipV,
        });
        if (result?.kind === 'object') {
            const o = result.object;
            if (!isStarterPropertyAsset(o.assetId)) this.propInventory.consume(o.assetId, 1);
            this.renderer.spawnAnim(`obj-${o.id}`, {
                gx: o.gx,
                gy: o.gy,
                w: o.footprint?.w ?? 1,
                d: o.footprint?.d ?? 1,
            });
            playPlacementFor(o.assetId);
            this._autosaveProperty();
        } else if (result?.kind === 'terrain') {
            this.renderer.spawnAnim(`t-${result.gx},${result.gy}`, {
                gx: result.gx,
                gy: result.gy,
                w: 1,
                d: 1,
            });
            playPlacementFor(result.assetId);
            this._autosaveProperty();
        }
    }

    _canPlacePropertyAt(assetId, gx, gy) {
        if (this.propertyReadOnly) return false;
        const bounds = this._propertyBounds();
        return canPlacePropertyAsset(assetId, gx, gy, bounds, {
            isOwned: id => this.propInventory.get(id) > 0,
        })
            && this.placement.canPlace(assetId, gx, gy);
    }

    _propertyPlacementBlockedMessage(assetId, gx, gy) {
        if (this.propertyReadOnly) return 'Visited properties are read-only';
        const bounds = this._propertyBounds();
        if (!footprintWithinBounds(assetId, gx, gy, bounds)) {
            return 'That spot is outside your claim';
        }
        if (!isStarterPropertyAsset(assetId) && this.propInventory.get(assetId) <= 0) {
            const item = generalStoreItem(assetId);
            return item ? `Buy ${item.name} at the store` : 'That prop is not owned';
        }
        return 'That spot is blocked';
    }

    _canErasePropertyAt(gx, gy) {
        if (this.propertyReadOnly) return false;
        const bounds = this._propertyBounds();
        const obj = this.tileMap.objectAt(gx, gy);
        if (obj?.role) return false;
        if (obj) {
            const fp = obj.footprint || { w: 1, d: 1 };
            for (let ix = 0; ix < fp.w; ix++)
            for (let iy = 0; iy < fp.d; iy++) {
                if (!canEditPropertyCell(obj.gx + ix, obj.gy + iy, bounds)) return false;
            }
            return true;
        }
        return canEditPropertyCell(gx, gy, bounds) && !!this.tileMap.getTerrain(gx, gy);
    }

    _propertyBounds() {
        return propertyBoundsForTier(this.propertyTier);
    }

    _syncCursorForCell(cell) {
        if (!this.tileMap.inBounds(cell.gx, cell.gy)) {
            this.canvas.style.cursor = CELL_CURSORS.blocked;
            return;
        }
        if (this.tool === 'pan') {
            this.canvas.style.cursor = CELL_CURSORS.pan;
            return;
        }
        if (this.mapKind === 'property') {
            if (this.tool === 'erase') {
                this.canvas.style.cursor = this._canErasePropertyAt(cell.gx, cell.gy)
                    ? CELL_CURSORS.erase
                    : CELL_CURSORS.blocked;
                return;
            }
            this.canvas.style.cursor = this._canPlacePropertyAt(this.selectedAssetId, cell.gx, cell.gy)
                ? CELL_CURSORS.place
                : CELL_CURSORS.blocked;
            return;
        }

        const obj = this.tileMap.objectAt(cell.gx, cell.gy);
        if (obj && isOre(obj.assetId)) {
            this.canvas.style.cursor = CELL_CURSORS.mine;
        } else if (isInteractable(this.tileMap, cell.gx, cell.gy)) {
            this.canvas.style.cursor = CELL_CURSORS.interact;
        } else if (isWalkable(this.tileMap, cell.gx, cell.gy)) {
            this.canvas.style.cursor = CELL_CURSORS.walk;
        } else {
            this.canvas.style.cursor = CELL_CURSORS.blocked;
        }
    }

    /**
     * Build an OreState for every ore PlacedObject currently in the
     * tileMap. Call once after procgen — capacity values are rolled
     * deterministically against the supplied rand fn so the same seed
     * always produces the same per-ore lifespan.
     */
    populateOreStates(rand = Math.random, opts = {}) {
        this.oreStates.clear();
        const oreObjects = this.tileMap.objects.filter(obj => isOre(obj.assetId));
        const budgets = Number.isFinite(opts.totalClearValueUsd)
            ? splitUsdBudget(opts.totalClearValueUsd, oreObjects.length, rand)
            : null;
        for (let i = 0; i < oreObjects.length; i++) {
            const obj = oreObjects[i];
            const state = OreState.fromAsset(obj.assetId, rand, budgets
                ? { ...opts, totalValueUsd: budgets[i] }
                : opts);
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
        if (obj?.role === MINE_PROPERTY_PORTAL_ROLE) {
            this.travelToMapRole(obj.role);
            return;
        }
        if (obj?.role === PROPERTY_MINE_PORTAL_ROLE) {
            this.travelToMapRole(obj.role);
            return;
        }
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
        const result = state.mine(Math.random, {
            yieldMultiplier: this.epochYieldModifier,
            priceSnapshot: this.priceSnapshot,
        });
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

        const cfg = oreConfig(result.oreType);
        const dustColor = cfg?.dustColor ?? '#9d8e74';
        const textColor = cfg?.textColor ?? '#1b5ba8';
        const rewardText = `+${formatCurrencyAmount(result.currency, result.amount)}`;
        const c = cellToScreen(obj.gx + 0.5, obj.gy + 0.5);
        this.renderer.spawnPlayerStrike(c.x, c.y, { color: dustColor });

        if (result.depleted) {
            // Bigger burst + the staggered double-thud for the crumble.
            this.renderer.spawnFloatingText(c.x, c.y - 12, rewardText, {
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
            this.renderer.spawnAnim(`mine-${obj.id}`, {
                gx: obj.gx,
                gy: obj.gy,
                w: obj.footprint?.w ?? 1,
                d: obj.footprint?.d ?? 1,
            }, 260);
            this.renderer.spawnFloatingText(c.x, c.y - 8, rewardText, {
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
     * it), so the live overlay's chunked crumble draw is what the player
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

    ensureMinePropertyPortal(nearCell) {
        if (this.tileMap.objects.some(o => o.role === MINE_PROPERTY_PORTAL_ROLE)) return null;
        const obj = addMinePropertyPortal(this.tileMap, nearCell);
        if (obj) {
            this.renderer.spawnAnim(`obj-${obj.id}`, {
                gx: obj.gx,
                gy: obj.gy,
                w: obj.footprint?.w ?? 1,
                d: obj.footprint?.d ?? 1,
            }, 520);
            this.renderer.markDirty();
        }
        return obj;
    }

    configureMapRegistry(opts = {}) {
        this.mapRegistry = createMapRegistry(opts);
        const property = mapByKind(this.mapRegistry, 'property');
        if (property?.ownerId) this.propertyOwner = property.ownerId;
        const mine = mapByKind(this.mapRegistry, 'mine');
        if (this.mapKind === 'mine' && mine) this.currentMapId = mine.id;
        this._emitMapChange();
    }

    travelToMapRole(role) {
        const target = travelTargetForRole(role, this.mapRegistry);
        if (!target) return false;
        return this.travelToMap(target.id);
    }

    async travelToMap(mapId) {
        const target = mapById(this.mapRegistry, mapId);
        if (!target) {
            this.ui?.showToast?.('Map is not available');
            return false;
        }
        if (target.id === this.currentMapId) return true;
        if (target.kind === 'property') {
            await this.travelToProperty({
                ownerId: target.ownerId ?? 'local',
                readOnly: !!target.readOnly,
            });
            return true;
        }
        if (target.kind === 'mine') {
            this.travelToMine();
            return true;
        }
        this.ui?.showToast?.('Map is not available');
        return false;
    }

    async travelToProperty(opts = {}) {
        const propertyDef = mapByKind(this.mapRegistry, 'property');
        const ownerId = opts.ownerId ?? propertyDef?.ownerId ?? 'local';
        const readOnly = !!(opts.readOnly ?? propertyDef?.readOnly);
        if (this.mapKind === 'property'
            && this.propertyOwner === ownerId
            && this.propertyReadOnly === readOnly) return;
        if (this.mapKind !== 'property') this._mapRuntime.set(this.currentMapId, this._captureRuntime());
        const read = await this._readPropertySnapshot(ownerId);
        this._loadPropertyMap(read.snapshot, {
            ownerId,
            readOnly,
            snapshotSource: read.source,
            snapshotStatus: read.status,
            snapshotStale: read.stale,
        });
        const visitStatus = read.status === 'found'
            ? `Visiting ${propertyVisitLabel(ownerId)}`
            : `Visiting ${propertyVisitLabel(ownerId)} · ${read.status === 'stale' ? 'snapshot pending' : 'starter view'}`;
        this.ui?.showToast?.(readOnly ? visitStatus : 'Welcome home', 1800);
    }

    async visitProperty(ownerId) {
        if (!ownerId) return false;
        const mine = mapByKind(this.mapRegistry, 'mine');
        this.mapRegistry = createMapRegistry({
            epoch: this.currentEpoch,
            propertyOwner: ownerId,
            propertyReadOnly: true,
            mineSpawn: mine?.entrySpawn ?? null,
        });
        await this.travelToProperty({ ownerId, readOnly: true });
        return true;
    }

    async setHomePropertyOwner(ownerId = 'local', { toast = false } = {}) {
        const nextOwner = ownerId || 'local';
        const alreadyHome = this.mapKind === 'property'
            && this.propertyOwner === nextOwner
            && !this.propertyReadOnly;
        if (alreadyHome) {
            if (toast) this.ui?.showToast?.(homeOwnerToast(nextOwner), 1600);
            return { ok: true, ownerId: nextOwner, changed: false };
        }

        if (this.mapKind === 'property' && !this.propertyReadOnly) this._autosaveProperty();
        const mine = mapByKind(this.mapRegistry, 'mine');
        this.mapRegistry = createMapRegistry({
            epoch: this.currentEpoch,
            propertyOwner: nextOwner,
            propertyReadOnly: false,
            mineSpawn: mine?.entrySpawn ?? null,
        });

        if (this.mapKind === 'property') {
            await this.travelToProperty({ ownerId: nextOwner, readOnly: false });
        } else {
            this.propertyOwner = nextOwner;
            this.propertyReadOnly = false;
            this.propertySnapshotSource = 'local';
            this.propertySnapshotStatus = 'missing';
            this.propertySnapshotStale = false;
            this._emitMapChange();
            this.ui?.update();
        }

        if (toast) this.ui?.showToast?.(homeOwnerToast(nextOwner), 1800);
        return { ok: true, ownerId: nextOwner, changed: true };
    }

    travelToMine() {
        if (this.mapKind !== 'property') return;
        if (!this.propertyReadOnly) this._autosaveProperty();
        const mineDef = mapByKind(this.mapRegistry, 'mine');
        const mineId = mineDef?.id ?? mineMapIdForEpoch(this.currentEpoch);
        const mine = this._mapRuntime.get(mineId);
        if (!mine) {
            this.ui?.showToast?.('Mine map is not loaded');
            return;
        }
        this._restoreRuntime(mine);
        this.mapKind = 'mine';
        this.propertyReadOnly = false;
        this.currentMapId = mineId;
        this.mode = 'play';
        this._syncPropertyExpansionPreview();
        this._syncBodyModeClass();
        this._emitMapChange();
        this.ui?.showToast?.('Back to the mine', 1600);
    }

    isAssetVisibleInPalette(assetId) {
        if (assetId.startsWith('player_') && assetId.endsWith('_back')) return false;
        return this.mapKind !== 'property'
            || isStarterPropertyAsset(assetId)
            || this.propInventory.get(assetId) > 0;
    }

    assetName(assetId) {
        return assetDefinitionFor(assetId)?.name ?? assetId;
    }

    propertyExpansionState() {
        const summary = propertyTierSummary(this.propertyTier);
        const next = nextPropertyTier(this.propertyTier);
        return {
            ...summary,
            ownerId: this.propertyOwner,
            readOnly: this.propertyReadOnly,
            snapshotSource: this.propertySnapshotSource,
            snapshotStatus: this.propertySnapshotStatus,
            snapshotStale: this.propertySnapshotStale,
            saveStatus: this.propertySnapshotSaveStatus(),
            next: this.propertyReadOnly ? null : next,
            canAffordNext: !this.propertyReadOnly && canAffordExpansion(this.player?.inventory, this.propertyTier),
            nextCostLabel: next?.cost ? formatExpansionCost(next.cost) : 'Max tier',
        };
    }

    propertySnapshotSaveStatus({ compact = true } = {}) {
        if (!this.propertySnapshotSaveResult) return null;
        return {
            ...this.propertySnapshotSaveResult,
            label: formatPropertySnapshotSaveStatus(this.propertySnapshotSaveResult, { compact }),
        };
    }

    unlockNextPropertyTier() {
        if (this.mapKind !== 'property') return { ok: false, reason: 'not-property' };
        if (this.propertyReadOnly) {
            this.ui?.showToast?.('Visited properties are read-only', 2200);
            return { ok: false, reason: 'read-only' };
        }
        const result = spendExpansionCost(this.player?.inventory, this.propertyTier);
        if (!result.ok) {
            const next = result.next ?? nextPropertyTier(this.propertyTier);
            const cost = next?.cost ? formatExpansionCost(next.cost) : 'Max tier';
            const message = result.reason === 'max-tier'
                ? 'Claim is fully expanded'
                : `Need ${cost} to expand`;
            this.ui?.showToast?.(message, 2200);
            return result;
        }

        this.propertyTier = result.tier;
        this._syncPropertyExpansionPreview();
        this._autosaveProperty();
        this.renderer.markDirty();
        this._emitMapChange();
        this.ui?.showToast?.(`Expanded to ${propertyTierSummary(this.propertyTier).name}`, 2200);
        return result;
    }

    buyGeneralStoreItem(assetId) {
        const item = generalStoreItem(assetId);
        const result = buyStoreItem({
            assetId,
            inventory: this.player?.inventory,
            propInventory: this.propInventory,
            propertyTier: this.propertyTier,
        });
        if (!result.ok) {
            if (result.reason === 'locked-tier') {
                this.ui?.showToast?.(`Unlock Tier ${item?.unlockTier ?? '?'} first`, 2200);
            } else if (result.reason === 'insufficient-funds') {
                this.ui?.showToast?.(`Need ${item ? formatStorePrice(item) : 'more CKB'}`, 2200);
            } else {
                this.ui?.showToast?.('Store purchase failed', 1800);
            }
            return result;
        }
        this.ui?.showToast?.(`Bought ${result.item.name}`, 1800);
        this.ui?.update();
        return result;
    }

    marketplaceListings() {
        return marketplaceListings(this.marketplaceState);
    }

    listMarketplaceItem({ assetId, price, account }) {
        const result = createMarketplaceListing({
            assetId,
            price,
            seller: account,
            propInventory: this.propInventory,
            state: this.marketplaceState,
        });
        if (!result.ok) {
            this.ui?.showToast?.(marketplaceFailureMessage(result.reason), 2200);
            return result;
        }
        this._saveMarketplace();
        this.ui?.showToast?.(`Listed ${result.listing.name}`, 1800);
        return result;
    }

    buyMarketplaceListing(listingId, account) {
        const result = buyMarketplaceListing({
            listingId,
            buyer: account,
            inventory: this.player?.inventory,
            propInventory: this.propInventory,
            state: this.marketplaceState,
        });
        if (!result.ok) {
            this.ui?.showToast?.(marketplaceFailureMessage(result.reason), 2200);
            return result;
        }
        this._saveMarketplace();
        this.ui?.showToast?.(`Bought ${result.listing.name}`, 1800);
        return result;
    }

    cancelMarketplaceListing(listingId, account) {
        const result = cancelMarketplaceListing({
            listingId,
            seller: account,
            propInventory: this.propInventory,
            state: this.marketplaceState,
        });
        if (!result.ok) {
            this.ui?.showToast?.(marketplaceFailureMessage(result.reason), 2200);
            return result;
        }
        this._saveMarketplace();
        this.ui?.showToast?.(`Canceled ${result.listing.name}`, 1800);
        return result;
    }

    onMarketplaceChange(cb) {
        this._marketplaceListeners.add(cb);
        return () => this._marketplaceListeners.delete(cb);
    }

    _saveMarketplace() {
        saveMarketplaceState(safeStorage, this.marketplaceState);
        for (const cb of this._marketplaceListeners) cb(this.marketplaceListings());
        this.ui?.update();
        this.renderer.markDirty();
    }

    onMapChange(cb) {
        this._mapListeners.add(cb);
        return () => this._mapListeners.delete(cb);
    }

    async _readPropertySnapshot(ownerId) {
        if (this.propertySnapshotAdapter?.read) {
            try {
                return await this.propertySnapshotAdapter.read({ ownerId });
            } catch (err) {
                console.warn('[cellshire] property snapshot read failed', err);
            }
        }
        return {
            source: 'unknown',
            ownerId,
            status: 'missing',
            stale: false,
            snapshot: null,
        };
    }

    _loadPropertyMap(saved, opts = {}) {
        const propertyDef = mapByKind(this.mapRegistry, 'property');
        const entrySpawn = entrySpawnForMap(propertyDef, PROPERTY_SPAWN);
        const starter = saved ? null : createStarterPropertyMap();
        const tileMapData = saved?.tileMap ?? starter.serialize();
        this.tileMap.deserialize(tileMapData, d => new PlacedObject(d));
        this.propertyTier = saved?.propertyTier ?? 1;
        this.propertyOwner = opts.ownerId ?? propertyDef?.ownerId ?? saved?.ownerId ?? 'local';
        this.propertyReadOnly = !!opts.readOnly;
        this.propertySnapshotSource = opts.snapshotSource ?? 'local';
        this.propertySnapshotStatus = opts.snapshotStatus ?? (saved ? 'found' : 'missing');
        this.propertySnapshotStale = !!opts.snapshotStale;
        this.oreStates.clear();
        this._pendingInteract = null;
        this._pendingDepletions.clear();
        this.currentEpoch = null;
        this.priceSnapshot = null;
        this.currentMapId = propertyDef?.id ?? 'property:local';
        this.mapKind = 'property';
        this.mode = this.propertyReadOnly ? 'visit' : 'property';
        this.selectedAssetId = isStarterPropertyAsset(this.selectedAssetId)
            ? this.selectedAssetId
            : 'path';
        this.category = assetDefinitionFor(this.selectedAssetId)?.category ?? 'terrain';
        this.tool = this.propertyReadOnly ? 'pan' : 'place';
        this._resetFlip();
        this.renderer.markDirty();
        this.movePlayerTo(entrySpawn.gx, entrySpawn.gy);
        if (saved?.camera) {
            this.camera.offsetX = saved.camera.offsetX;
            this.camera.offsetY = saved.camera.offsetY;
            this.camera.zoom = saved.camera.zoom;
        }
        this._syncBodyModeClass();
        this._syncPropertyExpansionPreview();
        this.ui?.update();
        this._emitMapChange();
    }

    _autosaveProperty() {
        if (this.mapKind === 'property' && !this.propertyReadOnly) {
            void this._savePropertyWithSnapshot();
        }
    }

    async _savePropertyWithSnapshot() {
        const result = await savePropertyZoneWithSnapshotWriter({
            storage: safeStorage,
            writer: this.propertySnapshotWriter,
            walletState: loadWalletIdentity(safeStorage),
            tileMap: this.tileMap,
            camera: this.camera,
            propertyTier: this.propertyTier,
            ownerId: this.propertyOwner,
        });
        this.propertySnapshotSaveResult = {
            ...result,
            savedAt: Date.now(),
            ownerId: this.propertyOwner,
        };
        this._emitMapChange();
        return this.propertySnapshotSaveResult;
    }

    _captureRuntime() {
        return {
            tileMap: this.tileMap.serialize(),
            camera: {
                offsetX: this.camera.offsetX,
                offsetY: this.camera.offsetY,
                zoom: this.camera.zoom,
            },
            playerCell: this.player ? { gx: this.player.gx, gy: this.player.gy } : null,
            currentMapId: this.currentMapId,
            currentEpoch: this.currentEpoch,
            epochYieldModifier: this.epochYieldModifier,
            priceSnapshot: this.priceSnapshot,
            mode: this.mode,
            mapKind: this.mapKind,
            propertyTier: this.propertyTier,
            propertyOwner: this.propertyOwner,
            propertyReadOnly: this.propertyReadOnly,
            propertySnapshotSource: this.propertySnapshotSource,
            propertySnapshotStatus: this.propertySnapshotStatus,
            propertySnapshotStale: this.propertySnapshotStale,
            propertySnapshotSaveResult: this.propertySnapshotSaveResult,
            oreStates: Array.from(this.oreStates.entries()).map(([id, state]) => ({
                id,
                oreType: state.oreType,
                capacityRemaining: state.capacityRemaining,
                maxCapacity: state.maxCapacity,
                totalValueUsd: state.totalValueUsd,
                remainingValueUsd: state.remainingValueUsd,
            })),
        };
    }

    _restoreRuntime(runtime) {
        this.tileMap.deserialize(runtime.tileMap, d => new PlacedObject(d));
        this.camera.offsetX = runtime.camera.offsetX;
        this.camera.offsetY = runtime.camera.offsetY;
        this.camera.zoom = runtime.camera.zoom;
        this.currentEpoch = runtime.currentEpoch;
        this.epochYieldModifier = runtime.epochYieldModifier ?? 1;
        this.priceSnapshot = runtime.priceSnapshot ?? null;
        this.mode = runtime.mode;
        this.mapKind = runtime.mapKind;
        this.currentMapId = runtime.currentMapId
            ?? mapByKind(this.mapRegistry, runtime.mapKind)?.id
            ?? this.currentMapId;
        if (runtime.mapKind === 'property') {
            this.propertyTier = runtime.propertyTier ?? this.propertyTier;
        }
        this.propertyOwner = runtime.propertyOwner ?? this.propertyOwner ?? 'local';
        this.propertyReadOnly = !!runtime.propertyReadOnly;
        this.propertySnapshotSource = runtime.propertySnapshotSource ?? this.propertySnapshotSource ?? 'local';
        this.propertySnapshotStatus = runtime.propertySnapshotStatus ?? this.propertySnapshotStatus ?? 'missing';
        this.propertySnapshotStale = !!runtime.propertySnapshotStale;
        this.propertySnapshotSaveResult = runtime.propertySnapshotSaveResult ?? this.propertySnapshotSaveResult ?? null;
        this.oreStates.clear();
        for (const entry of runtime.oreStates ?? []) {
            this.oreStates.set(entry.id, new OreState(
                entry.oreType,
                entry.capacityRemaining,
                entry.maxCapacity,
                {
                    totalValueUsd: entry.totalValueUsd,
                    remainingValueUsd: entry.remainingValueUsd,
                },
            ));
        }
        this._pendingInteract = null;
        this._pendingDepletions.clear();
        this._syncPropertyExpansionPreview();
        this.renderer.markDirty();
        if (runtime.playerCell) this.movePlayerTo(runtime.playerCell.gx, runtime.playerCell.gy);
        this.ui?.update();
    }

    _syncBodyModeClass() {
        if (typeof document === 'undefined') return;
        document.body.classList.toggle('mode-play', this.mode === 'play');
        document.body.classList.toggle('mode-build', this.mode === 'build');
        document.body.classList.toggle('mode-property', this.mode === 'property');
        document.body.classList.toggle('mode-visit', this.mode === 'visit');
    }

    _syncPropertyExpansionPreview() {
        this.renderer.propertyExpansionPreview = this.mapKind === 'property' && !this.propertyReadOnly
            ? propertyExpansionPreview(this.propertyTier)
            : null;
        this.renderer.markDirty();
    }

    _emitMapChange() {
        const state = {
            mapId: this.currentMapId,
            mapKind: this.mapKind,
            mode: this.mode,
            propertyOwner: this.propertyOwner,
            propertyReadOnly: this.propertyReadOnly,
            propertySnapshotSource: this.propertySnapshotSource,
            propertySnapshotStatus: this.propertySnapshotStatus,
            propertySnapshotStale: this.propertySnapshotStale,
            propertySnapshotSaveResult: this.propertySnapshotSaveResult,
            map: mapById(this.mapRegistry, this.currentMapId),
        };
        for (const cb of this._mapListeners) cb(state);
    }

    isVisitingProperty() {
        return this.mapKind === 'property' && this.propertyReadOnly;
    }

    shareableVisitLink({ baseUrl } = {}) {
        const fallback = typeof window !== 'undefined' ? window.location.href : 'http://127.0.0.1/';
        return buildVisitUrl({
            baseUrl: baseUrl ?? fallback,
            ownerId: this.propertyOwner || 'local',
            source: visitLinkSourceFromSnapshot(this.propertySnapshotSource),
        });
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

function marketplaceFailureMessage(reason) {
    if (reason === 'wallet-disconnected') return 'Connect JoyID to trade';
    if (reason === 'insufficient-funds') return 'Not enough CKB';
    if (reason === 'missing-owned-item') return 'No owned prop to list';
    if (reason === 'invalid-price') return 'Enter a valid price';
    if (reason === 'own-listing') return 'Cannot buy your own listing';
    if (reason === 'not-owner') return 'Only the seller can cancel';
    return 'Marketplace action failed';
}

function homeOwnerToast(ownerId) {
    return ownerId === 'local' ? 'Using local home' : 'Using wallet home';
}
