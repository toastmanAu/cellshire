import {
    bankLoanOffer,
    bankLoanSummary as localBankLoanSummary,
    borrowBankLoan as borrowLocalBankLoan,
    loanFeeAmount,
    loanPrincipalUsd,
    loanTotalOwed,
    repayBankLoan as repayLocalBankLoan,
    saveBankLoanBook,
} from './bankLoans.js';
import {
    createBankInputProviderFromParams,
    EmptyBankInputProvider,
    normalizeBankInputCell,
} from './bankInputProvider.js';
import {
    buildBankBorrowTransaction,
    buildBankRepayTransaction,
} from '../chain/bankTx.js';
import {
    ckbCollateralAmount,
    makeDebtCell,
} from '../chain/debtCell.js';
import { createCccJoyIdBankLoanSubmitter } from '../chain/cccJoyId.js';
import { formatCurrencyAmount } from '../mining/cryptoEconomy.js';
import { loadWalletIdentity } from '../wallet/walletIdentity.js';

export function chainBankEnabled(params) {
    return params?.get?.('chainBank') === '1';
}

export function chainBankSubmitMode(params) {
    const mode = params?.get?.('chainBankSubmit') || params?.get?.('chainBankMode');
    if (mode === 'ccc-real' || mode === 'joyid-real' || mode === 'ccc-joyid-real') {
        return 'ccc-joyid-real';
    }
    return mode === 'ccc' || mode === 'joyid' || mode === 'ccc-joyid'
        ? 'ccc-joyid'
        : 'prototype';
}

export class LocalBankAdapter {
    constructor({ storage, loanBook, treasury, priceSnapshot, inventory } = {}) {
        this.storage = storage;
        this.loanBook = loanBook;
        this.treasury = treasury;
        this.priceSnapshot = priceSnapshot;
        this.inventory = inventory;
    }

    summary() {
        return localBankLoanSummary({
            loanBook: this.loanBook,
            treasury: this.treasury,
            priceSnapshot: this.priceSnapshot,
        });
    }

    async borrow(offerId) {
        return borrowLocalBankLoan({
            offerId,
            loanBook: this.loanBook,
            inventory: this.inventory,
            treasury: this.treasury,
            priceSnapshot: this.priceSnapshot,
        });
    }

    async repay(amount = 'max') {
        return repayLocalBankLoan({
            loanBook: this.loanBook,
            inventory: this.inventory,
            amount,
        });
    }
}

export class ChainBankAdapter {
    constructor({
        storage,
        owner = 'local',
        loanBook,
        treasury,
        priceSnapshot,
        inventoryAdapter,
        currentEpoch = () => 0,
        termEpochs = 42,
        submit = defaultSubmitPrototypeBankTx,
        bankInputProvider = new EmptyBankInputProvider(),
        loadWallet = loadWalletIdentity,
    } = {}) {
        this.storage = storage;
        this.owner = owner;
        this.loanBook = loanBook;
        this.treasury = treasury;
        this.priceSnapshot = priceSnapshot;
        this.inventoryAdapter = inventoryAdapter;
        this.currentEpoch = currentEpoch;
        this.termEpochs = termEpochs;
        this.submit = submit;
        this.bankInputProvider = bankInputProvider;
        this.loadWallet = loadWallet;
    }

    summary() {
        const summary = localBankLoanSummary({
            loanBook: this.loanBook,
            treasury: this.treasury,
            priceSnapshot: this.priceSnapshot,
        });
        return {
            ...summary,
            mode: 'chain',
            reserveLabel: `${summary.reserveLabel} chain reserve`,
            detail: summary.active
                ? `${formatCurrencyAmount(summary.active.currency, summary.active.remainingOwed)} due · CKB collateral`
                : summary.detail,
            offers: summary.offers.map(offer => ({
                ...offer,
                mode: 'chain',
                collateralKind: 'ckb',
                collateralAmount: ckbCollateralAmount(offer.amount),
                collateralLabel: `${formatCurrencyAmount('ckb', ckbCollateralAmount(offer.amount))} collateral`,
            })),
        };
    }

