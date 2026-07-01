import { registerOpenAssetCell } from '../assets/openAssetStandard.js';
import { buildMarketplacePurchaseTransaction } from '../chain/marketplacePurchaseTx.js';
import { createCccJoyIdMarketplacePurchaseSubmitter } from '../chain/cccJoyId.js';
import {
    closeMarketplaceListing,
    buyMarketplaceListing,
    grantMarketplaceListing,
    marketplaceListings,
} from './playerMarketplace.js';

export class LocalMarketplaceAdapter {
    async buy({ listingId, buyer, inventory, propInventory, state }) {
        return buyMarketplaceListing({ listingId, buyer, inventory, propInventory, state });
    }
}

export function chainMarketplaceEnabled(params) {
    return params?.get?.('chainMarketplace') === '1';
}

export function chainMarketplaceSubmitMode(params) {
    const mode = params?.get?.('chainMarketplaceSubmit') || params?.get?.('chainMarketplaceMode');
    return mode === 'ccc' || mode === 'joyid' || mode === 'ccc-joyid'
        ? 'ccc-joyid'
        : 'prototype';
}

export class ChainMarketplaceAdapter {
    constructor({
        owner = 'local',
        inventoryAdapter = null,
        submit = defaultSubmitPrototypeMarketplacePurchase,
        requireWallet = false,
    } = {}) {
        this.owner = owner;
        this.inventoryAdapter = inventoryAdapter;
        this.submit = submit;
        this.requireWallet = requireWallet;
    }

    async buy({ listingId, buyer, propInventory, state }) {
        if (!buyer?.address) return { ok: false, reason: 'wallet-disconnected' };
        if (this.requireWallet && buyer.signer !== 'ccc-joyid') {
            return {
                ok: false,
                reason: 'wallet-disconnected',
                message: 'Connect JoyID before chain Marketplace purchases',
            };
        }
        const listing = marketplaceListings(state).find(item => item.id === listingId);
        if (!listing) return { ok: false, reason: 'missing-listing' };
        if (listing.seller === buyer.address) return { ok: false, reason: 'own-listing', listing };
        const snapshot = await this.inventoryAdapter?.read?.();
        const balance = snapshot?.currencies?.get?.(listing.price.currency) ?? 0;
        if (balance < listing.price.amount) {
            return { ok: false, reason: 'insufficient-funds', listing, balance };
        }

        const tx = buildMarketplacePurchaseTransaction({
            walletAccount: {
                provider: buyer.provider || 'joyid',
                address: buyer.address || this.owner,
                network: buyer.network || 'testnet',
            },
            listing,
            txNonce: `${Date.now()}`,
        });
        const receipt = await this.submit(tx);
        if (!receipt.ok) {
            return {
                ok: false,
                mode: 'chain',
                reason: receipt.reason || 'tx-failed',
                message: receipt.message || 'Marketplace purchase transaction failed',
                listing,
                tx,
            };
        }
        const settlement = receipt.mode === 'ccc-joyid'
            ? await this.inventoryAdapter?.readMarketplacePurchaseSettlement?.(tx, receipt)
            : this.inventoryAdapter?.settleMarketplacePurchaseTx?.(tx, receipt);
        if (settlement && !settlement.ok) {
            return {
                ok: false,
                mode: 'chain',
                reason: settlement.reason || 'settlement-failed',
                message: 'Marketplace purchase settlement failed',
                listing,
                tx,
                settlement,
            };
        }
        this.inventoryAdapter?.addPendingDelta?.({
            currency: listing.price.currency,
            amount: -listing.price.amount,
            txHash: receipt.txHash,
            source: 'marketplace',
        });
        const grant = settlement?.outputs?.open_asset_cell
            ? grantSettledOpenAssetListing({ listing, settlement, propInventory, state })
            : grantMarketplaceListing({ listing, propInventory, state });
        if (!grant.ok) return grant;
        return {
            ok: true,
            mode: receipt.mode === 'ccc-joyid'
                ? settlement?.ok ? 'chain-ccc-readback' : 'chain-ccc-receipt'
                : settlement?.ok ? 'chain-fixture-settled' : 'chain-prototype',
            listing,
            tx,
            txHash: receipt.txHash,
            settlement,
        };
    }
}

function grantSettledOpenAssetListing({ listing, settlement, propInventory, state } = {}) {
    const registered = registerOpenAssetCell(settlement?.outputs?.open_asset_cell);
    if (!registered.ok) {
        return {
            ok: false,
            reason: registered.reason || 'open-asset-registration-failed',
            message: 'Marketplace Open Asset transfer registration failed',
            listing,
            settlement,
        };
    }
    propInventory?.add?.(registered.definition.id, 1);
    return closeMarketplaceListing({ listing, state });
}

export async function defaultSubmitPrototypeMarketplacePurchase(tx) {
    await new Promise(r => setTimeout(r, 180));
    const id = btoa(`${tx.witness?.marketplace_purchase?.listing_id}:${tx.tx_nonce}`)
        .replace(/=+$/, '');
    return {
        ok: true,
        mode: 'prototype',
        txHash: `0xmarket${id.slice(0, 24).padEnd(24, '0')}`,
    };
}

export function makeMarketplaceAdapterFromParams({ params, owner, inventoryAdapter, location, importModule } = {}) {
    if (!chainMarketplaceEnabled(params)) return new LocalMarketplaceAdapter();
    if (chainMarketplaceSubmitMode(params) === 'ccc-joyid') {
        return new ChainMarketplaceAdapter({
            owner,
            inventoryAdapter,
            requireWallet: true,
            submit: createCccJoyIdMarketplacePurchaseSubmitter({ params, location, importModule }),
        });
    }
    return new ChainMarketplaceAdapter({ owner, inventoryAdapter });
}
