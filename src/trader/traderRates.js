import {
    CURRENCY_CATALOG,
    currencySymbol,
    formatCurrencyAmount,
    formatUsd,
    priceUsdForCurrency,
} from '../mining/cryptoEconomy.js';

export const TRADER_FEE_BPS = 75;

export function traderCurrencyIds() {
    return Object.keys(CURRENCY_CATALOG);
}

export function buildTraderRateTable(priceSnapshot = null, opts = {}) {
    const feeBps = Number.isFinite(opts.feeBps) ? opts.feeBps : TRADER_FEE_BPS;
    const feeMultiplier = Math.max(0, 1 - feeBps / 10000);
    const prices = {};

    for (const currencyId of traderCurrencyIds()) {
        const price = priceUsdForCurrency(currencyId, priceSnapshot);
        if (Number.isFinite(price) && price > 0) prices[currencyId] = price;
    }

    return {
        source: priceSnapshot?.mode || priceSnapshot?.source || 'fixed',
        capturedAt: priceSnapshot?.capturedAt ?? null,
        feeBps,
        feeMultiplier,
        prices,
    };
}

export function quoteTrade({ fromCurrency, toCurrency, fromAmount, rateTable }) {
    const amount = Number(fromAmount);
    if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) {
        return { ok: false, reason: 'invalid-pair' };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, reason: 'invalid-amount' };
    }

    const fromPrice = rateTable?.prices?.[fromCurrency];
    const toPrice = rateTable?.prices?.[toCurrency];
    if (!Number.isFinite(fromPrice) || !Number.isFinite(toPrice) || fromPrice <= 0 || toPrice <= 0) {
        return { ok: false, reason: 'missing-rate' };
    }

    const grossUsd = amount * fromPrice;
    const netUsd = grossUsd * rateTable.feeMultiplier;
    const toAmount = Number((netUsd / toPrice).toFixed(8));
    return {
        ok: true,
        fromCurrency,
        toCurrency,
        fromAmount: amount,
        toAmount,
        grossUsd,
        netUsd,
        feeUsd: grossUsd - netUsd,
        feeBps: rateTable.feeBps,
        rate: Number(((fromPrice / toPrice) * rateTable.feeMultiplier).toFixed(12)),
    };
}

export function formatTradeQuote(quote) {
    if (!quote?.ok) return 'No quote';
    return [
        `${formatCurrencyAmount(quote.fromCurrency, quote.fromAmount)}`,
        'for',
        `${formatCurrencyAmount(quote.toCurrency, quote.toAmount)}`,
        `(${formatUsd(quote.netUsd)} after ${quote.feeBps / 100}% fee)`,
    ].join(' ');
}

export function formatPairRate(quote) {
    if (!quote?.ok) return 'Rate unavailable';
    return `1 ${currencySymbol(quote.fromCurrency)} = ${quote.rate} ${currencySymbol(quote.toCurrency)}`;
}
