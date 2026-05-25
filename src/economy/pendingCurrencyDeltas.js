export const PENDING_CURRENCY_DELTAS_VERSION = 1;

export function pendingCurrencyDeltasKey(owner = 'local') {
    return `cellshire:pending-currency-deltas:v1:${encodeURIComponent(owner || 'local')}`;
}

export class PendingCurrencyDeltaStore {
    constructor({ storage, owner = 'local', now = Date.now } = {}) {
        this.storage = storage;
        this.owner = owner || 'local';
        this.now = now;
    }

    list() {
        return loadPendingCurrencyDeltas(this.storage, this.owner);
    }

    add({ currency, amount, txHash, source = 'unknown', expectedAmount = null }) {
        const delta = normalizePendingCurrencyDelta({
            version: PENDING_CURRENCY_DELTAS_VERSION,
            id: `${txHash || this.now()}:${currency}:${source}`,
            owner: this.owner,
            currency,
            amount,
            txHash: txHash || null,
            source,
            expectedAmount,
            createdAt: this.now(),
        });
        if (!delta) return null;
        const next = this.list().filter(existing => existing.id !== delta.id);
        next.push(delta);
        savePendingCurrencyDeltas(this.storage, this.owner, next);
        return delta;
    }

    replace(deltas) {
        savePendingCurrencyDeltas(this.storage, this.owner, deltas);
    }

    clear(id) {
        this.replace(this.list().filter(delta => delta.id !== id));
    }

    clearReconciled(indexedAmounts = {}) {
        const pending = this.list();
        const next = pending.filter(delta => {
            const indexed = Number(indexedAmounts[delta.currency] ?? 0);
            if (!Number.isFinite(delta.expectedAmount)) return true;
            return delta.amount < 0
                ? indexed > delta.expectedAmount
                : indexed < delta.expectedAmount;
        });
        if (next.length !== pending.length) this.replace(next);
        return {
            cleared: pending.length - next.length,
            pending: next,
        };
    }
}

export function loadPendingCurrencyDeltas(storage, owner = 'local') {
    try {
        const raw = storage?.get?.(pendingCurrencyDeltasKey(owner));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizePendingCurrencyDelta).filter(Boolean);
    } catch {
        return [];
    }
}

export function savePendingCurrencyDeltas(storage, owner = 'local', deltas = []) {
    const normalized = deltas.map(normalizePendingCurrencyDelta).filter(Boolean);
    storage?.set?.(pendingCurrencyDeltasKey(owner), JSON.stringify(normalized));
    return normalized;
}

export function pendingDeltaTotals(deltas = []) {
    const totals = {};
    for (const delta of deltas.map(normalizePendingCurrencyDelta).filter(Boolean)) {
        totals[delta.currency] = (totals[delta.currency] ?? 0) + delta.amount;
    }
    return totals;
}

function normalizePendingCurrencyDelta(delta) {
    const amount = Number(delta?.amount);
    if (!delta || typeof delta.currency !== 'string' || delta.currency === '') return null;
    if (!Number.isFinite(amount) || amount === 0) return null;
    const expectedAmount = Number(delta.expectedAmount);
    return {
        version: PENDING_CURRENCY_DELTAS_VERSION,
        id: String(delta.id || `${delta.txHash || 'pending'}:${delta.currency}`),
        owner: String(delta.owner || 'local'),
        currency: delta.currency,
        amount,
        txHash: typeof delta.txHash === 'string' ? delta.txHash : null,
        source: typeof delta.source === 'string' ? delta.source : 'unknown',
        expectedAmount: Number.isFinite(expectedAmount) ? expectedAmount : null,
        createdAt: Number.isFinite(Number(delta.createdAt)) ? Number(delta.createdAt) : 0,
    };
}
