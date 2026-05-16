/**
 * Player.js
 *
 * Player avatar entity. Holds:
 *   - logical cell position (gx, gy) — the tile the player is "on"
 *   - screen-space position (x, y) — the pixel the avatar is drawn at,
 *     centred on the tile's diamond centre
 *   - a path queue of cells to walk through, advanced by `tick(dt)`
 *
 * `tick(dt)` moves the avatar in a straight line toward the next cell at
 * `speedCellsPerSec` cells/sec. When it arrives within a one-pixel snap
 * window, the current cell is updated and the queue advances. The Game's
 * frame loop drives this and marks the renderer dirty while moving.
 *
 * The placeholder draw is a chunky 32x64 humanoid block — matching the
 * size the real PNG will land at (sizeScale 0.5, 1:2 aspect, flatBase).
 * When the asset is added it slots in without renderer changes.
 */

import { CONFIG } from '../config.js';
import { cellToScreen } from '../grid/IsoGrid.js';
import { Inventory } from './Inventory.js';

const TH = CONFIG.tile.h;

/** Centre of the diamond for cell (gx, gy) in world-space pixels. */
function cellCenter(gx, gy) {
    return cellToScreen(gx + 0.5, gy + 0.5);
}

export class Player {
    constructor({ gx, gy, speedCellsPerSec = 3.5, assetId = null } = { gx: 0, gy: 0 }) {
        this.gx = gx;
        this.gy = gy;
        const c = cellCenter(gx, gy);
        this.x = c.x;
        this.y = c.y;
        this.speed = speedCellsPerSec; // cells per second
        this.path = [];                 // remaining cells to visit
        this._target = null;            // current step target {gx, gy, x, y}
        this.inventory = new Inventory();
        // Optional asset id for the player skin. When set AND the asset
        // is loaded, the renderer draws the PNG; otherwise it falls
        // back to the cobalt-cube placeholder. Lets us wire all three
        // character slots before the PNGs land.
        this.assetId = assetId;
        // Two-way facing for the PNG render path. 'right' is the
        // canonical PNG orientation; 'left' triggers a horizontal flip
        // in the renderer. Updated once per step in _advanceTarget.
        this.facing = 'right';
    }

    /** Replace the current path. Empty array stops the player on the spot. */
    setPath(cells) {
        this.path = cells.slice();
        this._target = null;
        this._advanceTarget();
    }

    isMoving() {
        return this._target !== null;
    }

    /** Returns the cell the player is *heading to*, or current cell if idle. */
    targetCell() {
        if (this._target) return { gx: this._target.gx, gy: this._target.gy };
        return { gx: this.gx, gy: this.gy };
    }

    /**
     * Advance toward the current target. `dtSec` is wall-clock seconds since
     * the last tick. Returns true if any visible motion happened (caller
     * uses this to schedule a renderer redraw).
     */
    tick(dtSec) {
        if (!this._target) return false;
        const speedPx = this._stepLengthPx() * this.speed;
        const remainingPx = Math.hypot(
            this._target.x - this.x,
            this._target.y - this.y,
        );
        if (remainingPx <= 0.5) {
            // Snap to target, advance to next step.
            this.x = this._target.x;
            this.y = this._target.y;
            this.gx = this._target.gx;
            this.gy = this._target.gy;
            this._advanceTarget();
            return true;
        }
        const stepPx = Math.min(speedPx * dtSec, remainingPx);
        const ratio = stepPx / remainingPx;
        this.x += (this._target.x - this.x) * ratio;
        this.y += (this._target.y - this.y) * ratio;
        return true;
    }

    /** World-space draw box for the placeholder avatar. Width 32, height 64. */
    drawBox() {
        // x, y are at the diamond centre. Drop the feet to the diamond's
        // front corner so the avatar visually stands in the tile (matches
        // the future PNG's flatBase anchor).
        const feetY = this.y + TH / 2;
        const W = 32;
        const H = 64;
        return {
            x: this.x - W / 2,
            y: feetY - H,
            w: W,
            h: H,
        };
    }

    /** Sort key for painter's-order against tiles + objects. */
    sortKey() {
        // Sub-cell precision so the player slides cleanly between rows as
        // it walks, instead of popping behind objects at row boundaries.
        const cx = this.x / (CONFIG.tile.w / 2);
        const cy = this.y / (CONFIG.tile.h / 2);
        const gx = (cx + cy) / 2;
        const gy = (cy - cx) / 2;
        return gx + gy;
    }

    _advanceTarget() {
        if (this.path.length === 0) {
            this._target = null;
            return;
        }
        const next = this.path.shift();
        const c = cellCenter(next.gx, next.gy);
        // Derive screen-x heading from the grid step. In iso projection
        // screenX = (gx - gy) * (TW/2), so sign(dgx - dgy) is the screen-x
        // sign of the move. Cardinals map: east/north → right, west/south
        // → left. dgx === dgy catches the (0,0) same-cell no-op and the
        // NW/SE diagonals (±1,±1) — the latter are impossible today (A* is
        // 4-neighbour) but would need a proper formula if 8-dir lands.
        const dgx = next.gx - this.gx;
        const dgy = next.gy - this.gy;
        if (dgx !== dgy) {
            this.facing = (dgx - dgy) >= 0 ? 'right' : 'left';
        }
        this._target = { gx: next.gx, gy: next.gy, x: c.x, y: c.y };
    }

    _stepLengthPx() {
        // Average pixel-distance between adjacent cell centres. In iso
        // space NS and EW neighbours have the same diagonal pixel
        // distance: sqrt((TW/2)^2 + (TH/2)^2). Cache once at module load.
        if (!Player._stepPx) {
            const a = cellCenter(0, 0);
            const b = cellCenter(1, 0);
            Player._stepPx = Math.hypot(b.x - a.x, b.y - a.y);
        }
        return Player._stepPx;
    }
}
