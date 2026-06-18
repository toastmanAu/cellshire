import { BuildingProgression, unlockOrUpgradeBuilding } from '../buildings/buildingProgression.js';
import { Inventory } from '../core/Inventory.js';
import { TileMap } from '../grid/TileMap.js';
import { fixedPriceSnapshot } from '../mining/cryptoEconomy.js';
import { PropInventory } from '../property/propInventory.js';
import { ResourceInventory } from '../resources/resourceInventory.js';
import { buyStoreItem } from '../store/generalStoreCatalog.js';
import { HouseTreasury, houseTreasurySummary } from '../treasury/houseTreasury.js';
import { LocalTraderAdapter } from '../trader/traderAdapter.js';
import { buildTraderRateTable, quoteTrade } from '../trader/traderRates.js';
import { ToolProgression, upgradeTool } from '../tools/toolProgression.js';
import { spendExpansionCost } from '../property/propertyExpansion.js';
import { FarmState } from '../farm/farmState.js';
import {
    FARM_STARTER_CROP_GROW_MS,
    farmBoundsForTier,
} from '../farm/farmZone.js';
import { describe, expect, it } from '../test/harness.js';
import { generateWorld } from '../worldgen/procgen.js';
import { findSpawnCell } from '../worldgen/spawnCell.js';
import { summarizeNearbyHarvestResources } from './earlyResourcePacing.js';

describe('early economy pacing', () => {
    it('lets a focused first-session budget buy space, a prop, one building, and one tool upgrade', () => {
        const buildings = new BuildingProgression();
        const tools = new ToolProgression();
        const resources = new ResourceInventory([
            ['wood', 16],
            ['stone', 6],
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

    it('runs the sparse-seed first-session progression sweep', () => {
        const map = new TileMap(80, 80);
        generateWorld(map, 20260523);
        const summary = summarizeNearbyHarvestResources(map, {
            spawn: findSpawnCell(map),
            maxSteps: 36,
        });
        const farm = new FarmState();
        const bounds = farmBoundsForTier(1);
        for (let gy = bounds.minGy; gy <= bounds.maxGy; gy++)
        for (let gx = bounds.minGx; gx <= bounds.maxGx; gx++) {
            farm.plant(gx, gy, { now: 1000 });
        }
        let crop = 0;
        for (const plot of farm.entries()) {
            const harvested = farm.harvest(plot.gx, plot.gy, { now: 1000 + FARM_STARTER_CROP_GROW_MS });
            if (harvested.ok && harvested.output.resourceId === 'crop') {
                crop += harvested.output.amount;
            }
        }

        expect((summary.counts.stone ?? 0) >= 2).toBe(true);
        expect((summary.yields.wood ?? 0) >= 16).toBe(true);
        expect((summary.yields.stone ?? 0) >= 6).toBe(true);
        expect(crop >= 6).toBe(true);

        const buildings = new BuildingProgression();
        const tools = new ToolProgression();
        const resources = new ResourceInventory([
            ['wood', 16],
            ['stone', 6],
            ['crop', crop],
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
        expect(resources.get('crop')).toBe(crop - 5);
        expect(props.get('blue_railing')).toBe(1);
        expect(tools.getTier('woodaxe')).toBe(2);
    });

    it('lets starter farm beds supply first-session crop without a long idle gate', () => {
        const farm = new FarmState();
        const bounds = farmBoundsForTier(1);
        let planted = 0;
        for (let gy = bounds.minGy; gy <= bounds.maxGy; gy++)
        for (let gx = bounds.minGx; gx <= bounds.maxGx; gx++) {
            const result = farm.plant(gx, gy, { now: 1000 });
            if (result.ok) planted++;
        }

        expect(planted).toBe(4);
        expect(farm.readyCount({ now: 1000 + FARM_STARTER_CROP_GROW_MS - 1 })).toBe(0);
        expect(farm.readyCount({ now: 1000 + FARM_STARTER_CROP_GROW_MS })).toBe(4);

        let crop = 0;
        for (const plot of farm.entries()) {
            const harvested = farm.harvest(plot.gx, plot.gy, { now: 1000 + FARM_STARTER_CROP_GROW_MS });
            if (harvested.ok && harvested.output.resourceId === 'crop') {
                crop += harvested.output.amount;
            }
        }
        expect(crop).toBe(12);
        expect(crop >= 6).toBe(true);
        expect(FARM_STARTER_CROP_GROW_MS <= 12_000).toBe(true);
    });

    it('keeps the live Trader fee visible without making early swaps punitive', async () => {
        const currencies = new Inventory();
        const treasury = new HouseTreasury();
        currencies.add('ckb', 10000);
        const quote = quoteTrade({
            fromCurrency: 'ckb',
            toCurrency: 'doge',
            fromAmount: 10000,
            rateTable: buildTraderRateTable(fixedPriceSnapshot()),
        });

        const swap = await new LocalTraderAdapter().swap({ inventory: currencies, quote });
        const entry = treasury.recordTraderFee({ quote, swap, at: 1000 });
        const summary = houseTreasurySummary(treasury);

        expect(swap.ok).toBe(true);
        expect(quote.feeBps).toBe(200);
        expect(Number((quote.netUsd / quote.grossUsd).toFixed(2))).toBe(0.98);
        expect(Number(quote.feeUsd.toFixed(4))).toBe(0.2871);
        expect(entry.source).toBe('trader');
        expect(summary.totalLabel).toBe('$0.2871');
        expect(summary.recent[0]).toBe('Trader fee · $0.2871');
        expect(currencies.get('ckb')).toBe(0);
        expect(currencies.get('doge')).toBe(134.2255827);
    });

    it('measures harvest resources reachable from representative first mine spawns', () => {
        for (const seed of [1337, 20260523, 0xC011]) {
            const map = new TileMap(80, 80);
            generateWorld(map, seed);
            const spawn = findSpawnCell(map);
            const summary = summarizeNearbyHarvestResources(map, { spawn, maxSteps: 36 });

            expect(summary.reachableCells > 300).toBe(true);
            expect((summary.counts.wood ?? 0) >= 2).toBe(true);
            expect((summary.counts.stone ?? 0) >= 2).toBe(true);
            expect((summary.yields.wood ?? 0) >= 8).toBe(true);
            expect((summary.yields.stone ?? 0) >= 6).toBe(true);
        }
    });
});
