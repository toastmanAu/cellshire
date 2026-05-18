import { describe, it, expect } from '../test/harness.js';
import {
    coinGeckoSimplePriceUrl,
    getEpochPriceSnapshot,
    parseCoinGeckoSimplePrice,
    priceSnapshotStoreKey,
} from './priceSnapshot.js';

function fakeStorage(initial = {}) {
    const m = new Map(Object.entries(initial));
    return {
        get: k => (m.has(k) ? m.get(k) : null),
        set: (k, v) => m.set(k, String(v)),
        remove: k => m.delete(k),
    };
}

function sampleBody() {
    return {
        bitcoin: { usd: 100000, last_updated_at: 1779113192 },
        litecoin: { usd: 50, last_updated_at: 1779113182 },
        dogecoin: { usd: 0.1, last_updated_at: 1779113184 },
        dash: { usd: 40, last_updated_at: 1779113182 },
        monero: { usd: 400, last_updated_at: 1779113186 },
        zcash: { usd: 500, last_updated_at: 1779113184 },
        'nervos-network': { usd: 0.001, last_updated_at: 1779113190 },
        kaspa: { usd: 0.03, last_updated_at: 1779113183 },
        ergo: { usd: 0.3, last_updated_at: 1779113182 },
        'bitcoin-cash': { usd: 400, last_updated_at: 1779113186 },
        digibyte: { usd: 0.004, last_updated_at: 1779113185 },
        ravencoin: { usd: 0.005, last_updated_at: 1779113187 },
    };
}

describe('price snapshot', () => {
    it('builds the CoinGecko simple price URL for all mapped currencies', () => {
        const url = coinGeckoSimplePriceUrl();
        expect(url.includes('/simple/price?')).toBe(true);
        expect(url.includes('bitcoin%2Clitecoin')).toBe(true);
        expect(url.includes('vs_currencies=usd')).toBe(true);
    });

    it('parses CoinGecko prices into internal currency ids', () => {
        const out = parseCoinGeckoSimplePrice(sampleBody(), { fetchedAtMs: 1 });
        expect(out.prices.btc).toBe(100000);
        expect(out.prices.ckb).toBe(0.001);
        expect(out.prices.rvn).toBe(0.005);
        expect(out.capturedAt).toBe('2026-05-18T14:06:32.000Z');
    });

    it('fetches and caches a live epoch snapshot', async () => {
        const storage = fakeStorage();
        const out = await getEpochPriceSnapshot({
            epoch: '14455',
            storage,
            fetch: async () => ({
                ok: true,
                async json() { return sampleBody(); },
            }),
        });
        expect(out.mode).toBe('live');
        expect(JSON.parse(storage.get(priceSnapshotStoreKey('14455'))).prices.btc).toBe(100000);
    });

    it('falls back to cached snapshot when live fetch fails', async () => {
        const cached = {
            source: 'coingecko:simple-price',
            capturedAt: 'cached',
            vsCurrency: 'usd',
            prices: { btc: 1 },
        };
        const storage = fakeStorage({
            [priceSnapshotStoreKey('14455')]: JSON.stringify(cached),
        });
        const out = await getEpochPriceSnapshot({
            epoch: '14455',
            storage,
            fetch: async () => { throw new Error('offline'); },
        });
        expect(out.mode).toBe('cached');
        expect(out.prices.btc).toBe(1);
    });

    it('uses the fixed testnet table when live and cache are unavailable', async () => {
        const out = await getEpochPriceSnapshot({
            epoch: '14455',
            storage: fakeStorage(),
            fetch: async () => { throw new Error('offline'); },
        });
        expect(out.mode).toBe('fixed');
        expect(out.prices.btc).toBe(76847);
    });
});
