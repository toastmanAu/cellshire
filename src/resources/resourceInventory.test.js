import { describe, it, expect } from '../test/harness.js';
import {
    RESOURCE_INVENTORY_STORAGE_KEY,
    ResourceInventory,
    formatResourceAmount,
    loadResourceInventory,
    saveResourceInventory,
} from './resourceInventory.js';

function fakeStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        get: key => data.get(key) ?? null,
        set: (key, value) => data.set(key, value),
    };
}

describe('ResourceInventory', () => {
    it('tracks local gameplay resources without going negative', () => {
        const inventory = new ResourceInventory();
        expect(inventory.add('wood', 3)).toBe(true);
        expect(inventory.add('wood', -10)).toBe(true);
        expect(inventory.get('wood')).toBe(0);
        expect(inventory.add('unknown', 1)).toBe(false);
    });

    it('persists and reloads resources', () => {
        const storage = fakeStorage();
        const inventory = new ResourceInventory();
        inventory.add('stone', 4);
        expect(saveResourceInventory(storage, inventory)).toBe(true);
        const loaded = loadResourceInventory(storage);
        expect(storage.get(RESOURCE_INVENTORY_STORAGE_KEY) !== null).toBe(true);
        expect(loaded.get('stone')).toBe(4);
    });

    it('formats compact resource labels', () => {
        expect(formatResourceAmount('wood', 3)).toBe('3 Wood');
    });
});
