import { buildStorePurchaseTransaction } from '../chain/storePurchaseTx.js';
import { createCccJoyIdStorePurchaseSubmitter } from '../chain/cccJoyId.js';
import { registerOpenAssetCell } from '../assets/openAssetStandard.js';
import { loadWalletIdentity } from '../wallet/walletIdentity.js';
import {
    buyStoreItem,
    canBuyStoreItem,
    generalStoreItem,
} from './generalStoreCatalog.js';

export class LocalGeneralStoreAdapter {
    async buy({ assetId, inventory, propInventory, propertyTier }) {
        return buyStoreItem({ assetId, inventory, propInventory, propertyTier });
    }
}

export function chainStoreEnabled(params) {
    return params?.get?.('chainStore') === '1';
}

export function chainStoreSubmitMode(params) {
    const mode = params?.get?.('chainStoreSubmit') || params?.get?.('chainStoreMode');
    return mode === 'ccc' || mode === 'joyid' || mode === 'ccc-joyid'
        ? 'ccc-joyid'
        : 'prototype';
}

export class ChainGeneralStoreAdapter {
    constructor({
        storage,
        owner = 'local',
        inventoryAdapter = null,
        submit = defaultSubmitPrototypeStorePurchase,
        loadWallet = loadWalletIdentity,
        requireWallet = false,
    } = {}) {
        this.storage = storage;
        this.owner = owner;
        this.inventoryAdapter = inventoryAdapter;
        this.submit = submit;
        this.loadWallet = loadWallet;
        this.requireWallet = requireWallet;
    }

    async buy({ assetId, propInventory, propertyTier }) {
        const item = generalStoreItem(assetId);
        const snapshot = await this.inventoryAdapter?.read?.();
        const check = canBuyStoreItem({
            item,
            propertyTier,
            inventory: snapshot?.currencies,
        });
        if (!check.ok) return { ...check, item };

        const wallet = this.loadWallet(this.storage);
        if (this.requireWallet && (wallet.status !== 'connected' || !wallet.account)) {
            return {
                ok: false,
                reason: 'wallet-disconnected',
                message: 'Connect JoyID before chain Store purchases',
                item,
            };
        }
        const walletAccount = wallet.status === 'connected' && wallet.account
            ? wallet.account
            : { provider: 'prototype', address: this.owner || 'local', network: 'testnet' };
        const tx = buildStorePurchaseTransaction({
            walletAccount,
            item,
            txNonce: `${Date.now()}`,
        });
        const receipt = await this.submit(tx);
        if (!receipt.ok) {
            return {
                ok: false,
                mode: 'chain',
                reason: receipt.reason || 'tx-failed',
                message: receipt.message || 'Store purchase transaction failed',
                tx,
                item,
            };
        }

        const settlement = receipt.mode === 'ccc-joyid'
            ? null
            : this.inventoryAdapter?.settleStorePurchaseTx?.(tx, receipt);
        if (settlement && !settlement.ok) {
            return {
                ok: false,
                mode: 'chain',
                reason: settlement.reason || 'settlement-failed',
                message: 'Store purchase settlement failed',
                tx,
                settlement,
                item,
            };
        }

        const openAssetGrant = grantPurchasedOpenAsset({
            tx,
            settlement,
            propInventory,
        });
        if (!openAssetGrant.ok) {
            return {
                ok: false,
                mode: 'chain',
                reason: openAssetGrant.reason,
                message: openAssetGrant.message,
                tx,
                settlement,
                item,
            };
        }

        this.inventoryAdapter?.addPendingDelta?.({
            currency: item.price.currency,
            amount: -item.price.amount,
            txHash: receipt.txHash,
            source: 'store',
        });
        return {
            ok: true,
            mode: receipt.mode === 'ccc-joyid'
                ? 'chain-ccc-receipt'
                : settlement?.ok ? 'chain-fixture-settled' : 'chain-prototype',
            tx,
            txHash: receipt.txHash,
            settlement,
            item,
            assetId: openAssetGrant.assetId,
            sourceAssetId: item.assetId,
            openAssetCell: openAssetGrant.cell,
            count: propInventory?.get?.(openAssetGrant.assetId) ?? 0,
        };
    }
}

function grantPurchasedOpenAsset({ tx, settlement, propInventory } = {}) {
    const cell = settlement?.outputs?.open_asset_cell
        ?? tx?.outputs?.open_asset_mint?.cell
        ?? null;
    if (!cell) {
        return {
            ok: false,
            reason: 'missing-open-asset-mint',
            message: 'Store purchase did not include an Open Asset mint intent',
        };
    }
    const registered = registerOpenAssetCell(cell);
    if (!registered.ok) {
        return {
            ok: false,
            reason: registered.reason || 'open-asset-registration-failed',
            message: 'Store Open Asset registration failed',
        };
    }
    const assetId = registered.definition.id;
    propInventory?.add?.(assetId, 1);
    return {
        ok: true,
        assetId,
        cell,
    };
}

export async function defaultSubmitPrototypeStorePurchase(tx) {
    await new Promise(r => setTimeout(r, 160));
    const id = btoa(`${tx.witness?.store_purchase?.asset_id}:${tx.tx_nonce}`)
        .replace(/=+$/, '');
    return {
        ok: true,
        mode: 'prototype',
        txHash: `0xstore${id.slice(0, 24).padEnd(24, '0')}`,
    };
}

export function makeGeneralStoreAdapterFromParams({ params, storage, owner, inventoryAdapter, location, importModule } = {}) {
    if (!chainStoreEnabled(params)) return new LocalGeneralStoreAdapter();
    if (chainStoreSubmitMode(params) === 'ccc-joyid') {
        return new ChainGeneralStoreAdapter({
            storage,
            owner,
            inventoryAdapter,
            requireWallet: true,
            submit: createCccJoyIdStorePurchaseSubmitter({ params, location, importModule }),
        });
    }
    return new ChainGeneralStoreAdapter({ storage, owner, inventoryAdapter });
}
