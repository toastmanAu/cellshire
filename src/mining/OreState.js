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

import {
    DEFAULT_ORE_VALUE_USD_RANGE,
    amountForUsdValue,
    rewardCurrencyForOre,
    rollOreValueUsd,
} from './cryptoEconomy.js';
import { oreConfig, randInt } from './oreCatalog.js';

export class OreState {
    /**
     * Build an OreState from an ore asset ID. Capacity is rolled within
     * the catalog's capacityRange using the supplied rand fn so a single
     * procgen seed produces the same ore distribution every load.
     */
    static fromAsset(assetId, rand = Math.random, opts = {}) {
        const cfg = oreConfig(assetId);
        if (!cfg) return null;
        const capacity = randInt(rand, cfg.capacityRange[0], cfg.capacityRange[1]);
        const totalValueUsd = opts.totalValueUsd
            ?? rollOreValueUsd(rand, opts.valueRangeUsd ?? DEFAULT_ORE_VALUE_USD_RANGE);
        return new OreState(assetId, capacity, capacity, {
            totalValueUsd,
            remainingValueUsd: totalValueUsd,
        });
    }

    constructor(oreType, capacityRemaining, maxCapacity, opts = {}) {
        this.oreType = oreType;
        this.capacityRemaining = capacityRemaining;
        this.maxCapacity = maxCapacity;
        this.totalValueUsd = Number.isFinite(opts.totalValueUsd)
            ? opts.totalValueUsd
            : maxCapacity;
        this.remainingValueUsd = Number.isFinite(opts.remainingValueUsd)
            ? opts.remainingValueUsd
            : this.totalValueUsd * (capacityRemaining / Math.max(1, maxCapacity));
    }

    isDepleted() { return this.capacityRemaining <= 0; }

    /**
     * Restore the remaining capacity to a known value (e.g. from a
     * persisted mined-state at boot). Clamped to [0, maxCapacity] so
     * external callers can't push the invariant out of range.
     */
    restoreCapacity(n) {
        this.capacityRemaining = Math.max(0, Math.min(this.maxCapacity, n));
        this.remainingValueUsd = Number((
            this.totalValueUsd * (this.capacityRemaining / Math.max(1, this.maxCapacity))
        ).toFixed(8));
    }

    /**
     * Attempt one mining action. Higher-tier tools can extract more than
     * one capacity chunk at once, but the base USD value is still drawn
     * from the ore's remaining value so the vein's total value stays fixed.
     * Returns null if the ore is already depleted.
     */
    mine(rand = Math.random, { yieldMultiplier = 1, priceSnapshot = null, capacityPerHit = 1 } = {}) {
        if (this.isDepleted()) return null;
        const multiplier = Number.isFinite(yieldMultiplier) && yieldMultiplier > 1
            ? Math.floor(yieldMultiplier)
            : 1;
        const requestedCapacity = Math.max(1, Math.floor(Number(capacityPerHit) || 1));
        const capacitySpent = Math.min(this.capacityRemaining, requestedCapacity);
        const baseValueUsd = this.capacityRemaining <= capacitySpent
            ? this.remainingValueUsd
            : (this.remainingValueUsd / this.capacityRemaining) * capacitySpent;
        const valueUsd = Number((baseValueUsd * multiplier).toFixed(8));
        this.remainingValueUsd = Number(Math.max(0, this.remainingValueUsd - baseValueUsd).toFixed(8));
        const currency = rewardCurrencyForOre(this.oreType);
        this.capacityRemaining -= capacitySpent;
        return {
            oreType: this.oreType,
            currency,
            amount: amountForUsdValue(currency, valueUsd, { priceSnapshot }),
            baseValueUsd: Number(baseValueUsd.toFixed(8)),
            valueUsd,
            yieldMultiplier: multiplier,
            capacitySpent,
            depleted: this.isDepleted(),
        };
    }
}
