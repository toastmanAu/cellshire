import { amountToBaseUnits, baseUnitsToAmount } from './udtBalance.js';

export function buildStorePurchaseTransaction({
    walletAccount,
    item,
    txNonce = 'store-purchase',
}) {
    if (!walletAccount?.address) throw new Error('wallet account required');
    if (!item?.assetId || !item?.price?.currency || !Number.isFinite(Number(item.price.amount))) {
        throw new Error('store item required');
    }
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
                quantity: 1,
            },
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
                tx_nonce: txNonce,
            },
        },
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
