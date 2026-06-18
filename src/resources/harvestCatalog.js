export const HARVEST_RESOURCE_ROLES = Object.freeze({
    wood: 'wood_resource',
    stone: 'stone_resource',
    gold: 'gold_resource',
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
    [HARVEST_RESOURCE_ROLES.gold]: Object.freeze({
        role: HARVEST_RESOURCE_ROLES.gold,
        resourceId: 'gold',
        displayName: 'Gold',
        yieldAmount: 1,
        dustColor: '#d3a747',
        textColor: '#b97a13',
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
