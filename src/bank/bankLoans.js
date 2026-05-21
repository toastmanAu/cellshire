import {
    formatCurrencyAmount,
    formatUsd,
    priceUsdForCurrency,
} from '../mining/cryptoEconomy.js';

export const BANK_LOANS_STORAGE_KEY = 'cellshire:bank-loans:v1:local';
export const BANK_LOAN_CURRENCY = 'ckb';
export const BANK_LOAN_FEE_BPS = 300;
export const BANK_LOAN_TERM_DAYS = 7;
export const BANK_LOAN_BASE_RESERVE_USD = 100;

export const BANK_LOAN_OFFERS = Object.freeze([
    Object.freeze({
        id: 'starter-float',
        name: 'Starter float',
        amount: 5000,
        feeBps: BANK_LOAN_FEE_BPS,
        termDays: BANK_LOAN_TERM_DAYS,
    }),
    Object.freeze({
        id: 'builder-credit',
        name: 'Builder credit',
        amount: 15000,
        feeBps: BANK_LOAN_FEE_BPS,
        termDays: BANK_LOAN_TERM_DAYS,
    }),
    Object.freeze({
        id: 'expansion-note',
        name: 'Expansion note',
        amount: 50000,
        feeBps: BANK_LOAN_FEE_BPS,
        termDays: BANK_LOAN_TERM_DAYS,
    }),
]);

const OFFER_INDEX = new Map(BANK_LOAN_OFFERS.map(offer => [offer.id, offer]));

export class BankLoanBook {
    constructor(loans = []) {
        this.loans = [];
        this._listeners = new Set();
        for (const loan of loans) {
            const normalized = normalizeLoan(loan);
            if (normalized) this.loans.push(normalized);
        }
    }

    activeLoan() {
        return this.loans.find(loan => loan.status === 'active') ?? null;
    }

    entries() {
        return this.loans.slice().sort((a, b) => b.borrowedAt - a.borrowedAt);
    }

    serialize() {
        return {
            v: 1,
            loans: this.loans,
        };
    }

    onChange(cb) {
        this._listeners.add(cb);
        return () => this._listeners.delete(cb);
    }

    _emit(change) {
        for (const cb of this._listeners) cb(change);
    }
}

export function bankLoanOffer(id) {
    return OFFER_INDEX.get(id) ?? null;
}

export function loanTotalOwed(offer) {
    return Number((offer.amount * (1 + offer.feeBps / 10000)).toFixed(8));
}

export function loanFeeAmount(offer) {
    return Number((loanTotalOwed(offer) - offer.amount).toFixed(8));
}

export function loanPrincipalUsd(offer, priceSnapshot = null) {
    const price = priceUsdForCurrency(BANK_LOAN_CURRENCY, priceSnapshot);
    const amount = Number(offer?.amount ?? offer?.principal);
    return Number((amount * price).toFixed(8));
}

export function bankReserveState({ treasury, loanBook, priceSnapshot = null, baseReserveUsd = BANK_LOAN_BASE_RESERVE_USD } = {}) {
    const active = loanBook?.activeLoan?.();
    const activePrincipalUsd = active ? loanPrincipalUsd(active, priceSnapshot) : 0;
    const totalUsd = Number(((treasury?.totalUsd?.() ?? 0) + baseReserveUsd).toFixed(8));
    return {
        totalUsd,
        activePrincipalUsd,
        availableUsd: Number(Math.max(0, totalUsd - activePrincipalUsd).toFixed(8)),
        baseReserveUsd,
    };
}

export function availableBankLoanOffers({ treasury, loanBook, priceSnapshot = null } = {}) {
    const reserve = bankReserveState({ treasury, loanBook, priceSnapshot });
    const hasActiveLoan = !!loanBook?.activeLoan?.();
    return BANK_LOAN_OFFERS.map(offer => {
        const principalUsd = loanPrincipalUsd(offer, priceSnapshot);
        return {
            ...offer,
            currency: BANK_LOAN_CURRENCY,
            totalOwed: loanTotalOwed(offer),
            feeAmount: loanFeeAmount(offer),
            principalUsd,
            enabled: !hasActiveLoan && principalUsd <= reserve.availableUsd,
        };
    });
}

