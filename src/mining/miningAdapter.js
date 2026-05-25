import { buildMiningTransaction, buildOreCell } from '../chain/miningTx.js';
import {
    buildOreBirthTransaction,
    buildOreDecrementTransaction,
} from '../chain/miningTx.birth.js';
import { createOreIndexerFromParams, LocalOreIndexer } from '../chain/oreIndexer.js';
import {
    cccJoyIdMiningEnabled,
    createCccJoyIdMiningSubmitter,
} from '../chain/cccJoyId.js';
import { loadWalletIdentity } from '../wallet/walletIdentity.js';

export function chainMiningEnabled(params) {
    return params?.get?.('chainMining') === '1';
}

export function chainMiningOreTypes(params) {
    const raw = params?.get?.('chainMiningOre');
    if (!raw) return ['coal_seam'];
    return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export function chainMiningSubmitMode(params) {
    return cccJoyIdMiningEnabled(params) ? 'ccc-joyid' : 'prototype';
}

export function chainMiningBirthMode(params) {
    return params?.get?.('chainMiningBirth') === 'lazy' ? 'lazy' : 'legacy';
}

export class LocalMiningAdapter {
    canHandle() { return false; }

    async mine() {
        return { ok: true, mode: 'local' };
    }
}

export class ChainMiningAdapter {
    constructor({
        storage,
        supportedOreTypes = ['coal_seam'],
        submit = defaultSubmitPrototypeTx,
        loadWallet = loadWalletIdentity,
        shouldFail = false,
        lazyBirth = false,
        oreIndexer = null,
    }) {
        this.storage = storage;
        this.supportedOreTypes = new Set(supportedOreTypes);
        this.submit = submit;
        this.loadWallet = loadWallet;
        this.shouldFail = shouldFail;
        this.lazyBirth = lazyBirth;
        this.oreIndexer = oreIndexer;
    }

    canHandle(obj) {
        return this.supportedOreTypes.has(obj?.assetId);
    }

    async mine({ game, epoch, obj, state, result }) {
        if (!this.canHandle(obj)) {
            return { ok: true, mode: 'local-pass-through' };
        }

        const wallet = this.loadWallet(this.storage);
        if (wallet.status !== 'connected' || !wallet.account) {
            return {
                ok: false,
                reason: 'wallet-disconnected',
                message: 'Connect JoyID before chain mining',
            };
        }

        const beforeState = {
            ...state,
            capacityRemaining: state.capacityRemaining + 1,
        };
        const oreCell = buildOreCell({
            epoch,
            mapId: game?.currentMapId,
            obj,
            state: beforeState,
        });
        const tx = this.lazyBirth
            ? await this._buildLazyMiningTx({ walletAccount: wallet.account, oreCell, result })
            : buildMiningTransaction({
                walletAccount: wallet.account,
                oreCell,
                result,
                txNonce: `${Date.now()}`,
            });
        if (!tx.ok && tx.reason) return tx;
        const receipt = await this.submit(tx, { shouldFail: this.shouldFail });
        if (!receipt.ok) {
            return {
                ok: false,
                reason: receipt.reason || 'tx-failed',
                message: receipt.message || 'Mining transaction failed',
                tx,
            };
        }
        this.oreIndexer?.recordMiningTx?.(tx);
        return {
            ok: true,
            mode: this.lazyBirth ? `chain-lazy-${tx.action}` : 'chain',
            tx,
            txHash: receipt.txHash,
        };
    }

    async _buildLazyMiningTx({ walletAccount, oreCell, result }) {
        const indexer = this.oreIndexer ?? new LocalOreIndexer();
        const indexed = await indexer.getOreCell(oreCell.ore_id);
        if (indexed.status === 'depleted' || indexed.status === 'orphaned') {
            return {
                ok: false,
                reason: indexed.status,
                message: indexed.status === 'depleted' ? 'Ore cell already depleted' : 'Ore cell is orphaned',
            };
        }
        if (indexed.status === 'stale') {
            return {
                ok: false,
                reason: 'indexer-stale',
                message: 'Mining indexer is not ready',
            };
        }
        const txNonce = `${Date.now()}`;
        if (indexed.status === 'untouched') {
            return buildOreBirthTransaction({
                walletAccount,
                oreCell,
                result,
                txNonce,
            });
        }
        return buildOreDecrementTransaction({
            walletAccount,
            oreCell: indexed.liveCell,
            result,
            txNonce,
        });
    }
}

export async function defaultSubmitPrototypeTx(tx, { shouldFail = false } = {}) {
    await new Promise(r => setTimeout(r, 250));
    if (shouldFail) {
        return {
            ok: false,
            reason: 'signature-cancelled',
            message: 'JoyID signature cancelled',
        };
    }
    const oreId = tx.inputs?.ore_cell?.ore_id
        ?? tx.outputs?.ore_cell?.ore_id
        ?? tx.witness?.mining_receipt?.ore_id
        ?? 'unknown';
    const id = btoa(`${oreId}:${tx.tx_nonce}`).replace(/=+$/, '');
    return {
        ok: true,
        txHash: `0xprototype${id.slice(0, 24).padEnd(24, '0')}`,
    };
}

export function makeMiningAdapterFromParams({ params, storage, location, importModule, fetchImpl }) {
    if (!chainMiningEnabled(params)) return new LocalMiningAdapter();
    const submit = cccJoyIdMiningEnabled(params)
        ? createCccJoyIdMiningSubmitter({ params, location, importModule })
        : defaultSubmitPrototypeTx;
    const lazyBirth = chainMiningBirthMode(params) === 'lazy';
    return new ChainMiningAdapter({
        storage,
        supportedOreTypes: chainMiningOreTypes(params),
        submit,
        shouldFail: params.get('chainMiningFail') === '1',
        lazyBirth,
        oreIndexer: lazyBirth ? createOreIndexerFromParams({ params, fetchImpl }) : null,
    });
}
