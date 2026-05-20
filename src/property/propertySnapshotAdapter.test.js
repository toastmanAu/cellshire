import { describe, it, expect } from '../test/harness.js';
import { createStarterPropertyMap } from './propertyZone.js';
import {
    ChainPropertySnapshotAdapter,
    LocalStoragePropertySnapshotIndexer,
    buildPropertySnapshotRead,
    localPropertySnapshotCell,
    makePropertySnapshotAdapterFromParams,
    normalizePropertySnapshotCell,
    propertySnapshotCellsStorageKeyForOwner,
    propertySnapshotSourceFromParams,
    savePropertySnapshotCellsFixture,
} from './propertySnapshotAdapter.js';

function fakeStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        get: key => data.get(key) ?? null,
        set: (key, value) => data.set(key, value),
    };
}

function snapshot(ownerId = 'joyid:alice') {
    return {
        ownerId,
        savedAt: 123,
        propertyTier: 2,
        tileMap: createStarterPropertyMap().serialize(),
        camera: { offsetX: 1, offsetY: 2, zoom: 1.25 },
    };
}

describe('property snapshot adapter', () => {
    it('normalizes chain property cells into the local snapshot shape', () => {
        const cell = localPropertySnapshotCell(snapshot(), { ownerId: 'joyid:alice', blockNumber: 12 });
        const normalized = normalizePropertySnapshotCell(cell);
        expect(normalized.ownerId).toBe('joyid:alice');
        expect(normalized.blockNumber).toBe(12);
        expect(normalized.snapshot.tileMap.width).toBe(24);
        expect(normalized.snapshot.propertyTier).toBe(2);
        expect(normalizePropertySnapshotCell({ schema: 'bad' })).toBeNull();
    });

    it('chooses the newest active owner snapshot and reports stale cells', () => {
        const read = buildPropertySnapshotRead([
            localPropertySnapshotCell(snapshot('joyid:alice'), { ownerId: 'joyid:alice', blockNumber: 9 }),
            localPropertySnapshotCell({ ...snapshot('joyid:alice'), propertyTier: 3 }, {
                ownerId: 'joyid:alice',
                blockNumber: 14,
            }),
            localPropertySnapshotCell(snapshot('joyid:bob'), { ownerId: 'joyid:bob', blockNumber: 20 }),
        ], {
            ownerId: 'joyid:alice',
            minBlockNumber: 10,
        });
        expect(read.source).toBe('chain');
        expect(read.status).toBe('found');
        expect(read.stale).toBe(true);
        expect(read.staleCells.length).toBe(1);
        expect(read.snapshot.propertyTier).toBe(3);
    });

    it('returns a stale placeholder state when only old owner cells are indexed', () => {
        const read = buildPropertySnapshotRead([
            localPropertySnapshotCell(snapshot(), { ownerId: 'joyid:alice', blockNumber: 7 }),
        ], {
            ownerId: 'joyid:alice',
            minBlockNumber: 10,
        });
        expect(read.status).toBe('stale');
        expect(read.stale).toBe(true);
        expect(read.snapshot).toBeNull();
    });

    it('reads owner-keyed chain fixture cells through an indexer adapter', async () => {
        const storage = fakeStorage();
        savePropertySnapshotCellsFixture(storage, 'joyid:alice', [
            localPropertySnapshotCell(snapshot(), { ownerId: 'joyid:alice', blockNumber: 11 }),
        ]);
        expect(propertySnapshotCellsStorageKeyForOwner('joyid:alice'))
            .toBe('cellshire:property-snapshot-cells:v1:joyid%3Aalice');
        const adapter = new ChainPropertySnapshotAdapter({
            ownerId: 'joyid:alice',
            indexer: new LocalStoragePropertySnapshotIndexer({ storage }),
        });
        const read = await adapter.read();
        expect(read.status).toBe('found');
        expect(read.snapshot.ownerId).toBe('joyid:alice');
        expect(read.snapshot.tileMap.objects.length > 0).toBe(true);
    });

    it('selects local or chain source from visit params', () => {
        expect(propertySnapshotSourceFromParams(new URLSearchParams('?visitSource=chain'))).toBe('chain');
        expect(propertySnapshotSourceFromParams(new URLSearchParams('?visitSource=local'))).toBe('local');
        expect(makePropertySnapshotAdapterFromParams({
            params: new URLSearchParams('?visit=joyid%3Aalice&visitSource=chain'),
            storage: fakeStorage(),
        }).constructor.name).toBe('ChainPropertySnapshotAdapter');
    });
});
