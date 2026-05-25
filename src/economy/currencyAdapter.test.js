import { describe, expect, it } from '../test/harness.js';
import { Inventory } from '../core/Inventory.js';
import {
    FixtureCurrencyIndexer,
    LocalCurrencyAdapter,
    ReadOnlyChainCurrencyAdapter,
} from './currencyAdapter.js';
import { PendingCurrencyDeltaStore } from './pendingCurrencyDeltas.js';

function fakeStorage() {
    const m = new Map();
    return {
        get: k => (m.has(k) ? m.get(k) : null),
        set: (k, v) => m.set(k, String(v)),
    };
}

describe('currency adapters', () => {
    it('reads local currency balances unchanged', async () => {
        const inventory = new Inventory();
        inventory.add('bch', 2);
        const snapshot = await new LocalCurrencyAdapter({ inventory }).read();
        expect(snapshot.source).toBe('local');
        expect(snapshot.currencies.get('bch')).toBe(2);
    });

    it('overlays bch from a chain fixture while other currencies fall back local', async () => {
        const local = new Inventory();
        local.add('bch', 2);
        local.add('ckb', 1000);
        const snapshot = await new ReadOnlyChainCurrencyAdapter({
            localInventory: local,
            owner: 'ckt1owner',
            indexer: new FixtureCurrencyIndexer({
                balances: { bch: { amount: 4.5, stale: false } },
            }),
        }).read();
        expect(snapshot.source).toBe('chain');
        expect(snapshot.currencies.get('bch')).toBe(4.5);
        expect(snapshot.currencies.get('ckb')).toBe(1000);
        expect(snapshot.stale).toBe(false);
    });

    it('surfaces stale chain reads without mutating local fallback balances', async () => {
        const local = new Inventory();
        local.add('bch', 2);
        const snapshot = await new ReadOnlyChainCurrencyAdapter({
            localInventory: local,
            owner: 'ckt1owner',
            indexer: new FixtureCurrencyIndexer({ offline: true }),
        }).read();
        expect(snapshot.source).toBe('chain');
        expect(snapshot.stale).toBe(true);
        expect(snapshot.currencies.get('bch')).toBe(0);
    });

    it('overlays pending chain deltas and clears them after indexed balance catches up', async () => {
        const storage = fakeStorage();
        const pendingDeltas = new PendingCurrencyDeltaStore({ storage, owner: 'ckt1owner' });
        const indexer = new FixtureCurrencyIndexer({
            balances: { zec: { amount: 1, stale: false } },
        });
        const adapter = new ReadOnlyChainCurrencyAdapter({
            localInventory: new Inventory(),
            owner: 'ckt1owner',
            chainCurrencyIds: ['zec'],
            indexer,
            pendingDeltas,
        });
        await adapter.read();
        adapter.addPendingDelta({
            currency: 'zec',
            amount: 0.25,
            txHash: '0xmine',
            source: 'mining',
        });
        const pending = await adapter.read();
        expect(pending.pending).toBe(true);
        expect(pending.currencies.get('zec')).toBe(1.25);
        indexer.balances.zec = { amount: 1.25, stale: false };
        const reconciled = await adapter.read();
        expect(reconciled.pending).toBe(false);
        expect(reconciled.pendingDeltas.length).toBe(0);
        expect(reconciled.currencies.get('zec')).toBe(1.25);
    });

    it('applies fixture Trader settlement to indexed source and target balances', async () => {
        const indexer = new FixtureCurrencyIndexer({
            balances: { bch: { amount: 1, stale: false } },
        });
        const adapter = new ReadOnlyChainCurrencyAdapter({
            localInventory: new Inventory(),
            owner: 'ckt1owner',
            chainCurrencyIds: ['bch', 'zec'],
            indexer,
        });
        const settlement = adapter.settleTraderSwapTx({
            kind: 'cellshire_trader_swap_tx',
            action: 'swap',
            tx_nonce: 'swap-1',
            inputs: {
                source_balance_cell: { owner: 'ckt1owner', currency: 'bch', amount: 0.1 },
            },
            outputs: {
                target_balance_cell: { owner: 'ckt1owner', currency: 'zec', amount: 0.25 },
                treasury_fee_receipt: { currency: 'bch', fee_bps: 200 },
            },
            witness: {
                address: 'ckt1owner',
                trader_quote: {
                    from_currency: 'bch',
                    from_amount: 0.1,
                    to_currency: 'zec',
                    to_amount: 0.25,
                    fee_bps: 200,
                },
            },
        }, { txHash: '0xswap' });
        expect(settlement.ok).toBe(true);
        const snapshot = await adapter.read();
        expect(snapshot.currencies.get('bch')).toBe(0.9);
        expect(snapshot.currencies.get('zec')).toBe(0.25);
    });
});
