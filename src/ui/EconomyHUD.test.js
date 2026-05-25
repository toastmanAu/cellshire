import { describe, it, expect } from '../test/harness.js';
import { Inventory } from '../core/Inventory.js';
import { fixedPriceSnapshot } from '../mining/cryptoEconomy.js';
import { buildEconomySummary, installEconomyHUD, priceSnapshotDetail } from './EconomyHUD.js';

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

    it('formats price snapshot details for the disclosure affordance', () => {
        const detail = priceSnapshotDetail({
            mode: 'live',
            source: 'coingecko:simple-price',
            capturedAt: '2026-05-18T14:06:32Z',
            vsCurrency: 'usd',
        });
        expect(detail.label).toBe('prices live · 2026-05-18');
        expect(detail.rows).toEqual([
            ['Mode', 'live'],
            ['Source', 'coingecko:simple-price'],
            ['Captured', '2026-05-18T14:06:32Z'],
            ['Currency', 'USD'],
        ]);
    });

    it('renders balances from an inventory adapter snapshot', async () => {
        const chainCurrencies = new Inventory();
        chainCurrencies.add('ckb', 1000);
        const hud = installEconomyHUD({
            player: { inventory: new Inventory() },
            inventoryAdapter: {
                async read() {
                    return {
                        source: 'chain',
                        stale: false,
                        currencies: chainCurrencies,
                    };
                },
            },
            priceSnapshot: fixedPriceSnapshot(),
        });
        await hud.refresh();
        expect(hud.el.textContent.includes('CKB')).toBe(true);
        expect(hud.el.textContent.includes('$1.44')).toBe(true);
        hud.dismiss();
    });

    it('switches between local and chain wallet balance sources', async () => {
        const local = new Inventory();
        local.add('ckb', 1000);
        const chain = new Inventory();
        chain.add('bch', 2);
        const changes = [];
        const hud = installEconomyHUD({
            player: { inventory: local },
            inventoryAdapters: {
                local: {
                    async read() {
                        return { source: 'local', stale: false, currencies: local };
                    },
                },
                chain: {
                    async read() {
                        return { source: 'chain', stale: false, currencies: chain };
                    },
                },
            },
            initialInventorySource: 'local',
            onInventorySourceChange: source => changes.push(source),
            priceSnapshot: fixedPriceSnapshot(),
        });
        await hud.refresh();
        expect(hud.getInventorySource()).toBe('local');
        expect(hud.el.textContent.includes('Local wallet')).toBe(true);
        expect(hud.el.textContent.includes('CKB')).toBe(true);
        await hud.setInventorySource('chain');
        expect(hud.getInventorySource()).toBe('chain');
        expect(changes).toEqual(['chain']);
        expect(hud.el.textContent.includes('Chain wallet')).toBe(true);
        expect(hud.el.textContent.includes('BCH')).toBe(true);
        hud.dismiss();
    });
});
