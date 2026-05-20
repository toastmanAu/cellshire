import { savePropertyZone } from './propertyStore.js';
import { normalizePropertyTier } from './propertyExpansion.js';
import { buildPropertySnapshotTransaction } from '../chain/propertySnapshotTx.js';
import { createCccJoyIdPropertySnapshotSubmitter } from '../chain/cccJoyId.js';
import {
    PROPERTY_SNAPSHOT_CELL_SCHEMA,
    PROPERTY_SNAPSHOT_CELL_VERSION,
    localPropertySnapshotCell,
    propertySnapshotCellsStorageKeyForOwner,
} from './propertySnapshotAdapter.js';

export function propertySnapshotWriteGate(walletState, ownerId = 'local') {
    if (!ownerId || ownerId === 'local') return { ok: false, reason: 'local-owner' };
    if (walletState?.status !== 'connected' || !walletState.account?.address) {
        return { ok: false, reason: 'wallet-disconnected' };
    }
    if (walletState.account.address !== ownerId) return { ok: false, reason: 'owner-mismatch' };
    return { ok: true, ownerId };
}

export function buildPropertySnapshotPayload({
    ownerId = 'local',
    tileMap,
    camera = null,
    propertyTier = 1,
    savedAt = Date.now(),
} = {}) {
    return {
        schema: PROPERTY_SNAPSHOT_CELL_SCHEMA,
        version: PROPERTY_SNAPSHOT_CELL_VERSION,
        ownerId: ownerId || 'local',
        savedAt,
        propertyTier: normalizePropertyTier(propertyTier),
        tileMap: typeof tileMap?.serialize === 'function' ? tileMap.serialize() : tileMap,
        camera: camera ? {
            offsetX: camera.offsetX,
            offsetY: camera.offsetY,
            zoom: camera.zoom,
        } : null,
    };
}

export class LocalStoragePropertySnapshotWriter {
    constructor({ storage, now = Date.now } = {}) {
        this.storage = storage;
        this.now = now;
    }

    async write({ snapshot, walletState, blockNumber = null } = {}) {
        const gate = propertySnapshotWriteGate(walletState, snapshot?.ownerId);
        if (!gate.ok) return gate;
        const existing = this._readCells(snapshot.ownerId);
        const nextBlock = blockNumber ?? nextBlockNumber(existing);
        const cell = localPropertySnapshotCell(snapshot, {
            ownerId: snapshot.ownerId,
            blockNumber: nextBlock,
            savedAt: snapshot.savedAt ?? this.now(),
        });
        try {
            this.storage?.set?.(
                propertySnapshotCellsStorageKeyForOwner(snapshot.ownerId),
                JSON.stringify([cell]),
            );
            return { ok: true, source: 'local-fixture', ownerId: snapshot.ownerId, cell };
        } catch {
            return { ok: false, reason: 'write-failed' };
        }
    }

    _readCells(ownerId) {
        const raw = this.storage?.get?.(propertySnapshotCellsStorageKeyForOwner(ownerId));
        if (!raw) return [];
        try {
            const cells = JSON.parse(raw);
            return Array.isArray(cells) ? cells : [];
        } catch {
            return [];
        }
    }
}

export class PropertySnapshotSubmitAdapter {
    constructor({
        submit,
        shouldFail = false,
    } = {}) {
        this.submit = submit ?? defaultSubmitPrototypePropertySnapshotTx;
        this.shouldFail = shouldFail;
    }

    async write({ snapshot, walletState } = {}) {
        const gate = propertySnapshotWriteGate(walletState, snapshot?.ownerId);
        if (!gate.ok) return gate;
        const tx = buildPropertySnapshotTransaction({
            walletAccount: walletState.account,
            snapshot,
            txNonce: `${Date.now()}`,
        });
        const receipt = await this.submit(tx, { shouldFail: this.shouldFail });
        if (!receipt.ok) {
            return {
                ok: false,
                reason: receipt.reason || 'tx-failed',
                message: receipt.message || 'Property snapshot transaction failed',
                tx,
            };
        }
        return {
            ok: true,
            source: receipt.mode || 'submit',
            ownerId: snapshot.ownerId,
            tx,
            txHash: receipt.txHash,
        };
    }
}

