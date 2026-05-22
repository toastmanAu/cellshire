import { Inventory } from '../core/Inventory.js';
import { ResourceInventory } from '../resources/resourceInventory.js';
import {
    BuildingProgression,
    STANDARD_BUILDINGS,
    buildingCapabilityEffects,
    buildingProgressStorageKey,
    buildingProgressSummary,
    formatBuildingCost,
    loadBuildingProgression,
    saveBuildingProgression,
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
        expect(resources.get('wood')).toBe(12);
        expect(resources.get('stone')).toBe(16);
        expect(resources.get('crop')).toBe(17);
        expect(currencies.get('ckb')).toBe(500);
    });

    it('rejects building unlocks when either materials or CKB are short', () => {
        const progression = new BuildingProgression();
        const resources = new ResourceInventory();
        const currencies = new Inventory();
        resources.add('wood', 20);
        resources.add('stone', 20);
        resources.add('crop', 20);
        currencies.add('ckb', 1499);

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
        expect(currencies.get('ckb')).toBe(1499);
    });

    it('summarizes affordability from resource and currency inventories', () => {
        const progression = new BuildingProgression();
        const resources = new ResourceInventory([
            ['wood', 8],
            ['stone', 4],
            ['crop', 3],
        ]);
        const currencies = new Inventory();
        currencies.add('ckb', 1500);

        const workbench = buildingProgressSummary(progression, {
            resourceInventory: resources,
            currencyInventory: currencies,
        }).find(entry => entry.id === 'workbench');

        expect(workbench.canAffordNext).toBe(true);
        expect(workbench.actionLabel).toBe('Unlock');
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
