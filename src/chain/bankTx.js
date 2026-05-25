import {
    collateralLockArgs,
    makeDebtCell,
    ownerLockHash,
} from './debtCell.js';

export function buildBankBorrowTransaction({
    walletAccount,
    offer,
    collateral,
    currentEpoch = 0,
    termEpochs = 42,
    txNonce = 'bank-borrow',
} = {}) {
    if (!walletAccount?.address) throw new Error('wallet account required');
    if (!offer?.id || !Number.isFinite(Number(offer.amount))) throw new Error('loan offer required');
    if (!collateral?.outpoint || collateral.kind !== 'ckb') throw new Error('ckb collateral required');
    const beneficiaryLockHash = ownerLockHash(walletAccount.address);
    const debt = {
        beneficiaryLockHash,
        principal: Number(offer.amount),
        fee: Number(offer.feeAmount ?? (offer.totalOwed - offer.amount)),
        dueEpoch: Math.max(0, Math.floor(Number(currentEpoch) || 0)) + termEpochs,
        collateralKind: 'ckb',
        collateralOutpoint: collateral.outpoint,
        issuedAtEpoch: Math.max(0, Math.floor(Number(currentEpoch) || 0)),
        offerId: offer.id,
    };
    const debtCell = makeDebtCell(debt);
    return {
        version: 1,
        kind: 'cellshire_bank_loan_tx',
        network: walletAccount.network || 'testnet',
        tx_nonce: txNonce,
        action: 'borrow',
        inputs: {
            bank_reserve_cell: {
                currency: 'ckb',
                amount: offer.amount,
            },
            player_funding_lock: walletAccount.address,
            collateral_cell: {
                kind: 'ckb',
                amount: collateral.amount,
                outpoint: collateral.outpoint,
                owner: walletAccount.address,
            },
        },
        outputs: {
            player_ckb_cell: {
                owner: walletAccount.address,
                amount: offer.amount,
            },
            debt_cell: debtCell,
            collateral_locked_cell: {
                kind: 'ckb',
                amount: collateral.amount,
                outpoint: collateral.outpoint,
                lock: {
                    codeHash: `0x${'a'.repeat(64)}`,
                    hashType: 'type',
                    args: collateralLockArgs({ ownerLockHash: beneficiaryLockHash }),
                },
            },
            bank_reserve_change: {
                owner: 'cellshire-bank',
                currency: 'ckb',
            },
        },
        witness: {
            provider: walletAccount.provider || 'prototype',
            address: walletAccount.address,
            signature: 'pending',
            bank_receipt: {
                action: 'borrow',
                offer_id: offer.id,
                principal: offer.amount,
                fee: debt.fee,
                total_owed: offer.totalOwed,
                collateral_kind: 'ckb',
                collateral_amount: collateral.amount,
                due_epoch: debt.dueEpoch,
                tx_nonce: txNonce,
            },
        },
    };
}

export function buildBankRepayTransaction({
    walletAccount,
    loan,
    debtCell,
    txNonce = 'bank-repay',
} = {}) {
    if (!walletAccount?.address) throw new Error('wallet account required');
    if (!loan?.id) throw new Error('loan required');
    if (!debtCell?.debt) throw new Error('debt cell required');
    const payment = Number(loan.remainingOwed ?? loan.totalOwed);
    const principal = Number(loan.principal);
    const fee = Number(loan.feeAmount);
    return {
        version: 1,
        kind: 'cellshire_bank_loan_tx',
        network: walletAccount.network || 'testnet',
        tx_nonce: txNonce,
        action: 'repay',
        inputs: {
            debt_cell: debtCell,
            player_ckb_cell: {
                owner: walletAccount.address,
                amount: payment,
            },
            collateral_locked_cell: {
                kind: debtCell.debt.collateralKind,
                outpoint: debtCell.debt.collateralOutpoint,
                amount: loan.collateralAmount,
            },
        },
        outputs: {
            collateral_unlocked_cell: {
                kind: debtCell.debt.collateralKind,
                owner: walletAccount.address,
                amount: loan.collateralAmount,
                original_outpoint: debtCell.debt.collateralOutpoint,
            },
            bank_reserve_cell: {
                owner: 'cellshire-bank',
                currency: 'ckb',
                amount: principal,
            },
            treasury_fee_receipt: {
                currency: 'ckb',
                amount: fee,
                fee_bps: loan.feeBps,
            },
            player_change_lock: walletAccount.address,
        },
        witness: {
            provider: walletAccount.provider || 'prototype',
            address: walletAccount.address,
            signature: 'pending',
            bank_receipt: {
                action: 'repay',
                loan_id: loan.id,
                offer_id: loan.offerId,
                payment,
                principal,
                fee,
                collateral_amount: loan.collateralAmount,
                tx_nonce: txNonce,
            },
        },
    };
}
