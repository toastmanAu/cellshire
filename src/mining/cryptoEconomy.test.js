import { describe, it, expect } from '../test/harness.js';
import {
    CURRENCY_CATALOG,
    ORE_CURRENCY_MAP,
    amountForUsdValue,
    currencyDisplayName,
    currencySymbol,
    formatCurrencyAmount,
    rewardCurrencyForOre,
    rollOreValueUsd,
} from './cryptoEconomy.js';
import { ORE_CATALOG } from './oreCatalog.js';

describe('crypto economy mapping', () => {
    it('maps every current mineable deposit to a proof-of-work currency', () => {
        expect(Object.keys(ORE_CATALOG).sort()).toEqual(Object.keys(ORE_CURRENCY_MAP).sort());
        for (const currencyId of Object.values(ORE_CURRENCY_MAP)) {
            expect(CURRENCY_CATALOG[currencyId].pow).toBe(true);
        }
    });

    it('uses the requested deposit-to-crypto associations', () => {
        expect(rewardCurrencyForOre('gold_ore')).toBe('btc');
        expect(rewardCurrencyForOre('silver_ore')).toBe('ltc');
        expect(rewardCurrencyForOre('diamond_ore')).toBe('doge');
        expect(rewardCurrencyForOre('cobalt_ore')).toBe('dash');
        expect(rewardCurrencyForOre('copper_ore')).toBe('xmr');
        expect(rewardCurrencyForOre('coal_seam')).toBe('zec');
        expect(rewardCurrencyForOre('ckb_cluster')).toBe('ckb');
        expect(rewardCurrencyForOre('amethyst_geode')).toBe('kas');
        expect(rewardCurrencyForOre('iron_ore')).toBe('erg');
        expect(rewardCurrencyForOre('silicon_quartz')).toBe('bch');
        expect(rewardCurrencyForOre('lithium_ore')).toBe('dgb');
        expect(rewardCurrencyForOre('bismuth_ore')).toBe('rvn');
    });

    it('exposes player-facing currency labels and symbols', () => {
        expect(currencyDisplayName('btc')).toBe('Bitcoin');
        expect(currencySymbol('rvn')).toBe('RVN');
    });

    it('scales mined quantity by fixed USD value and coin price', () => {
        expect(amountForUsdValue('btc', 100)).toBe(0.00130129);
        expect(amountForUsdValue('ckb', 100)).toBe(69658.74182381);
        expect(amountForUsdValue('erg', 75)).toBe(265.98008341);
    });

    it('rolls deterministic per-ore USD value budgets in the target range', () => {
        expect(rollOreValueUsd(() => 0)).toBe(50);
        expect(rollOreValueUsd(() => 0.5)).toBe(125);
        expect(rollOreValueUsd(() => 1)).toBe(200);
    });

    it('formats small and large balances for the inventory HUD', () => {
        expect(formatCurrencyAmount('btc', 0.00001301)).toBe('0.00001301 BTC');
        expect(formatCurrencyAmount('ckb', 696.58741266)).toBe('696.59 CKB');
        expect(formatCurrencyAmount('doge', 9.54080443)).toBe('9.5408 DOGE');
    });
});
