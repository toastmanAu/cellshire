import { describe, it, expect } from '../test/harness.js';
import {
    resolveNodeEndpoint,
    getCurrentEpochHash,
    seedFromHash,
    seedOverrideFromUrl,
    getProcgenSeed,
} from './epochSeed.js';

function fakeStorage(initial = {}) {
    const m = new Map(Object.entries(initial));
    return {
        get: k => (m.has(k) ? m.get(k) : null),
        set: (k, v) => m.set(k, String(v)),
        remove: k => m.delete(k),
    };
}

const DEFAULT = 'https://testnet.ckb.dev';

describe('resolveNodeEndpoint', () => {
    it('returns the default when URL and storage are both empty', () => {
        const s = fakeStorage();
        expect(resolveNodeEndpoint({ url: null, storage: s, defaultUrl: DEFAULT })).toBe(DEFAULT);
    });

    it('returns and persists the URL flag when present', () => {
        const s = fakeStorage();
        const out = resolveNodeEndpoint({
            url: 'http://my-node:8114', storage: s, defaultUrl: DEFAULT,
        });
        expect(out).toBe('http://my-node:8114');
        expect(s.get('cellshire:node')).toBe('http://my-node:8114');
    });

    it('returns stored value when URL flag is missing', () => {
        const s = fakeStorage({ 'cellshire:node': 'http://stored:8114' });
        expect(resolveNodeEndpoint({ url: null, storage: s, defaultUrl: DEFAULT }))
            .toBe('http://stored:8114');
    });

    it('clears storage and returns default when URL flag is empty string', () => {
        const s = fakeStorage({ 'cellshire:node': 'http://stored:8114' });
        const out = resolveNodeEndpoint({ url: '', storage: s, defaultUrl: DEFAULT });
        expect(out).toBe(DEFAULT);
        expect(s.get('cellshire:node')).toBeNull();
    });
});

describe('seedFromHash', () => {
    it('derives a uint32 from the first 8 hex chars after 0x', () => {
        // 0xdeadbeef = 3735928559
        expect(seedFromHash('0xdeadbeefcafe1234')).toBe(0xdeadbeef >>> 0);
    });

    it('works without the 0x prefix', () => {
        expect(seedFromHash('deadbeefcafe1234')).toBe(0xdeadbeef >>> 0);
    });

    it('is deterministic — same hash → same seed', () => {
        const a = seedFromHash('0x1234567890abcdef');
        const b = seedFromHash('0x1234567890abcdef');
        expect(a).toBe(b);
    });

    it('throws on empty / non-hex input rather than silently returning 0', () => {
        let threw = 0;
        try { seedFromHash('0x'); } catch { threw++; }
        try { seedFromHash(''); } catch { threw++; }
        try { seedFromHash('0xZZZZZZZZ'); } catch { threw++; }
        expect(threw).toBe(3);
    });
});

describe('seedOverrideFromUrl', () => {
    it('normalizes decimal uint32 URL seed overrides', () => {
        expect(seedOverrideFromUrl('20260523')).toBe(20260523);
        expect(seedOverrideFromUrl('0')).toBe(0);
        expect(seedOverrideFromUrl('4294967295')).toBe(0xffffffff);
    });

    it('rejects missing, non-decimal, and out-of-range overrides', () => {
        expect(seedOverrideFromUrl(null)).toBeNull();
        expect(seedOverrideFromUrl('')).toBeNull();
        expect(seedOverrideFromUrl('0x1337')).toBeNull();
        expect(seedOverrideFromUrl('1.5')).toBeNull();
        expect(seedOverrideFromUrl('4294967296')).toBeNull();
    });
});

function makeFakeFetch(responses) {
    // responses: array of either { ok, json } objects or thunks that throw
    let i = 0;
    return async () => {
        const r = responses[i++];
        if (typeof r === 'function') return r();
        return {
            ok: r.ok ?? true,
            status: r.status ?? 200,
            json: async () => r.json,
        };
    };
}

