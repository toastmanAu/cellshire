import { formatUsd } from '../mining/cryptoEconomy.js';

export const HOUSE_TREASURY_STORAGE_KEY = 'cellshire:house-treasury:v1';

export class HouseTreasury {
    constructor(entries = []) {
        this.entriesList = [];
        this._listeners = new Set();
        for (const entry of entries) this.record(entry, { emit: false });
    }

    record(entry, opts = {}) {
        const normalized = normalizeTreasuryEntry(entry, this.entriesList.length);
        if (!normalized) return null;
        this.entriesList.push(normalized);
        if (opts.emit !== false) this._emit(normalized);
        return normalized;
    }

    recordTraderFee({ quote, swap, at = Date.now() } = {}) {
        if (!quote?.ok || !Number.isFinite(quote.feeUsd) || quote.feeUsd <= 0) return null;
        return this.record({
            source: 'trader',
            amountUsd: quote.feeUsd,
            at,
            detail: {
                fromCurrency: quote.fromCurrency,
                fromAmount: quote.fromAmount,
                toCurrency: quote.toCurrency,
                toAmount: quote.toAmount,
                feeBps: quote.feeBps,
                mode: swap?.mode ?? 'local',
            },
        });
    }

    totalUsd() {
        return Number(this.entriesList.reduce((sum, entry) => sum + entry.amountUsd, 0).toFixed(8));
    }

    entries() {
        return this.entriesList.slice().sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
    }

    recent(limit = 5) {
        return this.entries().slice(0, limit);
    }

    serialize() {
        return {
            v: 1,
            entries: this.entriesList,
        };
    }

    onChange(cb) {
        this._listeners.add(cb);
        return () => this._listeners.delete(cb);
    }

    _emit(entry) {
        for (const cb of this._listeners) cb(entry);
    }
}

export function loadHouseTreasury(storage) {
    const raw = storage?.get?.(HOUSE_TREASURY_STORAGE_KEY);
    if (!raw) return new HouseTreasury();
    try {
        const data = JSON.parse(raw);
        if (data?.v !== 1 || !Array.isArray(data.entries)) return new HouseTreasury();
        return new HouseTreasury(data.entries);
    } catch {
        return new HouseTreasury();
    }
}

export function saveHouseTreasury(storage, treasury) {
    try {
        storage?.set?.(HOUSE_TREASURY_STORAGE_KEY, JSON.stringify(treasury.serialize()));
        return true;
    } catch {
        return false;
    }
}

export function houseTreasurySummary(treasury) {
    const totalUsd = treasury?.totalUsd?.() ?? 0;
    const entries = treasury?.entries?.() ?? [];
    return {
        totalUsd,
        totalLabel: formatUsd(totalUsd),
        feeCount: entries.length,
        recent: entries.slice(0, 5).map(formatTreasuryEntry),
    };
}

export function formatTreasuryEntry(entry) {
    if (!entry) return '';
    const source = entry.source === 'trader' ? 'Trader fee' : entry.source;
    return `${source} · ${formatUsd(entry.amountUsd)}`;
}

function normalizeTreasuryEntry(entry, index) {
    const amountUsd = Number(entry?.amountUsd);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return null;
    const at = Number(entry?.at);
    return {
        id: typeof entry.id === 'string' && entry.id
            ? entry.id
            : `treasury:${Number.isFinite(at) ? at : Date.now()}:${index}`,
        source: typeof entry.source === 'string' && entry.source ? entry.source : 'unknown',
        amountUsd: Number(amountUsd.toFixed(8)),
        at: Number.isFinite(at) ? at : Date.now(),
        detail: entry.detail && typeof entry.detail === 'object' ? { ...entry.detail } : {},
    };
}
