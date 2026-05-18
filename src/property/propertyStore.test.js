import { describe, it, expect } from '../test/harness.js';
import {
    PROPERTY_STORAGE_KEY,
    clearPropertyZone,
    loadPropertyZone,
    savePropertyZone,
} from './propertyStore.js';
import { createStarterPropertyMap } from './propertyZone.js';

function fakeStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        get: key => data.get(key) ?? null,
        set: (key, value) => data.set(key, value),
        remove: key => data.delete(key),
    };
}

describe('propertyStore', () => {
    it('round-trips a property tilemap through storage', () => {
        const storage = fakeStorage();
        const map = createStarterPropertyMap();
        expect(savePropertyZone(storage, map)).toBe(true);
        const out = loadPropertyZone(storage);
        expect(out.tileMap.width).toBe(map.width);
        expect(out.tileMap.objects.length).toBe(map.objects.length);
    });

    it('returns null for missing or malformed storage', () => {
        expect(loadPropertyZone(fakeStorage())).toBeNull();
        expect(loadPropertyZone(fakeStorage({ [PROPERTY_STORAGE_KEY]: 'not json' }))).toBeNull();
    });

    it('clears the saved property snapshot', () => {
        const storage = fakeStorage();
        savePropertyZone(storage, createStarterPropertyMap());
        clearPropertyZone(storage);
        expect(loadPropertyZone(storage)).toBeNull();
    });
});
