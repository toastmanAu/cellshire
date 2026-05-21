export const RESOURCE_INVENTORY_STORAGE_KEY = 'cellshire:resources:v1:local';

export const RESOURCE_CATALOG = Object.freeze({
    wood: Object.freeze({ id: 'wood', name: 'Wood' }),
    stone: Object.freeze({ id: 'stone', name: 'Stone' }),
    gold: Object.freeze({ id: 'gold', name: 'Gold' }),
    crop: Object.freeze({ id: 'crop', name: 'Crop' }),
    herb: Object.freeze({ id: 'herb', name: 'Herb' }),
});

export class ResourceInventory {
    constructor(entries = []) {
        this.counts = new Map();
        this._listeners = new Set();
        for (const [resourceId, count] of entries) this.add(resourceId, count);
    }

    add(resourceId, delta = 1) {
        const amount = Number(delta);
        if (!RESOURCE_CATALOG[resourceId] || !Number.isFinite(amount) || amount === 0) return false;
        const prev = this.counts.get(resourceId) ?? 0;
        const next = Math.max(0, prev + amount);
        if (next === prev) return false;
        if (next === 0) this.counts.delete(resourceId);
        else this.counts.set(resourceId, next);
        this._emit({ resourceId, delta: amount, total: next });
        return true;
    }

    get(resourceId) {
        return this.counts.get(resourceId) ?? 0;
    }

    entries() {
        return Array.from(this.counts.entries())
            .filter(([, count]) => count > 0)
            .sort(([a], [b]) => a.localeCompare(b));
    }

    serialize() {
        return {
            v: 1,
            counts: Object.fromEntries(this.entries()),
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

export function loadResourceInventory(storage) {
    const raw = storage?.get?.(RESOURCE_INVENTORY_STORAGE_KEY);
    if (!raw) return new ResourceInventory();
    try {
        const data = JSON.parse(raw);
        if (data?.v !== 1 || !data.counts || typeof data.counts !== 'object') {
            return new ResourceInventory();
        }
        return new ResourceInventory(Object.entries(data.counts));
    } catch {
        return new ResourceInventory();
    }
}

export function saveResourceInventory(storage, inventory) {
    try {
        storage?.set?.(RESOURCE_INVENTORY_STORAGE_KEY, JSON.stringify(inventory.serialize()));
        return true;
    } catch {
        return false;
    }
}

export function formatResourceAmount(resourceId, amount) {
    const name = RESOURCE_CATALOG[resourceId]?.name ?? resourceId;
    return `${Math.floor(amount)} ${name}`;
}
