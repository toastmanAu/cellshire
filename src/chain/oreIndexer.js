export function chainMiningIndexerMode(params) {
    const explicit = params?.get?.('chainMiningIndexer') || params?.get?.('oreIndexer');
    if (explicit === 'http' || params?.get?.('chainMiningIndexerUrl')) return 'http';
    return 'fixture';
}

export function createOreIndexerFromParams({ params, fetchImpl } = {}) {
    if (chainMiningIndexerMode(params) === 'http') {
        return new HttpOreIndexer({
            baseUrl: params?.get?.('chainMiningIndexerUrl') || params?.get?.('oreIndexerUrl'),
            fetchImpl,
        });
    }
    return new LocalOreIndexer();
}

export class LocalOreIndexer {
    constructor(entries = []) {
        this.cells = new Map();
        this.orphaned = new Set();
        for (const entry of entries) {
            if (entry?.oreId && entry?.cell) this.cells.set(entry.oreId, entry.cell);
        }
    }

    async getOreCell(oreId) {
        if (this.orphaned.has(oreId)) return { status: 'orphaned', liveCell: null };
        const liveCell = this.cells.get(oreId) ?? null;
        if (!liveCell) return { status: 'untouched', liveCell: null };
        if (liveCell.capacity_remaining <= 0) return { status: 'depleted', liveCell: null };
        return { status: 'live', liveCell };
    }

    recordMiningTx(tx) {
        const oreId = tx?.witness?.mining_receipt?.ore_id
            ?? tx?.inputs?.ore_cell?.ore_id
            ?? tx?.outputs?.ore_cell?.ore_id;
        if (!oreId) return { ok: false, reason: 'missing-ore-id' };
        if (tx.action === 'birth' && this.cells.has(oreId)) {
            this.orphaned.add(oreId);
            return { ok: true, status: 'orphaned' };
        }
        if (tx.outputs?.ore_cell) {
            this.cells.set(oreId, tx.outputs.ore_cell);
            return { ok: true, status: 'live' };
        }
        this.cells.set(oreId, { ...(tx.inputs?.ore_cell ?? {}), capacity_remaining: 0 });
        return { ok: true, status: 'depleted' };
    }

    markOrphaned(oreId) {
        this.orphaned.add(oreId);
    }
}

export class HttpOreIndexer {
    constructor({
        baseUrl = '/api/cellshire',
        fetchImpl = globalThis.fetch?.bind(globalThis),
    } = {}) {
        this.baseUrl = String(baseUrl || '/api/cellshire').replace(/\/+$/, '');
        this.fetchImpl = fetchImpl;
    }

    async getOreCell(oreId) {
        if (!this.fetchImpl) {
            return { status: 'stale', liveCell: null, reason: 'fetch-unavailable' };
        }
        try {
            const res = await this.fetchImpl(`${this.baseUrl}/ore/${encodeURIComponent(oreId)}`);
            if (res.status === 404) return { status: 'untouched', liveCell: null };
            if (!res.ok) return { status: 'stale', liveCell: null, reason: `http-${res.status}` };
            return normalizeOreIndexerRecord(await res.json(), oreId);
        } catch (err) {
            return {
                status: 'stale',
                liveCell: null,
                reason: err?.message || 'indexer-unavailable',
            };
        }
    }

    recordMiningTx() {
        return { ok: true, status: 'pending-indexer' };
    }
}

export function normalizeOreIndexerRecord(record, oreId = null) {
    if (!record) return { status: 'untouched', liveCell: null };
    const status = record.status || (record.liveCell || record.cell ? 'live' : 'untouched');
    if (status === 'untouched') return { status, liveCell: null };
    if (status === 'orphaned') return { status, liveCell: null };
    if (status === 'depleted') return { status, liveCell: null };
    if (status === 'live') {
        const liveCell = record.liveCell || record.cell;
        if (!liveCell) return { status: 'stale', liveCell: null, reason: 'missing-live-cell' };
        if (oreId && liveCell.ore_id && liveCell.ore_id !== oreId) {
            return { status: 'stale', liveCell: null, reason: 'ore-id-mismatch' };
        }
        if (Number(liveCell.capacity_remaining) <= 0) {
            return { status: 'depleted', liveCell: null };
        }
        return { status: 'live', liveCell };
    }
    return { status: 'stale', liveCell: null, reason: `unknown-status:${status}` };
}
