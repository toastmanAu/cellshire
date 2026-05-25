import { Inventory } from '../core/Inventory.js';
import { ResourceInventory } from '../resources/resourceInventory.js';
import {
    BuildingProgression,
    STANDARD_BUILDINGS,
    STANDARD_BUILDING_ASSET_IDS,
    buildingCapabilityEffects,
    buildingTierGate,
    buildingProgressStorageKey,
    buildingProgressSummary,
    formatBuildingCost,
    isStandardBuildingAsset,
    isStandardBuildingAssetUnlocked,
    loadBuildingProgression,
    saveBuildingProgression,
    standardBuildingIdForAsset,
    unlockOrUpgradeBuilding,
} from './buildingProgression.js';
import { describe, expect, it } from '../test/harness.js';

describe('building progression', () => {
    it('starts every home with a level 1 house and locks the standard utility buildings', () => {
        const progression = new BuildingProgression();

        expect(progression.getLevel('home')).toBe(1);
        expect(progression.getLevel('workbench')).toBe(0);
        expect(progression.entries().map(entry => entry.id))
            .toEqual(STANDARD_BUILDINGS.map(entry => entry.id));
    });

    it('maps progression buildings to placeable home-base asset ids', () => {
        const progression = new BuildingProgression({ workbench: 1 });

        expect(STANDARD_BUILDING_ASSET_IDS.includes('house')).toBe(true);
        expect(STANDARD_BUILDING_ASSET_IDS.includes('workbench')).toBe(true);
        expect(standardBuildingIdForAsset('house')).toBe('home');
        expect(standardBuildingIdForAsset('workbench')).toBe('workbench');
        expect(isStandardBuildingAsset('workbench')).toBe(true);
        expect(isStandardBuildingAssetUnlocked(progression, 'house')).toBe(true);
        expect(isStandardBuildingAssetUnlocked(progression, 'workbench')).toBe(true);
        expect(isStandardBuildingAssetUnlocked(progression, 'tool_rack')).toBe(false);
    });

    it('requires wood, stone, crop, and CKB for every paid building step', () => {
        for (const building of STANDARD_BUILDINGS) {
            for (const cost of Object.values(building.levels)) {
                expect(cost.resources.wood > 0).toBe(true);
                expect(cost.resources.stone > 0).toBe(true);
                expect(cost.resources.crop > 0).toBe(true);
                expect(cost.ckb > 0).toBe(true);
                expect(formatBuildingCost(cost).includes('CKB')).toBe(true);
            }
        }
    });

    it('spends resources and CKB to unlock a building', () => {
        const progression = new BuildingProgression();
        const resources = new ResourceInventory();
        const currencies = new Inventory();
        resources.add('wood', 20);
        resources.add('stone', 20);
        resources.add('crop', 20);
        currencies.add('ckb', 2000);

        const result = unlockOrUpgradeBuilding({
            progression,
            buildingId: 'workbench',
            resourceInventory: resources,
            currencyInventory: currencies,
        });

        expect(result.ok).toBe(true);
        expect(progression.getLevel('workbench')).toBe(1);
        expect(resources.get('wood')).toBe(14);
        expect(resources.get('stone')).toBe(17);
        expect(resources.get('crop')).toBe(18);
        expect(currencies.get('ckb')).toBe(1100);
    });

    it('rejects building unlocks when either materials or CKB are short', () => {
        const progression = new BuildingProgression();
        const resources = new ResourceInventory();
        const currencies = new Inventory();
        resources.add('wood', 20);
        resources.add('stone', 20);
        resources.add('crop', 20);
        currencies.add('ckb', 899);

        const result = unlockOrUpgradeBuilding({
            progression,
            buildingId: 'workbench',
            resourceInventory: resources,
            currencyInventory: currencies,
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toBe('insufficient-funds');
        expect(progression.getLevel('workbench')).toBe(0);
        expect(resources.get('wood')).toBe(20);
        expect(currencies.get('ckb')).toBe(899);
    });

    it('summarizes affordability from resource and currency inventories', () => {
        const progression = new BuildingProgression();
        const resources = new ResourceInventory([
            ['wood', 6],
            ['stone', 3],
            ['crop', 2],
        ]);
        const currencies = new Inventory();
        currencies.add('ckb', 900);

        const workbench = buildingProgressSummary(progression, {
            resourceInventory: resources,
            currencyInventory: currencies,
        }).find(entry => entry.id === 'workbench');

        expect(workbench.canAffordNext).toBe(true);
        expect(workbench.actionLabel).toBe('Unlock');
    });

    it('gates higher building tiers until the previous tier is complete across the set', () => {
        const early = new BuildingProgression({ workbench: 1 });
        const locked = buildingProgressSummary(early, {
            resourceInventory: new ResourceInventory([['wood', 999], ['stone', 999], ['crop', 999]]),
            currencyInventory: (() => {
                const inv = new Inventory();
                inv.add('ckb', 999999);
                return inv;
            })(),
        }).find(entry => entry.id === 'workbench');

        expect(locked.canAffordNext).toBe(false);
        expect(locked.tierGate.ok).toBe(false);
        expect(locked.tierGate.requiredLevel).toBe(1);
        expect(locked.tierGateLabel.includes('Need all buildings Level 1')).toBe(true);

        const ready = new BuildingProgression({
            home: 1,
            workbench: 1,
            tool_rack: 1,
            sawmill: 1,
            stone_yard: 1,
            farm_storage: 1,
        });
        expect(buildingTierGate(ready, 'workbench', 2).ok).toBe(true);
    });

    it('derives conservative resource-yield bonuses from utility building levels', () => {
        const progression = new BuildingProgression({
            sawmill: 2,
            stone_yard: 1,
            farm_storage: 2,
        });
        const effects = buildingCapabilityEffects(progression);

        expect(effects.resourceYieldAmount('wood', 3)).toBe(5);
        expect(effects.resourceYieldAmount('stone', 2)).toBe(3);
        expect(effects.resourceYieldAmount('crop', 2)).toBe(4);
        expect(effects.resourceYieldAmount('gold', 1)).toBe(1);
        expect(effects.buildingEffects.sawmill).toBe('Wood harvest +2');
    });

    it('persists owner-keyed building levels', () => {
        const store = new Map();
        const storage = {
            get: key => store.get(key) ?? null,
            set: (key, value) => store.set(key, value),
        };
        const progression = new BuildingProgression({ home: 2, workbench: 1 });

        expect(saveBuildingProgression(storage, 'joyid:alice', progression)).toBe(true);
        expect(store.has(buildingProgressStorageKey('joyid:alice'))).toBe(true);

        const loaded = loadBuildingProgression(storage, 'joyid:alice');
        expect(loaded.getLevel('home')).toBe(2);
        expect(loaded.getLevel('workbench')).toBe(1);
        expect(loaded.getLevel('sawmill')).toBe(0);
    });
});
