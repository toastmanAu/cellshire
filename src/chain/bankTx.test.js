import { describe, it, expect } from '../test/harness.js';
import { BANK_LOAN_OFFERS, loanFeeAmount, loanTotalOwed } from '../bank/bankLoans.js';
import {
    buildBankBorrowTransaction,
    buildBankRepayTransaction,
    settleBankBorrowFixture,
    settleBankRepayFixture,
} from './bankTx.js';

const walletAccount = {
    provider: 'prototype',
    address: 'ckt1-player',
    network: 'testnet',
};

const collateral = {
    kind: 'ckb',
    amount: 11250,
    outpoint: {
        txHash: `0x${'2'.repeat(64)}`,
        index: 0,
    },
};

describe('bank chain transactions', () => {
    it('builds a BORROW transaction with principal, fee, due epoch, and collateral pointer', () => {
        const offer = {
            ...BANK_LOAN_OFFERS[0],
            currency: 'ckb',
            totalOwed: loanTotalOwed(BANK_LOAN_OFFERS[0]),
            feeAmount: loanFeeAmount(BANK_LOAN_OFFERS[0]),
        };
        const tx = buildBankBorrowTransaction({
            walletAccount,
            offer,
            collateral,
            currentEpoch: 14400,
            termEpochs: 42,
            txNonce: 'borrow-1',
        });
        expect(tx.action).toBe('borrow');
        expect(tx.outputs.player_ckb_cell.amount).toBe(7500);
        expect(tx.outputs.debt_cell.debt.fee).toBe(187.5);
        expect(tx.outputs.debt_cell.debt.dueEpoch).toBe(14442);
        expect(tx.outputs.debt_cell.debt.collateralOutpoint.txHash).toBe(collateral.outpoint.txHash);
        expect(tx.outputs.collateral_locked_cell.amount).toBe(11250);
    });

    it('builds a REPAY transaction that consumes debt and releases collateral to the player', () => {
        const offer = {
            ...BANK_LOAN_OFFERS[0],
            currency: 'ckb',
            totalOwed: loanTotalOwed(BANK_LOAN_OFFERS[0]),
            feeAmount: loanFeeAmount(BANK_LOAN_OFFERS[0]),
        };
        const borrow = buildBankBorrowTransaction({
            walletAccount,
            offer,
            collateral,
            currentEpoch: 14400,
            termEpochs: 42,
        });
        const loan = {
            id: 'loan-1',
            offerId: offer.id,
            principal: offer.amount,
            feeAmount: offer.feeAmount,
            totalOwed: offer.totalOwed,
            remainingOwed: offer.totalOwed,
            feeBps: offer.feeBps,
            collateralAmount: collateral.amount,
        };
        const repay = buildBankRepayTransaction({
            walletAccount,
            loan,
            debtCell: borrow.outputs.debt_cell,
            txNonce: 'repay-1',
        });
        expect(repay.action).toBe('repay');
        expect(repay.inputs.debt_cell.debt.offerId).toBe('starter-float');
        expect(repay.outputs.bank_reserve_cell.amount).toBe(7500);
        expect(repay.outputs.treasury_fee_receipt.amount).toBe(187.5);
        expect(repay.outputs.collateral_unlocked_cell.owner).toBe('ckt1-player');
    });

    it('settles a CKB-collateral BORROW into debt and locked collateral fixture cells', () => {
        const offer = {
            ...BANK_LOAN_OFFERS[0],
            currency: 'ckb',
            totalOwed: loanTotalOwed(BANK_LOAN_OFFERS[0]),
            feeAmount: loanFeeAmount(BANK_LOAN_OFFERS[0]),
        };
        const tx = buildBankBorrowTransaction({
            walletAccount,
            offer,
            collateral,
            currentEpoch: 14400,
            termEpochs: 42,
            txNonce: 'borrow-1',
        });
        const settlement = settleBankBorrowFixture({
            tx,
            txHash: '0xborrow',
            indexedBalances: {
                ckb: { amount: 20000, stale: false, outPoint: { txHash: '0xold', index: 0 } },
            },
        });
        expect(settlement.ok).toBe(true);
        expect(settlement.updates.ckb.amount).toBe(16250);
        expect(settlement.outputs.debt_cell.outPoint.txHash.startsWith('0x')).toBe(true);
        expect(settlement.outputs.collateral_locked_cell.amount).toBe(11250);
        expect(Object.keys(settlement.bankUpdates.debtCells).length).toBe(1);
    });

    it('settles full REPAY by consuming debt, releasing collateral, and charging only the fee net', () => {
        const offer = {
            ...BANK_LOAN_OFFERS[0],
            currency: 'ckb',
            totalOwed: loanTotalOwed(BANK_LOAN_OFFERS[0]),
            feeAmount: loanFeeAmount(BANK_LOAN_OFFERS[0]),
        };
        const borrow = buildBankBorrowTransaction({
            walletAccount,
            offer,
            collateral,
            currentEpoch: 14400,
            termEpochs: 42,
        });
        const borrowSettlement = settleBankBorrowFixture({
            tx: borrow,
            txHash: '0xborrow',
            indexedBalances: { ckb: { amount: 20000, stale: false } },
        });
        const loan = {
            id: 'loan-1',
            offerId: offer.id,
            principal: offer.amount,
            feeAmount: offer.feeAmount,
            totalOwed: offer.totalOwed,
            remainingOwed: offer.totalOwed,
            feeBps: offer.feeBps,
            collateralAmount: collateral.amount,
        };
        const repay = buildBankRepayTransaction({
            walletAccount,
            loan,
            debtCell: borrowSettlement.outputs.debt_cell,
            txNonce: 'repay-1',
        });
        const settlement = settleBankRepayFixture({
            tx: repay,
            txHash: '0xrepay',
            indexedBalances: { ckb: { amount: borrowSettlement.updates.ckb.amount, stale: false } },
            bankState: {
                debtCells: borrowSettlement.bankUpdates.debtCells,
                lockedCollateral: borrowSettlement.bankUpdates.lockedCollateral,
            },
        });
        expect(settlement.ok).toBe(true);
        expect(settlement.updates.ckb.amount).toBe(19812.5);
        expect(settlement.bankUpdates.consumedDebtKeys.length).toBe(1);
        expect(settlement.outputs.collateral_unlocked_cell.amount).toBe(11250);
    });
});
