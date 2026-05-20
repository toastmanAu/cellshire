import { describe, it, expect } from '../test/harness.js';
import { Inventory } from '../core/Inventory.js';
import {
    MAX_PROPERTY_TIER,
    canAffordExpansion,
    formatExpansionCost,
    nextPropertyTier,
    normalizePropertyTier,
    propertyBoundsForTier,
    propertyExpansionPreview,
    propertyTierSummary,
    spendExpansionCost,
} from './propertyExpansion.js';

describe('propertyExpansion tiers', () => {
    it('normalizes invalid tiers into the supported range', () => {
        expect(normalizePropertyTier(null)).toBe(1);
        expect(normalizePropertyTier(99)).toBe(MAX_PROPERTY_TIER);
        expect(normalizePropertyTier(2)).toBe(2);
    });

    it('expands editable bounds one ring at a time', () => {
        expect(propertyBoundsForTier(1)).toEqual({ minGx: 4, minGy: 4, maxGx: 19, maxGy: 19 });
        expect(propertyBoundsForTier(2)).toEqual({ minGx: 3, minGy: 3, maxGx: 20, maxGy: 20 });
        expect(propertyBoundsForTier(4)).toEqual({ minGx: 1, minGy: 1, maxGx: 22, maxGy: 22 });
    });

    it('describes the current and next claim tiers', () => {
        const summary = propertyTierSummary(1);
        expect(summary.label).toBe('Tier 1 · 16x16');
        expect(summary.next.name).toBe('Garden claim');
        expect(formatExpansionCost(summary.next.cost)).toBe('10000.00 CKB');
        expect(nextPropertyTier(4)).toBeNull();
    });

    it('spends local CKB to unlock the next tier', () => {
        const inv = new Inventory();
        inv.add('ckb', 12000);
        expect(canAffordExpansion(inv, 1)).toBe(true);
        const result = spendExpansionCost(inv, 1);
        expect(result.ok).toBe(true);
        expect(result.tier).toBe(2);
        expect(inv.get('ckb')).toBe(2000);
    });

    it('rejects expansion when the local balance is short', () => {
        const inv = new Inventory();
        inv.add('ckb', 9999);
        const result = spendExpansionCost(inv, 1);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('insufficient-funds');
        expect(inv.get('ckb')).toBe(9999);
    });

    it('builds a renderer preview for current and next bounds', () => {
        const preview = propertyExpansionPreview(2);
        expect(preview.currentBounds).toEqual({ minGx: 3, minGy: 3, maxGx: 20, maxGy: 20 });
        expect(preview.nextBounds).toEqual({ minGx: 2, minGy: 2, maxGx: 21, maxGy: 21 });
    });
});
