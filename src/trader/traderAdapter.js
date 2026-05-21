export class LocalTraderAdapter {
    async swap({ inventory, quote }) {
        if (!quote?.ok) return { ok: false, reason: quote?.reason || 'invalid-quote' };
        if (!inventory) return { ok: false, reason: 'missing-inventory' };
        const balance = inventory.get(quote.fromCurrency);
        if (balance < quote.fromAmount) {
            return { ok: false, reason: 'insufficient-funds', balance };
        }
        inventory.add(quote.fromCurrency, -quote.fromAmount);
        inventory.add(quote.toCurrency, quote.toAmount);
        return {
            ok: true,
            mode: 'local',
            fromCurrency: quote.fromCurrency,
            fromAmount: quote.fromAmount,
            toCurrency: quote.toCurrency,
            toAmount: quote.toAmount,
            feeUsd: quote.feeUsd,
            feeBps: quote.feeBps,
        };
    }
}

export class CellswapTraderAdapter {
    async swap() {
        return {
            ok: false,
            mode: 'cellswap',
            reason: 'not-implemented',
        };
    }
}
