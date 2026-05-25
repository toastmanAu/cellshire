import { buildMarketplacePurchaseTransaction } from '../chain/marketplacePurchaseTx.js';
import {
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

export class ChainMarketplaceAdapter {
    constructor({
        owner = 'local',
        inventoryAdapter = null,
        submit = defaultSubmitPrototypeMarketplacePurchase,
    } = {}) {
        this.owner = owner;
        this.inventoryAdapter = inventoryAdapter;
        this.submit = submit;
    }

    async buy({ listingId, buyer, propInventory, state }) {
        if (!buyer?.address) return { ok: false, reason: 'wallet-disconnected' };
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
        const settlement = this.inventoryAdapter?.settleMarketplacePurchaseTx?.(tx, receipt);
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
        const grant = grantMarketplaceListing({ listing, propInventory, state });
        if (!grant.ok) return grant;
        return {
            ok: true,
            mode: settlement?.ok ? 'chain-fixture-settled' : 'chain-prototype',
            listing,
            tx,
            txHash: receipt.txHash,
            settlement,
        };
    }
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

export function makeMarketplaceAdapterFromParams({ params, owner, inventoryAdapter } = {}) {
    if (!chainMarketplaceEnabled(params)) return new LocalMarketplaceAdapter();
    return new ChainMarketplaceAdapter({ owner, inventoryAdapter });
}