export async function defaultSubmitPrototypePropertySnapshotTx(tx, { shouldFail = false } = {}) {
    await new Promise(r => setTimeout(r, 250));
    if (shouldFail) {
        return {
            ok: false,
            reason: 'signature-cancelled',
            message: 'JoyID signature cancelled',
        };
    }
    const id = btoa(`${tx.outputs.property_snapshot_cell.ownerId}:${tx.tx_nonce}`).replace(/=+$/, '');
    return {
        ok: true,
        mode: 'prototype',
        txHash: `0xpropsnap${id.slice(0, 24).padEnd(24, '0')}`,
    };
}

export async function savePropertyZoneWithSnapshotWriter({
    storage,
    writer,
    walletState,
    tileMap,
    camera = null,
    propertyTier = 1,
    ownerId = 'local',
    savedAt = Date.now(),
} = {}) {
    const localSaved = savePropertyZone(storage, tileMap, camera, {
        propertyTier,
        ownerId,
    });
    if (!localSaved) {
        return {
            ok: false,
            localSaved: false,
            snapshotWrite: { ok: false, reason: 'local-save-failed' },
        };
    }
    const snapshot = buildPropertySnapshotPayload({
        ownerId,
        tileMap,
        camera,
        propertyTier,
        savedAt,
    });
    return {
        ok: true,
        localSaved: true,
        snapshotWrite: writer?.write
            ? await writer.write({ snapshot, walletState })
            : { ok: false, reason: 'writer-unavailable' },
    };
}

export function formatPropertySnapshotSaveStatus(result, { compact = false } = {}) {
    if (!result?.localSaved) return compact ? 'save failed' : 'Property save failed';
    const write = result.snapshotWrite ?? {};
    if (write.ok) {
        if (write.source === 'local-fixture') {
            return compact ? 'snapshot ready' : 'Saved local + visit snapshot';
        }
        if (write.source === 'ccc-joyid' || write.txHash) {
            return compact ? 'snapshot published' : 'Saved local + published snapshot';
        }
        return compact ? 'snapshot submitted' : 'Saved local + submitted snapshot';
    }

    if (write.reason === 'local-owner') {
        return compact ? 'local saved' : 'Saved local property';
    }
    if (write.reason === 'wallet-disconnected') {
        return compact ? 'wallet needed' : 'Saved local; connect JoyID to publish';
    }
    if (write.reason === 'owner-mismatch') {
        return compact ? 'owner mismatch' : 'Saved local; wallet owner mismatch';
    }
    if (write.reason === 'signature-cancelled') {
        return compact ? 'publish cancelled' : 'Saved local; publish cancelled';
    }
    if (write.reason === 'insufficient-capacity') {
        return compact ? 'needs CKB' : 'Saved local; not enough CKB to publish';
    }
    if (write.reason === 'write-failed') {
        return compact ? 'snapshot failed' : 'Saved local; snapshot write failed';
    }
    if (write.reason === 'writer-unavailable') {
        return compact ? 'local only' : 'Saved local; snapshot writer unavailable';
    }
    return compact ? 'snapshot pending' : (write.message || 'Saved local; snapshot not published');
}

export function propertySnapshotSubmitMode(params) {
    const mode = params?.get?.('propertySnapshotSubmit') || params?.get?.('propertySnapshotMode');
    return params?.get?.('propertySnapshotReal') === '1'
        || mode === 'ccc'
        || mode === 'joyid'
        || mode === 'ccc-joyid'
        ? 'ccc-joyid'
        : 'local-fixture';
}

export function makePropertySnapshotWriterFromParams({ params, storage, location, importModule } = {}) {
    if (propertySnapshotSubmitMode(params) !== 'ccc-joyid') {
        return new LocalStoragePropertySnapshotWriter({ storage });
    }
    return new PropertySnapshotSubmitAdapter({
        submit: createCccJoyIdPropertySnapshotSubmitter({ params, location, importModule }),
        shouldFail: params?.get?.('propertySnapshotFail') === '1',
    });
}

function nextBlockNumber(cells) {
    return cells.reduce((max, cell) => Math.max(max, Number(cell?.blockNumber) || 0), 0) + 1;
}
