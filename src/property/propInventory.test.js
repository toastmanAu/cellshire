import { describe, it, expect } from '../test/harness.js';
import {
    PROP_INVENTORY_STORAGE_KEY,
    PropInventory,
    loadPropInventory,
    savePropInventory,
} from './propInventory.js';

describe('PropInventory', () => {
    it('tracks prop counts without going negative', () => {
        const inventory = new PropInventory();
        inventory.add('blue_railing', 2);
        expect(inventory.get('blue_railing')).toBe(2);
        expect(inventory.consume('blue_railing')).toBe(true);
        expect(inventory.get('blue_railing')).toBe(1);
        expect(inventory.consume('blue_railing', 2)).toBe(false);
        expect(inventory.get('blue_railing')).toBe(1);
    });

    it('persists and reloads local prop counts', () => {
        const store = new Map();
        const storage = {
            get: key => store.get(key) ?? null,
            set: (key, value) => store.set(key, value),
        };
        const inventory = new PropInventory([['stone_lantern', 3]]);
        expect(savePropInventory(storage, inventory)).toBe(true);
        expect(store.has(PROP_INVENTORY_STORAGE_KEY)).toBe(true);
        const loaded = loadPropInventory(storage);
        expect(loaded.get('stone_lantern')).toBe(3);
    });

    it('falls back to an empty inventory on malformed storage', () => {
        const storage = { get: () => '{bad json' };
        expect(loadPropInventory(storage).entries().length).toBe(0);
    });
});
