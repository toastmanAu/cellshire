import { describe, it, expect } from '../test/harness.js';
import {
    MAP_KINDS,
    createMapRegistry,
    entrySpawnForMap,
    mapByKind,
    mineMapIdForEpoch,
    propertyMapIdForOwner,
    townshipMapId,
    travelTargetForRole,
} from './mapRegistry.js';
import {
    TOWNSHIP_MAP_ID,
    TOWNSHIP_PORTAL_ROLE,
    TOWNSHIP_MINE_PORTAL_ROLE,
    TOWNSHIP_PROPERTY_PORTAL_ROLE,
} from '../township/townshipZone.js';

describe('mapRegistry', () => {
    it('builds deterministic mine and property map ids', () => {
        expect(mineMapIdForEpoch('14455')).toBe('mine:14455');
        expect(mineMapIdForEpoch(null)).toBe('mine:local');
        expect(propertyMapIdForOwner()).toBe('property:local');
        expect(propertyMapIdForOwner('joyid:alice')).toBe('property:joyid%3Aalice');
        expect(townshipMapId()).toBe(TOWNSHIP_MAP_ID);
    });

    it('creates mine, township, and property entries with seed sources and spawns', () => {
        const registry = createMapRegistry({
            epoch: '14455',
            propertyOwner: 'joyid:alice',
            propertyReadOnly: true,
            mineSpawn: { gx: 10, gy: 12 },
        });
        const mine = mapByKind(registry, MAP_KINDS.mine);
        const township = mapByKind(registry, MAP_KINDS.township);
        const property = mapByKind(registry, MAP_KINDS.property);
        expect(mine.id).toBe('mine:14455');
        expect(mine.seedSource).toBe('epoch');
        expect(mine.entrySpawn).toEqual({ gx: 10, gy: 12 });
        expect(township.id).toBe(TOWNSHIP_MAP_ID);
        expect(township.name).toBe('Township');
        expect(township.seedSource).toBe('communal');
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
        expect(travelTargetForRole(TOWNSHIP_PORTAL_ROLE, registry).kind).toBe('township');
        expect(travelTargetForRole(TOWNSHIP_MINE_PORTAL_ROLE, registry).kind).toBe('mine');
        expect(travelTargetForRole(TOWNSHIP_PROPERTY_PORTAL_ROLE, registry).kind).toBe('property');
        expect(travelTargetForRole('vendor', registry)).toBeNull();
    });

    it('falls back when a map has no entry spawn', () => {
        const registry = createMapRegistry({ epoch: '14455' });
        const mine = mapByKind(registry, MAP_KINDS.mine);
        expect(entrySpawnForMap(mine, { gx: 3, gy: 4 })).toEqual({ gx: 3, gy: 4 });
    });
});
