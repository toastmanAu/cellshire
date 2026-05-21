import { describe, it, expect } from '../test/harness.js';
import { fixedPriceSnapshot } from '../mining/cryptoEconomy.js';
import { buildTraderRateTable, quoteTrade } from '../trader/traderRates.js';
import {
    HOUSE_TREASURY_STORAGE_KEY,
    HouseTreasury,
    houseTreasurySummary,
    loadHouseTreasury,
    saveHouseTreasury,
} from './houseTreasury.js';

function fakeStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        get: key => data.get(key) ?? null,
        set: (key, value) => data.set(key, value),
    };
}

describe('HouseTreasury', () => {
    it('records trader fee entries from prepared quotes', () => {
        const treasury = new HouseTreasury();
        const quote = quoteTrade({
            fromCurrency: 'ckb',
            toCurrency: 'doge',
            fromAmount: 1000,
            rateTable: buildTraderRateTable(fixedPriceSnapshot(), { feeBps: 100 }),
        });
        const entry = treasury.recordTraderFee({ quote, swap: { mode: 'local' }, at: 123 });
        expect(entry.source).toBe('trader');
        expect(Number(entry.amountUsd.toFixed(4))).toBe(0.0144);
        expect(entry.detail.fromCurrency).toBe('ckb');
        expect(entry.detail.toCurrency).toBe('doge');
        expect(entry.detail.feeBps).toBe(100);
        expect(treasury.totalUsd()).toBe(entry.amountUsd);
    });

    it('persists and reloads treasury entries', () => {
        const storage = fakeStorage();
        const treasury = new HouseTreasury();
        treasury.record({ source: 'trader', amountUsd: 1.25, at: 1 });
        expect(saveHouseTreasury(storage, treasury)).toBe(true);
        const loaded = loadHouseTreasury(storage);
        expect(storage.get(HOUSE_TREASURY_STORAGE_KEY) !== null).toBe(true);
        expect(loaded.totalUsd()).toBe(1.25);
        expect(loaded.entries()[0].source).toBe('trader');
    });

    it('summarizes balances for HUD and bank views', () => {
        const treasury = new HouseTreasury([
            { source: 'trader', amountUsd: 1.25, at: 1 },
            { source: 'trader', amountUsd: 2.5, at: 2 },
        ]);
        const summary = houseTreasurySummary(treasury);
        expect(summary.totalLabel).toBe('$3.75');
        expect(summary.feeCount).toBe(2);
        expect(summary.recent[0]).toBe('Trader fee · $2.50');
    });

    it('ignores invalid or zero fee entries', () => {
        const treasury = new HouseTreasury();
        expect(treasury.record({ source: 'trader', amountUsd: 0 })).toBeNull();
        expect(treasury.recordTraderFee({ quote: { ok: false } })).toBeNull();
        expect(treasury.entries().length).toBe(0);
    });
});
