import { describe, it, expect } from '../test/harness.js';
import { makeSafeStorage } from './safeStorage.js';

describe('safeStorage', () => {
    function fakeBackend() {
        const m = new Map();
        return {
            getItem: k => (m.has(k) ? m.get(k) : null),
            setItem: (k, v) => m.set(k, String(v)),
            removeItem: k => m.delete(k),
        };
    }

    it('round-trips a value through a normal backend', () => {
        const s = makeSafeStorage(fakeBackend());
        s.set('hello', 'world');
        expect(s.get('hello')).toBe('world');
    });

    it('falls back to in-memory when setItem throws', () => {
        const throwing = {
            getItem: () => null,
            setItem: () => { throw new Error('quota'); },
            removeItem: () => {},
        };
        const s = makeSafeStorage(throwing);
        s.set('k', 'v');
        expect(s.get('k')).toBe('v');
    });

    it('returns null for missing keys', () => {
        const s = makeSafeStorage(fakeBackend());
        expect(s.get('nope')).toBeNull();
    });

    it('works when given no backend (null)', () => {
        const s = makeSafeStorage(null);
        s.set('k', 'v');
        expect(s.get('k')).toBe('v');
    });
});