    async borrow(offerId) {
        const offer = bankLoanOffer(offerId);
        if (!offer) return { ok: false, reason: 'missing-offer' };
        if (this.loanBook?.activeLoan?.()) return { ok: false, reason: 'active-loan' };
        const balance = await this._ckbBalance();
        const collateralAmount = ckbCollateralAmount(offer.amount);
        if (balance < collateralAmount) {
            return { ok: false, reason: 'insufficient-collateral', balance, collateralAmount };
        }
        const walletAccount = this._walletAccount();
        const chainOffer = chainOfferFromLocalOffer(offer, this.priceSnapshot);
        const provided = await this._borrowInputs({
            walletAccount,
            offer: chainOffer,
            collateralAmount,
        });
        if (provided?.ok === false) return { ok: false, mode: 'chain', reason: provided.reason || 'bank-inputs-unavailable' };
        const collateralCell = normalizeBankInputCell(provided?.collateralCell) ?? null;
        const bankReserveCell = normalizeBankInputCell(provided?.bankReserveCell) ?? null;
        const collateralOutpoint = collateralCell?.outPoint ?? fixtureOutpoint({
            owner: walletAccount.address,
            offerId,
            amount: collateralAmount,
        });
        const tx = buildBankBorrowTransaction({
            walletAccount,
            offer: chainOffer,
            collateral: {
                kind: 'ckb',
                amount: collateralAmount,
                outpoint: collateralOutpoint,
                cell: collateralCell,
            },
            bankReserveCell,
            currentEpoch: this.currentEpoch(),
            termEpochs: this.termEpochs,
            txNonce: `${Date.now()}`,
        });
        const receipt = await this.submit(tx);
        if (!receipt.ok) return { ok: false, mode: 'chain', reason: receipt.reason || 'tx-failed', tx };

        const settlement = receipt.mode?.startsWith?.('ccc-joyid')
            ? null
            : this.inventoryAdapter?.settleBankBorrowTx?.(tx, receipt);
        if (settlement && !settlement.ok) {
            return {
                ok: false,
                mode: 'chain',
                reason: settlement.reason || 'settlement-failed',
                message: 'Bank borrow settlement failed',
                tx,
                settlement,
            };
        }

        const loan = chainLoanFromOffer({
            offer: chainOffer,
            tx,
            txHash: receipt.txHash,
            collateralAmount,
            currentEpoch: this.currentEpoch(),
            termEpochs: this.termEpochs,
            loanIndex: this.loanBook?.loans?.length ?? 0,
            settlement,
        });
        this.loanBook.loans.push(loan);
        this.loanBook._emit?.({ type: 'borrow', loan });
        this.inventoryAdapter?.addPendingDelta?.({
            currency: 'ckb',
            amount: chainOffer.amount - collateralAmount,
            txHash: receipt.txHash,
            source: 'bank-borrow-net',
        });
        saveBankLoanBook(this.storage, this.loanBook);
        return {
            ok: true,
            mode: receipt.mode === 'ccc-joyid-real'
                ? 'chain-ccc-real'
                : receipt.mode === 'ccc-joyid'
                ? 'chain-ccc-receipt'
                : settlement?.ok ? 'chain-fixture-settled' : 'chain-prototype',
            loan,
            tx,
            txHash: receipt.txHash,
            settlement,
        };
    }

