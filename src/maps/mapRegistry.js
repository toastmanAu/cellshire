import { PROPERTY_MAP_ID, PROPERTY_MINE_PORTAL_ROLE, PROPERTY_SPAWN } from '../property/propertyZone.js';

export const MAP_KINDS = Object.freeze({
    mine: 'mine',
    property: 'property',
});

export function mineMapIdForEpoch(epochNumber) {
    return epochNumber === null || epochNumber === undefined || epochNumber === ''
        ? 'mine:local'
        : `mine:${epochNumber}`;
}

export function propertyMapIdForOwner(ownerId = 'local') {
    return ownerId === 'local'
        ? PROPERTY_MAP_ID
        : `property:${encodeURIComponent(ownerId)}`;
}

export function createMapRegistry({
    epoch = null,
    propertyOwner = 'local',
    propertyReadOnly = false,
    mineSpawn = null,
} = {}) {
    const ownerId = propertyOwner || 'local';
    return [
        {
            id: mineMapIdForEpoch(epoch),
            kind: MAP_KINDS.mine,
            name: 'Public mine',
            seedSource: 'epoch',
            entrySpawn: validSpawn(mineSpawn) ? mineSpawn : null,
        },
        {
            id: propertyMapIdForOwner(ownerId),
            kind: MAP_KINDS.property,
            name: ownerId === 'local' ? 'Home plot' : 'Visited plot',
            ownerId,
            readOnly: !!propertyReadOnly,
            seedSource: 'player',
            entrySpawn: PROPERTY_SPAWN,
        },
    ];
}

export function mapById(registry, id) {
    return registry.find(entry => entry.id === id) ?? null;
}

export function mapByKind(registry, kind) {
    return registry.find(entry => entry.kind === kind) ?? null;
}

export function entrySpawnForMap(mapDef, fallback = null) {
    return validSpawn(mapDef?.entrySpawn) ? mapDef.entrySpawn : fallback;
}

export function travelTargetForRole(role, registry) {
    if (role === 'property_portal') return mapByKind(registry, MAP_KINDS.property);
    if (role === PROPERTY_MINE_PORTAL_ROLE) return mapByKind(registry, MAP_KINDS.mine);
    return null;
}

function validSpawn(cell) {
    return Number.isInteger(cell?.gx) && Number.isInteger(cell?.gy);
}
