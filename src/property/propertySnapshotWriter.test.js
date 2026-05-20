import { describe, it, expect } from '../test/harness.js';
import { createStarterPropertyMap } from './propertyZone.js';
import { loadPropertyZone } from './propertyStore.js';
import { propertySnapshotCellsStorageKeyForOwner } from './propertySnapshotAdapter.js';
import {
    LocalStoragePropertySnapshotWriter,
    PropertySnapshotSubmitAdapter,
    buildPropertySnapshotPayload,
    makePropertySnapshotWriterFromParams,
    propertySnapshotWriteGate,
    propertySnapshotSubmitMode,
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

    it('writes wallet-owned snapshots into owner-keyed local fixture cells', async () => {
        const storage = fakeStorage();
        const writer = new LocalStoragePropertySnapshotWriter({ storage, now: () => 123 });
        const snapshot = buildPropertySnapshotPayload({
            ownerId: 'ckt1owner',
            tileMap: createStarterPropertyMap(),
            propertyTier: 2,
            savedAt: 123,
        });
        const result = await writer.write({ snapshot, walletState: wallet('ckt1owner') });
        expect(result.ok).toBe(true);
        expect(result.cell.blockNumber).toBe(1);
        const raw = JSON.parse(storage.get(propertySnapshotCellsStorageKeyForOwner('ckt1owner')));
        expect(raw.length).toBe(1);
        expect(raw[0].ownerId).toBe('ckt1owner');
        expect(raw[0].tileMap.objects.length > 0).toBe(true);

        await writer.write({ snapshot, walletState: wallet('ckt1owner') });
        const updated = JSON.parse(storage.get(propertySnapshotCellsStorageKeyForOwner('ckt1owner')));
        expect(updated.length).toBe(1);
        expect(updated[0].blockNumber).toBe(2);
    });

    it('submits wallet-owned snapshots through the configured submit adapter', async () => {
        let submitted = null;
        const writer = new PropertySnapshotSubmitAdapter({
            submit: async (tx) => {
                submitted = tx;
                return { ok: true, mode: 'ccc-joyid', txHash: '0xabc' };
            },
        });
        const snapshot = buildPropertySnapshotPayload({
            ownerId: 'ckt1owner',
            tileMap: createStarterPropertyMap(),
        });
        const result = await writer.write({ snapshot, walletState: wallet('ckt1owner') });
        expect(result.ok).toBe(true);
        expect(result.txHash).toBe('0xabc');
        expect(submitted.outputs.property_snapshot_cell.ownerId).toBe('ckt1owner');
    });

    it('surfaces submit failures without failing the local save', async () => {
        const storage = fakeStorage();
        const writer = new PropertySnapshotSubmitAdapter({
            submit: async () => ({ ok: false, reason: 'insufficient-capacity', message: 'not enough CKB' }),
        });
        const result = await savePropertyZoneWithSnapshotWriter({
            storage,
            writer,
            walletState: wallet('ckt1owner'),
            ownerId: 'ckt1owner',
            tileMap: createStarterPropertyMap(),
            propertyTier: 2,
        });
        expect(result.ok).toBe(true);
        expect(result.localSaved).toBe(true);
        expect(result.snapshotWrite.reason).toBe('insufficient-capacity');
        expect(loadPropertyZone(storage, { ownerId: 'ckt1owner' }).propertyTier).toBe(2);
    });

    it('keeps the local property save when snapshot writing is not allowed', async () => {
        const storage = fakeStorage();
        const writer = new LocalStoragePropertySnapshotWriter({ storage });
        const result = await savePropertyZoneWithSnapshotWriter({
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

    it('selects CCC submit mode only when explicitly requested', () => {
        expect(propertySnapshotSubmitMode(new URLSearchParams(''))).toBe('local-fixture');
        expect(propertySnapshotSubmitMode(new URLSearchParams('propertySnapshotSubmit=ccc'))).toBe('ccc-joyid');
        expect(makePropertySnapshotWriterFromParams({
            params: new URLSearchParams(''),
            storage: fakeStorage(),
        }).constructor.name).toBe('LocalStoragePropertySnapshotWriter');
        expect(makePropertySnapshotWriterFromParams({
            params: new URLSearchParams('propertySnapshotSubmit=ccc'),
            storage: fakeStorage(),
        }).constructor.name).toBe('PropertySnapshotSubmitAdapter');
    });
});
