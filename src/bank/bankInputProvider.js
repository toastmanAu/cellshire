export class EmptyBankInputProvider {
    async selectBorrowInputs() {
        return null;
    }

    async selectRepayInputs() {
        return null;
    }
}

export class StaticBankInputProvider {
    constructor({
        borrow = null,
        repay = null,
    } = {}) {
        this.borrow = borrow;
        this.repay = repay;
    }

    async selectBorrowInputs() {
        return this.borrow;
    }

    async selectRepayInputs() {
        return this.repay;
    }
}

export class HttpBankInputProvider {
    constructor({
        url,
        borrowUrl = url,
        repayUrl = url,
        token = '',
        fallback = new EmptyBankInputProvider(),
        fetchImpl = globalThis.fetch?.bind?.(globalThis) ?? globalThis.fetch,
    } = {}) {
        this.url = url;
        this.borrowUrl = borrowUrl;
        this.repayUrl = repayUrl;
        this.token = token;
        this.fallback = fallback;
        this.fetchImpl = fetchImpl;
    }

    async selectBorrowInputs(context = {}) {
        const local = await this.fallback?.selectBorrowInputs?.(context);
        if (local?.bankReserveCell && local?.collateralCell) return local;
        if (!this.borrowUrl) return local ?? null;
        if (typeof this.fetchImpl !== 'function') return { ok: false, reason: 'bank-input-provider-unavailable' };
        try {
            const response = await this.fetchImpl(this.borrowUrl, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify({
                    protocol: 'cellshire.bank.inputs.select',
                    version: 1,
                    action: 'borrow',
                    walletAccount: publicWalletAccount(context.walletAccount),
                    offer: publicOffer(context.offer),
                    collateralAmount: Number(context.collateralAmount),
                }),
            });
            if (!response?.ok) return { ok: false, reason: `bank-input-provider-http-${response?.status || 'network'}` };
            const body = await response.json();
            if (body?.ok === false) return { ok: false, reason: body.reason || 'bank-input-provider-rejected' };
            const normalized = normalizeBankInputProviderResponse(body, 'borrow');
            if (normalized?.ok === false) return normalized;
            return {
                ...local,
                ...normalized,
            };
        } catch {
            return { ok: false, reason: 'bank-input-provider-failed' };
        }
    }

    async selectRepayInputs(context = {}) {
        const local = await this.fallback?.selectRepayInputs?.(context);
        if (local?.debtCell && local?.lockedCollateralCell) return local;
        if (!this.repayUrl) return local ?? null;
        if (typeof this.fetchImpl !== 'function') return { ok: false, reason: 'bank-input-provider-unavailable' };
        try {
            const response = await this.fetchImpl(this.repayUrl, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify({
                    protocol: 'cellshire.bank.inputs.select',
                    version: 1,
                    action: 'repay',
                    walletAccount: publicWalletAccount(context.walletAccount),
                    loan: publicLoan(context.loan),
                }),
            });
            if (!response?.ok) return { ok: false, reason: `bank-input-provider-http-${response?.status || 'network'}` };
            const body = await response.json();
            if (body?.ok === false) return { ok: false, reason: body.reason || 'bank-input-provider-rejected' };
            const normalized = normalizeBankInputProviderResponse(body, 'repay');
            if (normalized?.ok === false) return normalized;
            return {
                ...local,
                ...normalized,
            };
        } catch {
            return { ok: false, reason: 'bank-input-provider-failed' };
        }
    }

    _headers() {
        const headers = { 'content-type': 'application/json' };
        if (this.token) headers.authorization = `Bearer ${this.token}`;
        return headers;
    }
}

export function createBankInputProviderFromParams(params, { fetchImpl } = {}) {
    const fallback = createStaticBankInputProviderFromParams(params);
    const url = params?.get?.('chainBankInputProviderUrl') || '';
    const borrowUrl = params?.get?.('chainBankBorrowInputProviderUrl')
        || url
        || params?.get?.('chainBankReserveIndexerUrl')
        || '';
    const repayUrl = params?.get?.('chainBankRepayInputProviderUrl')
        || url
        || params?.get?.('chainBankRepayIndexerUrl')
        || '';
    if (borrowUrl || repayUrl) {
        return new HttpBankInputProvider({
            url,
            borrowUrl,
            repayUrl,
            token: params?.get?.('chainBankInputProviderToken') || params?.get?.('chainBankReserveIndexerToken') || '',
            fallback,
            fetchImpl,
        });
    }
    return fallback;
}

function createStaticBankInputProviderFromParams(params) {
    const borrow = {
        bankReserveCell: cellFromParams(params, 'chainBankReserveCell'),
        collateralCell: cellFromParams(params, 'chainBankCollateralCell'),
    };
    const repay = {
        debtCell: cellFromParams(params, 'chainBankDebtCell'),
        lockedCollateralCell: cellFromParams(params, 'chainBankLockedCollateralCell'),
    };
    const hasBorrow = !!(borrow.bankReserveCell || borrow.collateralCell);
    const hasRepay = !!(repay.debtCell || repay.lockedCollateralCell);
    return hasBorrow || hasRepay
        ? new StaticBankInputProvider({
            borrow: hasBorrow ? borrow : null,
            repay: hasRepay ? repay : null,
        })
        : new EmptyBankInputProvider();
}

