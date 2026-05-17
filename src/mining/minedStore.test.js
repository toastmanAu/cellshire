import { describe, it, expect } from '../test/harness.js';
import {
    minedStoreKey,
    loadMinedState,
    pruneStaleMinedState,
    recordMine,
} from './minedStore.js';

function fakeStorage(initial = {}) {
    const m = new Map(Object.entries(initial));
    return {
        get: k => (m.has(k) ? m.get(k) : null),
        set: (k, v) => m.set(k, String(v)),
        remove: k => m.delete(k),
        keys: () => Array.from(m.keys()),
    };
}

describe('minedStoreKey', () => {
    it('builds the storage key from an epoch number string', () => {
        expect(minedStoreKey('14455')).toBe('cellshire:mined:14455');
    });

    it('returns null when epoch is null', () => {
        expect(minedStoreKey(null)).toBeNull();
    });

    it('returns null when epoch is undefined', () => {
        expect(minedStoreKey(undefined)).toBeNull();
    });

    it('returns null when epoch is empty string', () => {
        expect(minedStoreKey('')).toBeNull();
    });

    it('builds a valid key for epoch "0" — epoch 0 is real on chain', () => {
        expect(minedStoreKey('0')).toBe('cellshire:mined:0');
    });
});

describe('loadMinedState', () => {
    it('returns {} for a missing key', () => {
        const s = fakeStorage();
        expect(loadMinedState(s, '14455')).toEqual({});
    });

    it('parses a valid JSON entry', () => {
        const s = fakeStorage({
            'cellshire:mined:14455': JSON.stringify({ '5,5': 0, '12,8': 2 }),
        });
        expect(loadMinedState(s, '14455')).toEqual({ '5,5': 0, '12,8': 2 });
    });

    it('returns {} on malformed JSON', () => {
        const s = fakeStorage({ 'cellshire:mined:14455': 'not json' });
        expect(loadMinedState(s, '14455')).toEqual({});
    });

    it('returns {} when epoch is null (no persistence on random seed)', () => {
        const s = fakeStorage({ 'cellshire:mined:14455': JSON.stringify({ '5,5': 0 }) });
        expect(loadMinedState(s, null)).toEqual({});
    });
});

describe('recordMine', () => {
    it('writes a fresh entry for a new epoch', () => {
        const s = fakeStorage();
        recordMine(s, '14455', 5, 5, 2);
        expect(loadMinedState(s, '14455')).toEqual({ '5,5': 2 });
    });

    it('preserves prior positions when adding a new one', () => {
        const s = fakeStorage({
            'cellshire:mined:14455': JSON.stringify({ '5,5': 0 }),
        });
        recordMine(s, '14455', 12, 8, 3);
        expect(loadMinedState(s, '14455')).toEqual({ '5,5': 0, '12,8': 3 });
    });

    it('updates an existing position (decrement path)', () => {
        const s = fakeStorage({
            'cellshire:mined:14455': JSON.stringify({ '5,5': 2 }),
        });
        recordMine(s, '14455', 5, 5, 1);
        expect(loadMinedState(s, '14455')).toEqual({ '5,5': 1 });
    });

    it('no-ops when epoch is null', () => {
        const s = fakeStorage();
        recordMine(s, null, 5, 5, 2);
        expect(s.get('cellshire:mined:null')).toBeNull();
    });
});

describe('pruneStaleMinedState', () => {
    it('removes mined-state keys from other epochs', () => {
        const s = fakeStorage({
            'cellshire:mined:14454': JSON.stringify({ '1,1': 0 }),
            'cellshire:mined:14455': JSON.stringify({ '2,2': 1 }),
            'cellshire:mined:14456': JSON.stringify({ '3,3': 2 }),
            'cellshire:lastEpoch': JSON.stringify({ number: '14455' }),
            'cellshire:character': 'miner',
        });
        pruneStaleMinedState(s, '14455');
        expect(s.get('cellshire:mined:14454')).toBeNull();
        expect(s.get('cellshire:mined:14455')).toBe(JSON.stringify({ '2,2': 1 }));
        expect(s.get('cellshire:mined:14456')).toBeNull();
        expect(s.get('cellshire:lastEpoch')).toBe(JSON.stringify({ number: '14455' }));
        expect(s.get('cellshire:character')).toBe('miner');
    });

    it('no-ops when epoch is null', () => {
        const s = fakeStorage({
            'cellshire:mined:14455': JSON.stringify({ '2,2': 1 }),
        });
        pruneStaleMinedState(s, null);
        expect(s.get('cellshire:mined:14455')).toBe(JSON.stringify({ '2,2': 1 }));
    });

    it('no-ops when storage cannot enumerate keys', () => {
        const s = {
            get: k => (k === 'cellshire:mined:14454' ? 'old' : null),
            remove: () => { throw new Error('should not remove'); },
        };
        pruneStaleMinedState(s, '14455');
        expect(s.get('cellshire:mined:14454')).toBe('old');
    });
});
