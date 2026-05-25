import { BuildingProgression, unlockOrUpgradeBuilding } from '../buildings/buildingProgression.js';
import { Inventory } from '../core/Inventory.js';
import { PropInventory } from '../property/propInventory.js';
import { ResourceInventory } from '../resources/resourceInventory.js';
import { buyStoreItem } from '../store/generalStoreCatalog.js';
import { ToolProgression, upgradeTool } from '../tools/toolProgression.js';
import { spendExpansionCost } from '../property/propertyExpansion.js';
import { describe, expect, it } from '../test/harness.js';

describe('early economy pacing', () => {
    it('lets a focused first-session budget buy space, a prop, one building, and one tool upgrade', () => {
        const buildings = new BuildingProgression();
        const tools = new ToolProgression();
        const resources = new ResourceInventory([
            ['wood', 16],
            ['stone', 9],
            ['crop', 6],
        ]);
        const currencies = new Inventory();
        const props = new PropInventory();
        currencies.add('ckb', 10000);

        expect(spendExpansionCost(currencies, 1).ok).toBe(true);
        expect(buyStoreItem({
            assetId: 'blue_railing',
            inventory: currencies,
            propInventory: props,
            propertyTier: 2,
        }).ok).toBe(true);
        expect(unlockOrUpgradeBuilding({
            progression: buildings,
            buildingId: 'tool_rack',
            resourceInventory: resources,
            currencyInventory: currencies,
        }).ok).toBe(true);
        expect(upgradeTool({
            toolProgression: tools,
            buildingProgression: buildings,
            resourceInventory: resources,
            currencyInventory: currencies,
            toolId: 'woodaxe',
        }).ok).toBe(true);

        expect(currencies.get('ckb')).toBe(50);
        expect(resources.get('wood')).toBe(2);
        expect(resources.get('stone')).toBe(0);
        expect(resources.get('crop')).toBe(1);
        expect(props.get('blue_railing')).toBe(1);
    });
});
