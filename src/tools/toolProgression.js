import { formatCurrencyAmount } from '../mining/cryptoEconomy.js';
import { formatResourceAmount } from '../resources/resourceInventory.js';

export const TOOL_PROGRESS_STORAGE_PREFIX = 'cellshire:tools:v1:';

export const TOOL_LINES = Object.freeze([
    Object.freeze({
        id: 'pickaxe',
        name: 'Pickaxe',
        resourceId: 'stone',
        resourceName: 'Stone',
        tiers: Object.freeze([
            Object.freeze({ tier: 1, name: 'Rusted Pickaxe', requiredToolRackLevel: 0, resourceHarvestBonus: 0, cost: null }),
            Object.freeze({
                tier: 2,
                name: 'Reinforced Pickaxe',
                requiredToolRackLevel: 1,
                resourceHarvestBonus: 1,
                cost: Object.freeze({
                    resources: Object.freeze({ wood: 6, stone: 7, crop: 3 }),
                    ckb: 1100,
                }),
            }),
            Object.freeze({
                tier: 3,
                name: 'Steel Pickaxe',
                requiredToolRackLevel: 2,
                resourceHarvestBonus: 2,
                cost: Object.freeze({
                    resources: Object.freeze({ wood: 24, stone: 32, crop: 10 }),
                    ckb: 7800,
                }),
            }),
            Object.freeze({
                tier: 4,
                name: 'Silver Pickaxe',
                requiredToolRackLevel: 3,
                resourceHarvestBonus: 3,
                cost: Object.freeze({
                    resources: Object.freeze({ wood: 55, stone: 78, crop: 24 }),
                    ckb: 18000,
                }),
            }),
            Object.freeze({
                tier: 5,
                name: 'Gold Pickaxe',
                requiredToolRackLevel: 4,
                resourceHarvestBonus: 4,
                cost: Object.freeze({
                    resources: Object.freeze({ wood: 110, stone: 150, crop: 50 }),
                    ckb: 42000,
                }),
            }),
            Object.freeze({
                tier: 6,
                name: 'Diamond Pickaxe',
                requiredToolRackLevel: 5,
                resourceHarvestBonus: 6,
                cost: Object.freeze({
                    resources: Object.freeze({ wood: 210, stone: 280, crop: 95 }),
                    ckb: 95000,
                }),
            }),
        ]),
    }),
    Object.freeze({
        id: 'woodaxe',
        name: 'Woodaxe',
        resourceId: 'wood',
        resourceName: 'Wood',
        tiers: Object.freeze([
            Object.freeze({ tier: 1, name: 'Rusted Woodaxe', requiredToolRackLevel: 0, resourceHarvestBonus: 0, cost: null }),
            Object.freeze({
                tier: 2,
                name: 'Reinforced Woodaxe',
                requiredToolRackLevel: 1,
                resourceHarvestBonus: 1,
                cost: Object.freeze({
                    resources: Object.freeze({ wood: 7, stone: 5, crop: 3 }),
                    ckb: 1100,
                }),
            }),
            Object.freeze({
                tier: 3,
                name: 'Steel Woodaxe',
                requiredToolRackLevel: 2,
                resourceHarvestBonus: 2,
                cost: Object.freeze({
                    resources: Object.freeze({ wood: 32, stone: 24, crop: 10 }),
                    ckb: 7600,
                }),
            }),
            Object.freeze({
                tier: 4,
                name: 'Silver Woodaxe',
                requiredToolRackLevel: 3,
                resourceHarvestBonus: 3,
                cost: Object.freeze({
                    resources: Object.freeze({ wood: 78, stone: 55, crop: 24 }),
                    ckb: 17500,
                }),
            }),
            Object.freeze({
                tier: 5,
                name: 'Gold Woodaxe',
                requiredToolRackLevel: 4,
                resourceHarvestBonus: 4,
                cost: Object.freeze({
                    resources: Object.freeze({ wood: 150, stone: 110, crop: 50 }),
                    ckb: 40000,
                }),
            }),
            Object.freeze({
                tier: 6,
                name: 'Diamond Woodaxe',
                requiredToolRackLevel: 5,
                resourceHarvestBonus: 6,
                cost: Object.freeze({
                    resources: Object.freeze({ wood: 280, stone: 210, crop: 95 }),
                    ckb: 90000,
                }),
            }),
        ]),
    }),
    Object.freeze({
        id: 'hoe_scythe',
        name: 'Hoe / Scythe',
        resourceId: 'crop',
        resourceName: 'Crop',
        tiers: Object.freeze([
            Object.freeze({ tier: 1, name: 'Worn Hoe', requiredToolRackLevel: 0, resourceHarvestBonus: 0, cost: null }),
            Object.freeze({
                tier: 2,
                name: 'Reinforced Hoe',
                requiredToolRackLevel: 1,
                resourceHarvestBonus: 1,
                cost: Object.freeze({
                    resources: Object.freeze({ wood: 5, stone: 4, crop: 7 }),
                    ckb: 1000,
                }),
            }),
            Object.freeze({
                tier: 3,
                name: 'Steel Scythe',
                requiredToolRackLevel: 2,
                resourceHarvestBonus: 2,
                cost: Object.freeze({
                    resources: Object.freeze({ wood: 20, stone: 18, crop: 32 }),
                    ckb: 7200,
                }),
            }),
            Object.freeze({
                tier: 4,
                name: 'Silver Scythe',
                requiredToolRackLevel: 3,
                resourceHarvestBonus: 3,
                cost: Object.freeze({
                    resources: Object.freeze({ wood: 45, stone: 42, crop: 78 }),
                    ckb: 16500,
                }),
            }),
            Object.freeze({
                tier: 5,
                name: 'Gold Scythe',
                requiredToolRackLevel: 4,
                resourceHarvestBonus: 4,
                cost: Object.freeze({
                    resources: Object.freeze({ wood: 90, stone: 85, crop: 150 }),
                    ckb: 38000,
                }),
            }),
            Object.freeze({
                tier: 6,
                name: 'Diamond Scythe',
                requiredToolRackLevel: 5,
                resourceHarvestBonus: 6,
                cost: Object.freeze({
                    resources: Object.freeze({ wood: 175, stone: 165, crop: 280 }),
                    ckb: 85000,
                }),
            }),
        ]),
    }),
]);

