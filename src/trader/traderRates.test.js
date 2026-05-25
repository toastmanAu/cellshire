import { describe, it, expect } from '../test/harness.js';
import { fixedPriceSnapshot } from '../mining/cryptoEconomy.js';
import {
    buildTraderRateTable,
    formatPairRate,
    formatTradeQuote,
    quoteTrade,
    TRADER_FEE_BPS,
    traderCurrencyIds,
} from './traderRates.js';

describe('traderRates', () => {
    it('defaults to a 2% house trader fee', () => {
        const table = buildTraderRateTable(fixedPriceSnapshot());
        expect(TRADER_FEE_BPS).toBe(200);
        expect(table.feeBps).toBe(200);
        expect(table.feeMultiplier).toBe(0.98);
    });

    it('builds a deterministic price-backed rate table', () => {
        const table = buildTraderRateTable(fixedPriceSnapshot(), { feeBps: 100 });
        expect(table.prices.btc).toBe(76847);
        expect(table.prices.ckb).toBe(0.00143557);
        expect(table.feeMultiplier).toBe(0.99);
    });

    it('quotes swaps through USD value with a fixed fee', () => {
        const table = buildTraderRateTable(fixedPriceSnapshot(), { feeBps: 100 });
        const quote = quoteTrade({
            fromCurrency: 'ckb',
            toCurrency: 'doge',
            fromAmount: 1000,
            rateTable: table,
        });
        expect(quote.ok).toBe(true);
        expect(Number(quote.netUsd.toFixed(4))).toBe(1.4212);
        expect(quote.toAmount).toBe(13.55952315);
    });

    it('rejects invalid pairs and missing rates', () => {
        const table = buildTraderRateTable(fixedPriceSnapshot());
        expect(quoteTrade({
            fromCurrency: 'btc',
            toCurrency: 'btc',
            fromAmount: 1,
            rateTable: table,
        }).reason).toBe('invalid-pair');
        expect(quoteTrade({
            fromCurrency: 'btc',
            toCurrency: 'unknown',
            fromAmount: 1,
            rateTable: table,
        }).reason).toBe('missing-rate');
    });

    it('formats quote and pair rate strings for the UI', () => {
        const table = buildTraderRateTable(fixedPriceSnapshot(), { feeBps: 100 });
        const quote = quoteTrade({
            fromCurrency: 'ckb',
            toCurrency: 'doge',
            fromAmount: 1000,
            rateTable: table,
        });
        expect(formatTradeQuote(quote)).toBe('1000.00 CKB for 13.5595 DOGE ($1.42 after 1% fee)');
        expect(formatPairRate(quote)).toBe('1 CKB = 0.013559523151 DOGE');
    });

    it('lists the current economy currencies', () => {
        expect(traderCurrencyIds().length).toBe(12);
    });
});
