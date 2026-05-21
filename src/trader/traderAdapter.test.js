import { describe, it, expect } from '../test/harness.js';
import { Inventory } from '../core/Inventory.js';
import { fixedPriceSnapshot } from '../mining/cryptoEconomy.js';
import { LocalTraderAdapter, CellswapTraderAdapter } from './traderAdapter.js';
import { buildTraderRateTable, quoteTrade } from './traderRates.js';

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
