import { describe, it, expect } from '../test/harness.js';
import { Inventory } from '../core/Inventory.js';
import { PropInventory } from '../property/propInventory.js';
import { buildEconomySummary } from '../ui/EconomyHUD.js';
import {
    ChainInventoryAdapter,
    LocalInventoryAdapter,
    buildInventorySnapshot,
    normalizeInventoryCell,
} from './inventoryAdapter.js';
import { fixedPriceSnapshot } from '../mining/cryptoEconomy.js';

function currencyCell(currency, amount, blockNumber = 10) {
    return {
        schema: 'cellshire.inventory',
        version: 1,
        kind: 'currency',
        cellId: `cell:${currency}:${amount}:${blockNumber}`,
        owner: 'ckt1owner',
        currency,
        amount,
        blockNumber,
    };
}

function propCell(assetId, count, blockNumber = 10) {
    return {
        schema: 'cellshire.inventory',
        version: 1,
        kind: 'prop',
        cellId: `cell:${assetId}:${count}:${blockNumber}`,
        owner: 'ckt1owner',
        assetId,
        count,
        blockNumber,
    };
}

describe('inventory adapter', () => {
    it('normalizes currency and prop inventory cells', () => {
        expect(normalizeInventoryCell(currencyCell('ckb', 12)).amount).toBe(12);
        expect(normalizeInventoryCell(propCell('bench', 2)).count).toBe(2);
        expect(normalizeInventoryCell({ schema: 'bad' })).toBeNull();
    });

    it('builds chain views with the same currency and prop inventory interface', () => {
        const snapshot = buildInventorySnapshot([
            currencyCell('ckb', 1000),
            currencyCell('ckb', 250),
            propCell('bench', 2),
        ]);
        expect(snapshot.currencies.get('ckb')).toBe(1250);
        expect(snapshot.props.get('bench')).toBe(2);
        expect(snapshot.currencies.entries()[0][0]).toBe('ckb');
    });

    it('applies pending deltas and flags stale indexer reads', () => {
        const snapshot = buildInventorySnapshot([
            currencyCell('ckb', 1000, 7),
            currencyCell('doge', 5, 12),
            propCell('bench', 1, 12),
        ], {
            minBlockNumber: 10,
            pending: [
                { kind: 'currency', currency: 'ckb', amount: 300 },
                { kind: 'prop', assetId: 'bench', count: -1 },
            ],
        });
        expect(snapshot.stale).toBe(true);
        expect(snapshot.staleCells.length).toBe(1);
        expect(snapshot.currencies.get('ckb')).toBe(300);
        expect(snapshot.props.get('bench')).toBe(0);
    });

    it('lets HUD summaries render local or chain currency views through the same interface', async () => {
        const localCurrencies = new Inventory();
        localCurrencies.add('ckb', 1000);
        const local = await new LocalInventoryAdapter({
            currencies: localCurrencies,
            props: new PropInventory(),
        }).read();
        const chain = buildInventorySnapshot([currencyCell('ckb', 1000)]);
        expect(buildEconomySummary(local.currencies, fixedPriceSnapshot()).totalUsd)
            .toBe(buildEconomySummary(chain.currencies, fixedPriceSnapshot()).totalUsd);
    });

    it('reads player cells through a chain indexer adapter', async () => {
        const adapter = new ChainInventoryAdapter({
            owner: 'ckt1owner',
            indexer: {
                async getInventoryCells({ owner }) {
                    expect(owner).toBe('ckt1owner');
                    return [currencyCell('ckb', 42), propCell('crate', 1)];
                },
            },
        });
        const snapshot = await adapter.read();
        expect(snapshot.source).toBe('chain');
        expect(snapshot.currencies.get('ckb')).toBe(42);
        expect(snapshot.props.get('crate')).toBe(1);
    });
});
