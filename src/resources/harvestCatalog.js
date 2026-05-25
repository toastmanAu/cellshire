export const HARVEST_RESOURCE_ROLES = Object.freeze({
    wood: 'wood_resource',
    stone: 'stone_resource',
});

export const HARVEST_RESOURCE_CATALOG = Object.freeze({
    [HARVEST_RESOURCE_ROLES.wood]: Object.freeze({
        role: HARVEST_RESOURCE_ROLES.wood,
        resourceId: 'wood',
        displayName: 'Wood',
        yieldAmount: 4,
        dustColor: '#7b5734',
        textColor: '#3d7355',
    }),
    [HARVEST_RESOURCE_ROLES.stone]: Object.freeze({
        role: HARVEST_RESOURCE_ROLES.stone,
        resourceId: 'stone',
        displayName: 'Stone',
        yieldAmount: 3,
        dustColor: '#8c8f8e',
        textColor: '#6a7882',
    }),
});

export function harvestResourceConfig(role) {
    return HARVEST_RESOURCE_CATALOG[role] ?? null;
}

export function isHarvestResourceRole(role) {
    return !!harvestResourceConfig(role);
}

export function isHarvestResourceObject(obj) {
    return isHarvestResourceRole(obj?.role);
}
