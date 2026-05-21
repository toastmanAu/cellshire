import { formatResourceAmount } from '../resources/resourceInventory.js';

export const FARM_CROP_ROLE = 'farm_crop';
export const FARM_STARTER_CROP_ID = 'starter_crop';
export const FARM_STARTER_CROP_GROW_MS = 15_000;

export const FARM_CROPS = Object.freeze({
    [FARM_STARTER_CROP_ID]: Object.freeze({
        id: FARM_STARTER_CROP_ID,
        name: 'Starter crop',
        assetId: 'crop_patch',
        growMs: FARM_STARTER_CROP_GROW_MS,
        output: Object.freeze({ resourceId: 'crop', amount: 2 }),
    }),
});

export const FARM_TIERS = Object.freeze([
    Object.freeze({
        tier: 1,
        name: 'Starter beds',
        bounds: Object.freeze({ minGx: 15, minGy: 13, maxGx: 16, maxGy: 14 }),
        cost: null,
    }),
    Object.freeze({
        tier: 2,
        name: 'Kitchen garden',
        bounds: Object.freeze({ minGx: 14, minGy: 12, maxGx: 17, maxGy: 15 }),
        cost: Object.freeze({ wood: 12, stone: 8 }),
    }),
    Object.freeze({
        tier: 3,
        name: 'Field patch',
        bounds: Object.freeze({ minGx: 13, minGy: 11, maxGx: 18, maxGy: 16 }),
        cost: Object.freeze({ wood: 30, stone: 18 }),
    }),
]);

export const MAX_FARM_TIER = FARM_TIERS[FARM_TIERS.length - 1].tier;

export function normalizeFarmTier(value) {
    const tier = Number(value);
    if (!Number.isInteger(tier)) return 1;
    return Math.max(1, Math.min(MAX_FARM_TIER, tier));
}

export function farmTierConfig(tier) {
    const normalized = normalizeFarmTier(tier);
    return FARM_TIERS.find(entry => entry.tier === normalized) ?? FARM_TIERS[0];
}

export function farmBoundsForTier(tier) {
    return farmTierConfig(tier).bounds;
}

export function nextFarmTier(tier) {
    const next = normalizeFarmTier(tier) + 1;
    return next > MAX_FARM_TIER ? null : farmTierConfig(next);
}

export function farmSize(bounds) {
    return {
        width: bounds.maxGx - bounds.minGx + 1,
        height: bounds.maxGy - bounds.minGy + 1,
    };
}

export function farmTierSummary(tier) {
    const current = farmTierConfig(tier);
    const next = nextFarmTier(tier);
    const size = farmSize(current.bounds);
    return {
        tier: current.tier,
        name: current.name,
        bounds: current.bounds,
        size,
        label: `Farm ${current.tier} · ${size.width}x${size.height}`,
        next,
    };
}

export function isFarmCell(gx, gy, tier) {
    const bounds = farmBoundsForTier(tier);
    return gx >= bounds.minGx
        && gy >= bounds.minGy
        && gx <= bounds.maxGx
        && gy <= bounds.maxGy;
}

export function farmExpansionPreview(tier) {
    const current = farmTierConfig(tier);
    const next = nextFarmTier(tier);
    return {
        currentBounds: current.bounds,
        nextBounds: next?.bounds ?? current.bounds,
        maxBounds: farmTierConfig(MAX_FARM_TIER).bounds,
    };
}

export function formatFarmExpansionCost(cost) {
    if (!cost) return 'Max tier';
    return Object.entries(cost)
        .map(([resourceId, amount]) => formatResourceAmount(resourceId, amount))
        .join(' + ');
}

export function canAffordFarmExpansion(resourceInventory, tier) {
    const next = nextFarmTier(tier);
    if (!next?.cost) return false;
    return Object.entries(next.cost)
        .every(([resourceId, amount]) => (resourceInventory?.get?.(resourceId) ?? 0) >= amount);
}

export function spendFarmExpansionCost(resourceInventory, tier) {
    const next = nextFarmTier(tier);
    if (!next?.cost) return { ok: false, reason: 'max-tier', tier: normalizeFarmTier(tier) };
    if (!canAffordFarmExpansion(resourceInventory, tier)) {
        return { ok: false, reason: 'insufficient-resources', tier: normalizeFarmTier(tier), next };
    }
    for (const [resourceId, amount] of Object.entries(next.cost)) {
        resourceInventory.add(resourceId, -amount);
    }
    return { ok: true, tier: next.tier, next };
}
