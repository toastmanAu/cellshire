import { assetDefinitionFor } from '../assets/assetRegistry.js';
import { amountToBaseUnits, baseUnitsToAmount } from './udtBalance.js';

export function buildMarketplacePurchaseTransaction({
    walletAccount,
    listing,
    txNonce = 'marketplace-purchase',
}) {
    if (!walletAccount?.address) throw new Error('wallet account required');
    if (!listing?.id || !listing?.assetId || !listing?.price?.currency || !Number.isFinite(Number(listing.price.amount))) {
        throw new Error('marketplace listing required');
    }
    const openAsset = listing.itemType === 'prop'
        ? assetDefinitionFor(listing.assetId)?.openAsset
        : null;
    const openAssetTransfer = openAsset ? {
        schema: 'cellshire.marketplace.open_asset_transfer',
        cell_id: openAsset.cellId,
        asset_id: listing.assetId,
        from: listing.seller,
        to: walletAccount.address,
    } : null;
    return {
        version: 1,
        kind: 'cellshire_marketplace_purchase_tx',
        network: walletAccount.network || 'testnet',
        tx_nonce: txNonce,
        action: 'purchase',
        inputs: {
            payment_balance_cell: {
                owner: walletAccount.address,
                currency: listing.price.currency,
                amount: listing.price.amount,
            },
            listing_cell: {
                listing_id: listing.id,
                cell_id: listing.cellId,
                seller: listing.seller,
                item_type: listing.itemType,
                asset_id: listing.assetId,
            },
        },
        outputs: {
            buyer_receipt: {
                owner: walletAccount.address,
                item_type: listing.itemType,
                asset_id: listing.assetId,
                quantity: 1,
            },
            seller_receipt: {
                owner: listing.seller,
                currency: listing.price.currency,
                amount: listing.price.amount,
            },
            open_asset_transfer: openAssetTransfer,
        },
        witness: {
            provider: walletAccount.provider || 'prototype',
            address: walletAccount.address,
            signature: 'pending',
            marketplace_purchase: {
                listing_id: listing.id,
                cell_id: listing.cellId,
                seller: listing.seller,
                item_type: listing.itemType,
                asset_id: listing.assetId,
                open_asset_cell_id: openAssetTransfer?.cell_id ?? null,
                price_currency: listing.price.currency,
                price_amount: listing.price.amount,
                tx_nonce: txNonce,
            },
        },
    };
}

export function settleMarketplacePurchaseFixture({
    tx,
    indexedBalances = {},
    txHash = null,
} = {}) {
    if (tx?.kind !== 'cellshire_marketplace_purchase_tx') {
        return { ok: false, reason: 'invalid-marketplace-tx' };
    }
    const purchase = tx.witness?.marketplace_purchase;
    const owner = tx.witness?.address ?? tx.inputs?.payment_balance_cell?.owner ?? null;
    const currency = purchase?.price_currency;
    const assetId = purchase?.asset_id;
    if (!owner || !currency || !assetId) return { ok: false, reason: 'invalid-marketplace-purchase' };
    const openAssetTransfer = tx.outputs?.open_asset_transfer ?? null;
    if (openAssetTransfer) {
        if (openAssetTransfer.cell_id !== purchase.open_asset_cell_id) {
            return { ok: false, reason: 'invalid-open-asset-transfer' };
        }
        if (openAssetTransfer.asset_id !== assetId || openAssetTransfer.from !== purchase.seller || openAssetTransfer.to !== owner) {
            return { ok: false, reason: 'invalid-open-asset-transfer' };
        }
        if (tx.inputs?.listing_cell?.cell_id !== openAssetTransfer.cell_id) {
            return { ok: false, reason: 'invalid-open-asset-listing-cell' };
        }
    }

    const before = normalizedBalanceAmount(indexedBalances[currency]);
    const beforeUnits = amountToBaseUnits(before);
    const priceUnits = amountToBaseUnits(purchase.price_amount);
    if (priceUnits <= 0n) return { ok: false, reason: 'invalid-marketplace-price' };
    if (beforeUnits < priceUnits) {
        return {
            ok: false,
            reason: 'insufficient-funds',
            balance: before,
            required: purchase.price_amount,
        };
    }

    const afterUnits = beforeUnits - priceUnits;
    const after = baseUnitsToAmount(afterUnits);
    const outPoint = afterUnits > 0n ? fixtureOutPoint(txHash, currency) : null;
    return {
        ok: true,
        mode: 'fixture-settlement',
        txHash,
        owner,
        listingId: purchase.listing_id,
        assetId,
        inputs: {
            payment_balance_cell: {
                owner,
                currency,
                amount: before,
                outPoint: indexedBalances[currency]?.outPoint ?? null,
            },
            listing_cell: tx.inputs?.listing_cell ?? null,
        },
        outputs: {
            payment_balance_cell: afterUnits > 0n
                ? { owner, currency, amount: after, outPoint }
                : null,
            buyer_receipt: tx.outputs?.buyer_receipt ?? null,
            seller_receipt: tx.outputs?.seller_receipt ?? null,
            open_asset_transfer: openAssetTransfer,
        },
        updates: {
            [currency]: {
                owner,
                currency,
                amount: after,
                stale: false,
                outPoint,
                spent: afterUnits === 0n,
            },
        },
    };
}

function normalizedBalanceAmount(entry) {
    if (typeof entry === 'number') return entry;
    return Number(entry?.amount ?? 0) || 0;
}

function fixtureOutPoint(txHash, currency) {
    const raw = `${txHash || 'fixture'}:${currency}:marketplace`;
    let hex = '';
    for (let i = 0; i < raw.length && hex.length < 64; i++) {
        hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return {
        txHash: `0x${hex.padEnd(64, '0')}`,
        index: 1,
    };
}
