import { describe, it, expect } from '../test/harness.js';
import { Inventory } from '../core/Inventory.js';
import { fixedPriceSnapshot } from '../mining/cryptoEconomy.js';
import {
    FixtureCurrencyIndexer,
    ReadOnlyChainCurrencyAdapter,
} from '../economy/currencyAdapter.js';
import { PendingCurrencyDeltaStore } from '../economy/pendingCurrencyDeltas.js';
import {
    chainTraderEnabled,
    chainTraderSubmitMode,
    ChainTraderAdapter,
    CellswapTraderAdapter,
    LocalTraderAdapter,
    makeTraderAdapterFromParams,
} from './traderAdapter.js';
import { buildTraderRateTable, quoteTrade } from './traderRates.js';

function fakeStorage(initial = {}) {
    const m = new Map(Object.entries(initial));
    return {
        get: k => (m.has(k) ? m.get(k) : null),
        set: (k, v) => m.set(k, String(v)),
    };
}

describe('LocalTraderAdapter', () => {
    it('swaps local balances using a prepared quote', async () => {
        const inventory = new Inventory();
        inventory.add('ckb', 1000);
        const quote = quoteTrade({
            fromCurrency: 'ckb',
            toCurrency: 'doge',
            fromAmount: 1000,
            rateTable: buildTraderRateTable(fixedPriceSnapshot(), { feeBps: 100 }),
        });
        const out = await new LocalTraderAdapter().swap({ inventory, quote });
        expect(out.ok).toBe(true);
        expect(inventory.get('ckb')).toBe(0);
        expect(inventory.get('doge')).toBe(13.55952315);
        expect(Number(out.feeUsd.toFixed(4))).toBe(0.0144);
        expect(out.feeBps).toBe(100);
    });

    it('rejects swaps when the balance is short', async () => {
        const inventory = new Inventory();
        inventory.add('ckb', 10);
        const quote = quoteTrade({
            fromCurrency: 'ckb',
            toCurrency: 'doge',
            fromAmount: 1000,
            rateTable: buildTraderRateTable(fixedPriceSnapshot()),
        });
        const out = await new LocalTraderAdapter().swap({ inventory, quote });
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('insufficient-funds');
        expect(inventory.get('ckb')).toBe(10);
    });
});

describe('CellswapTraderAdapter', () => {
    it('keeps the future chain adapter boundary explicit', async () => {
        const out = await new CellswapTraderAdapter().swap({});
        expect(out.mode).toBe('cellswap');
        expect(out.reason).toBe('not-implemented');
    });
});

describe('ChainTraderAdapter', () => {
    it('builds a trader swap tx and records pending source/target deltas', async () => {
        const inventory = new Inventory();
        inventory.add('bch', 1);
        const quote = quoteTrade({
            fromCurrency: 'bch',
            toCurrency: 'zec',
            fromAmount: 0.1,
            rateTable: buildTraderRateTable(fixedPriceSnapshot()),
        });
        const pending = [];
        let submitted = null;
        const out = await new ChainTraderAdapter({
            storage: fakeStorage(),
            owner: 'ckt1owner',
            inventoryAdapter: {
                addPendingDelta(delta) {
                    pending.push(delta);
                },
            },
            submit: async (tx) => {
                submitted = tx;
                return { ok: true, txHash: '0xswap' };
            },
        }).swap({ inventory, quote });
        expect(out.ok).toBe(true);
        expect(out.mode).toBe('chain-prototype');
        expect(submitted.kind).toBe('cellshire_trader_swap_tx');
        expect(inventory.get('bch')).toBe(1);
        expect(pending.map(delta => [delta.currency, delta.amount])).toEqual([
            ['bch', -0.1],
            ['zec', quote.toAmount],
        ]);
    });

    it('selects the chain adapter only behind the explicit flag', () => {
        expect(chainTraderEnabled(new URLSearchParams('chainTrader=1'))).toBe(true);
        expect(chainTraderSubmitMode(new URLSearchParams('chainTraderSubmit=ccc'))).toBe('ccc-joyid');
        expect(makeTraderAdapterFromParams({ params: new URLSearchParams(''), storage: fakeStorage() }).constructor.name)
            .toBe('LocalTraderAdapter');
        expect(makeTraderAdapterFromParams({ params: new URLSearchParams('chainTrader=1'), storage: fakeStorage() }).constructor.name)
            .toBe('ChainTraderAdapter');
    });

    it('requires a connected wallet for CCC-backed trader swaps', async () => {
        const inventory = new Inventory();
        inventory.add('bch', 1);
        const quote = quoteTrade({
            fromCurrency: 'bch',
            toCurrency: 'zec',
            fromAmount: 0.1,
            rateTable: buildTraderRateTable(fixedPriceSnapshot()),
        });
        const out = await makeTraderAdapterFromParams({
            params: new URLSearchParams('chainTrader=1&chainTraderSubmit=ccc'),
            storage: fakeStorage(),
        }).swap({ inventory, quote });
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('wallet-disconnected');
    });

    it('settles fixture swaps and lets indexed balances clear pending deltas', async () => {
        const storage = fakeStorage();
        const pendingDeltas = new PendingCurrencyDeltaStore({ storage, owner: 'ckt1owner' });
        const indexer = new FixtureCurrencyIndexer({
            balances: { bch: { amount: 1, stale: false } },
        });
        const chainAdapter = new ReadOnlyChainCurrencyAdapter({
            localInventory: new Inventory(),
            owner: 'ckt1owner',
            chainCurrencyIds: ['bch', 'zec'],
            indexer,
            pendingDeltas,
        });
        const first = await chainAdapter.read();
        const quote = quoteTrade({
            fromCurrency: 'bch',
            toCurrency: 'zec',
            fromAmount: 0.1,
            rateTable: buildTraderRateTable(fixedPriceSnapshot()),
        });
        const out = await new ChainTraderAdapter({
            storage,
            owner: 'ckt1owner',
            inventoryAdapter: chainAdapter,
        }).swap({ inventory: first.currencies, quote });
        expect(out.ok).toBe(true);
        expect(out.mode).toBe('chain-fixture-settled');
        expect(pendingDeltas.list().length).toBe(2);
        const reconciled = await chainAdapter.read();
        expect(reconciled.pending).toBe(false);
        expect(reconciled.currencies.get('bch')).toBe(0.9);
        expect(reconciled.currencies.get('zec')).toBe(quote.toAmount);
    });
});
