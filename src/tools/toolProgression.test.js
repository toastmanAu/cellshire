import {
    BuildingProgression,
    activeBuildingIdsFromAssetIds,
    activeBuildingProgression,
} from '../buildings/buildingProgression.js';
import { Inventory } from '../core/Inventory.js';
import { ResourceInventory } from '../resources/resourceInventory.js';
import {
    MAX_TOOL_TIER,
    TOOL_LINE_IDS,
    TOOL_LINES,
    ToolProgression,
    loadToolProgression,
    saveToolProgression,
    toolIconSrc,
    toolOreCapacityPerHit,
    toolProgressStorageKey,
    toolProgressSummary,
    toolResourceYieldAmount,
    upgradeTool,
} from './toolProgression.js';
import { describe, expect, it } from '../test/harness.js';

describe('tool progression', () => {
    it('starts with baseline pickaxe, woodaxe, and hoe/scythe lines', () => {
        const summary = toolProgressSummary({
            toolProgression: new ToolProgression(),
            buildingProgression: new BuildingProgression(),
        });

        expect(summary.lines.map(line => line.id)).toEqual(TOOL_LINE_IDS);
        expect(summary.lines.map(line => line.current.name))
            .toEqual(['Rusted Pickaxe', 'Rusted Woodaxe', 'Worn Hoe']);
        expect(summary.lines.every(line => line.canUpgrade === false)).toBe(true);
        expect(summary.lines[0].nextRequiredLabel).toBe('Tool Rack 1');
        expect(summary.lines[0].iconSrc).toBe('assets/tool_pickaxe_t1.png');
        expect(summary.lines[1].nextIconSrc).toBe('assets/tool_woodaxe_t2.png');
    });

    it('maps tool tiers to installed icon assets', () => {
        expect(toolIconSrc('pickaxe', 6)).toBe('assets/tool_pickaxe_t6.png');
        expect(toolIconSrc('hoe_scythe', 4)).toBe('assets/tool_hoe_scythe_t4.png');
    });

    it('defines six paid/earned tiers for every tool family', () => {
        expect(MAX_TOOL_TIER).toBe(6);
        for (const line of TOOL_LINES) {
            expect(line.tiers.map(entry => entry.tier)).toEqual([1, 2, 3, 4, 5, 6]);
            expect(line.tiers[5].name.includes('Diamond')).toBe(true);
            expect(line.tiers[5].requiredToolRackLevel).toBe(5);
            expect(line.tiers[5].cost.resources.wood > 0).toBe(true);
            expect(line.tiers[5].cost.resources.stone > 0).toBe(true);
            expect(line.tiers[5].cost.resources.crop > 0).toBe(true);
            expect(line.tiers[5].cost.resources.herb > 0).toBe(true);
            expect(line.tiers[5].cost.resources.gold > 0).toBe(true);
            expect(line.tiers[5].cost.ckb > 0).toBe(true);
        }
    });

    it('spends materials and CKB to upgrade one selected tool line', () => {
        const tools = new ToolProgression();
        const resources = new ResourceInventory([
            ['wood', 7],
            ['stone', 3],
            ['crop', 3],
        ]);
        const currencies = new Inventory();
        currencies.add('ckb', 1100);

        const result = upgradeTool({
            toolProgression: tools,
            buildingProgression: new BuildingProgression({ tool_rack: 1 }),
            resourceInventory: resources,
            currencyInventory: currencies,
            toolId: 'woodaxe',
        });

        expect(result.ok).toBe(true);
        expect(result.toolId).toBe('woodaxe');
        expect(tools.getTier('woodaxe')).toBe(2);
        expect(tools.getTier('pickaxe')).toBe(1);
        expect(resources.get('wood')).toBe(0);
        expect(resources.get('stone')).toBe(0);
        expect(resources.get('crop')).toBe(0);
        expect(currencies.get('ckb')).toBe(0);
    });

    it('requires a placed Tool Rack when active progression is provided', () => {
        const progression = new BuildingProgression({ tool_rack: 1 });
        const inactive = activeBuildingProgression(progression, activeBuildingIdsFromAssetIds(['house']));
        const active = activeBuildingProgression(progression, activeBuildingIdsFromAssetIds(['house', 'tool_rack']));
        const resources = new ResourceInventory([
            ['wood', 6],
            ['stone', 7],
            ['crop', 3],
        ]);
        const currencies = new Inventory();
        currencies.add('ckb', 1100);

        const locked = upgradeTool({
            toolProgression: new ToolProgression(),
            buildingProgression: progression,
            activeBuildingProgression: inactive,
            resourceInventory: resources,
            currencyInventory: currencies,
            toolId: 'pickaxe',
        });
        expect(locked.reason).toBe('locked');
        expect(toolProgressSummary({
            toolProgression: new ToolProgression(),
            buildingProgression: progression,
            activeBuildingProgression: active,
            resourceInventory: resources,
            currencyInventory: currencies,
        }).lines[0].canUpgrade).toBe(true);
    });

    it('applies each tool bonus only to its corresponding resource', () => {
        const tools = new ToolProgression({
            tiers: { pickaxe: 6, woodaxe: 4, hoe_scythe: 2 },
        });

        expect(toolResourceYieldAmount(tools, 'stone', 3)).toBe(9);
        expect(toolResourceYieldAmount(tools, 'wood', 3)).toBe(6);
        expect(toolResourceYieldAmount(tools, 'crop', 3)).toBe(4);
        expect(toolResourceYieldAmount(tools, 'gold', 3)).toBe(3);
    });

    it('lets upgraded pickaxes extract ore capacity faster without affecting other tools', () => {
        expect(toolOreCapacityPerHit(new ToolProgression())).toBe(1);
        expect(toolOreCapacityPerHit(new ToolProgression({ tiers: { pickaxe: 2 } }))).toBe(1);
        expect(toolOreCapacityPerHit(new ToolProgression({ tiers: { pickaxe: 3 } }))).toBe(2);
        expect(toolOreCapacityPerHit(new ToolProgression({ tiers: { pickaxe: 6 } }))).toBe(3);

        const summary = toolProgressSummary({
            toolProgression: new ToolProgression({ tiers: { pickaxe: 3 } }),
            buildingProgression: new BuildingProgression(),
        });
        expect(summary.lines[0].effectLabel).toBe('Stone yield +2 · Ore x2');
        expect(summary.lines[1].effectLabel).toBe('Wood baseline yield');
    });

    it('gates diamond upgrades behind Tool Rack level 5', () => {
        const tools = new ToolProgression({ tiers: { pickaxe: 5 } });
        const resources = new ResourceInventory([
            ['wood', 210],
            ['stone', 280],
            ['crop', 95],
            ['herb', 35],
            ['gold', 4],
        ]);
        const currencies = new Inventory();
        currencies.add('ckb', 95000);

        const locked = upgradeTool({
            toolProgression: tools,
            buildingProgression: new BuildingProgression({ tool_rack: 4 }),
            resourceInventory: resources,
            currencyInventory: currencies,
            toolId: 'pickaxe',
        });
        expect(locked.ok).toBe(false);
        expect(locked.reason).toBe('locked');
        expect(locked.requiredToolRackLevel).toBe(5);

        const upgraded = upgradeTool({
            toolProgression: tools,
            buildingProgression: new BuildingProgression({ tool_rack: 5 }),
            resourceInventory: resources,
            currencyInventory: currencies,
            toolId: 'pickaxe',
        });
        expect(upgraded.ok).toBe(true);
        expect(tools.getTier('pickaxe')).toBe(6);
        expect(resources.get('wood')).toBe(0);
        expect(resources.get('stone')).toBe(0);
        expect(resources.get('crop')).toBe(0);
        expect(resources.get('herb')).toBe(0);
        expect(resources.get('gold')).toBe(0);
        expect(currencies.get('ckb')).toBe(0);
    });

    it('persists owner-keyed tool progression', () => {
        const store = new Map();
        const storage = {
            get: key => store.get(key) ?? null,
            set: (key, value) => store.set(key, value),
        };
        const tools = new ToolProgression({ tiers: { pickaxe: 6, woodaxe: 4, hoe_scythe: 1 } });

        expect(saveToolProgression(storage, 'joyid:alice', tools)).toBe(true);
        expect(store.has(toolProgressStorageKey('joyid:alice'))).toBe(true);

        const loaded = loadToolProgression(storage, 'joyid:alice');
        expect(loaded.getTier('pickaxe')).toBe(6);
        expect(loaded.getTier('woodaxe')).toBe(4);
        expect(loaded.getTier('hoe_scythe')).toBe(1);
    });

    it('migrates legacy single-tier saves across all tool lines', () => {
        const store = new Map([[toolProgressStorageKey('joyid:alice'), JSON.stringify({ v: 1, tier: 2 })]]);
        const storage = {
            get: key => store.get(key) ?? null,
        };

        const loaded = loadToolProgression(storage, 'joyid:alice');

        expect(loaded.getTier('pickaxe')).toBe(2);
        expect(loaded.getTier('woodaxe')).toBe(2);
        expect(loaded.getTier('hoe_scythe')).toBe(2);
    });
});
