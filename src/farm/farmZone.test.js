import { describe, it, expect } from '../test/harness.js';
import { Inventory } from '../core/Inventory.js';
import { ResourceInventory } from '../resources/resourceInventory.js';
import {
    canAffordFarmExpansion,
    farmCropAssetId,
    farmCropIdForCell,
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

    it('spends local materials and CKB to unlock the next farm tier', () => {
        const inventory = new ResourceInventory();
        const currencies = new Inventory();
        inventory.add('wood', 10);
        inventory.add('stone', 7);
        currencies.add('ckb', 500);
        expect(canAffordFarmExpansion(inventory, 1, currencies)).toBe(true);
        const result = spendFarmExpansionCost(inventory, 1, currencies);
        expect(result.ok).toBe(true);
        expect(result.tier).toBe(2);
        expect(inventory.get('wood')).toBe(0);
        expect(inventory.get('stone')).toBe(0);
        expect(currencies.get('ckb')).toBe(0);
    });

    it('requires herb and CKB for the field patch expansion', () => {
        const inventory = new ResourceInventory([
            ['wood', 28],
            ['stone', 18],
            ['herb', 4],
        ]);
        const currencies = new Inventory();
        currencies.add('ckb', 2199);
        expect(canAffordFarmExpansion(inventory, 2, currencies)).toBe(false);
        currencies.add('ckb', 1);
        expect(spendFarmExpansionCost(inventory, 2, currencies).ok).toBe(true);
        expect(inventory.get('herb')).toBe(0);
        expect(currencies.get('ckb')).toBe(0);
    });

    it('formats resource costs for UI labels', () => {
        expect(formatFarmExpansionCost({
            resources: { wood: 10, stone: 7 },
            ckb: 500,
        })).toBe('10 Wood + 7 Stone + 500.00 CKB');
    });

    it('maps planted crop plots to planted and ready visuals', () => {
        const plot = { cropId: 'starter_crop', plantedAt: 1000, readyAt: 16000 };
        expect(farmCropAssetId(plot, 15000)).toBe('farm_plot_starter_crop');
        expect(farmCropAssetId(plot, 16000)).toBe('farm_plot_ready_crop');
    });

    it('selects upgraded farm crops from expanded farm tiers', () => {
        expect(farmCropIdForCell(15, 13, 1)).toBe('starter_crop');
        expect(farmCropIdForCell(15, 12, 2)).toBe('herb_crop');
        expect(farmCropIdForCell(14, 11, 3)).toBe('timber_plot');
    });

    it('maps herb and timber plots to their ready visuals', () => {
        expect(farmCropAssetId({ cropId: 'herb_crop', readyAt: 2000 }, 1000)).toBe('garden_bed');
        expect(farmCropAssetId({ cropId: 'herb_crop', readyAt: 2000 }, 2000)).toBe('veg_garden');
        expect(farmCropAssetId({ cropId: 'timber_plot', readyAt: 2000 }, 1000)).toBe('dry_grass');
        expect(farmCropAssetId({ cropId: 'timber_plot', readyAt: 2000 }, 2000)).toBe('harvest_tree');
    });

    it('can map crop visuals by epoch timing when requested', () => {
        const plot = {
            cropId: 'starter_crop',
            plantedAt: 1000,
            readyAt: 16000,
            plantedEpoch: 12,
            readyEpoch: 13,
        };
        expect(farmCropAssetId(plot, { now: 16000, epoch: 12, timing: 'epoch' })).toBe('farm_plot_starter_crop');
        expect(farmCropAssetId(plot, { now: 1000, epoch: 13, timing: 'epoch' })).toBe('farm_plot_ready_crop');
    });
});
