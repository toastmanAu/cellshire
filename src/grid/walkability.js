/**
 * walkability.js
 *
 * Single source of truth for "what can the player step on" and "what can
 * the player interact with". Procgen produces only four terrain types
 * (water / sand / dirt / dark_stone) and a small set of object kinds
 * (ores, boulders, cypress); the rules below are intentionally tight so
 * Pathfinder and Game share one definition.
 *
 * TUNING: edit the two sets below as the game grows — placed property
 * tiles, paths, bridges, fences will all want walkability entries here.
 * The rest of the code reads through `isWalkable` / `isInteractable`, so
 * additions automatically flow to pathfinding and click handling.
 */

const WALKABLE_TERRAIN = new Set([
    'sand',
    'dirt',
    'dark_stone',
    // Mykonos legacy tiles that procgen can produce via seedExampleVillage.
    'grass',
    'path',
]);

const INTERACTABLE_OBJECTS = new Set([
    'coal_seam',
    'iron_ore',
    'copper_ore',
    'gold_ore',
    'amethyst_geode',
    'diamond_ore',
    'ckb_cluster',
    // Boulders block movement and do nothing on click yet — leave out
    // until they get a real interaction (rubble drop? terrain reshape?).
]);

/** True if a cell can be walked into (in-bounds, walkable terrain, no object). */
export function isWalkable(tileMap, gx, gy) {
    if (!tileMap.inBounds(gx, gy)) return false;
    const terrain = tileMap.getTerrain(gx, gy);
    if (!terrain || !WALKABLE_TERRAIN.has(terrain)) return false;
    if (tileMap.objectAt(gx, gy)) return false;
    return true;
}

/** True if a cell holds an interactable object (ore, future vendor, etc.). */
export function isInteractable(tileMap, gx, gy) {
    const obj = tileMap.objectAt(gx, gy);
    if (!obj) return false;
    return INTERACTABLE_OBJECTS.has(obj.assetId);
}

/**
 * Pick the closest walkable neighbour of (tx, ty) — the tile the player
 * should walk to when they click on an ore / prop / vendor. "Closest"
 * is measured from (fromGx, fromGy) so the player approaches from their
 * current side of the deposit rather than always picking the same
 * neighbour.
 *
 * Returns { gx, gy } or null if every neighbour is blocked.
 */
export function findAdjacentWalkable(tileMap, tx, ty, fromGx, fromGy) {
    const NEIGHBOURS = [
        { dx:  0, dy: -1 },
        { dx:  1, dy:  0 },
        { dx:  0, dy:  1 },
        { dx: -1, dy:  0 },
    ];
    let best = null;
    let bestDist = Infinity;
    for (const { dx, dy } of NEIGHBOURS) {
        const gx = tx + dx;
        const gy = ty + dy;
        if (!isWalkable(tileMap, gx, gy)) continue;
        const ddx = gx - fromGx;
        const ddy = gy - fromGy;
        const dist = ddx * ddx + ddy * ddy;
        if (dist < bestDist) {
            bestDist = dist;
            best = { gx, gy };
        }
    }
    return best;
}
