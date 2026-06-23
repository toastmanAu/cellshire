import { amountToBaseUnits, baseUnitsToAmount } from './udtBalance.js';
import {
    normalizeOpenAssetCell,
    openAssetIdForCell,
    OPEN_ASSET_RENDERER,
    OPEN_ASSET_SCHEMA,
    OPEN_ASSET_SCHEMA_VERSION,
} from '../assets/openAssetStandard.js';

export const STORE_OPEN_ASSET_MINT_SCHEMA = 'cellshire.store.open_asset_mint';
export const STORE_OPEN_ASSET_MINT_VERSION = 1;

export function buildStorePurchaseTransaction({
    walletAccount,
    item,
    txNonce = 'store-purchase',
}) {
    if (!walletAccount?.address) throw new Error('wallet account required');
    if (!item?.assetId || !item?.price?.currency || !Number.isFinite(Number(item.price.amount))) {
        throw new Error('store item required');
    }
    const openAssetMint = buildStoreOpenAssetMintIntent({
        owner: walletAccount.address,
        item,
        txNonce,
    });
    return {
        version: 1,
        kind: 'cellshire_store_purchase_tx',
        network: walletAccount.network || 'testnet',
        tx_nonce: txNonce,
        action: 'purchase',
        inputs: {
            payment_balance_cell: {
                owner: walletAccount.address,
                currency: item.price.currency,
                amount: item.price.amount,
            },
        },
        outputs: {
            prop_receipt: {
                owner: walletAccount.address,
                asset_id: item.assetId,
                open_asset_id: openAssetIdForCell(openAssetMint.cell.cellId),
                quantity: 1,
            },
            open_asset_mint: openAssetMint,
            treasury_receipt: {
                currency: item.price.currency,
                amount: item.price.amount,
            },
        },
        witness: {
            provider: walletAccount.provider || 'prototype',
            address: walletAccount.address,
            signature: 'pending',
            store_purchase: {
                asset_id: item.assetId,
                price_currency: item.price.currency,
                price_amount: item.price.amount,
                open_asset_cell_id: openAssetMint.cell.cellId,
                tx_nonce: txNonce,
            },
        },
    };
}

export function buildStoreOpenAssetMintIntent({ owner, item, txNonce = 'store-purchase' } = {}) {
    if (!owner) throw new Error('store open asset owner required');
    if (!item?.assetId || !item?.name) throw new Error('store open asset item required');
    const cell = {
        schema: OPEN_ASSET_SCHEMA,
        version: OPEN_ASSET_SCHEMA_VERSION,
        cellId: `store:${owner}:${item.assetId}:${txNonce}`,
        itemType: 'prop',
        owner,
        metadata: {
            name: item.name,
            description: `General Store purchase: ${item.name}`,
            traits: {
                source: 'general_store',
                sourceAssetId: item.assetId,
                rarity: item.rarity ?? 'common',
                unlockTier: Number(item.unlockTier) || 1,
                priceCurrency: item.price?.currency ?? 'ckb',
                priceAmount: Number(item.price?.amount) || 0,
            },
        },
        render: {
            renderer: OPEN_ASSET_RENDERER,
            version: 1,
            source: { assetId: item.assetId },
            overrides: {
                category: item.category || 'props',
                kind: 'object',
                footprint: {
                    w: Number(item.footprint?.w) || 1,
                    d: Number(item.footprint?.d) || 1,
                },
            },
        },
    };
    return {
        schema: STORE_OPEN_ASSET_MINT_SCHEMA,
        version: STORE_OPEN_ASSET_MINT_VERSION,
        source: 'general_store',
        cell,
    };
}

export function settleStorePurchaseFixture({
    tx,
    indexedBalances = {},
    txHash = null,
} = {}) {
    if (tx?.kind !== 'cellshire_store_purchase_tx') {
        return { ok: false, reason: 'invalid-store-tx' };
    }
    const purchase = tx.witness?.store_purchase;
    const owner = tx.witness?.address ?? tx.inputs?.payment_balance_cell?.owner ?? null;
    const currency = purchase?.price_currency;
    const assetId = purchase?.asset_id;
    if (!owner || !currency || !assetId) return { ok: false, reason: 'invalid-store-purchase' };
    const mint = tx.outputs?.open_asset_mint;
    if (!validStoreOpenAssetMint(mint, { owner, assetId })) {
        return { ok: false, reason: 'invalid-open-asset-mint' };
    }

    const before = normalizedBalanceAmount(indexedBalances[currency]);
    const beforeUnits = amountToBaseUnits(before);
    const priceUnits = amountToBaseUnits(purchase.price_amount);
    if (priceUnits <= 0n) return { ok: false, reason: 'invalid-store-price' };
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
        assetId,
        inputs: {
            payment_balance_cell: {
                owner,
                currency,
                amount: before,
                outPoint: indexedBalances[currency]?.outPoint ?? null,
            },
        },
        outputs: {
            payment_balance_cell: afterUnits > 0n
                ? { owner, currency, amount: after, outPoint }
                : null,
            prop_receipt: tx.outputs?.prop_receipt ?? null,
            open_asset_cell: mint.cell,
            treasury_receipt: tx.outputs?.treasury_receipt ?? null,
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

function validStoreOpenAssetMint(mint, { owner, assetId }) {
    if (mint?.schema !== STORE_OPEN_ASSET_MINT_SCHEMA) return false;
    if (mint.version !== STORE_OPEN_ASSET_MINT_VERSION) return false;
    const normalized = normalizeOpenAssetCell(mint.cell);
    if (!normalized.ok) return false;
    const cell = normalized.cell;
    return cell.owner === owner
        && cell.itemType === 'prop'
        && cell.render.source.assetId === assetId
        && cell.metadata.traits?.source === 'general_store';
}

function normalizedBalanceAmount(entry) {
    if (typeof entry === 'number') return entry;
    return Number(entry?.amount ?? 0) || 0;
}

function fixtureOutPoint(txHash, currency) {
    const raw = `${txHash || 'fixture'}:${currency}:store`;
    let hex = '';
    for (let i = 0; i < raw.length && hex.length < 64; i++) {
        hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return {
        txHash: `0x${hex.padEnd(64, '0')}`,
        index: 0,
    };
}
