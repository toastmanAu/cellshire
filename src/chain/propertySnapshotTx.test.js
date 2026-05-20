import { describe, it, expect } from '../test/harness.js';
import { createStarterPropertyMap } from '../property/propertyZone.js';
import { buildPropertySnapshotPayload } from '../property/propertySnapshotWriter.js';
import { buildPropertySnapshotTransaction } from './propertySnapshotTx.js';

const walletAccount = {
    provider: 'joyid',
    address: 'ckt1owner',
    network: 'testnet',
};

describe('buildPropertySnapshotTransaction', () => {
    it('builds a transaction request for a wallet-owned property snapshot cell', () => {
        const snapshot = buildPropertySnapshotPayload({
            ownerId: 'ckt1owner',
            tileMap: createStarterPropertyMap(),
            camera: { offsetX: 1, offsetY: 2, zoom: 1.25 },
            propertyTier: 2,
            savedAt: 123,
        });
        const tx = buildPropertySnapshotTransaction({
            walletAccount,
            snapshot,
            txNonce: 'test',
            blockNumber: 9,
        });
        expect(tx.kind).toBe('cellshire_property_snapshot_tx');
        expect(tx.action).toBe('publish_property_snapshot');
        expect(tx.outputs.property_snapshot_cell.ownerId).toBe('ckt1owner');
        expect(tx.outputs.property_snapshot_cell.blockNumber).toBe(9);
        expect(tx.outputs.property_snapshot_cell.propertyTier).toBe(2);
        expect(tx.outputs.change_lock).toBe('ckt1owner');
        expect(tx.witness.signature).toBe('pending');
    });

    it('rejects snapshots for a different owner', () => {
        let threw = false;
        try {
            buildPropertySnapshotTransaction({
                walletAccount,
                snapshot: buildPropertySnapshotPayload({
                    ownerId: 'ckt1other',
                    tileMap: createStarterPropertyMap(),
                }),
            });
        } catch {
            threw = true;
        }
        expect(threw).toBe(true);
    });
});
