import { buildMiningTransaction, buildOreCell } from '../chain/miningTx.js';
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
    }) {
        this.storage = storage;
        this.supportedOreTypes = new Set(supportedOreTypes);
        this.submit = submit;
        this.loadWallet = loadWallet;
        this.shouldFail = shouldFail;
    }

    canHandle(obj) {
        return this.supportedOreTypes.has(obj?.assetId);
    }

    async mine({ epoch, obj, state, result }) {
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

        const oreCell = buildOreCell({
            epoch,
            obj,
            state: {
                ...state,
                capacityRemaining: state.capacityRemaining + 1,
            },
        });
        const tx = buildMiningTransaction({
            walletAccount: wallet.account,
            oreCell,
            result,
            txNonce: `${Date.now()}`,
        });
        const receipt = await this.submit(tx, { shouldFail: this.shouldFail });
        if (!receipt.ok) {
            return {
                ok: false,
                reason: receipt.reason || 'tx-failed',
                message: receipt.message || 'Mining transaction failed',
                tx,
            };
        }
        return {
            ok: true,
            mode: 'chain',
            tx,
            txHash: receipt.txHash,
        };
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
    const id = btoa(`${tx.inputs.ore_cell.ore_id}:${tx.tx_nonce}`).replace(/=+$/, '');
    return {
        ok: true,
        txHash: `0xprototype${id.slice(0, 24).padEnd(24, '0')}`,
    };
}

export function makeMiningAdapterFromParams({ params, storage, location, importModule }) {
    if (!chainMiningEnabled(params)) return new LocalMiningAdapter();
    const submit = cccJoyIdMiningEnabled(params)
        ? createCccJoyIdMiningSubmitter({ params, location, importModule })
        : defaultSubmitPrototypeTx;
    return new ChainMiningAdapter({
        storage,
        supportedOreTypes: chainMiningOreTypes(params),
        submit,
        shouldFail: params.get('chainMiningFail') === '1',
    });
}