    async repay(amount = 'max') {
        const loan = this.loanBook?.activeLoan?.();
        if (!loan) return { ok: false, reason: 'no-active-loan' };
        const payment = amount === 'max' ? loan.remainingOwed : Math.min(Number(amount), loan.remainingOwed);
        if (!Number.isFinite(payment) || payment <= 0) return { ok: false, reason: 'invalid-amount', loan };
        if (payment !== loan.remainingOwed) {
            return { ok: false, reason: 'full-repayment-required', loan, payment, required: loan.remainingOwed };
        }
        const balance = await this._ckbBalance();
        if (balance < payment) return { ok: false, reason: 'insufficient-funds', loan, balance, payment };
        const walletAccount = this._walletAccount();
        const provided = await this._repayInputs({
            walletAccount,
            loan,
        });
        if (provided?.ok === false) return { ok: false, mode: 'chain', reason: provided.reason || 'bank-inputs-unavailable' };
        const providedDebtCell = normalizeBankInputCell(provided?.debtCell) ?? null;
        const providedLockedCollateral = normalizeBankInputCell(provided?.lockedCollateralCell) ?? null;
        const debtCell = withDebtShape(providedDebtCell, loan.debtCell ?? makeDebtCell(loan.debt));
        const lockedCollateralCell = providedLockedCollateral ?? loan.collateralLockedCell ?? null;
        const tx = buildBankRepayTransaction({
            walletAccount,
            loan: { ...loan, remainingOwed: payment },
            debtCell,
            lockedCollateralCell,
            txNonce: `${Date.now()}`,
        });
        const receipt = await this.submit(tx);
        if (!receipt.ok) return { ok: false, mode: 'chain', reason: receipt.reason || 'tx-failed', tx };

        const settlement = receipt.mode?.startsWith?.('ccc-joyid')
            ? null
            : this.inventoryAdapter?.settleBankRepayTx?.(tx, receipt);
        if (settlement && !settlement.ok) {
            return {
                ok: false,
                mode: 'chain',
                reason: settlement.reason || 'settlement-failed',
                message: 'Bank repay settlement failed',
                tx,
                settlement,
            };
        }

        loan.remainingOwed = Number((loan.remainingOwed - payment).toFixed(8));
        if (loan.remainingOwed <= 0) {
            loan.remainingOwed = 0;
            loan.status = 'paid';
            loan.paidAt = Date.now();
            loan.repaidTxHash = receipt.txHash;
        }
        this.loanBook._emit?.({ type: 'repay', loan, payment });
        this.inventoryAdapter?.addPendingDelta?.({
            currency: 'ckb',
            amount: -payment + (loan.status === 'paid' ? Number(loan.collateralAmount || 0) : 0),
            txHash: receipt.txHash,
            source: 'bank-repay-net',
        });
        saveBankLoanBook(this.storage, this.loanBook);
        return {
            ok: true,
            mode: receipt.mode === 'ccc-joyid-real'
                ? 'chain-ccc-real'
                : receipt.mode === 'ccc-joyid'
                ? 'chain-ccc-receipt'
                : settlement?.ok ? 'chain-fixture-settled' : 'chain-prototype',
            loan,
            payment,
            paid: loan.status === 'paid',
            tx,
            txHash: receipt.txHash,
            settlement,
        };
    }

    async _ckbBalance() {
        const snapshot = await this.inventoryAdapter?.read?.();
        return Number(snapshot?.currencies?.get?.('ckb') ?? 0);
    }

    _walletAccount() {
        const wallet = this.loadWallet(this.storage);
        return wallet.status === 'connected' && wallet.account
            ? wallet.account
            : { provider: 'prototype', address: this.owner || 'local', network: 'testnet' };
    }

    async _borrowInputs(context) {
        return await this.bankInputProvider?.selectBorrowInputs?.(context);
    }

    async _repayInputs(context) {
        return await this.bankInputProvider?.selectRepayInputs?.(context);
    }
}

export async function defaultSubmitPrototypeBankTx(tx) {
    await new Promise(r => setTimeout(r, 180));
    const id = btoa(`${tx.action}:${tx.witness?.bank_receipt?.offer_id || tx.witness?.bank_receipt?.loan_id}:${tx.tx_nonce}`)
        .replace(/=+$/, '');
    return {
        ok: true,
        txHash: `0xbank${id.slice(0, 24).padEnd(24, '0')}`,
    };
}