export const TOOL_LINE_IDS = Object.freeze(TOOL_LINES.map(line => line.id));
export const MAX_TOOL_TIER = 6;

const TOOL_LINE_INDEX = new Map(TOOL_LINES.map(line => [line.id, line]));
const RESOURCE_TOOL_INDEX = new Map(TOOL_LINES.map(line => [line.resourceId, line.id]));

export function toolProgressStorageKey(ownerId = 'local') {
    return `${TOOL_PROGRESS_STORAGE_PREFIX}${ownerId || 'local'}`;
}

export function toolLineConfig(toolId = 'pickaxe') {
    return TOOL_LINE_INDEX.get(toolId) ?? TOOL_LINE_INDEX.get('pickaxe');
}

export function toolLineForResource(resourceId) {
    const toolId = RESOURCE_TOOL_INDEX.get(resourceId);
    return toolId ? toolLineConfig(toolId) : null;
}

export function normalizeToolTier(value) {
    const tier = Number(value);
    if (!Number.isInteger(tier)) return 1;
    return Math.max(1, Math.min(MAX_TOOL_TIER, tier));
}

export function toolTierConfig(toolId, tier) {
    const line = toolLineConfig(toolId);
    const normalized = normalizeToolTier(tier);
    return line.tiers.find(entry => entry.tier === normalized) ?? line.tiers[0];
}

export function toolIconSrc(toolId, tier) {
    const line = toolLineConfig(toolId);
    const normalized = normalizeToolTier(tier);
    return `assets/tool_${line.id}_t${normalized}.png`;
}

export function nextToolTier(toolId, tier) {
    const next = normalizeToolTier(tier) + 1;
    return next > MAX_TOOL_TIER ? null : toolTierConfig(toolId, next);
}

export class ToolProgression {
    constructor({ tier = null, tiers = null } = {}) {
        this.tiers = new Map();
        this._listeners = new Set();
        const legacyTier = tier === null ? null : normalizeToolTier(tier);
        for (const line of TOOL_LINES) {
            const raw = tiers && Object.prototype.hasOwnProperty.call(tiers, line.id)
                ? tiers[line.id]
                : legacyTier ?? 1;
            this.tiers.set(line.id, normalizeToolTier(raw));
        }
    }

    get tier() {
        return this.getTier('pickaxe');
    }

    set tier(tier) {
        this.setTier('pickaxe', tier);
    }

    getTier(toolId = 'pickaxe') {
        const line = toolLineConfig(toolId);
        return this.tiers.get(line.id) ?? 1;
    }

    setTier(toolId, tier) {
        const line = toolLineConfig(toolId);
        const next = normalizeToolTier(tier);
        const prev = this.getTier(line.id);
        if (next === prev) return false;
        this.tiers.set(line.id, next);
        this._emit({ toolId: line.id, tier: next, previousTier: prev });
        return true;
    }

    entries() {
        return TOOL_LINES.map(line => ({
            toolId: line.id,
            tier: this.getTier(line.id),
        }));
    }

    serialize() {
        return {
            v: 2,
            tiers: Object.fromEntries(this.tiers.entries()),
        };
    }

    onChange(cb) {
        this._listeners.add(cb);
        return () => this._listeners.delete(cb);
    }

    _emit(change) {
        for (const cb of this._listeners) cb(change);
    }
}

