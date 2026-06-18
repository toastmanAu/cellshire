/**
 * procgen.js
 *
 * Spike: procedurally fills a TileMap with biome bands and ore nodes.
 *
 * Approach (deliberately simple — this is a renderer scaling test, not a
 * world-design exercise):
 *   - Seeded value noise (no external deps; keeps the no-bundler property)
 *   - Two octaves layered for biome shaping
 *   - Threshold bands → water / sand / grass / stone
 *   - Poisson-disc-ish ore scatter on stone cells using a min-spacing grid
 *
 * Bulk-writes directly to tileMap (no per-cell animation; placing 10k tiles
 * via setTimeout queues would be catastrophic). Caller is responsible for
 * one final renderer.markDirty().
 */

import { PlacedObject } from '../building/PlacedObject.js';
import { ASSET_INDEX } from '../assets/assetManifest.js';
import { isWalkable } from '../grid/walkability.js';
import { HARVEST_RESOURCE_ROLES } from '../resources/harvestCatalog.js';
import { findSpawnCell } from './spawnCell.js';

const EARLY_RESOURCE_MAX_STEPS = 36;
const EARLY_STONE_NODE_FLOOR = 2;

/* ── Seeded RNG (mulberry32) ────────────────────────────────────── */

function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ── 2D value noise on a coarse lattice ────────────────────────── */

function makeNoise2D(seed, latticeSize = 8) {
    const rand = mulberry32(seed);
    // Pre-compute a lattice of random values that we'll bilinearly interp.
    // latticeSize sets the "wavelength" of the noise in grid cells.
    const L = latticeSize;
    const cache = new Map();

    function latticeVal(lx, ly) {
        const k = `${lx},${ly}`;
        let v = cache.get(k);
        if (v === undefined) {
            // Mix the lattice coords into the seed so deterministic per coord
            const sub = mulberry32(seed ^ (lx * 374761393) ^ (ly * 668265263));
            v = sub();
            cache.set(k, v);
        }
        return v;
    }

    return function noise2D(x, y) {
        const fx = x / L, fy = y / L;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = fx - x0, ty = fy - y0;
        // Smoothstep for nicer bilinear
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);

        const v00 = latticeVal(x0,     y0);
        const v10 = latticeVal(x0 + 1, y0);
        const v01 = latticeVal(x0,     y0 + 1);
        const v11 = latticeVal(x0 + 1, y0 + 1);

        const a = v00 + (v10 - v00) * sx;
        const b = v01 + (v11 - v01) * sx;
        return a + (b - a) * sy;
    };
}

/* ── Public API ────────────────────────────────────────────────── */

/**
 * Generate biomes + ore nodes into the given tileMap.
 * Returns simple stats for the FPS HUD.
 */
