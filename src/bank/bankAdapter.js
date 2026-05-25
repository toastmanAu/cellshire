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
        const collateralOutpoint = fixtureOutpoint({
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
            },
            currentEpoch: this.currentEpoch(),
            termEpochs: this.termEpochs,
            txNonce: `${Date.now()}`,
        });
        const receipt = await this.submit(tx);
        if (!receipt.ok) return { ok: false, mode: 'chain', reason: receipt.reason || 'tx-failed', tx };

        const loan = chainLoanFromOffer({
            offer: chainOffer,
            tx,
            txHash: receipt.txHash,
            collateralAmount,
            currentEpoch: this.currentEpoch(),
            termEpochs: this.termEpochs,
            loanIndex: this.loanBook?.loans?.length ?? 0,
        });
        this.loanBook.loans.push(loan);
        this.loanBook._emit?.({ type: 'borrow', loan });
        this.inventoryAdapter?.addPendingDelta?.({
            currency: 'ckb',
            amount: chainOffer.amount,
            txHash: receipt.txHash,
            source: 'bank-borrow',
        });
        this.inventoryAdapter?.addPendingDelta?.({
            currency: 'ckb',
            amount: -collateralAmount,
            txHash: receipt.txHash,
            source: 'bank-collateral',
        });
        saveBankLoanBook(this.storage, this.loanBook);
        return { ok: true, mode: 'chain-prototype', loan, tx, txHash: receipt.txHash };
    }

    async repay(amount = 'max') {
        const loan = this.loanBook?.activeLoan?.();
        if (!loan) return { ok: false, reason: 'no-active-loan' };
        const payment = amount === 'max' ? loan.remainingOwed : Math.min(Number(amount), loan.remainingOwed);
        if (!Number.isFinite(payment) || payment <= 0) return { ok: false, reason: 'invalid-amount', loan };
        const balance = await this._ckbBalance();
        if (balance < payment) return { ok: false, reason: 'insufficient-funds', loan, balance, payment };
        const walletAccount = this._walletAccount();
        const debtCell = loan.debtCell ?? makeDebtCell(loan.debt);
        const tx = buildBankRepayTransaction({
            walletAccount,
            loan: { ...loan, remainingOwed: payment },
            debtCell,
            txNonce: `${Date.now()}`,
        });
        const receipt = await this.submit(tx);
        if (!receipt.ok) return { ok: false, mode: 'chain', reason: receipt.reason || 'tx-failed', tx };

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
            amount: -payment,
            txHash: receipt.txHash,
            source: 'bank-repay',
        });
        if (loan.status === 'paid' && loan.collateralAmount) {
            this.inventoryAdapter?.addPendingDelta?.({
                currency: 'ckb',
                amount: loan.collateralAmount,
                txHash: receipt.txHash,
                source: 'bank-collateral-release',
            });
        }
        saveBankLoanBook(this.storage, this.loanBook);
        return { ok: true, mode: 'chain-prototype', loan, payment, paid: loan.status === 'paid', tx, txHash: receipt.txHash };
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
            submit: createCccJoyIdBankLoanSubmitter({ params, location, importModule }),
        });
    }
    return new ChainBankAdapter({ storage, owner, loanBook, treasury, priceSnapshot, inventoryAdapter, currentEpoch });
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

function chainLoanFromOffer({ offer, tx, txHash, collateralAmount, currentEpoch, termEpochs, loanIndex }) {
    const borrowedAt = Date.now();
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
        debt: tx.outputs.debt_cell.debt,
        debtCell: tx.outputs.debt_cell,
    };
}

function fixtureOutpoint({ owner, offerId, amount }) {
    const body = btoa(`${owner}:${offerId}:${amount}`).replace(/=+$/, '').toLowerCase();
    return {
        txHash: `0x${body.replace(/[^0-9a-f]/g, '').slice(0, 64).padEnd(64, '0')}`,
        index: 0,
    };
}