export function toolProgressSummary({ toolProgression, buildingProgression, resourceInventory, currencyInventory } = {}) {
    const toolRackLevel = buildingProgression?.getLevel?.('tool_rack') ?? 0;
    const lines = TOOL_LINES.map(line => toolLineSummary({
        line,
        toolProgression,
        toolRackLevel,
        resourceInventory,
        currencyInventory,
    }));
    return {
        toolRackLevel,
        lines,
    };
}

function toolLineSummary({ line, toolProgression, toolRackLevel, resourceInventory, currencyInventory }) {
    const current = toolTierConfig(line.id, toolProgression?.getTier?.(line.id) ?? 1);
    const next = nextToolTier(line.id, current.tier);
    return {
        id: line.id,
        name: line.name,
        resourceId: line.resourceId,
        current,
        next,
        toolRackLevel,
        label: `${current.name} · Tier ${current.tier}`,
        iconSrc: toolIconSrc(line.id, current.tier),
        nextIconSrc: next ? toolIconSrc(line.id, next.tier) : null,
        effectLabel: current.resourceHarvestBonus > 0
            ? `${line.resourceName} yield +${current.resourceHarvestBonus}`
            : `${line.resourceName} baseline yield`,
        nextCostLabel: next?.cost ? formatToolCost(next.cost) : 'Max tier',
        nextRequiredLabel: next ? `Tool Rack ${next.requiredToolRackLevel}` : 'Max tier',
        canUpgrade: !!next
            && toolRackLevel >= next.requiredToolRackLevel
            && canAffordToolUpgrade({ next, resourceInventory, currencyInventory }),
    };
}

export function formatToolCost(cost) {
    if (!cost) return 'Max tier';
    const resources = Object.entries(cost.resources ?? {})
        .map(([resourceId, amount]) => formatResourceAmount(resourceId, amount));
    return [...resources, formatCurrencyAmount('ckb', cost.ckb ?? 0)].join(' · ');
}

export function canAffordToolUpgrade({ next, resourceInventory, currencyInventory } = {}) {
    if (!next?.cost) return false;
    const resourcesOk = Object.entries(next.cost.resources ?? {})
        .every(([resourceId, amount]) => (resourceInventory?.get?.(resourceId) ?? 0) >= amount);
    const ckbOk = (currencyInventory?.get?.('ckb') ?? 0) >= (next.cost.ckb ?? 0);
    return resourcesOk && ckbOk;
}

export function upgradeTool({ toolProgression, buildingProgression, resourceInventory, currencyInventory, toolId = 'pickaxe' } = {}) {
    const line = toolLineConfig(toolId);
    const current = toolTierConfig(line.id, toolProgression?.getTier?.(line.id) ?? 1);
    const next = nextToolTier(line.id, current.tier);
    if (!next) return { ok: false, reason: 'max-tier', toolId: line.id, current };
    const toolRackLevel = buildingProgression?.getLevel?.('tool_rack') ?? 0;
    if (toolRackLevel < next.requiredToolRackLevel) {
        return { ok: false, reason: 'locked', toolId: line.id, current, next, requiredToolRackLevel: next.requiredToolRackLevel };
    }
    if (!canAffordToolUpgrade({ next, resourceInventory, currencyInventory })) {
        return { ok: false, reason: 'insufficient-funds', toolId: line.id, current, next };
    }
    for (const [resourceId, amount] of Object.entries(next.cost.resources ?? {})) {
        resourceInventory.add(resourceId, -amount);
    }
    if (next.cost.ckb) currencyInventory.add('ckb', -next.cost.ckb);
    toolProgression.setTier(line.id, next.tier);
    return { ok: true, toolId: line.id, current: next, tier: next.tier };
}

export function toolResourceYieldAmount(toolProgression, resourceId, baseAmount) {
    const line = toolLineForResource(resourceId);
    const base = Math.max(0, Number(baseAmount) || 0);
    if (!line) return base;
    const current = toolTierConfig(line.id, toolProgression?.getTier?.(line.id) ?? 1);
    return base + current.resourceHarvestBonus;
}

export function loadToolProgression(storage, ownerId = 'local') {
    const raw = storage?.get?.(toolProgressStorageKey(ownerId));
    if (!raw) return new ToolProgression();
    try {
        const data = JSON.parse(raw);
        if (data?.v === 2 && data.tiers && typeof data.tiers === 'object') {
            return new ToolProgression({ tiers: data.tiers });
        }
        if (data?.v === 1 && Number.isInteger(Number(data.tier))) {
            return new ToolProgression({ tier: data.tier });
        }
        return new ToolProgression();
    } catch {
        return new ToolProgression();
    }
}

export function saveToolProgression(storage, ownerId = 'local', toolProgression) {
    try {
        storage?.set?.(toolProgressStorageKey(ownerId), JSON.stringify(toolProgression.serialize()));
        return true;
    } catch {
        return false;
    }
}

export function clearToolProgression(storage, ownerId = 'local') {
    try {
        storage?.remove?.(toolProgressStorageKey(ownerId));
        return true;
    } catch {
        return false;
    }
}
