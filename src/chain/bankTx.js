import {
    collateralLockArgs,
    makeDebtCell,
    ownerLockHash,
} from './debtCell.js';
import { amountToBaseUnits, baseUnitsToAmount } from './udtBalance.js';

export function buildBankBorrowTransaction({
    walletAccount,
    offer,
    collateral,
    bankReserveCell = null,
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
            bank_reserve_cell: normalizeBankTxCell(bankReserveCell, {
                currency: 'ckb',
                amount: offer.amount,
            }),
            player_funding_lock: walletAccount.address,
            collateral_cell: normalizeBankTxCell(collateral.cell, {
                kind: 'ckb',
                amount: collateral.amount,
                outpoint: collateral.outpoint,
                outPoint: collateral.outpoint,
                owner: walletAccount.address,
            }),
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
    lockedCollateralCell = null,
    playerPaymentCell = null,
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
            debt_cell: normalizeBankTxCell(debtCell, debtCell),
            player_ckb_cell: normalizeBankTxCell(playerPaymentCell, {
                owner: walletAccount.address,
                amount: payment,
            }),
            collateral_locked_cell: normalizeBankTxCell(lockedCollateralCell, {
                kind: debtCell.debt.collateralKind,
                outpoint: debtCell.debt.collateralOutpoint,
                outPoint: debtCell.debt.collateralOutpoint,
                amount: loan.collateralAmount,
            }),
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

export function settleBankBorrowFixture({
    tx,
    indexedBalances = {},
    txHash = null,
} = {}) {
    if (tx?.kind !== 'cellshire_bank_loan_tx' || tx.action !== 'borrow') {
        return { ok: false, reason: 'invalid-bank-borrow-tx' };
    }
    const receipt = tx.witness?.bank_receipt;
    const owner = tx.witness?.address ?? tx.inputs?.collateral_cell?.owner ?? null;
    const principalUnits = amountToBaseUnits(receipt?.principal);
    const collateralUnits = amountToBaseUnits(receipt?.collateral_amount);
    if (!owner || principalUnits <= 0n || collateralUnits <= 0n) {
        return { ok: false, reason: 'invalid-bank-borrow' };
    }

    const before = normalizedBalanceAmount(indexedBalances.ckb);
    const beforeUnits = amountToBaseUnits(before);
    if (beforeUnits < collateralUnits) {
        return {
            ok: false,
            reason: 'insufficient-collateral',
            balance: before,
            required: receipt.collateral_amount,
        };
    }

    const afterUnits = beforeUnits - collateralUnits + principalUnits;
    const after = baseUnitsToAmount(afterUnits);
    const ckbOutPoint = afterUnits > 0n ? fixtureOutPoint(txHash, 'ckb', 'bank-borrow') : null;
    const debtOutPoint = fixtureOutPoint(txHash, 'debt', 'bank');
    const lockedCollateralOutPoint = fixtureOutPoint(txHash, 'collateral', 'bank');
    const debtCell = {
        ...tx.outputs.debt_cell,
        outPoint: debtOutPoint,
    };
    const lockedCollateral = {
        ...tx.outputs.collateral_locked_cell,
        owner,
        outPoint: lockedCollateralOutPoint,
        originalOutPoint: tx.inputs?.collateral_cell?.outpoint ?? null,
        debtOutPoint,
    };

    return {
        ok: true,
        mode: 'fixture-settlement',
        txHash,
        owner,
        debtKey: collateralKey(tx.outputs.debt_cell?.debt?.collateralOutpoint),
        inputs: {
            bank_reserve_cell: tx.inputs?.bank_reserve_cell ?? null,
            collateral_cell: {
                ...tx.inputs?.collateral_cell,
                amount: receipt.collateral_amount,
            },
            player_ckb_cell: {
                owner,
                currency: 'ckb',
                amount: before,
                outPoint: indexedBalances.ckb?.outPoint ?? null,
            },
        },
        outputs: {
            player_ckb_cell: tx.outputs?.player_ckb_cell ?? null,
            debt_cell: debtCell,
            collateral_locked_cell: lockedCollateral,
            bank_reserve_change: tx.outputs?.bank_reserve_change ?? null,
        },
        updates: {
            ckb: {
                owner,
                currency: 'ckb',
                amount: after,
                stale: false,
                outPoint: ckbOutPoint,
                spent: afterUnits === 0n,
            },
        },
        bankUpdates: {
            debtCells: {
                [collateralKey(debtCell.debt?.collateralOutpoint)]: debtCell,
            },
            lockedCollateral: {
                [collateralKey(debtCell.debt?.collateralOutpoint)]: lockedCollateral,
            },
        },
    };
}

export function settleBankRepayFixture({
    tx,
    indexedBalances = {},
    bankState = null,
    txHash = null,
} = {}) {
    if (tx?.kind !== 'cellshire_bank_loan_tx' || tx.action !== 'repay') {
        return { ok: false, reason: 'invalid-bank-repay-tx' };
    }
    const debt = tx.inputs?.debt_cell?.debt;
    const receipt = tx.witness?.bank_receipt;
    const owner = tx.witness?.address ?? tx.inputs?.player_ckb_cell?.owner ?? null;
    const key = collateralKey(debt?.collateralOutpoint);
    if (!owner || !debt || !key) return { ok: false, reason: 'invalid-bank-repay' };

    const storedDebt = bankState?.debtCells?.[key] ?? null;
    const storedCollateral = bankState?.lockedCollateral?.[key] ?? null;
    if (bankState && (!storedDebt || !storedCollateral)) {
        return { ok: false, reason: 'locked-collateral-missing' };
    }

    const paymentUnits = amountToBaseUnits(receipt?.payment);
    const owedUnits = amountToBaseUnits((Number(debt.principal) || 0) + (Number(debt.fee) || 0));
    if (paymentUnits <= 0n || paymentUnits !== owedUnits) {
        return {
            ok: false,
            reason: 'full-repayment-required',
            payment: receipt?.payment,
            required: baseUnitsToAmount(owedUnits),
        };
    }

    const before = normalizedBalanceAmount(indexedBalances.ckb);
    const beforeUnits = amountToBaseUnits(before);
    if (beforeUnits < paymentUnits) {
        return {
            ok: false,
            reason: 'insufficient-funds',
            balance: before,
            required: receipt.payment,
        };
    }

    const collateralUnits = amountToBaseUnits(receipt.collateral_amount);
    const afterUnits = beforeUnits - paymentUnits + collateralUnits;
    const after = baseUnitsToAmount(afterUnits);
    const ckbOutPoint = afterUnits > 0n ? fixtureOutPoint(txHash, 'ckb', 'bank-repay') : null;
    return {
        ok: true,
        mode: 'fixture-settlement',
        txHash,
        owner,
        debtKey: key,
        inputs: {
            debt_cell: storedDebt ?? tx.inputs.debt_cell,
            player_ckb_cell: {
                owner,
                currency: 'ckb',
                amount: before,
                outPoint: indexedBalances.ckb?.outPoint ?? null,
            },
            collateral_locked_cell: storedCollateral ?? tx.inputs.collateral_locked_cell,
        },
        outputs: {
            collateral_unlocked_cell: {
                ...tx.outputs.collateral_unlocked_cell,
                outPoint: fixtureOutPoint(txHash, 'collateral-release', 'bank'),
            },
            bank_reserve_cell: tx.outputs.bank_reserve_cell,
            treasury_fee_receipt: tx.outputs.treasury_fee_receipt,
            player_change_lock: tx.outputs.player_change_lock,
        },
        updates: {
            ckb: {
                owner,
                currency: 'ckb',
                amount: after,
                stale: false,
                outPoint: ckbOutPoint,
                spent: afterUnits === 0n,
            },
        },
        bankUpdates: {
            consumedDebtKeys: [key],
            releasedCollateral: {
                [key]: tx.outputs.collateral_unlocked_cell,
            },
        },
    };
}

export function bankDebtKeyFromDebtCell(debtCell) {
    return collateralKey(debtCell?.debt?.collateralOutpoint);
}

function normalizedBalanceAmount(entry) {
    if (typeof entry === 'number') return entry;
    return Number(entry?.amount ?? 0) || 0;
}

function normalizeBankTxCell(cell, fallback) {
    const source = cell && typeof cell === 'object' ? cell : {};
    const base = fallback && typeof fallback === 'object' ? fallback : {};
    const outPoint = normalizeOutPoint(source.outPoint ?? source.outpoint ?? source.previousOutput)
        ?? normalizeOutPoint(base.outPoint ?? base.outpoint ?? base.previousOutput);
    const out = {
        ...base,
        ...source,
    };
    if (outPoint) {
        out.outPoint = outPoint;
        out.outpoint = outPoint;
    }
    return out;
}

function normalizeOutPoint(value) {
    if (!value || typeof value !== 'object') return null;
    const txHash = typeof value.txHash === 'string'
        ? value.txHash
        : typeof value.tx_hash === 'string'
            ? value.tx_hash
            : null;
    const body = txHash?.startsWith?.('0x') ? txHash.slice(2) : txHash;
    const index = Math.floor(Number(value.index));
    if (!/^[0-9a-f]{64}$/i.test(body || '') || !Number.isFinite(index) || index < 0) return null;
    return { txHash: `0x${body.toLowerCase()}`, index };
}

function collateralKey(outpoint) {
    if (!outpoint?.txHash || !Number.isFinite(Number(outpoint.index))) return null;
    return `${String(outpoint.txHash).toLowerCase()}:${Math.floor(Number(outpoint.index))}`;
}

function fixtureOutPoint(txHash, role, namespace) {
    const raw = `${txHash || 'fixture'}:${namespace}:${role}`;
    let hex = '';
    for (let i = 0; i < raw.length && hex.length < 64; i++) {
        hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return {
        txHash: `0x${hex.padEnd(64, '0')}`,
        index: role.length % 4,
    };
}
