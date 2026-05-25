import { formatCurrencyAmount } from '../mining/cryptoEconomy.js';
import { PROPERTY_EDIT_BOUNDS } from './propertyZone.js';

export const PROPERTY_EXPANSION_TIERS = Object.freeze([
    Object.freeze({
        tier: 1,
        name: 'Starter claim',
        bounds: PROPERTY_EDIT_BOUNDS,
        cost: null,
    }),
    Object.freeze({
        tier: 2,
        name: 'Garden claim',
        bounds: Object.freeze({ minGx: 3, minGy: 3, maxGx: 20, maxGy: 20 }),
        cost: Object.freeze({ currency: 'ckb', amount: 7500 }),
    }),
    Object.freeze({
        tier: 3,
        name: 'Homestead claim',
        bounds: Object.freeze({ minGx: 2, minGy: 2, maxGx: 21, maxGy: 21 }),
        cost: Object.freeze({ currency: 'ckb', amount: 22000 }),
    }),
    Object.freeze({
        tier: 4,
        name: 'Estate claim',
        bounds: Object.freeze({ minGx: 1, minGy: 1, maxGx: 22, maxGy: 22 }),
        cost: Object.freeze({ currency: 'ckb', amount: 48000 }),
    }),
]);

export const MAX_PROPERTY_TIER = PROPERTY_EXPANSION_TIERS[PROPERTY_EXPANSION_TIERS.length - 1].tier;

export function normalizePropertyTier(value) {
    const tier = Number(value);
    if (!Number.isInteger(tier)) return 1;
    return Math.max(1, Math.min(MAX_PROPERTY_TIER, tier));
}

export function propertyTierConfig(tier) {
    const normalized = normalizePropertyTier(tier);
    return PROPERTY_EXPANSION_TIERS.find(entry => entry.tier === normalized)
        ?? PROPERTY_EXPANSION_TIERS[0];
}

export function propertyBoundsForTier(tier) {
    return propertyTierConfig(tier).bounds;
}

export function nextPropertyTier(tier) {
    const next = normalizePropertyTier(tier) + 1;
    return next > MAX_PROPERTY_TIER ? null : propertyTierConfig(next);
}

export function claimSize(bounds) {
    return {
        width: bounds.maxGx - bounds.minGx + 1,
        height: bounds.maxGy - bounds.minGy + 1,
    };
}

export function propertyTierSummary(tier) {
    const current = propertyTierConfig(tier);
    const next = nextPropertyTier(tier);
    const size = claimSize(current.bounds);
    return {
        tier: current.tier,
        name: current.name,
        bounds: current.bounds,
        size,
        label: `Tier ${current.tier} · ${size.width}x${size.height}`,
        next,
    };
}

export function formatExpansionCost(cost) {
    if (!cost) return 'Max tier';
    return formatCurrencyAmount(cost.currency, cost.amount);
}

export function canAffordExpansion(inventory, tier) {
    const next = nextPropertyTier(tier);
    if (!next?.cost) return false;
    return (inventory?.get?.(next.cost.currency) ?? 0) >= next.cost.amount;
}

export function spendExpansionCost(inventory, tier) {
    const next = nextPropertyTier(tier);
    if (!next?.cost) return { ok: false, reason: 'max-tier', tier: normalizePropertyTier(tier) };
    if (!canAffordExpansion(inventory, tier)) {
        return { ok: false, reason: 'insufficient-funds', tier: normalizePropertyTier(tier), next };
    }
    inventory.add(next.cost.currency, -next.cost.amount);
    return { ok: true, tier: next.tier, next };
}

export function propertyExpansionPreview(tier) {
    const current = propertyTierConfig(tier);
    const next = nextPropertyTier(tier);
    return {
        currentBounds: current.bounds,
        nextBounds: next?.bounds ?? current.bounds,
        maxBounds: propertyTierConfig(MAX_PROPERTY_TIER).bounds,
    };
}
