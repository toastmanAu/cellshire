import { describe, it, expect } from '../test/harness.js';
import {
    PROPERTY_STORAGE_KEY,
    clearPropertyZone,
    loadPropertyZone,
    propertyStorageKeyForOwner,
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
        expect(out.propertyTier).toBe(1);
    });

    it('round-trips the unlocked property tier', () => {
        const storage = fakeStorage();
        const map = createStarterPropertyMap();
        expect(savePropertyZone(storage, map, null, { propertyTier: 3 })).toBe(true);
        expect(loadPropertyZone(storage).propertyTier).toBe(3);
    });

    it('stores owner-specific property snapshots for visits', () => {
        const storage = fakeStorage();
        const map = createStarterPropertyMap();
        expect(propertyStorageKeyForOwner('joyid:alice')).toBe('cellshire:property:v1:joyid%3Aalice');
        expect(savePropertyZone(storage, map, null, {
            ownerId: 'joyid:alice',
            propertyTier: 2,
        })).toBe(true);
        expect(loadPropertyZone(storage)).toBeNull();
        const out = loadPropertyZone(storage, { ownerId: 'joyid:alice' });
        expect(out.ownerId).toBe('joyid:alice');
        expect(out.propertyTier).toBe(2);
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