describe('getCurrentEpochHash', () => {
    it('returns { hash, number } on the happy path', async () => {
        const fetch = makeFakeFetch([
            { json: { result: { number: '0x3877', start_number: '0xe10510' } } },
            { json: { result: '0xabcdef1234567890' } },
        ]);
        const out = await getCurrentEpochHash(DEFAULT, { fetch });
        expect(out.hash).toBe('0xabcdef1234567890');
        expect(out.number).toBe('14455');  // 0x3877 = 14455 decimal
    });

    it('returns best-effort epoch progress when the RPC has length and tip', async () => {
        const fetch = makeFakeFetch([
            { json: { result: { number: '0x3877', start_number: '0x64', length: '0x64' } } },
            { json: { result: '0xabcdef1234567890' } },
            { json: { result: { number: '0x96' } } },
        ]);
        const out = await getCurrentEpochHash(DEFAULT, { fetch });
        expect(out.epochInfo.number).toBe('14455');
        expect(out.epochInfo.startNumber).toBe(100);
        expect(out.epochInfo.length).toBe(100);
        expect(out.epochInfo.tipNumber).toBe(150);
    });

    it('throws on HTTP non-2xx', async () => {
        const fetch = makeFakeFetch([{ ok: false, status: 500, json: {} }]);
        let threw = false;
        try { await getCurrentEpochHash(DEFAULT, { fetch }); } catch { threw = true; }
        expect(threw).toBe(true);
    });

    it('throws on RPC error body', async () => {
        const fetch = makeFakeFetch([
            { json: { error: { code: -32000, message: 'nope' } } },
        ]);
        let threw = false;
        try { await getCurrentEpochHash(DEFAULT, { fetch }); } catch { threw = true; }
        expect(threw).toBe(true);
    });

    it('throws on network error', async () => {
        const fetch = makeFakeFetch([() => { throw new Error('connection refused'); }]);
        let threw = false;
        try { await getCurrentEpochHash(DEFAULT, { fetch }); } catch { threw = true; }
        expect(threw).toBe(true);
    });

    it('throws on slow RPC timeout', async () => {
        const fetch = (_endpoint, init) => new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
        let message = '';
        try {
            await getCurrentEpochHash(DEFAULT, { fetch, timeoutMs: 1 });
        } catch (err) {
            message = err.message;
        }
        expect(message).toBe('RPC timeout after 1ms from get_current_epoch');
    });
});

describe('getProcgenSeed', () => {
    it('uses an explicit URL seed override without touching the node or cache', async () => {
        const storage = fakeStorage();
        let fetchCalls = 0;
        const fetch = async () => {
            fetchCalls++;
            throw new Error('should not fetch');
        };
        const out = await getProcgenSeed({
            url: null,
            seedOverride: '20260523',
            storage,
            fetch,
            defaultUrl: DEFAULT,
        });
        expect(out.source).toBe('url');
        expect(out.seed).toBe(20260523);
        expect(out.epoch).toBeNull();
        expect(out.hash).toBeNull();
        expect(fetchCalls).toBe(0);
        expect(storage.get('cellshire:lastEpoch')).toBeNull();
    });

    it('happy path: source=live, seed derived from hash, caches result', async () => {
        const storage = fakeStorage();
        const fetch = makeFakeFetch([
            { json: { result: { number: '0x3877', start_number: '0xe10510' } } },
            { json: { result: '0xdeadbeef00000000' } },
        ]);
        const out = await getProcgenSeed({
            url: null, storage, fetch, defaultUrl: DEFAULT,
        });
        expect(out.source).toBe('live');
        expect(out.seed).toBe(0xdeadbeef >>> 0);
        expect(out.epoch).toBe('14455');
        expect(out.hash).toBe('0xdeadbeef00000000');
        const cached = JSON.parse(storage.get('cellshire:lastEpoch'));
        expect(cached.hash).toBe('0xdeadbeef00000000');
        expect(cached.number).toBe('14455');
    });

    it('falls back to cached when fetch fails', async () => {
        const storage = fakeStorage({
            'cellshire:lastEpoch': JSON.stringify({
                hash: '0xcafef00d00000000', number: '14400',
            }),
        });
        const fetch = makeFakeFetch([() => { throw new Error('network'); }]);
        const out = await getProcgenSeed({
            url: null, storage, fetch, defaultUrl: DEFAULT,
        });
        expect(out.source).toBe('cached');
        expect(out.seed).toBe(0xcafef00d >>> 0);
        expect(out.epoch).toBe('14400');
        expect(out.hash).toBe('0xcafef00d00000000');
    });

    it('falls back to random when fetch fails AND cache is cold', async () => {
        const storage = fakeStorage();
        const fetch = makeFakeFetch([() => { throw new Error('network'); }]);
        const out = await getProcgenSeed({
            url: null, storage, fetch, defaultUrl: DEFAULT,
        });
        expect(out.source).toBe('random');
        expect(out.epoch).toBeNull();
        expect(out.hash).toBeNull();
        expect(typeof out.seed).toBe('number');
    });

    it('falls through to random when cached value is malformed', async () => {
        const storage = fakeStorage({ 'cellshire:lastEpoch': 'not json' });
        const fetch = makeFakeFetch([() => { throw new Error('network'); }]);
        const out = await getProcgenSeed({
            url: null, storage, fetch, defaultUrl: DEFAULT,
        });
        expect(out.source).toBe('random');
        expect(out.epoch).toBeNull();
    });
});
