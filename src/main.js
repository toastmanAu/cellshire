/**
 * main.js
 *
 * Entry point. Generates the asset pack first (with progress UI), then
 * instantiates the game once everything is ready.
 */

import { loadAssets } from './assets/assetLoader.js';
import { Game } from './core/Game.js';
import { UIManager } from './ui/UIManager.js';
import { loadUiAudio } from './ui/Audio.js';
import { generateWorld } from './worldgen/procgen.js';
import { installPerfHUD } from './ui/PerfHUD.js';
import { installEpochHUD } from './ui/EpochHUD.js';
import { installWalletHUD } from './ui/WalletHUD.js';
import { installInventoryHUD } from './ui/InventoryHUD.js';
import { isWalkable } from './grid/walkability.js';
import { getAvailableCharacters, resolveCharacterChoice } from './characters/catalog.js';
import { safeStorage } from './lib/safeStorage.js';
import { installCharacterPicker } from './ui/CharacterPicker.js';
import { getProcgenSeed } from './chain/epochSeed.js';
import {
    cccJoyIdEnabled,
    cccJoyIdMiningEnabled,
    connectCccJoyId,
} from './chain/cccJoyId.js';
import { describeEpochModifier } from './chain/epochModifier.js';
import { loadMinedState, pruneStaleMinedState } from './mining/minedStore.js';
import { chainMiningEnabled, makeMiningAdapterFromParams } from './mining/miningAdapter.js';
import { walletFeatureEnabled } from './wallet/walletIdentity.js';

