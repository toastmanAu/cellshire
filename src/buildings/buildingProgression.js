import { formatCurrencyAmount } from '../mining/cryptoEconomy.js';
import { formatResourceAmount } from '../resources/resourceInventory.js';

export const BUILDING_PROGRESS_STORAGE_PREFIX = 'cellshire:buildings:v1:';

export const STANDARD_BUILDINGS = Object.freeze([
    Object.freeze({
        id: 'home',
        assetId: 'house',
        name: 'Home',
        capability: 'Home management',
        starterLevel: 1,
        maxLevel: 3,
        levels: Object.freeze({
            2: Object.freeze({ resources: Object.freeze({ wood: 20, stone: 15, crop: 8 }), ckb: 3500 }),
            3: Object.freeze({ resources: Object.freeze({ wood: 45, stone: 35, crop: 18 }), ckb: 9000 }),
        }),
    }),
    Object.freeze({
        id: 'workbench',
        assetId: 'workbench',
        name: 'Workbench',
        capability: 'Basic crafting',
        starterLevel: 0,
        maxLevel: 2,
        levels: Object.freeze({
            1: Object.freeze({ resources: Object.freeze({ wood: 6, stone: 3, crop: 2 }), ckb: 900 }),
            2: Object.freeze({ resources: Object.freeze({ wood: 22, stone: 12, crop: 8 }), ckb: 5000 }),
        }),
    }),
    Object.freeze({
        id: 'tool_rack',
        assetId: 'tool_rack',
        name: 'Tool Rack',
        capability: 'Tool upgrades',
        starterLevel: 0,
        maxLevel: 5,
        levels: Object.freeze({
            1: Object.freeze({ resources: Object.freeze({ wood: 7, stone: 3, crop: 2 }), ckb: 1000 }),
            2: Object.freeze({ resources: Object.freeze({ wood: 24, stone: 18, crop: 8 }), ckb: 5500 }),
            3: Object.freeze({ resources: Object.freeze({ wood: 56, stone: 42, crop: 18 }), ckb: 15000 }),
            4: Object.freeze({ resources: Object.freeze({ wood: 105, stone: 80, crop: 36 }), ckb: 36000 }),
            5: Object.freeze({ resources: Object.freeze({ wood: 190, stone: 150, crop: 75 }), ckb: 82000 }),
        }),
    }),
    Object.freeze({
        id: 'sawmill',
        assetId: 'sawmill',
        name: 'Sawmill',
        capability: 'Wood processing',
        starterLevel: 0,
        maxLevel: 2,
        levels: Object.freeze({
            1: Object.freeze({ resources: Object.freeze({ wood: 8, stone: 4, crop: 3 }), ckb: 1200 }),
            2: Object.freeze({ resources: Object.freeze({ wood: 42, stone: 20, crop: 12 }), ckb: 8500 }),
        }),
    }),
    Object.freeze({
        id: 'stone_yard',
        assetId: 'stone_yard',
        name: 'Stone Yard',
        capability: 'Masonry processing',
        starterLevel: 0,
        maxLevel: 2,
        levels: Object.freeze({
            1: Object.freeze({ resources: Object.freeze({ wood: 5, stone: 8, crop: 3 }), ckb: 1200 }),
            2: Object.freeze({ resources: Object.freeze({ wood: 25, stone: 44, crop: 12 }), ckb: 9000 }),
        }),
    }),
    Object.freeze({
        id: 'farm_storage',
        assetId: 'farm_storage',
        name: 'Farm Storage',
        capability: 'Farm capacity',
        starterLevel: 0,
        maxLevel: 2,
        levels: Object.freeze({
            1: Object.freeze({ resources: Object.freeze({ wood: 6, stone: 4, crop: 6 }), ckb: 1100 }),
            2: Object.freeze({ resources: Object.freeze({ wood: 32, stone: 20, crop: 24 }), ckb: 7600 }),
        }),
    }),
]);

export const STANDARD_BUILDING_IDS = Object.freeze(STANDARD_BUILDINGS.map(entry => entry.id));
export const STANDARD_BUILDING_ASSET_IDS = Object.freeze(
    Array.from(new Set(STANDARD_BUILDINGS.map(entry => entry.assetId)))
);

const BUILDING_INDEX = new Map(STANDARD_BUILDINGS.map(entry => [entry.id, entry]));
const BUILDING_ASSET_INDEX = new Map(STANDARD_BUILDINGS.map(entry => [entry.assetId, entry.id]));

export function buildingProgressStorageKey(ownerId = 'local') {
    return `${BUILDING_PROGRESS_STORAGE_PREFIX}${ownerId || 'local'}`;
}

export function buildingDefinition(buildingId) {
    return BUILDING_INDEX.get(buildingId) ?? null;
}

export function standardBuildingIdForAsset(assetId) {
    return BUILDING_ASSET_INDEX.get(assetId) ?? null;
}

export function isStandardBuildingAsset(assetId) {
    return BUILDING_ASSET_INDEX.has(assetId);
}

