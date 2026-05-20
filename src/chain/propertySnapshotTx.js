import { localPropertySnapshotCell } from '../property/propertySnapshotAdapter.js';

export function buildPropertySnapshotTransaction({
    walletAccount,
    snapshot,
    txNonce = 'prototype',
    blockNumber = 0,
} = {}) {
    if (!walletAccount?.address) throw new Error('wallet account required');
    if (!snapshot?.ownerId || !snapshot?.tileMap) throw new Error('property snapshot required');
    if (snapshot.ownerId !== walletAccount.address) {
        throw new Error('property snapshot owner does not match wallet');
    }

    return {
        version: 1,
        kind: 'cellshire_property_snapshot_tx',
        network: walletAccount.network || 'testnet',
        tx_nonce: txNonce,
        action: 'publish_property_snapshot',
        inputs: {
            funding_lock: walletAccount.address,
        },
        outputs: {
            property_snapshot_cell: localPropertySnapshotCell(snapshot, {
                ownerId: snapshot.ownerId,
                blockNumber,
            }),
            change_lock: walletAccount.address,
        },
        witness: {
            provider: walletAccount.provider,
            address: walletAccount.address,
            signature: 'pending',
        },
    };
}
