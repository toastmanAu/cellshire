import { isWalkable } from '../grid/walkability.js';
import { harvestResourceConfig, isHarvestResourceObject } from '../resources/harvestCatalog.js';

const NEIGHBOURS = Object.freeze([
    Object.freeze({ dx: 1, dy: 0 }),
    Object.freeze({ dx: -1, dy: 0 }),
    Object.freeze({ dx: 0, dy: 1 }),
    Object.freeze({ dx: 0, dy: -1 }),
]);

export function summarizeNearbyHarvestResources(tileMap, {
    spawn,
    maxSteps = 36,
} = {}) {
    if (!tileMap || !spawn || !isWalkable(tileMap, spawn.gx, spawn.gy)) {
        return emptySummary(maxSteps);
    }

    const queue = [{ gx: spawn.gx, gy: spawn.gy, steps: 0 }];
    const visited = new Set([cellKey(spawn.gx, spawn.gy)]);
    const resources = new Map();

    for (let i = 0; i < queue.length; i++) {
        const cell = queue[i];
        for (const { dx, dy } of NEIGHBOURS) {
            const gx = cell.gx + dx;
            const gy = cell.gy + dy;
            const obj = tileMap.objectAt(gx, gy);
            if (isHarvestResourceObject(obj)) resources.set(obj.id, obj);
        }
        if (cell.steps >= maxSteps) continue;
        for (const { dx, dy } of NEIGHBOURS) {
            const gx = cell.gx + dx;
            const gy = cell.gy + dy;
            const key = cellKey(gx, gy);
            if (visited.has(key)) continue;
            if (!isWalkable(tileMap, gx, gy)) continue;
            visited.add(key);
            queue.push({ gx, gy, steps: cell.steps + 1 });
        }
    }

    const counts = {};
    const yields = {};
    for (const obj of resources.values()) {
        const cfg = harvestResourceConfig(obj.role);
        if (!cfg) continue;
        counts[cfg.resourceId] = (counts[cfg.resourceId] ?? 0) + 1;
        yields[cfg.resourceId] = (yields[cfg.resourceId] ?? 0) + cfg.yieldAmount;
    }

    return {
        maxSteps,
        reachableCells: visited.size,
        totalNodes: resources.size,
        counts,
        yields,
    };
}

function emptySummary(maxSteps) {
    return {
        maxSteps,
        reachableCells: 0,
        totalNodes: 0,
        counts: {},
        yields: {},
    };
}

function cellKey(gx, gy) {
    return `${gx},${gy}`;
}