async function main() {
    const fill = document.getElementById('loading-fill');
    const status = document.getElementById('loading-status');
    const loadingScreen = document.getElementById('loading-screen');
    const app = document.getElementById('app');

    await loadAssets((p, label) => {
        fill.style.width = `${Math.round(p * 100)}%`;
        status.textContent = `crafting ${label}…`;
    });

    // Kick off the UI sound effect download in parallel — it's tiny and
    // we don't want the very first click to feel sluggish waiting for it.
    loadUiAudio();

    fill.style.width = '100%';
    status.textContent = 'arriving at the harbor';

    // Tiny delay for the bar to finish its sweep — feels nicer.
    await new Promise(r => setTimeout(r, 250));

    const canvas = document.getElementById('game-canvas');
    const game = new Game(canvas);

    // Mode selection. Default is play mode (click-to-walk miner); the
    // ?dev=1 flag re-exposes the Mykonos builder toolbar and palette for
    // property-zone / asset-pack work.
    const params = new URLSearchParams(location.search);
    const devMode = params.get('dev') === '1';
    game.mode = devMode ? 'build' : 'play';
    game.miningAdapter = makeMiningAdapterFromParams({
        params,
        storage: safeStorage,
        location: window.location,
    });
    document.body.classList.add(devMode ? 'mode-build' : 'mode-play');

    const ui = new UIManager(game);
    game.ui = ui;
    ui.update();
    // Debug hook so devtools sessions can inspect runtime state.
    if (typeof window !== 'undefined') window.__cellshire = { game };

    // Spike: optional ?size=N URL param resizes the tileMap before
    // procgen so we can sweep 100 / 200 / 256 / 300 without code edits.
    const requestedSize = parseInt(params.get('size'), 10);
    if (Number.isFinite(requestedSize) && requestedSize >= 10 && requestedSize <= 600) {
        const tm = game.tileMap;
        tm.width = requestedSize;
        tm.height = requestedSize;
        tm.terrain = new Array(requestedSize * requestedSize).fill(null);
        tm.objects = [];
        tm._occupancy = new Array(requestedSize * requestedSize).fill(null);
        tm._nextId = 1;
        tm.terrainVersion++;
        tm.objectsVersion++;
        // Renderer caches and bounds were computed lazily; force a recompute
        // by clearing them before the first cache build.
        game.renderer._worldBounds = null;
        game.renderer._cacheScale = null;
        game._centerCamera();
    }

    // Procgen seed is derived from the CKB chain's current epoch hash
    // so every player loading inside the same epoch window sees the
    // same world. Source ladder is live → cached → random; see
    // src/chain/epochSeed.js for the full path. Loading screen stays
    // visible during the fetch (~200ms on a healthy RPC).
    const { seed, source: seedSource, epoch, hash: epochHash, epochInfo } = await getProcgenSeed({
        url: params.get('node'),
        storage: safeStorage,
        fetch: window.fetch.bind(window),
        defaultUrl: 'https://testnet.ckb.dev',
    });
    const t0 = performance.now();
    const stats = generateWorld(game.tileMap, seed);
    const genMs = performance.now() - t0;
    game.renderer.markDirty();

    // Build mining state from the procgen output. Same `seed` is mixed
    // in so per-ore capacity is deterministic across reloads.
    game.populateOreStates(makeSeededRand(seed ^ 0x70F0));

    // Tag the Game with the epoch so _mineOre can persist hits to the
    // correct per-epoch storage key. Null on random seed = no
    // persistence (see minedStore.recordMine).
    game.currentEpoch = epoch;
    const epochModifierState = describeEpochModifier(epochHash);
    game.epochYieldModifier = epochModifierState.multiplier;

    // Restore any mined-ore state from a prior session in the same
    // epoch. Positions with remainingCapacity > 0 update their
    // OreState; positions at 0 are removed from the world outright (no
    // crumble anim — that already played last session).
    //
    // Note: this removal path intentionally bypasses _pendingDepletions
    // because that map is always empty at boot (no animations have
    // been spawned yet). The crumble anim is purely a runtime affordance.
    pruneStaleMinedState(safeStorage, epoch);
    const minedState = loadMinedState(safeStorage, epoch);
    for (const [posKey, remaining] of Object.entries(minedState)) {
        const [gx, gy] = posKey.split(',').map(Number);
        const obj = game.tileMap.objectAt(gx, gy);
        if (!obj) continue;
        const oreState = game.oreStates.get(obj.id);
        if (!oreState) continue;
        oreState.restoreCapacity(remaining);
        if (remaining <= 0) {
            game.tileMap.removeObjectAt(gx, gy);
            game.oreStates.delete(obj.id);
        }
    }
    game.renderer.markDirty();

    // Place the player on a walkable cell near the centre of the map.
    // We use a connected-component flood-fill so the player always
    // spawns in the largest reachable region (small sand islands are
    // skipped).
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

    const genStats = {
        seed,
        genMs,
        source: seedSource,
        epoch,
        epochHash,
        epochInfo,
        epochModifier: epochModifierState,
        ...stats,
    };
    installPerfHUD(game, genStats);
    installEpochHUD(game, genStats);
    if (walletFeatureEnabled(params) || chainMiningEnabled(params) || cccJoyIdEnabled(params)) {
        const useRealJoyId = cccJoyIdEnabled(params) || cccJoyIdMiningEnabled(params);
        installWalletHUD({
            storage: safeStorage,
            shouldFail: params.get('walletFail') === '1',
            connector: useRealJoyId
                ? ({ shouldFail }) => {
                    if (shouldFail) throw new Error('JoyID connection cancelled');
                    return connectCccJoyId({ params, location: window.location });
                }
                : undefined,
        });
    }

    loadingScreen.classList.add('hidden');
    app.classList.remove('hidden');
}

/**
 * Place a small starter scene so first-run users see something pretty.
 *
 * Each placement is queued with a depth-based delay so the village
 * ripples in back-to-front: the back row of grass appears first, then
 * the wave sweeps forward across the island and the buildings + props
 * pop in on top of the terrain wave as it passes them. The whole reveal
 * lasts a touch over a second.
 */
