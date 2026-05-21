import { PROPERTY_MAP_ID, PROPERTY_MINE_PORTAL_ROLE, PROPERTY_SPAWN } from '../property/propertyZone.js';
import {
    TOWNSHIP_MAP_ID,
    TOWNSHIP_MINE_PORTAL_ROLE,
    TOWNSHIP_PORTAL_ROLE,
    TOWNSHIP_PROPERTY_PORTAL_ROLE,
    TOWNSHIP_SPAWN,
} from '../township/townshipZone.js';

export const MAP_KINDS = Object.freeze({
    mine: 'mine',
    property: 'property',
    township: 'township',
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

export function townshipMapId() {
    return TOWNSHIP_MAP_ID;
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
            id: TOWNSHIP_MAP_ID,
            kind: MAP_KINDS.township,
            name: 'Township',
            seedSource: 'communal',
            entrySpawn: TOWNSHIP_SPAWN,
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
    if (role === TOWNSHIP_PORTAL_ROLE) return mapByKind(registry, MAP_KINDS.township);
    if (role === TOWNSHIP_MINE_PORTAL_ROLE) return mapByKind(registry, MAP_KINDS.mine);
    if (role === TOWNSHIP_PROPERTY_PORTAL_ROLE) return mapByKind(registry, MAP_KINDS.property);
    return null;
}

function validSpawn(cell) {
    return Number.isInteger(cell?.gx) && Number.isInteger(cell?.gy);
}