export function generateWorld(tileMap, seed = 1337) {
    const W = tileMap.width;
    const H = tileMap.height;

    // Two octaves of noise blended for variety.
    const macro = makeNoise2D(seed,       18);  // big biome shapes
    const detail = makeNoise2D(seed ^ 7,  6);   // local roughness

    // Terrain pass — pure tilemap writes, no animation
    let counts = { water: 0, sand: 0, grass: 0, stone: 0 };

    for (let gy = 0; gy < H; gy++)
    for (let gx = 0; gx < W; gx++) {
        const n = macro(gx, gy) * 0.7 + detail(gx, gy) * 0.3;

        let assetId;
        if (n < 0.32)      { assetId = 'water';      counts.water++; }
        else if (n < 0.40) { assetId = 'sand';       counts.sand++; }
        else if (n < 0.72) { assetId = 'dirt';       counts.grass++; }   // grass slot → mining dirt
        else               { assetId = 'dark_stone'; counts.stone++; }   // stone slot → mining dark stone

        tileMap.setTerrain(gx, gy, assetId);
    }

    // Ore scatter — Poisson-disc-ish via min-spacing reject sampling.
    // We seed candidates over stone cells with a third noise pass driving
    // density. Ores are existing rock assets used as visual stand-ins.
    const oreRand = mulberry32(seed ^ 0x5A5A);
    const oreNoise = makeNoise2D(seed ^ 0xC001, 10);

    // Pool of asset ids that read as "mineable resource". Each ore id maps
    // to a CKB cell type in the game design (capacity = remaining ore).
    // Repetitions in the pool weight rarity: common ores appear many times,
    // rare ores once. Coal/iron are most common, tech metals and copper
    // are uncommon, precious/crystal deposits are rare, and ckb_cluster is
    // a rare signature landmark.
    const oreAssets = [
        'coal_seam',  'coal_seam',  'coal_seam',  'coal_seam',   // common
        'iron_ore',   'iron_ore',   'iron_ore',   'iron_ore',    // common
        'copper_ore', 'copper_ore', 'copper_ore',                // uncommon
        'silver_ore', 'silver_ore',                              // uncommon
        'lithium_ore', 'lithium_ore',                             // uncommon
        'cobalt_ore', 'cobalt_ore',                               // uncommon
        'silicon_quartz', 'silicon_quartz',                       // uncommon
        'gold_ore',   'gold_ore',                                 // rare
        'amethyst_geode',                                         // rare
        'bismuth_ore',                                            // rare
        'diamond_ore',                                            // rare
        'ckb_cluster',                                            // rare signature
        'boulder',    'boulder',                                  // non-ore filler
    ];
    const MIN_SPACING = 3; // cells between ores

    const placed = new Set();   // "gx,gy" keys for spacing check
    const inSpacing = (gx, gy) => {
        for (let dy = -MIN_SPACING; dy <= MIN_SPACING; dy++)
        for (let dx = -MIN_SPACING; dx <= MIN_SPACING; dx++) {
            if (dx * dx + dy * dy > MIN_SPACING * MIN_SPACING) continue;
            if (placed.has(`${gx + dx},${gy + dy}`)) return true;
        }
        return false;
    };

    let oresPlaced = 0;
    for (let gy = 0; gy < H; gy++)
    for (let gx = 0; gx < W; gx++) {
        if (tileMap.getTerrain(gx, gy) !== 'dark_stone') continue;
        // Density modulated by noise so ores cluster naturally.
        const density = 0.06 + oreNoise(gx, gy) * 0.18;
        if (oreRand() > density) continue;
        if (inSpacing(gx, gy)) continue;
        if (!tileMap.isFreeFor(gx, gy, 1, 1)) continue;

        const assetId = oreAssets[Math.floor(oreRand() * oreAssets.length)];
        const asset = ASSET_INDEX[assetId];
        if (!asset) continue;

        const obj = new PlacedObject({
            id: tileMap.nextId(),
            assetId,
            gx, gy,
            footprint: asset.footprint,
        });
        tileMap.addObject(obj);
        placed.add(`${gx},${gy}`);
        oresPlaced++;
    }

    // Epoch-refreshing local resources.
    const treeRand = mulberry32(seed ^ 0xBEEF);
    let treesPlaced = 0;
    for (let gy = 0; gy < H; gy++)
    for (let gx = 0; gx < W; gx++) {
        if (tileMap.getTerrain(gx, gy) !== 'dirt') continue;
        if (treeRand() > 0.015) continue;
        if (!tileMap.isFreeFor(gx, gy, 1, 1)) continue;
        const obj = new PlacedObject({
            id: tileMap.nextId(),
            assetId: 'harvest_tree',
            gx, gy,
            footprint: { w: 1, d: 1 },
            role: HARVEST_RESOURCE_ROLES.wood,
        });
        tileMap.addObject(obj);
        treesPlaced++;
    }

    const stoneRand = mulberry32(seed ^ 0x51A7E);
    const stoneNoise = makeNoise2D(seed ^ 0x570E, 12);
    let stoneResourcesPlaced = 0;
    for (let gy = 0; gy < H; gy++)
    for (let gx = 0; gx < W; gx++) {
        if (tileMap.getTerrain(gx, gy) !== 'dark_stone') continue;
        const density = 0.015 + stoneNoise(gx, gy) * 0.045;
        if (stoneRand() > density) continue;
        if (!tileMap.isFreeFor(gx, gy, 1, 1)) continue;
        const assetId = 'stone_outcrop';
        const asset = ASSET_INDEX[assetId];
        if (!asset) continue;
        const obj = new PlacedObject({
            id: tileMap.nextId(),
            assetId,
            gx, gy,
            footprint: asset.footprint,
            role: HARVEST_RESOURCE_ROLES.stone,
        });
        tileMap.addObject(obj);
        stoneResourcesPlaced++;
    }

    const goldRand = mulberry32(seed ^ 0x601D);
    const goldNoise = makeNoise2D(seed ^ 0xA117, 14);
    let goldResourcesPlaced = 0;
    for (let gy = 0; gy < H; gy++)
    for (let gx = 0; gx < W; gx++) {
        if (tileMap.getTerrain(gx, gy) !== 'dark_stone') continue;
        const density = 0.003 + goldNoise(gx, gy) * 0.012;
        if (goldRand() > density) continue;
        if (!tileMap.isFreeFor(gx, gy, 1, 1)) continue;
        const assetId = 'gold_nugget_node';
        const asset = ASSET_INDEX[assetId];
        if (!asset) continue;
        const obj = new PlacedObject({
            id: tileMap.nextId(),
            assetId,
            gx, gy,
            footprint: asset.footprint,
            role: HARVEST_RESOURCE_ROLES.gold,
        });
        tileMap.addObject(obj);
        goldResourcesPlaced++;
    }

    const stoneGuarantee = ensureNearbyStoneFloor(tileMap, {
        minNodes: EARLY_STONE_NODE_FLOOR,
        maxSteps: EARLY_RESOURCE_MAX_STEPS,
    });
    stoneResourcesPlaced += stoneGuarantee.added;

    return {
        ...counts,
        oresPlaced,
        treesPlaced,
        stoneResourcesPlaced,
        stoneResourcesGuaranteed: stoneGuarantee.added,
        goldResourcesPlaced,
        total: W * H,
    };
}