export function isStandardBuildingAssetUnlocked(progression, assetId) {
    const buildingId = standardBuildingIdForAsset(assetId);
    if (!buildingId) return false;
    return (progression?.getLevel?.(buildingId) ?? 0) > 0;
}

export function activeBuildingProgression(progression, activeBuildingIds = []) {
    const active = activeBuildingIdSet(activeBuildingIds);
    return {
        getLevel(buildingId) {
            const def = buildingDefinition(buildingId);
            if (!def) return 0;
            const level = progression?.getLevel?.(buildingId) ?? def.starterLevel;
            if (buildingId === 'home') return level;
            return active.has(buildingId) ? level : 0;
        },
    };
}

export function activeBuildingIdsFromAssetIds(assetIds = []) {
    const active = new Set();
    for (const assetId of assetIds) {
        const buildingId = standardBuildingIdForAsset(assetId);
        if (buildingId) active.add(buildingId);
    }
    return activeBuildingIdSet(active);
}

function activeBuildingIdSet(values = []) {
    const out = new Set(['home']);
    for (const value of values) {
        if (buildingDefinition(value)) out.add(value);
    }
    return out;
}

export class BuildingProgression {
    constructor(levels = {}) {
        this.levels = new Map();
        this._listeners = new Set();
        for (const def of STANDARD_BUILDINGS) {
            const raw = Number(levels[def.id]);
            const level = Number.isInteger(raw) ? raw : def.starterLevel;
            this.levels.set(def.id, clampLevel(def, level));
        }
    }

    getLevel(buildingId) {
        const def = buildingDefinition(buildingId);
        if (!def) return 0;
        return this.levels.get(buildingId) ?? def.starterLevel;
    }

    setLevel(buildingId, level) {
        const def = buildingDefinition(buildingId);
        if (!def) return false;
        const next = clampLevel(def, level);
        const prev = this.getLevel(buildingId);
        if (next === prev) return false;
        this.levels.set(buildingId, next);
        this._emit({ buildingId, level: next, previousLevel: prev });
        return true;
    }

    entries() {
        return STANDARD_BUILDINGS.map(def => buildingStateFor(this, def.id));
    }

