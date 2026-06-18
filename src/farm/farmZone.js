import { formatResourceAmount } from '../resources/resourceInventory.js';
import { formatCurrencyAmount } from '../mining/cryptoEconomy.js';

export const FARM_CROP_ROLE = 'farm_crop';
export const FARM_EMPTY_PLOT_ASSET_ID = 'farm_plot_empty';
export const FARM_STARTER_CROP_ID = 'starter_crop';
export const FARM_HERB_CROP_ID = 'herb_crop';
export const FARM_TIMBER_CROP_ID = 'timber_plot';
export const FARM_STARTER_CROP_GROW_MS = 12_000;

export const FARM_CROPS = Object.freeze({
    [FARM_STARTER_CROP_ID]: Object.freeze({
        id: FARM_STARTER_CROP_ID,
        name: 'Starter crop',
        assetId: 'farm_plot_starter_crop',
        readyAssetId: 'farm_plot_ready_crop',
        growMs: FARM_STARTER_CROP_GROW_MS,
        growEpochs: 1,
        output: Object.freeze({ resourceId: 'crop', amount: 3 }),
    }),
    [FARM_HERB_CROP_ID]: Object.freeze({
        id: FARM_HERB_CROP_ID,
        name: 'Herb Crop',
        assetId: 'garden_bed',
        readyAssetId: 'veg_garden',
        growMs: 10_000,
        growEpochs: 1,
        output: Object.freeze({ resourceId: 'herb', amount: 2 }),
    }),
    [FARM_TIMBER_CROP_ID]: Object.freeze({
        id: FARM_TIMBER_CROP_ID,
        name: 'Timber Plot',
        assetId: 'dry_grass',
        readyAssetId: 'harvest_tree',
        growMs: 30_000,
        growEpochs: 2,
        output: Object.freeze({ resourceId: 'wood', amount: 5 }),
    }),
});

export function farmCropIdForCell(gx, gy, tier = 1) {
    const normalizedTier = normalizeFarmTier(tier);
    const x = Math.floor(Number(gx));
    const y = Math.floor(Number(gy));
    if (!Number.isInteger(x) || !Number.isInteger(y)) return FARM_STARTER_CROP_ID;
    if (normalizedTier >= 3 && (x + y) % 5 === 0) return FARM_TIMBER_CROP_ID;
    if (normalizedTier >= 2 && (x + y) % 3 === 0) return FARM_HERB_CROP_ID;
    return FARM_STARTER_CROP_ID;
}

export function farmCropAssetId(plot, nowOrClock = Date.now()) {
    const crop = FARM_CROPS[plot?.cropId] ?? FARM_CROPS[FARM_STARTER_CROP_ID];
    const clock = normalizeFarmClock(nowOrClock);
    return isFarmPlotReady(plot, clock)
        ? crop.readyAssetId ?? crop.assetId
        : crop.assetId;
}

export function normalizeFarmClock(nowOrClock = Date.now()) {
    if (typeof nowOrClock === 'object' && nowOrClock !== null) {
        return {
            now: Number.isFinite(Number(nowOrClock.now)) ? Number(nowOrClock.now) : Date.now(),
            epoch: normalizeFarmEpoch(nowOrClock.epoch),
            timing: nowOrClock.timing === 'epoch' ? 'epoch' : 'elapsed',
        };
    }
    return {
        now: Number.isFinite(Number(nowOrClock)) ? Number(nowOrClock) : Date.now(),
        epoch: null,
        timing: 'elapsed',
    };
}

export function normalizeFarmEpoch(value) {
    if (value === null || value === undefined || value === '') return null;
    const epoch = Number(value);
    return Number.isInteger(epoch) && epoch >= 0 ? epoch : null;
}

export function isFarmPlotReady(plot, nowOrClock = Date.now()) {
    if (!plot) return false;
    const clock = normalizeFarmClock(nowOrClock);
    if (clock.timing === 'epoch' && clock.epoch !== null && Number.isInteger(plot.readyEpoch)) {
        return clock.epoch >= plot.readyEpoch;
    }
    return clock.now >= Number(plot.readyAt);
}

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
        cost: Object.freeze({
            resources: Object.freeze({ wood: 10, stone: 7 }),
            ckb: 500,
        }),
    }),
    Object.freeze({
        tier: 3,
        name: 'Field patch',
        bounds: Object.freeze({ minGx: 13, minGy: 11, maxGx: 18, maxGy: 16 }),
        cost: Object.freeze({
            resources: Object.freeze({ wood: 28, stone: 18, herb: 4 }),
            ckb: 2200,
        }),
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
    const resources = Object.entries(farmExpansionCostResources(cost))
        .map(([resourceId, amount]) => formatResourceAmount(resourceId, amount));
    const ckb = farmExpansionCostCkb(cost);
    return [
        ...resources,
        ...(ckb > 0 ? [formatCurrencyAmount('ckb', ckb)] : []),
    ].join(' + ');
}

export function canAffordFarmExpansion(resourceInventory, tier, currencyInventory = null) {
    const next = nextFarmTier(tier);
    if (!next?.cost) return false;
    const resourcesOk = Object.entries(farmExpansionCostResources(next.cost))
        .every(([resourceId, amount]) => (resourceInventory?.get?.(resourceId) ?? 0) >= amount);
    const ckb = farmExpansionCostCkb(next.cost);
    const ckbOk = ckb <= 0 || (currencyInventory?.get?.('ckb') ?? 0) >= ckb;
    return resourcesOk && ckbOk;
}

export function spendFarmExpansionCost(resourceInventory, tier, currencyInventory = null) {
    const next = nextFarmTier(tier);
    if (!next?.cost) return { ok: false, reason: 'max-tier', tier: normalizeFarmTier(tier) };
    if (!canAffordFarmExpansion(resourceInventory, tier, currencyInventory)) {
        return { ok: false, reason: 'insufficient-funds', tier: normalizeFarmTier(tier), next };
    }
    for (const [resourceId, amount] of Object.entries(farmExpansionCostResources(next.cost))) {
        resourceInventory.add(resourceId, -amount);
    }
    const ckb = farmExpansionCostCkb(next.cost);
    if (ckb > 0) currencyInventory?.add?.('ckb', -ckb);
    return { ok: true, tier: next.tier, next };
}

function farmExpansionCostResources(cost) {
    if (!cost) return {};
    if (cost.resources) return cost.resources;
    return Object.fromEntries(
        Object.entries(cost).filter(([resourceId]) => resourceId !== 'ckb')
    );
}

function farmExpansionCostCkb(cost) {
    return Math.max(0, Number(cost?.ckb) || 0);
}