function seedExampleVillage(game) {
    const W = game.tileMap.width, H = game.tileMap.height;

    // Tuning for the reveal. STEP_MS is how long the wave takes to move
    // one diamond row deeper into the scene; OBJECT_DELAY adds a small
    // beat after the back-row terrain settles before its building or
    // prop pops in on top.
    const STEP_MS      = 32;
    const OBJECT_DELAY = 90;

    const placeT = (id, gx, gy) => {
        const delay = (gx + gy) * STEP_MS;
        game.placeAndAnimate(id, gx, gy, { delay });
    };
    const placeO = (id, gx, gy) => {
        const delay = (gx + gy) * STEP_MS + OBJECT_DELAY;
        game.placeAndAnimate(id, gx, gy, { delay });
    };

    // Grass everywhere
    for (let gy = 0; gy < H; gy++)
    for (let gx = 0; gx < W; gx++) {
        placeT('grass', gx, gy);
    }

    // Stone path crossing
    const midX = Math.floor(W / 2);
    const midY = Math.floor(H / 2);
    for (let gx = 1; gx < W - 1; gx++) placeT('path', gx, midY);
    for (let gy = 1; gy < H - 1; gy++) placeT('path', midX, gy);

    // Water canal along the front edge
    for (let gx = 0; gx < W; gx++) {
        placeT('water', gx, H - 1);
        placeT('water', gx, H - 2);
    }
    // Sand strip just behind the water as beach
    for (let gx = 0; gx < W; gx++) placeT('sand', gx, H - 3);

    // A house and chapel
    placeO('house', 2, 2);
    placeO('main_chapel', 7, 1);
    placeO('windmill', 11, 2);
    placeO('two_story', 2, 7);
    placeO('villa', 7, 7);

    // Some nature accents
    placeO('cypress', 1, 5);
    placeO('cypress', 12, 5);
    placeO('bougainvillea', 5, 3);
    placeO('olive', 0, 9);
    placeO('flower_pot', 6, 5);
    placeO('terracotta_pot', 11, 6);
    placeO('agave', 13, 8);

    // Lanterns + small bridge
    placeO('lantern_post', 4, 6);
    placeO('lantern_post', 9, 6);
    placeO('small_bridge', 5, H - 2);
}

/**
 * Pick a spawn cell on the **largest connected walkable region**. A naive
 * spiral-from-centre fails on water-heavy seeds: the closest walkable cell
 * to centre might be a tiny sand island with no land bridge to any ore.
 *
 * We flood-fill all walkable components, then return the cell of the
 * largest one that's closest to the map centre — biggest reachable area,
 * still framed nicely by the initial camera.
 */
function findSpawnCell(tileMap) {
    const W = tileMap.width;
    const H = tileMap.height;
    const cx = Math.floor(W / 2);
    const cy = Math.floor(H / 2);
    const visited = new Uint8Array(W * H);

    let bestSize = 0;
    let bestCell = null;
    let bestCenterDist = Infinity;

    for (let gy0 = 0; gy0 < H; gy0++)
    for (let gx0 = 0; gx0 < W; gx0++) {
        if (visited[gy0 * W + gx0]) continue;
        if (!isWalkable(tileMap, gx0, gy0)) {
            visited[gy0 * W + gx0] = 1;
            continue;
        }
        const queue = [[gx0, gy0]];
        visited[gy0 * W + gx0] = 1;
        const region = [];
        while (queue.length) {
            const [gx, gy] = queue.pop();
            region.push([gx, gy]);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = gx + dx;
                const ny = gy + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                if (visited[ny * W + nx]) continue;
                visited[ny * W + nx] = 1;
                if (!isWalkable(tileMap, nx, ny)) continue;
                queue.push([nx, ny]);
            }
        }
        if (region.length < bestSize) continue;
        // For this region, find the walkable cell closest to map centre.
        let closest = null;
        let closestDist = Infinity;
        for (const [gx, gy] of region) {
            const d = (gx - cx) * (gx - cx) + (gy - cy) * (gy - cy);
            if (d < closestDist) { closestDist = d; closest = [gx, gy]; }
        }
        if (region.length > bestSize
            || (region.length === bestSize && closestDist < bestCenterDist)) {
            bestSize = region.length;
            bestCell = closest;
            bestCenterDist = closestDist;
        }
    }
    if (!bestCell) return null;
    return { gx: bestCell[0], gy: bestCell[1] };
}


/** Seeded RNG (mulberry32) — matches the one in procgen for parity. */
function makeSeededRand(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

main().catch(err => {
    console.error(err);
    document.getElementById('loading-status').textContent =
        `Something went wrong: ${err.message}`;
});
