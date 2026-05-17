/**
 * OreState.js
 *
 * Per-instance mining state for one ore PlacedObject. Stored side-band
 * in `Game.oreStates` (keyed by PlacedObject.id) rather than mutating
 * the PlacedObject — this keeps the renderer, save system, and
 * placement system unaware of mining, and mirrors how the on-chain
 * version will work later: one CKB cell per ore = one OreState.
 *
 * `mine(rand)` is the only mutating call. Returns the yield + a flag
 * for whether the ore is now depleted, or null if already empty.
 */

import { oreConfig, randInt } from './oreCatalog.js';

export class OreState {
    /**
     * Build an OreState from an ore asset ID. Capacity is rolled within
     * the catalog's capacityRange using the supplied rand fn so a single
     * procgen seed produces the same ore distribution every load.
     */
    static fromAsset(assetId, rand = Math.random) {
        const cfg = oreConfig(assetId);
        if (!cfg) return null;
        const capacity = randInt(rand, cfg.capacityRange[0], cfg.capacityRange[1]);
        return new OreState(assetId, capacity, capacity);
    }

    constructor(oreType, capacityRemaining, maxCapacity) {
        this.oreType = oreType;
        this.capacityRemaining = capacityRemaining;
        this.maxCapacity = maxCapacity;
    }

    isDepleted() { return this.capacityRemaining <= 0; }

    /**
     * Restore the remaining capacity to a known value (e.g. from a
     * persisted mined-state at boot). Clamped to [0, maxCapacity] so
     * external callers can't push the invariant out of range.
     */
    restoreCapacity(n) {
        this.capacityRemaining = Math.max(0, Math.min(this.maxCapacity, n));
    }

    /**
     * Attempt one mining hit. Rolls a yield in the catalog's yieldRange,
     * applies the current epoch yield multiplier, decrements capacity,
     * and returns the result. Returns null if the ore is already
     * depleted (caller should remove the cell at that point).
     */
    mine(rand = Math.random, { yieldMultiplier = 1 } = {}) {
        if (this.isDepleted()) return null;
        const cfg = oreConfig(this.oreType);
        const multiplier = Number.isFinite(yieldMultiplier) && yieldMultiplier > 1
            ? Math.floor(yieldMultiplier)
            : 1;
        const baseAmount = cfg
            ? randInt(rand, cfg.yieldRange[0], cfg.yieldRange[1])
            : 1;
        this.capacityRemaining--;
        return {
            currency: this.oreType,
            amount: baseAmount * multiplier,
            baseAmount,
            yieldMultiplier: multiplier,
            depleted: this.isDepleted(),
        };
    }
}