export function normalizeBankInputProviderResponse(body, action = 'borrow') {
    if (!body || typeof body !== 'object') return { ok: false, reason: 'bank-input-provider-invalid-response' };
    if (body.protocol && body.protocol !== 'cellshire.bank.inputs.response') {
        return { ok: false, reason: 'bank-input-provider-invalid-protocol' };
    }
    if (body.version != null && Number(body.version) !== 1) {
        return { ok: false, reason: 'bank-input-provider-unsupported-version' };
    }
    const source = action === 'borrow'
        ? (body.borrow ?? body)
        : (body.repay ?? body);
    if (action === 'borrow') {
        const bankReserveCell = normalizeBankInputCell(source.bankReserveCell ?? source.bank_reserve_cell);
        const collateralCell = normalizeBankInputCell(source.collateralCell ?? source.collateral_cell);
        if (!bankReserveCell || !collateralCell) {
            return { ok: false, reason: 'bank-input-provider-missing-borrow-inputs' };
        }
        return { bankReserveCell, collateralCell };
    }
    const debtCell = normalizeBankInputCell(source.debtCell ?? source.debt_cell);
    const lockedCollateralCell = normalizeBankInputCell(source.lockedCollateralCell ?? source.locked_collateral_cell);
    if (!debtCell || !lockedCollateralCell) {
        return { ok: false, reason: 'bank-input-provider-missing-repay-inputs' };
    }
    return { debtCell, lockedCollateralCell };
}

export function normalizeBankInputCell(cell) {
    if (!cell || typeof cell !== 'object') return null;
    const outPoint = normalizeOutPoint(cell.outPoint ?? cell.outpoint ?? cell.previousOutput);
    if (!outPoint) return null;
    const capacity = numberOr(cell.capacity ?? cell.capacityCkb ?? cell.amount, null);
    const normalized = {
        ...cell,
        outPoint,
        capacity: capacity ?? undefined,
        amount: numberOr(cell.amount, capacity ?? undefined),
        lock: cell.lock ?? null,
        type: cell.type ?? null,
    };
    if ('data' in cell) normalized.data = normalizeHex(cell.data) ?? cell.data;
    return normalized;
}

function cellFromParams(params, prefix) {
    const txHash = normalizeHash(params?.get?.(`${prefix}TxHash`));
    if (!txHash) return null;
    const index = numberOr(params?.get?.(`${prefix}Index`), 0);
    if (!Number.isInteger(index) || index < 0) return null;
    const capacity = numberOr(params?.get?.(`${prefix}CapacityCkb`), null);
    const amount = numberOr(params?.get?.(`${prefix}AmountCkb`), capacity);
    return normalizeBankInputCell({
        outPoint: { txHash, index },
        capacity,
        amount,
        data: params?.get?.(`${prefix}Data`) ?? '0x',
    });
}

function normalizeOutPoint(value) {
    if (!value || typeof value !== 'object') return null;
    const txHash = normalizeHash(value.txHash ?? value.tx_hash);
    const index = numberOr(value.index, null);
    if (!txHash || !Number.isInteger(index) || index < 0) return null;
    return { txHash, index };
}

function normalizeHash(value) {
    if (typeof value !== 'string') return null;
    const body = value.startsWith('0x') ? value.slice(2) : value;
    return /^[0-9a-f]{64}$/i.test(body) ? `0x${body.toLowerCase()}` : null;
}

function normalizeHex(value) {
    if (typeof value !== 'string') return null;
    const body = value.startsWith('0x') ? value.slice(2) : value;
    return /^[0-9a-f]*$/i.test(body) && body.length % 2 === 0
        ? `0x${body.toLowerCase()}`
        : null;
}

function numberOr(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function publicWalletAccount(account = {}) {
    return {
        provider: account.provider ?? null,
        address: account.address ?? null,
        network: account.network ?? null,
    };
}

function publicOffer(offer = {}) {
    return {
        id: offer.id ?? null,
        amount: Number(offer.amount),
        currency: offer.currency ?? null,
        totalOwed: Number(offer.totalOwed),
        feeAmount: Number(offer.feeAmount),
    };
}

function publicLoan(loan = {}) {
    return {
        id: loan.id ?? null,
        offerId: loan.offerId ?? null,
        principal: Number(loan.principal),
        feeAmount: Number(loan.feeAmount),
        totalOwed: Number(loan.totalOwed),
        remainingOwed: Number(loan.remainingOwed),
        collateralAmount: Number(loan.collateralAmount),
        collateralKind: loan.collateralKind ?? null,
        borrowTxHash: loan.borrowTxHash ?? null,
        debtOutPoint: loan.debtCell?.outPoint ?? null,
        lockedCollateralOutPoint: loan.collateralLockedCell?.outPoint ?? null,
    };
}
