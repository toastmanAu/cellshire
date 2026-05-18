import { describe, it, expect } from '../test/harness.js';
import { Inventory } from '../core/Inventory.js';
import { fixedPriceSnapshot } from '../mining/cryptoEconomy.js';
import { buildEconomySummary } from './EconomyHUD.js';

describe('EconomyHUD summary', () => {
    it('totals balances against the active price snapshot', () => {
        const inv = new Inventory();
        inv.add('btc', 0.001);
        inv.add('ckb', 1000);
        const summary = buildEconomySummary(inv, fixedPriceSnapshot());
        expect(summary.entries.length).toBe(2);
        expect(Number(summary.totalUsd.toFixed(2))).toBe(78.28);
        expect(summary.hasBalances).toBe(true);
    });

    it('reports an empty portfolio before mining', () => {
        const summary = buildEconomySummary(new Inventory(), fixedPriceSnapshot());
        expect(summary.entries.length).toBe(0);
        expect(summary.totalUsd).toBe(0);
        expect(summary.hasBalances).toBe(false);
    });
});