export function makeBankAdapterFromParams({
    params,
    storage,
    owner,
    loanBook,
    treasury,
    priceSnapshot,
    inventory,
    inventoryAdapter,
    currentEpoch,
    location,
    importModule,
    fetchImpl,
} = {}) {
    if (!chainBankEnabled(params)) {
        return new LocalBankAdapter({ storage, loanBook, treasury, priceSnapshot, inventory });
    }
    if (params?.get?.('chainBankCollateral') && params.get('chainBankCollateral') !== 'ckb') {
        return new ChainBankAdapter({
            storage,
            owner,
            loanBook,
            treasury,
            priceSnapshot,
            inventoryAdapter,
            currentEpoch,
            bankInputProvider: createBankInputProviderFromParams(params, { fetchImpl }),
            submit: async () => ({ ok: false, reason: 'unsupported-collateral' }),
        });
    }
    if (chainBankSubmitMode(params) === 'ccc-joyid') {
        return new ChainBankAdapter({
            storage,
            owner,
            loanBook,
            treasury,
            priceSnapshot,
            inventoryAdapter,
            currentEpoch,
            bankInputProvider: createBankInputProviderFromParams(params, { fetchImpl }),
            submit: createCccJoyIdBankLoanSubmitter({ params, location, importModule }),
        });
    }
    if (chainBankSubmitMode(params) === 'ccc-joyid-real') {
        return new ChainBankAdapter({
            storage,
            owner,
            loanBook,
            treasury,
            priceSnapshot,
            inventoryAdapter,
            currentEpoch,
            bankInputProvider: createBankInputProviderFromParams(params, { fetchImpl }),
            submit: createCccJoyIdBankLoanSubmitter({
                params,
                location,
                importModule,
                fetchImpl,
                realBankTx: true,
            }),
        });
    }
    return new ChainBankAdapter({
        storage,
        owner,
        loanBook,
        treasury,
        priceSnapshot,
        inventoryAdapter,
        currentEpoch,
        bankInputProvider: createBankInputProviderFromParams(params, { fetchImpl }),
    });
}

function chainOfferFromLocalOffer(offer, priceSnapshot) {
    return {
        ...offer,
        currency: 'ckb',
        totalOwed: loanTotalOwed(offer),
        feeAmount: loanFeeAmount(offer),
        principalUsd: loanPrincipalUsd(offer, priceSnapshot),
    };
}

function chainLoanFromOffer({ offer, tx, txHash, collateralAmount, currentEpoch, termEpochs, loanIndex, settlement = null }) {
    const borrowedAt = Date.now();
    const debtCell = settlement?.outputs?.debt_cell ?? tx.outputs.debt_cell;
    return {
        id: `chain-loan:${txHash}:${loanIndex}`,
        offerId: offer.id,
        name: offer.name,
        status: 'active',
        mode: 'chain',
        currency: 'ckb',
        principal: offer.amount,
        feeAmount: offer.feeAmount,
        totalOwed: offer.totalOwed,
        remainingOwed: offer.totalOwed,
        feeBps: offer.feeBps,
        borrowedAt,
        dueAt: borrowedAt + offer.termDays * 24 * 60 * 60 * 1000,
        dueEpoch: Math.max(0, Math.floor(Number(currentEpoch) || 0)) + termEpochs,
        principalUsd: offer.principalUsd,
        collateralKind: 'ckb',
        collateralAmount,
        borrowTxHash: txHash,
        debt: debtCell.debt,
        debtCell,
        collateralLockedCell: settlement?.outputs?.collateral_locked_cell ?? tx.outputs.collateral_locked_cell,
    };
}

function withDebtShape(candidate, fallback) {
    if (!candidate) return fallback;
    const debt = candidate.debt ?? fallback?.debt ?? null;
    const data = candidate.data ?? fallback?.data ?? null;
    const type = candidate.type ?? fallback?.type ?? null;
    const lock = candidate.lock ?? fallback?.lock ?? null;
    return {
        ...fallback,
        ...candidate,
        debt,
        data,
        type,
        lock,
    };
}

function fixtureOutpoint({ owner, offerId, amount }) {
    const body = btoa(`${owner}:${offerId}:${amount}`).replace(/=+$/, '').toLowerCase();
    return {
        txHash: `0x${body.replace(/[^0-9a-f]/g, '').slice(0, 64).padEnd(64, '0')}`,
        index: 0,
    };
}