function ensureNearbyStoneFloor(tileMap, { minNodes, maxSteps }) {
    const spawn = findSpawnCell(tileMap);
    if (!spawn) return { added: 0, spawn: null };

    let nearby = nearbyHarvestResourceCounts(tileMap, { spawn, maxSteps });
    let needed = Math.max(0, minNodes - (nearby.counts.stone ?? 0));
    if (needed <= 0) return { added: 0, spawn };

    let added = 0;
    const candidates = nearbyStoneCandidates(tileMap, { spawn, maxSteps });
    const asset = ASSET_INDEX.stone_outcrop;
    if (!asset) return { added: 0, spawn };

    for (const candidate of candidates) {
        if (needed <= 0) break;
        if (!tileMap.isFreeFor(candidate.gx, candidate.gy, 1, 1)) continue;
        const obj = new PlacedObject({
            id: tileMap.nextId(),
            assetId: 'stone_outcrop',
            gx: candidate.gx,
            gy: candidate.gy,
            footprint: asset.footprint,
            role: HARVEST_RESOURCE_ROLES.stone,
        });
        tileMap.addObject(obj);
        added++;
        needed--;
    }

    nearby = nearbyHarvestResourceCounts(tileMap, { spawn, maxSteps });
    return {
        added,
        spawn,
        stoneNodes: nearby.counts.stone ?? 0,
    };
}

function nearbyStoneCandidates(tileMap, { spawn, maxSteps }) {
    const visited = reachableWalkCells(tileMap, { spawn, maxSteps });
    const seen = new Set();
    const candidates = [];

    for (const cell of visited.values()) {
        for (const { dx, dy } of CARDINALS) {
            const gx = cell.gx + dx;
            const gy = cell.gy + dy;
            const key = cellKey(gx, gy);
            if (seen.has(key)) continue;
            seen.add(key);
            if (!tileMap.inBounds(gx, gy)) continue;
            if (gx === spawn.gx && gy === spawn.gy) continue;
            if (!tileMap.isFreeFor(gx, gy, 1, 1)) continue;
            const terrain = tileMap.getTerrain(gx, gy);
            if (terrain !== 'dark_stone' && terrain !== 'dirt') continue;
            const dist = Math.abs(gx - spawn.gx) + Math.abs(gy - spawn.gy);
            if (dist < 4) continue;
            candidates.push({
                gx,
                gy,
                terrain,
                dist,
                terrainRank: terrain === 'dark_stone' ? 0 : 1,
            });
        }
    }

    return candidates.sort((a, b) => (
        a.terrainRank - b.terrainRank
        || a.dist - b.dist
        || a.gy - b.gy
        || a.gx - b.gx
    ));
}

function nearbyHarvestResourceCounts(tileMap, { spawn, maxSteps }) {
    const visited = reachableWalkCells(tileMap, { spawn, maxSteps });
    const resources = new Set();
    const counts = {};

    for (const cell of visited.values()) {
        for (const { dx, dy } of CARDINALS) {
            const obj = tileMap.objectAt(cell.gx + dx, cell.gy + dy);
            if (!obj?.role || resources.has(obj.id)) continue;
            resources.add(obj.id);
            if (obj.role === HARVEST_RESOURCE_ROLES.wood) {
                counts.wood = (counts.wood ?? 0) + 1;
            } else if (obj.role === HARVEST_RESOURCE_ROLES.stone) {
                counts.stone = (counts.stone ?? 0) + 1;
            } else if (obj.role === HARVEST_RESOURCE_ROLES.gold) {
                counts.gold = (counts.gold ?? 0) + 1;
            }
        }
    }

    return { counts, reachableCells: visited.size };
}

function reachableWalkCells(tileMap, { spawn, maxSteps }) {
    const queue = [{ gx: spawn.gx, gy: spawn.gy, steps: 0 }];
    const visited = new Map([[cellKey(spawn.gx, spawn.gy), queue[0]]]);

    for (let i = 0; i < queue.length; i++) {
        const cell = queue[i];
        if (cell.steps >= maxSteps) continue;
        for (const { dx, dy } of CARDINALS) {
            const gx = cell.gx + dx;
            const gy = cell.gy + dy;
            const key = cellKey(gx, gy);
            if (visited.has(key)) continue;
            if (!isWalkable(tileMap, gx, gy)) continue;
            const next = { gx, gy, steps: cell.steps + 1 };
            visited.set(key, next);
            queue.push(next);
        }
    }

    return visited;
}

const CARDINALS = Object.freeze([
    Object.freeze({ dx: 1, dy: 0 }),
    Object.freeze({ dx: -1, dy: 0 }),
    Object.freeze({ dx: 0, dy: 1 }),
    Object.freeze({ dx: 0, dy: -1 }),
]);

function cellKey(gx, gy) {
    return `${gx},${gy}`;
}
