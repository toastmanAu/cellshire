import { assetDefinitionFor } from '../assets/assetRegistry.js';
import { PlacedObject } from '../building/PlacedObject.js';
import { TileMap } from '../grid/TileMap.js';

export const TOWNSHIP_MAP_ID = 'township:communal';
export const TOWNSHIP_SIZE = 32;
export const TOWNSHIP_SPAWN = Object.freeze({ gx: 15, gy: 24 });
export const TOWNSHIP_PORTAL_ROLE = 'township_portal';
export const TOWNSHIP_MINE_PORTAL_ROLE = 'township_mine_portal';
export const TOWNSHIP_PROPERTY_PORTAL_ROLE = 'township_property_portal';

export const TOWNSHIP_BUILDING_ROLES = Object.freeze({
    store: 'township_store',
    market: 'township_market',
    bank: 'township_bank',
    gallery: 'township_gallery',
    communityHall: 'township_community_hall',
});

export function isTownshipBuildingRole(role) {
    return Object.values(TOWNSHIP_BUILDING_ROLES).includes(role);
}

export function townshipBuildingLabel(role) {
    if (role === TOWNSHIP_BUILDING_ROLES.store) return 'General Store';
    if (role === TOWNSHIP_BUILDING_ROLES.market) return 'Market';
    if (role === TOWNSHIP_BUILDING_ROLES.bank) return 'Bank';
    if (role === TOWNSHIP_BUILDING_ROLES.gallery) return 'Gallery';
    if (role === TOWNSHIP_BUILDING_ROLES.communityHall) return 'Community Hall';
    return 'Township';
}

export function createTownshipMap() {
    const tileMap = new TileMap(TOWNSHIP_SIZE, TOWNSHIP_SIZE);
    for (let gy = 0; gy < TOWNSHIP_SIZE; gy++)
    for (let gx = 0; gx < TOWNSHIP_SIZE; gx++) {
        tileMap.setTerrain(gx, gy, 'grass');
    }

    for (let gx = 4; gx <= 27; gx++) tileMap.setTerrain(gx, 23, 'path');
    for (let gy = 5; gy <= 27; gy++) tileMap.setTerrain(15, gy, 'path');
    for (let gx = 8; gx <= 23; gx++) tileMap.setTerrain(gx, 13, 'path');
    for (let gy = 9; gy <= 18; gy++) {
        tileMap.setTerrain(8, gy, 'path');
        tileMap.setTerrain(23, gy, 'path');
    }
    for (let gx = 12; gx <= 18; gx++)
    for (let gy = 20; gy <= 25; gy++) {
        tileMap.setTerrain(gx, gy, 'stone');
    }

    addObject(tileMap, 'cube_house', 6, 9, { role: TOWNSHIP_BUILDING_ROLES.store });
    addObject(tileMap, 'terrace_house', 12, 7, { role: TOWNSHIP_BUILDING_ROLES.market });
    addObject(tileMap, 'two_story', 20, 8, { role: TOWNSHIP_BUILDING_ROLES.bank });
    addObject(tileMap, 'villa', 5, 16, { role: TOWNSHIP_BUILDING_ROLES.gallery });
    addObject(tileMap, 'main_chapel', 19, 16, { role: TOWNSHIP_BUILDING_ROLES.communityHall });

    addObject(tileMap, 'signpost', 13, 24, { role: TOWNSHIP_MINE_PORTAL_ROLE });
    addObject(tileMap, 'signpost', 17, 24, { role: TOWNSHIP_PROPERTY_PORTAL_ROLE });
    addObject(tileMap, 'well', 15, 20);
    addObject(tileMap, 'bench', 12, 22);
    addObject(tileMap, 'bench', 18, 22);
    addObject(tileMap, 'lantern_post', 10, 13);
    addObject(tileMap, 'lantern_post', 20, 13);
    addObject(tileMap, 'banner', 14, 19);
    addObject(tileMap, 'banner', 16, 19);

    return tileMap;
}

export function addMineTownshipPortal(tileMap, nearCell) {
    const spot = findPortalSpot(tileMap, nearCell);
    if (!spot) return null;
    return addObject(tileMap, 'signpost', spot.gx, spot.gy, {
        role: TOWNSHIP_PORTAL_ROLE,
    });
}

export function addPropertyTownshipPortal(tileMap) {
    return addObject(tileMap, 'signpost', 6, 5, {
        role: TOWNSHIP_PORTAL_ROLE,
    });
}

function findPortalSpot(tileMap, nearCell) {
    const candidates = [];
    for (let r = 2; r <= 7; r++) {
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
    const asset = assetDefinitionFor(assetId);
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
