import { describe, expect, it } from '../test/harness.js';
import {
    PendingCurrencyDeltaStore,
    loadPendingCurrencyDeltas,
    pendingCurrencyDeltasKey,
    pendingDeltaTotals,
} from './pendingCurrencyDeltas.js';

function fakeStorage() {
    const m = new Map();
    return {
        get: k => (m.has(k) ? m.get(k) : null),
        set: (k, v) => m.set(k, String(v)),
    };
}

describe('pending currency deltas', () => {
    it('persists pending deltas by owner and totals them by currency', () => {
        const storage = fakeStorage();
        const store = new PendingCurrencyDeltaStore({
            storage,
            owner: 'ckt1owner',
            now: () => 123,
        });
        store.add({
            currency: 'zec',
            amount: 0.5,
            txHash: '0xmine1',
            source: 'mining',
            expectedAmount: 1.5,
        });
        const loaded = loadPendingCurrencyDeltas(storage, 'ckt1owner');
        expect(loaded.length).toBe(1);
        expect(loaded[0].currency).toBe('zec');
        expect(pendingDeltaTotals(loaded).zec).toBe(0.5);
        expect(storage.get(pendingCurrencyDeltasKey('ckt1owner')).includes('0xmine1')).toBe(true);
    });

    it('clears only deltas whose indexed balance has caught up', () => {
        const storage = fakeStorage();
        const store = new PendingCurrencyDeltaStore({ storage, owner: 'ckt1owner' });
        store.add({ currency: 'zec', amount: 1, txHash: '0x1', expectedAmount: 1 });
        store.add({ currency: 'zec', amount: 1, txHash: '0x2', expectedAmount: 2 });
        const out = store.clearReconciled({ zec: 1 });
        expect(out.cleared).toBe(1);
        expect(out.pending.length).toBe(1);
        expect(out.pending[0].txHash).toBe('0x2');
    });

    it('clears outgoing deltas when indexed balance drops to the expected amount', () => {
        const storage = fakeStorage();
        const store = new PendingCurrencyDeltaStore({ storage, owner: 'ckt1owner' });
        store.add({ currency: 'bch', amount: -0.5, txHash: '0xspend', expectedAmount: 1.5 });
        expect(store.clearReconciled({ bch: 1.75 }).pending.length).toBe(1);
        expect(store.clearReconciled({ bch: 1.5 }).pending.length).toBe(0);
    });
});
