import { amountToBaseUnits, baseUnitsToAmount } from './udtBalance.js';

export function buildTraderSwapTransaction({
    walletAccount,
    quote,
    txNonce = 'trader-swap',
}) {
    if (!quote?.ok) throw new Error('valid quote required');
    if (!walletAccount?.address) throw new Error('wallet account required');
    return {
        version: 1,
        kind: 'cellshire_trader_swap_tx',
        network: walletAccount.network || 'testnet',
        tx_nonce: txNonce,
        action: 'swap',
        inputs: {
            source_balance_cell: {
                owner: walletAccount.address,
                currency: quote.fromCurrency,
                amount: quote.fromAmount,
            },
        },
        outputs: {
            target_balance_cell: {
                owner: walletAccount.address,
                currency: quote.toCurrency,
                amount: quote.toAmount,
            },
            treasury_fee_receipt: {
                currency: quote.fromCurrency,
                fee_usd: quote.feeUsd,
                fee_bps: quote.feeBps,
                gross_usd: quote.grossUsd,
                net_usd: quote.netUsd,
            },
        },
        witness: {
            provider: walletAccount.provider || 'prototype',
            address: walletAccount.address,
            signature: 'pending',
            trader_quote: {
                from_currency: quote.fromCurrency,
                from_amount: quote.fromAmount,
                to_currency: quote.toCurrency,
                to_amount: quote.toAmount,
                rate: quote.rate,
                fee_bps: quote.feeBps,
                tx_nonce: txNonce,
            },
        },
    };
}

export function settleTraderSwapFixture({
    tx,
    indexedBalances = {},
    txHash = null,
} = {}) {
    if (tx?.kind !== 'cellshire_trader_swap_tx') {
        return { ok: false, reason: 'invalid-trader-tx' };
    }
    const quote = tx.witness?.trader_quote;
    const owner = tx.witness?.address ?? tx.inputs?.source_balance_cell?.owner ?? null;
    const fromCurrency = quote?.from_currency;
    const toCurrency = quote?.to_currency;
    if (!owner || !fromCurrency || !toCurrency || fromCurrency === toCurrency) {
        return { ok: false, reason: 'invalid-trader-quote' };
    }

    const sourceBefore = normalizedBalanceAmount(indexedBalances[fromCurrency]);
    const targetBefore = normalizedBalanceAmount(indexedBalances[toCurrency]);
    const sourceBeforeUnits = amountToBaseUnits(sourceBefore);
    const targetBeforeUnits = amountToBaseUnits(targetBefore);
    const fromUnits = amountToBaseUnits(quote.from_amount);
    const toUnits = amountToBaseUnits(quote.to_amount);
    if (fromUnits <= 0n || toUnits <= 0n) return { ok: false, reason: 'invalid-trader-amount' };
    if (sourceBeforeUnits < fromUnits) {
        return {
            ok: false,
            reason: 'insufficient-source-balance',
            balance: sourceBefore,
            required: quote.from_amount,
        };
    }

    const sourceAfterUnits = sourceBeforeUnits - fromUnits;
    const targetAfterUnits = targetBeforeUnits + toUnits;
    const sourceAfter = baseUnitsToAmount(sourceAfterUnits);
    const targetAfter = baseUnitsToAmount(targetAfterUnits);
    const sourceOutPoint = sourceAfterUnits > 0n ? fixtureOutPoint(txHash, fromCurrency) : null;
    const targetOutPoint = fixtureOutPoint(txHash, toCurrency);
    const updates = {
        [fromCurrency]: {
            owner,
            currency: fromCurrency,
            amount: sourceAfter,
            stale: false,
            outPoint: sourceOutPoint,
            spent: sourceAfterUnits === 0n,
        },
        [toCurrency]: {
            owner,
            currency: toCurrency,
            amount: targetAfter,
            stale: false,
            outPoint: targetOutPoint,
            spent: false,
        },
    };

    return {
        ok: true,
        mode: 'fixture-settlement',
        txHash,
        owner,
        inputs: {
            source_balance_cell: {
                owner,
                currency: fromCurrency,
                amount: sourceBefore,
                outPoint: indexedBalances[fromCurrency]?.outPoint ?? null,
            },
            target_balance_cell: targetBeforeUnits > 0n
                ? {
                    owner,
                    currency: toCurrency,
                    amount: targetBefore,
                    outPoint: indexedBalances[toCurrency]?.outPoint ?? null,
                }
                : null,
        },
        outputs: {
            source_balance_cell: sourceAfterUnits > 0n
                ? {
                    owner,
                    currency: fromCurrency,
                    amount: sourceAfter,
                    outPoint: sourceOutPoint,
                }
                : null,
            target_balance_cell: {
                owner,
                currency: toCurrency,
                amount: targetAfter,
                outPoint: targetOutPoint,
            },
            treasury_fee_receipt: tx.outputs?.treasury_fee_receipt ?? null,
        },
        updates,
    };
}

function normalizedBalanceAmount(entry) {
    if (typeof entry === 'number') return entry;
    return Number(entry?.amount ?? 0) || 0;
}

function fixtureOutPoint(txHash, currency) {
    const raw = `${txHash || 'fixture'}:${currency}`;
    let hex = '';
    for (let i = 0; i < raw.length && hex.length < 64; i++) {
        hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return {
        txHash: `0x${hex.padEnd(64, '0')}`,
        index: currency.charCodeAt(0) % 4,
    };
}
