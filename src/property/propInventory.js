export const PROP_INVENTORY_STORAGE_KEY = 'cellshire:props:v1:local';

export class PropInventory {
    constructor(entries = []) {
        this.counts = new Map();
        this._listeners = new Set();
        for (const [assetId, count] of entries) this.add(assetId, count);
    }

    add(assetId, delta = 1) {
        const amount = Number(delta);
        if (!assetId || !Number.isFinite(amount) || amount === 0) return false;
        const prev = this.counts.get(assetId) ?? 0;
        const next = Math.max(0, prev + amount);
        if (next === prev) return false;
        if (next === 0) this.counts.delete(assetId);
        else this.counts.set(assetId, next);
        this._emit({ assetId, delta: amount, total: next });
        return true;
    }

    consume(assetId, amount = 1) {
        const qty = Number(amount);
        if (!Number.isFinite(qty) || qty <= 0) return false;
        if (this.get(assetId) < qty) return false;
        return this.add(assetId, -qty);
    }

    get(assetId) {
        return this.counts.get(assetId) ?? 0;
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

export function loadPropInventory(storage) {
    const raw = storage?.get?.(PROP_INVENTORY_STORAGE_KEY);
    if (!raw) return new PropInventory();
    try {
        const data = JSON.parse(raw);
        if (data?.v !== 1 || !data.counts || typeof data.counts !== 'object') {
            return new PropInventory();
        }
        return new PropInventory(Object.entries(data.counts));
    } catch {
        return new PropInventory();
    }
}

export function savePropInventory(storage, inventory) {
    try {
        storage?.set?.(PROP_INVENTORY_STORAGE_KEY, JSON.stringify(inventory.serialize()));
        return true;
    } catch {
        return false;
    }
}
