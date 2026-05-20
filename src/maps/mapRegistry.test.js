import { describe, it, expect } from '../test/harness.js';
import {
    MAP_KINDS,
    createMapRegistry,
    entrySpawnForMap,
    mapByKind,
    mineMapIdForEpoch,
    propertyMapIdForOwner,
    travelTargetForRole,
} from './mapRegistry.js';

describe('mapRegistry', () => {
    it('builds deterministic mine and property map ids', () => {
        expect(mineMapIdForEpoch('14455')).toBe('mine:14455');
        expect(mineMapIdForEpoch(null)).toBe('mine:local');
        expect(propertyMapIdForOwner()).toBe('property:local');
        expect(propertyMapIdForOwner('joyid:alice')).toBe('property:joyid%3Aalice');
    });

    it('creates mine and property entries with seed sources and spawns', () => {
        const registry = createMapRegistry({
            epoch: '14455',
            propertyOwner: 'joyid:alice',
            propertyReadOnly: true,
            mineSpawn: { gx: 10, gy: 12 },
        });
        const mine = mapByKind(registry, MAP_KINDS.mine);
        const property = mapByKind(registry, MAP_KINDS.property);
        expect(mine.id).toBe('mine:14455');
        expect(mine.seedSource).toBe('epoch');
        expect(mine.entrySpawn).toEqual({ gx: 10, gy: 12 });
        expect(property.id).toBe('property:joyid%3Aalice');
        expect(property.name).toBe('Visited plot');
        expect(property.ownerId).toBe('joyid:alice');
        expect(property.readOnly).toBe(true);
        expect(property.seedSource).toBe('player');
    });

    it('resolves portal roles through the registry', () => {
        const registry = createMapRegistry({ epoch: '14455' });
        expect(travelTargetForRole('property_portal', registry).kind).toBe('property');
        expect(travelTargetForRole('mine_portal', registry).kind).toBe('mine');
        expect(travelTargetForRole('vendor', registry)).toBeNull();
    });

    it('falls back when a map has no entry spawn', () => {
        const registry = createMapRegistry({ epoch: '14455' });
        const mine = mapByKind(registry, MAP_KINDS.mine);
        expect(entrySpawnForMap(mine, { gx: 3, gy: 4 })).toEqual({ gx: 3, gy: 4 });
    });
});
