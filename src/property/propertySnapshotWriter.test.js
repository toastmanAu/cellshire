import { describe, it, expect } from '../test/harness.js';
import { createStarterPropertyMap } from './propertyZone.js';
import { loadPropertyZone } from './propertyStore.js';
import { propertySnapshotCellsStorageKeyForOwner } from './propertySnapshotAdapter.js';
import {
    LocalStoragePropertySnapshotWriter,
    buildPropertySnapshotPayload,
    propertySnapshotWriteGate,
    savePropertyZoneWithSnapshotWriter,
} from './propertySnapshotWriter.js';

function fakeStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        get: key => data.get(key) ?? null,
        set: (key, value) => data.set(key, value),
        remove: key => data.delete(key),
    };
}

function wallet(address = 'ckt1wallet') {
    return {
        status: 'connected',
        account: { provider: 'joyid', address, label: 'JoyID Dev' },
    };
}

describe('property snapshot writer', () => {
    it('builds a chain-shaped property snapshot payload', () => {
        const map = createStarterPropertyMap();
        const payload = buildPropertySnapshotPayload({
            ownerId: 'ckt1owner',
            tileMap: map,
            camera: { offsetX: 11, offsetY: 22, zoom: 1.5 },
            propertyTier: 3,
            savedAt: 123,
        });
        expect(payload.schema).toBe('cellshire.property.snapshot');
        expect(payload.version).toBe(1);
        expect(payload.ownerId).toBe('ckt1owner');
        expect(payload.propertyTier).toBe(3);
        expect(payload.tileMap.width).toBe(map.width);
        expect(payload.camera.zoom).toBe(1.5);
    });

    it('gates snapshot writes behind the connected owner wallet', () => {
        expect(propertySnapshotWriteGate(wallet('ckt1owner'), 'ckt1owner').ok).toBe(true);
        expect(propertySnapshotWriteGate(null, 'ckt1owner').reason).toBe('wallet-disconnected');
        expect(propertySnapshotWriteGate(wallet('ckt1other'), 'ckt1owner').reason).toBe('owner-mismatch');
        expect(propertySnapshotWriteGate(wallet('ckt1owner'), 'local').reason).toBe('local-owner');
    });

    it('writes wallet-owned snapshots into owner-keyed local fixture cells', () => {
        const storage = fakeStorage();
        const writer = new LocalStoragePropertySnapshotWriter({ storage, now: () => 123 });
        const snapshot = buildPropertySnapshotPayload({
            ownerId: 'ckt1owner',
            tileMap: createStarterPropertyMap(),
            propertyTier: 2,
            savedAt: 123,
        });
        const result = writer.write({ snapshot, walletState: wallet('ckt1owner') });
        expect(result.ok).toBe(true);
        expect(result.cell.blockNumber).toBe(1);
        const raw = JSON.parse(storage.get(propertySnapshotCellsStorageKeyForOwner('ckt1owner')));
        expect(raw.length).toBe(1);
        expect(raw[0].ownerId).toBe('ckt1owner');
        expect(raw[0].tileMap.objects.length > 0).toBe(true);

        writer.write({ snapshot, walletState: wallet('ckt1owner') });
        const updated = JSON.parse(storage.get(propertySnapshotCellsStorageKeyForOwner('ckt1owner')));
        expect(updated.length).toBe(1);
        expect(updated[0].blockNumber).toBe(2);
    });

    it('keeps the local property save when snapshot writing is not allowed', () => {
        const storage = fakeStorage();
        const writer = new LocalStoragePropertySnapshotWriter({ storage });
        const result = savePropertyZoneWithSnapshotWriter({
            storage,
            writer,
            walletState: { status: 'disconnected', account: null },
            ownerId: 'ckt1owner',
            tileMap: createStarterPropertyMap(),
            propertyTier: 2,
        });
        expect(result.ok).toBe(true);
        expect(result.localSaved).toBe(true);
        expect(result.snapshotWrite.reason).toBe('wallet-disconnected');
        expect(loadPropertyZone(storage, { ownerId: 'ckt1owner' }).propertyTier).toBe(2);
        expect(storage.get(propertySnapshotCellsStorageKeyForOwner('ckt1owner'))).toBeNull();
    });
});