export function borrowBankLoan({
    offerId,
    loanBook,
    inventory,
    treasury,
    priceSnapshot = null,
    now = Date.now,
} = {}) {
    const offer = bankLoanOffer(offerId);
    if (!offer) return { ok: false, reason: 'missing-offer' };
    if (!loanBook) return { ok: false, reason: 'missing-loan-book' };
    if (!inventory) return { ok: false, reason: 'missing-inventory' };
    if (loanBook.activeLoan()) return { ok: false, reason: 'active-loan' };
    const reserve = bankReserveState({ treasury, loanBook, priceSnapshot });
    const principalUsd = loanPrincipalUsd(offer, priceSnapshot);
    if (principalUsd > reserve.availableUsd) {
        return { ok: false, reason: 'insufficient-reserve', offer, reserve };
    }

    const borrowedAt = now();
    const loan = {
        id: `loan:${borrowedAt}:${loanBook.loans.length}`,
        offerId: offer.id,
        name: offer.name,
        status: 'active',
        currency: BANK_LOAN_CURRENCY,
        principal: offer.amount,
        feeAmount: loanFeeAmount(offer),
        totalOwed: loanTotalOwed(offer),
        remainingOwed: loanTotalOwed(offer),
        feeBps: offer.feeBps,
        borrowedAt,
        dueAt: borrowedAt + offer.termDays * 24 * 60 * 60 * 1000,
        principalUsd,
    };
    inventory.add(BANK_LOAN_CURRENCY, offer.amount);
    loanBook.loans.push(loan);
    loanBook._emit({ type: 'borrow', loan });
    return { ok: true, loan };
}

export function repayBankLoan({
    loanBook,
    inventory,
    amount,
} = {}) {
    const loan = loanBook?.activeLoan?.();
    if (!loan) return { ok: false, reason: 'no-active-loan' };
    if (!inventory) return { ok: false, reason: 'missing-inventory' };
    const requested = amount === 'max'
        ? loan.remainingOwed
        : Number(amount);
    if (!Number.isFinite(requested) || requested <= 0) {
        return { ok: false, reason: 'invalid-amount', loan };
    }
    const payment = Math.min(requested, loan.remainingOwed);
    const balance = inventory.get(loan.currency);
    if (balance < payment) {
        return { ok: false, reason: 'insufficient-funds', loan, balance, payment };
    }
    inventory.add(loan.currency, -payment);
    loan.remainingOwed = Number((loan.remainingOwed - payment).toFixed(8));
    if (loan.remainingOwed <= 0) {
        loan.remainingOwed = 0;
        loan.status = 'paid';
        loan.paidAt = Date.now();
    }
    loanBook._emit({ type: 'repay', loan, payment });
    return { ok: true, loan, payment, paid: loan.status === 'paid' };
}

export function bankLoanSummary({ loanBook, treasury, priceSnapshot = null } = {}) {
    const active = loanBook?.activeLoan?.() ?? null;
    const reserve = bankReserveState({ treasury, loanBook, priceSnapshot });
    return {
        active,
        reserve,
        reserveLabel: formatUsd(reserve.availableUsd),
        offers: availableBankLoanOffers({ treasury, loanBook, priceSnapshot }),
        detail: active
            ? `${formatCurrencyAmount(active.currency, active.remainingOwed)} due`
            : `${formatUsd(reserve.availableUsd)} available`,
    };
}

export function loadBankLoanBook(storage) {
    const raw = storage?.get?.(BANK_LOANS_STORAGE_KEY);
    if (!raw) return new BankLoanBook();
    try {
        const data = JSON.parse(raw);
        if (data?.v !== 1 || !Array.isArray(data.loans)) return new BankLoanBook();
        return new BankLoanBook(data.loans);
    } catch {
        return new BankLoanBook();
    }
}

export function saveBankLoanBook(storage, loanBook) {
    try {
        storage?.set?.(BANK_LOANS_STORAGE_KEY, JSON.stringify(loanBook.serialize()));
        return true;
    } catch {
        return false;
    }
}

function normalizeLoan(loan) {
    if (!loan || typeof loan !== 'object') return null;
    const principal = Number(loan.principal);
    const remainingOwed = Number(loan.remainingOwed);
    if (!Number.isFinite(principal) || principal <= 0) return null;
    if (!Number.isFinite(remainingOwed) || remainingOwed < 0) return null;
    return {
        id: typeof loan.id === 'string' && loan.id ? loan.id : `loan:${Date.now()}`,
        offerId: typeof loan.offerId === 'string' ? loan.offerId : 'unknown',
        name: typeof loan.name === 'string' && loan.name ? loan.name : 'Loan',
        status: loan.status === 'paid' ? 'paid' : 'active',
        currency: loan.currency || BANK_LOAN_CURRENCY,
        principal,
        feeAmount: Number(loan.feeAmount) || 0,
        totalOwed: Number(loan.totalOwed) || principal,
        remainingOwed,
        feeBps: Number(loan.feeBps) || 0,
        borrowedAt: Number(loan.borrowedAt) || Date.now(),
        dueAt: Number(loan.dueAt) || Date.now(),
        paidAt: Number(loan.paidAt) || null,
        principalUsd: Number(loan.principalUsd) || 0,
    };
}
