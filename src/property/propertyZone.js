import { ASSET_INDEX } from '../assets/assetManifest.js';
import { PlacedObject } from '../building/PlacedObject.js';
import { TileMap } from '../grid/TileMap.js';

export const PROPERTY_MAP_ID = 'property:local';
export const PROPERTY_SIZE = 24;
export const PROPERTY_EDIT_BOUNDS = Object.freeze({
    minGx: 4,
    minGy: 4,
    maxGx: 19,
    maxGy: 19,
});
export const PROPERTY_SPAWN = Object.freeze({ gx: 12, gy: 18 });
export const PROPERTY_MINE_PORTAL_ROLE = 'mine_portal';
export const MINE_PROPERTY_PORTAL_ROLE = 'property_portal';

export const STARTER_PROPERTY_ASSETS = Object.freeze([
    'grass',
    'path',
    'dirt',
    'stone',
    'cypress',
    'agave',
    'dry_grass',
    'flower_pot',
    'low_wall',
    'gate_fence',
    'lantern_post',
    'bench',
    'signpost',
    'crate',
    'storage_box',
    'wood_pile',
    'water_bucket',
    'pottery_jar',
    'terracotta_pot',
    'rocks',
    'flat_stone',
    'pebbles',
    'garden_bed',
    'crop_patch',
]);

const STARTER_SET = new Set(STARTER_PROPERTY_ASSETS);

export function isStarterPropertyAsset(assetId) {
    return STARTER_SET.has(assetId);
}

export function footprintWithinBounds(assetId, gx, gy, bounds = PROPERTY_EDIT_BOUNDS) {
    const asset = ASSET_INDEX[assetId];
    if (!asset) return false;
    const w = asset.footprint?.w ?? 1;
    const d = asset.footprint?.d ?? 1;
    return gx >= bounds.minGx
        && gy >= bounds.minGy
        && gx + w - 1 <= bounds.maxGx
        && gy + d - 1 <= bounds.maxGy;
}

export function canEditPropertyCell(gx, gy, bounds = PROPERTY_EDIT_BOUNDS) {
    return gx >= bounds.minGx
        && gy >= bounds.minGy
        && gx <= bounds.maxGx
        && gy <= bounds.maxGy;
}

export function canPlacePropertyAsset(assetId, gx, gy, bounds = PROPERTY_EDIT_BOUNDS) {
    return isStarterPropertyAsset(assetId)
        && footprintWithinBounds(assetId, gx, gy, bounds);
}

export function createStarterPropertyMap() {
    const tileMap = new TileMap(PROPERTY_SIZE, PROPERTY_SIZE);
    for (let gy = 0; gy < PROPERTY_SIZE; gy++)
    for (let gx = 0; gx < PROPERTY_SIZE; gx++) {
        tileMap.setTerrain(gx, gy, 'grass');
    }

    for (let gx = PROPERTY_EDIT_BOUNDS.minGx; gx <= PROPERTY_EDIT_BOUNDS.maxGx; gx++) {
        tileMap.setTerrain(gx, PROPERTY_SPAWN.gy, 'path');
    }
    for (let gy = PROPERTY_EDIT_BOUNDS.minGy; gy <= PROPERTY_EDIT_BOUNDS.maxGy; gy++) {
        tileMap.setTerrain(PROPERTY_SPAWN.gx, gy, 'path');
    }

    const fenceMinX = PROPERTY_EDIT_BOUNDS.minGx - 1;
    const fenceMinY = PROPERTY_EDIT_BOUNDS.minGy - 1;
    const fenceMaxX = PROPERTY_EDIT_BOUNDS.maxGx + 1;
    const fenceMaxY = PROPERTY_EDIT_BOUNDS.maxGy + 1;
    for (let gx = fenceMinX; gx <= fenceMaxX; gx++) {
        if (gx !== PROPERTY_SPAWN.gx) addObject(tileMap, 'low_wall', gx, fenceMinY);
        if (gx !== PROPERTY_SPAWN.gx) addObject(tileMap, 'low_wall', gx, fenceMaxY);
    }
    for (let gy = fenceMinY + 1; gy <= fenceMaxY - 1; gy++) {
        addObject(tileMap, 'low_wall', fenceMinX, gy);
        addObject(tileMap, 'low_wall', fenceMaxX, gy);
    }

    addObject(tileMap, 'gate_fence', PROPERTY_SPAWN.gx - 1, fenceMaxY);
    addObject(tileMap, 'gate_fence', PROPERTY_SPAWN.gx + 1, fenceMaxY);
    addObject(tileMap, 'signpost', PROPERTY_SPAWN.gx, PROPERTY_EDIT_BOUNDS.minGy, {
        role: PROPERTY_MINE_PORTAL_ROLE,
    });
    addObject(tileMap, 'storage_box', PROPERTY_EDIT_BOUNDS.minGx + 1, PROPERTY_EDIT_BOUNDS.maxGy - 1);
    addObject(tileMap, 'crate', PROPERTY_EDIT_BOUNDS.minGx + 2, PROPERTY_EDIT_BOUNDS.maxGy - 1);
    addObject(tileMap, 'flower_pot', PROPERTY_EDIT_BOUNDS.maxGx - 1, PROPERTY_EDIT_BOUNDS.minGy + 1);

    return tileMap;
}

export function addMinePropertyPortal(tileMap, nearCell) {
    const spot = findPortalSpot(tileMap, nearCell);
    if (!spot) return null;
    return addObject(tileMap, 'signpost', spot.gx, spot.gy, {
        role: MINE_PROPERTY_PORTAL_ROLE,
    });
}

function findPortalSpot(tileMap, nearCell) {
    const candidates = [];
    for (let r = 1; r <= 5; r++) {
        for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            candidates.push({ gx: nearCell.gx + dx, gy: nearCell.gy + dy });
        }
    }
    return candidates.find(c => tileMap.inBounds(c.gx, c.gy)
        && tileMap.getTerrain(c.gx, c.gy)
        && tileMap.isFreeFor(c.gx, c.gy, 1, 1));
}

function addObject(tileMap, assetId, gx, gy, opts = {}) {
    const asset = ASSET_INDEX[assetId];
    if (!asset || !tileMap.isFreeFor(gx, gy, asset.footprint.w, asset.footprint.d)) return null;
    const obj = new PlacedObject({
        id: tileMap.nextId(),
        assetId,
        gx,
        gy,
        footprint: asset.footprint,
        role: opts.role ?? null,
    });
    tileMap.addObject(obj);
    return obj;
}
