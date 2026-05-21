import { describe, it, expect } from '../test/harness.js';
import { ResourceInventory } from '../resources/resourceInventory.js';
import {
    canAffordFarmExpansion,
    farmBoundsForTier,
    farmTierSummary,
    formatFarmExpansionCost,
    isFarmCell,
    spendFarmExpansionCost,
} from './farmZone.js';

describe('farm zone tiers', () => {
    it('defines an expandable farm area inside the home plot', () => {
        expect(farmBoundsForTier(1)).toEqual({ minGx: 15, minGy: 13, maxGx: 16, maxGy: 14 });
        expect(farmTierSummary(1).label).toBe('Farm 1 · 2x2');
        expect(isFarmCell(15, 13, 1)).toBe(true);
        expect(isFarmCell(14, 13, 1)).toBe(false);
    });

    it('spends local wood and stone to unlock the next farm tier', () => {
        const inventory = new ResourceInventory();
        inventory.add('wood', 12);
        inventory.add('stone', 8);
        expect(canAffordFarmExpansion(inventory, 1)).toBe(true);
        const result = spendFarmExpansionCost(inventory, 1);
        expect(result.ok).toBe(true);
        expect(result.tier).toBe(2);
        expect(inventory.get('wood')).toBe(0);
        expect(inventory.get('stone')).toBe(0);
    });

    it('formats resource costs for UI labels', () => {
        expect(formatFarmExpansionCost({ wood: 12, stone: 8 })).toBe('12 Wood + 8 Stone');
    });
});
