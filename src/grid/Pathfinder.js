/**
 * Pathfinder.js
 *
 * A* over the TileMap using 4-directional moves. The walkability test is
 * injected so the same algorithm can serve different "player kinds" later
 * (a swimmer crosses water, a flying drone ignores objects, etc.).
 *
 * Performance: a binary min-heap frontier keeps the per-node pop O(log N).
 * On a 300×300 world (90k cells, the design ceiling) a worst-case search
 * runs in a few ms — well inside one frame. The closed set is a Uint8Array
 * keyed by `gy * width + gx` so visited-checks are O(1) without GC churn.
 */

import { isWalkable } from './walkability.js';

/* ── Min-heap keyed on `f` score ──────────────────────────────────── */

class MinHeap {
    constructor() { this.data = []; }
    get size() { return this.data.length; }
    push(node) {
        const a = this.data;
        a.push(node);
        let i = a.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (a[parent].f <= a[i].f) break;
            [a[parent], a[i]] = [a[i], a[parent]];
            i = parent;
        }
    }
    pop() {
        const a = this.data;
        if (a.length === 0) return null;
        const top = a[0];
        const last = a.pop();
        if (a.length > 0) {
            a[0] = last;
            let i = 0;
            const n = a.length;
            for (;;) {
                const l = i * 2 + 1;
                const r = l + 1;
                let smallest = i;
                if (l < n && a[l].f < a[smallest].f) smallest = l;
                if (r < n && a[r].f < a[smallest].f) smallest = r;
                if (smallest === i) break;
                [a[i], a[smallest]] = [a[smallest], a[i]];
                i = smallest;
            }
        }
        return top;
    }
}

/* ── A* search ────────────────────────────────────────────────────── */

const DIRS = [
    { dx:  0, dy: -1 },
    { dx:  1, dy:  0 },
    { dx:  0, dy:  1 },
    { dx: -1, dy:  0 },
];

/**
 * Find the shortest walkable path from (sx, sy) to (tx, ty).
 *
 * Returns an array of cells [{gx, gy}, …] starting with the FIRST step
 * after the start (the start itself is omitted) and ending at the goal.
 * Returns null if no path exists. Returns [] if start === goal.
 */
export function findPath(tileMap, sx, sy, tx, ty, walkable = isWalkable) {
    if (sx === tx && sy === ty) return [];
    if (!walkable(tileMap, tx, ty)) return null;

    const W = tileMap.width;
    const H = tileMap.height;
    const idx = (gx, gy) => gy * W + gx;

    const closed = new Uint8Array(W * H);
    const gScore = new Float64Array(W * H);
    gScore.fill(Infinity);
    const cameFrom = new Int32Array(W * H);
    cameFrom.fill(-1);

    const h = (gx, gy) => Math.abs(gx - tx) + Math.abs(gy - ty);

    const open = new MinHeap();
    const startIdx = idx(sx, sy);
    gScore[startIdx] = 0;
    open.push({ gx: sx, gy: sy, f: h(sx, sy) });

    while (open.size > 0) {
        const cur = open.pop();
        const ci = idx(cur.gx, cur.gy);
        if (closed[ci]) continue;
        closed[ci] = 1;

        if (cur.gx === tx && cur.gy === ty) {
            // Reconstruct path from cameFrom chain.
            const path = [];
            let i = ci;
            while (i !== startIdx) {
                const gy = (i / W) | 0;
                const gx = i - gy * W;
                path.push({ gx, gy });
                i = cameFrom[i];
                if (i < 0) return null; // defensive: chain broke
            }
            path.reverse();
            return path;
        }

        const curG = gScore[ci];
        for (const { dx, dy } of DIRS) {
            const nx = cur.gx + dx;
            const ny = cur.gy + dy;
            if (!walkable(tileMap, nx, ny)) continue;
            const ni = idx(nx, ny);
            if (closed[ni]) continue;
            const tentative = curG + 1;
            if (tentative >= gScore[ni]) continue;
            gScore[ni] = tentative;
            cameFrom[ni] = ci;
            open.push({ gx: nx, gy: ny, f: tentative + h(nx, ny) });
        }
    }

    return null;
}