    serialize() {
        return {
            v: 1,
            levels: Object.fromEntries(this.levels.entries()),
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

export function buildingStateFor(progression, buildingId) {
    const def = buildingDefinition(buildingId);
    if (!def) return null;
    const level = progression?.getLevel?.(buildingId) ?? def.starterLevel;
    const nextLevel = level >= def.maxLevel ? null : level + 1;
    const nextCost = nextLevel ? def.levels[nextLevel] ?? null : null;
    const tierGate = buildingTierGate(progression, buildingId, nextLevel);
    return {
        id: def.id,
        assetId: def.assetId,
        name: def.name,
        capability: def.capability,
        level,
        maxLevel: def.maxLevel,
        unlocked: level > 0,
        label: level > 0 ? `Level ${level}` : 'Locked',
        actionLabel: nextLevel ? (level > 0 ? `Upgrade to ${nextLevel}` : 'Unlock') : 'Max level',
        nextLevel,
        nextCost,
        nextCostLabel: nextCost ? formatBuildingCost(nextCost) : 'Max level',
        tierGate,
        tierGateLabel: tierGate.ok ? null : formatBuildingTierGate(tierGate),
    };
}

export function buildingTierGate(progression, buildingId, nextLevel) {
    if (!nextLevel || nextLevel <= 1) return { ok: true, requiredLevel: 0, blockers: [] };
    const def = buildingDefinition(buildingId);
    if (!def) return { ok: false, requiredLevel: nextLevel - 1, blockers: [] };
    const requiredLevel = nextLevel - 1;
    const blockers = STANDARD_BUILDINGS
        .filter(entry => entry.maxLevel >= requiredLevel)
        .filter(entry => (progression?.getLevel?.(entry.id) ?? entry.starterLevel) < requiredLevel)
        .map(entry => ({
            id: entry.id,
            name: entry.name,
            level: progression?.getLevel?.(entry.id) ?? entry.starterLevel,
        }));
    return {
        ok: blockers.length === 0,
        requiredLevel,
        blockers,
    };
}

export function formatBuildingTierGate(gate) {
    if (!gate || gate.ok) return '';
    const names = gate.blockers.slice(0, 3).map(entry => entry.name).join(', ');
    const more = gate.blockers.length > 3 ? ` +${gate.blockers.length - 3} more` : '';
    return `Need all buildings Level ${gate.requiredLevel}: ${names}${more}`;
}

export function buildingProgressSummary(progression, { resourceInventory, currencyInventory, activeBuildingIds = null } = {}) {
    const activeProgression = activeBuildingIds === null
        ? progression
        : activeBuildingProgression(progression, activeBuildingIds);
    const effects = buildingCapabilityEffects(activeProgression);
    return STANDARD_BUILDINGS.map(def => {
        const state = buildingStateFor(progression, def.id);
        const activeLevel = activeProgression?.getLevel?.(def.id) ?? state.level;
        const inactiveUnlocked = state.unlocked && activeLevel <= 0 && def.id !== 'home';
        return {
            ...state,
            active: state.unlocked && !inactiveUnlocked,
            activeLevel,
            effectLabel: inactiveUnlocked
                ? 'Place on property to activate'
                : effects.buildingEffects[def.id] ?? null,
            canAffordNext: !!state.nextCost && state.tierGate.ok && canAffordBuildingCost({
                resourceInventory,
                currencyInventory,
                cost: state.nextCost,
            }),
        };
    });
}

export function buildingCapabilityEffects(progression) {
    const level = buildingId => progression?.getLevel?.(buildingId)
        ?? buildingDefinition(buildingId)?.starterLevel
        ?? 0;
    const bonuses = {
        wood: level('sawmill'),
        stone: level('stone_yard'),
        crop: level('farm_storage'),
    };
    return {
        levels: Object.fromEntries(STANDARD_BUILDING_IDS.map(id => [id, level(id)])),
        resourceYieldBonus(resourceId) {
            return Math.max(0, Math.floor(bonuses[resourceId] ?? 0));
        },
        resourceYieldAmount(resourceId, baseAmount) {
            const base = Math.max(0, Number(baseAmount) || 0);
            return base + this.resourceYieldBonus(resourceId);
        },
        buildingEffects: {
            home: level('home') > 1 ? `Home management level ${level('home')}` : 'Starter home active',
            workbench: level('workbench') > 0 ? `Crafting tier ${level('workbench')}` : 'Unlocks basic crafting',
            tool_rack: level('tool_rack') > 0 ? `Tool upgrade tier ${level('tool_rack')}` : 'Unlocks tool upgrades',
            sawmill: level('sawmill') > 0 ? `Wood harvest +${bonuses.wood}` : 'Improves wood harvests',
            stone_yard: level('stone_yard') > 0 ? `Stone harvest +${bonuses.stone}` : 'Improves stone harvests',
            farm_storage: level('farm_storage') > 0 ? `Crop harvest +${bonuses.crop}` : 'Improves crop harvests',
        },
    };
}

export function formatBuildingCost(cost) {
    if (!cost) return 'Max level';
    const resources = Object.entries(cost.resources ?? {})
        .map(([resourceId, amount]) => formatResourceAmount(resourceId, amount));
    return [...resources, formatCurrencyAmount('ckb', cost.ckb ?? 0)].join(' · ');
}

export function canAffordBuildingCost({ resourceInventory, currencyInventory, cost } = {}) {
    if (!cost) return false;
    const resourcesOk = Object.entries(cost.resources ?? {})
        .every(([resourceId, amount]) => (resourceInventory?.get?.(resourceId) ?? 0) >= amount);
    const ckbOk = (currencyInventory?.get?.('ckb') ?? 0) >= (cost.ckb ?? 0);
    return resourcesOk && ckbOk;
}

export function spendBuildingCost({ resourceInventory, currencyInventory, cost } = {}) {
    if (!canAffordBuildingCost({ resourceInventory, currencyInventory, cost })) {
        return { ok: false, reason: 'insufficient-funds' };
    }
    for (const [resourceId, amount] of Object.entries(cost.resources ?? {})) {
        resourceInventory.add(resourceId, -amount);
    }
    if (cost.ckb) currencyInventory.add('ckb', -cost.ckb);
    return { ok: true };
}

export function unlockOrUpgradeBuilding({ progression, buildingId, resourceInventory, currencyInventory } = {}) {
    const state = buildingStateFor(progression, buildingId);
    if (!state) return { ok: false, reason: 'missing-building' };
    if (!state.nextLevel || !state.nextCost) {
        return { ok: false, reason: 'max-level', state };
    }
    if (!state.tierGate.ok) {
        return { ok: false, reason: 'tier-gate', state, gate: state.tierGate };
    }
    const spend = spendBuildingCost({
        resourceInventory,
        currencyInventory,
        cost: state.nextCost,
    });
    if (!spend.ok) return { ...spend, state };
    progression.setLevel(buildingId, state.nextLevel);
    return {
        ok: true,
        buildingId,
        level: state.nextLevel,
        state: buildingStateFor(progression, buildingId),
    };
}

export function loadBuildingProgression(storage, ownerId = 'local') {
    const raw = storage?.get?.(buildingProgressStorageKey(ownerId));
    if (!raw) return new BuildingProgression();
    try {
        const data = JSON.parse(raw);
        if (data?.v !== 1 || !data.levels || typeof data.levels !== 'object') {
            return new BuildingProgression();
        }
        return new BuildingProgression(data.levels);
    } catch {
        return new BuildingProgression();
    }
}

export function saveBuildingProgression(storage, ownerId = 'local', progression) {
    try {
        storage?.set?.(buildingProgressStorageKey(ownerId), JSON.stringify(progression.serialize()));
        return true;
    } catch {
        return false;
    }
}

export function clearBuildingProgression(storage, ownerId = 'local') {
    try {
        storage?.remove?.(buildingProgressStorageKey(ownerId));
        return true;
    } catch {
        return false;
    }
}

function clampLevel(def, level) {
    return Math.max(0, Math.min(def.maxLevel, Number(level) || 0));
}
