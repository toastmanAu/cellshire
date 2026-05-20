import { loadPropertyZone } from './propertyStore.js';
import { normalizePropertyTier } from './propertyExpansion.js';

export const PROPERTY_SNAPSHOT_CELL_SCHEMA = 'cellshire.property.snapshot';
export const PROPERTY_SNAPSHOT_CELL_VERSION = 1;
export const PROPERTY_SNAPSHOT_SOURCE_PARAM = 'visitSource';
export const PROPERTY_SNAPSHOT_CELLS_PREFIX = 'cellshire:property-snapshot-cells:v1:';

export function propertySnapshotSourceFromParams(params) {
    return params?.get?.(PROPERTY_SNAPSHOT_SOURCE_PARAM) === 'chain' ? 'chain' : 'local';
}

export function propertySnapshotCellsStorageKeyForOwner(ownerId = 'local') {
    return `${PROPERTY_SNAPSHOT_CELLS_PREFIX}${encodeURIComponent(ownerId || 'local')}`;
}

export function normalizePropertySnapshotCell(cell) {
    if (!cell || typeof cell !== 'object') return null;
    if (cell.schema !== PROPERTY_SNAPSHOT_CELL_SCHEMA
        || cell.version !== PROPERTY_SNAPSHOT_CELL_VERSION) return null;
    const tileMap = cell.tileMap ?? cell.snapshot?.tileMap;
    if (!tileMap || typeof tileMap !== 'object') return null;
    const ownerId = stringOr(cell.ownerId ?? cell.owner, 'local');
    return {
        cellId: stringOr(cell.cellId, `property:${ownerId}`),
        ownerId,
        blockNumber: numberOr(cell.blockNumber, 0),
        savedAt: numberOr(cell.savedAt ?? cell.snapshot?.savedAt, null),
        snapshot: {
            ownerId,
            tileMap,
            camera: cell.camera ?? cell.snapshot?.camera ?? null,
            savedAt: cell.savedAt ?? cell.snapshot?.savedAt ?? null,
            propertyTier: normalizePropertyTier(cell.propertyTier ?? cell.snapshot?.propertyTier),
        },
    };
}

export function buildPropertySnapshotRead(cells = [], opts = {}) {
    const ownerId = opts.ownerId ?? 'local';
    const minBlockNumber = numberOr(opts.minBlockNumber, 0);
    const normalized = cells
        .map(normalizePropertySnapshotCell)
        .filter(cell => cell && cell.ownerId === ownerId);
    const staleCells = normalized.filter(cell => cell.blockNumber < minBlockNumber);
    const active = normalized
        .filter(cell => cell.blockNumber >= minBlockNumber)
        .sort((a, b) => (b.blockNumber - a.blockNumber) || ((b.savedAt ?? 0) - (a.savedAt ?? 0)));
    const selected = active[0] ?? null;
    return {
        source: 'chain',
        ownerId,
        status: selected ? 'found' : staleCells.length ? 'stale' : 'missing',
        stale: staleCells.length > 0,
        minBlockNumber,
        cell: selected,
        staleCells,
        snapshot: selected?.snapshot ?? null,
    };
}

export class LocalPropertySnapshotAdapter {
    constructor({ storage } = {}) {
        this.storage = storage;
    }

    async read({ ownerId = 'local' } = {}) {
        const snapshot = loadPropertyZone(this.storage, { ownerId });
        return {
            source: 'local',
            ownerId,
            status: snapshot ? 'found' : 'missing',
            stale: false,
            snapshot,
        };
    }
}

export class ChainPropertySnapshotAdapter {
    constructor({ indexer, ownerId = 'local', minBlockNumber = 0 } = {}) {
        this.indexer = indexer;
        this.ownerId = ownerId;
        this.minBlockNumber = minBlockNumber;
    }

    async read({ ownerId = this.ownerId } = {}) {
        const cells = await this.indexer.getPropertySnapshotCells({ ownerId });
        return buildPropertySnapshotRead(cells, {
            ownerId,
            minBlockNumber: this.minBlockNumber,
        });
    }
}

export class LocalStoragePropertySnapshotIndexer {
    constructor({ storage } = {}) {
        this.storage = storage;
    }

    async getPropertySnapshotCells({ ownerId = 'local' } = {}) {
        const raw = this.storage?.get?.(propertySnapshotCellsStorageKeyForOwner(ownerId));
        if (!raw) return [];
        try {
            const data = JSON.parse(raw);
            return Array.isArray(data) ? data : [];
        } catch {
            return [];
        }
    }
}

export function savePropertySnapshotCellsFixture(storage, ownerId, cells) {
    storage?.set?.(propertySnapshotCellsStorageKeyForOwner(ownerId), JSON.stringify(cells));
}

export function makePropertySnapshotAdapterFromParams({ params, storage, indexer } = {}) {
    if (propertySnapshotSourceFromParams(params) !== 'chain') {
        return new LocalPropertySnapshotAdapter({ storage });
    }
    return new ChainPropertySnapshotAdapter({
        ownerId: params?.get?.('visit') || 'local',
        minBlockNumber: numberOr(params?.get?.('visitMinBlock'), 0),
        indexer: indexer ?? new LocalStoragePropertySnapshotIndexer({ storage }),
    });
}

export function localPropertySnapshotCell(snapshot, opts = {}) {
    const ownerId = opts.ownerId ?? snapshot?.ownerId ?? 'local';
    return {
        schema: PROPERTY_SNAPSHOT_CELL_SCHEMA,
        version: PROPERTY_SNAPSHOT_CELL_VERSION,
        kind: 'property_snapshot',
        cellId: opts.cellId ?? `property:${ownerId}:${opts.blockNumber ?? 0}`,
        ownerId,
        blockNumber: opts.blockNumber ?? 0,
        savedAt: snapshot?.savedAt ?? opts.savedAt ?? Date.now(),
        propertyTier: snapshot?.propertyTier ?? 1,
        tileMap: snapshot?.tileMap,
        camera: snapshot?.camera ?? null,
    };
}

function stringOr(value, fallback) {
    return typeof value === 'string' && value !== '' ? value : fallback;
}

function numberOr(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}
