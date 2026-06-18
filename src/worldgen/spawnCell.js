import { isWalkable } from '../grid/walkability.js';

/**
 * Pick a spawn cell on the largest connected walkable region. A naive
 * spiral-from-centre fails on water-heavy seeds: the closest walkable cell
 * to centre might be a tiny sand island with no land bridge to any ore.
 */
export function findSpawnCell(tileMap) {
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
        let closest = null;
        let closestDist = Infinity;
        for (const [gx, gy] of region) {
            const d = (gx - cx) * (gx - cx) + (gy - cy) * (gy - cy);
            if (d < closestDist) {
                closestDist = d;
                closest = [gx, gy];
            }
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
