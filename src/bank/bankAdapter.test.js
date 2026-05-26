import { describe, it, expect } from '../test/harness.js';
import { Inventory } from '../core/Inventory.js';
import {
    FixtureCurrencyIndexer,
    LocalCurrencyAdapter,
    ReadOnlyChainCurrencyAdapter,
} from '../economy/currencyAdapter.js';
import { PendingCurrencyDeltaStore, pendingDeltaTotals } from '../economy/pendingCurrencyDeltas.js';
import { fixedPriceSnapshot } from '../mining/cryptoEconomy.js';
import { HouseTreasury } from '../treasury/houseTreasury.js';
import { BankLoanBook } from './bankLoans.js';
import {
    ChainBankAdapter,
    LocalBankAdapter,
    chainBankEnabled,
    chainBankSubmitMode,
} from './bankAdapter.js';

function fakeStorage() {
    const data = new Map();
    return {
        get: key => data.get(key) ?? null,
        set: (key, value) => data.set(key, value),
    };
}

class PendingAdapter extends LocalCurrencyAdapter {
    constructor({ inventory, pendingDeltas }) {
        super({ inventory });
        this.pendingDeltas = pendingDeltas;
    }

    addPendingDelta(delta) {
        const current = this.inventory.get(delta.currency);
        return this.pendingDeltas.add({
            ...delta,
            expectedAmount: current + Number(delta.amount || 0),
        });
    }
}

describe('bank adapters', () => {
    it('keeps local bank behavior behind the local adapter', async () => {
        const inventory = new Inventory();
        const adapter = new LocalBankAdapter({
            loanBook: new BankLoanBook(),
            treasury: new HouseTreasury(),
            priceSnapshot: fixedPriceSnapshot(),
            inventory,
        });
        const borrowed = await adapter.borrow('starter-float');
        expect(borrowed.ok).toBe(true);
        expect(inventory.get('ckb')).toBe(7500);
        expect(adapter.summary().active.remainingOwed).toBe(7687.5);
    });

    it('selects the chain bank only behind the explicit flag', () => {
        expect(chainBankEnabled(new URLSearchParams(''))).toBe(false);
        expect(chainBankEnabled(new URLSearchParams('chainBank=1'))).toBe(true);
        expect(chainBankSubmitMode(new URLSearchParams('chainBankSubmit=ccc-real'))).toBe('ccc-joyid-real');
    });

    it('borrows and repays through chain-shaped fixture txs with pending CKB deltas', async () => {
        const storage = fakeStorage();
        const loanBook = new BankLoanBook();
        const inventory = new Inventory();
        inventory.add('ckb', 20000);
        const pendingDeltas = new PendingCurrencyDeltaStore({ storage, owner: 'local' });
        const inventoryAdapter = new PendingAdapter({ inventory, pendingDeltas });
        const adapter = new ChainBankAdapter({
            storage,
            owner: 'local',
            loanBook,
            treasury: new HouseTreasury(),
            priceSnapshot: fixedPriceSnapshot(),
            inventoryAdapter,
            currentEpoch: () => 14400,
            submit: async tx => ({ ok: true, txHash: `0x${tx.action.padEnd(64, '0')}` }),
        });
        const borrowed = await adapter.borrow('starter-float');
        expect(borrowed.ok).toBe(true);
        expect(borrowed.tx.action).toBe('borrow');
        expect(loanBook.activeLoan().collateralAmount).toBe(11250);
        expect(pendingDeltaTotals(pendingDeltas.list()).ckb).toBe(-3750);
        inventory.add('ckb', 10000);
        const repaid = await adapter.repay('max');
        expect(repaid.ok).toBe(true);
        expect(repaid.tx.action).toBe('repay');
        expect(loanBook.activeLoan()).toBeNull();
        expect(pendingDeltaTotals(pendingDeltas.list()).ckb).toBe(-187.5);
    });

    it('settles chain bank borrow and repay through the fixture collateral state', async () => {
        const storage = fakeStorage();
        const loanBook = new BankLoanBook();
        const pendingDeltas = new PendingCurrencyDeltaStore({ storage, owner: 'ckt1buyer' });
        const indexer = new FixtureCurrencyIndexer({
            balances: { ckb: { amount: 20000, stale: false } },
        });
        const inventoryAdapter = new ReadOnlyChainCurrencyAdapter({
            localInventory: new Inventory(),
            owner: 'ckt1buyer',
            chainCurrencyIds: ['ckb'],
            indexer,
            pendingDeltas,
        });
        await inventoryAdapter.read();
        const adapter = new ChainBankAdapter({
            storage,
            owner: 'ckt1buyer',
            loanBook,
            treasury: new HouseTreasury(),
            priceSnapshot: fixedPriceSnapshot(),
            inventoryAdapter,
            currentEpoch: () => 14400,
            submit: async tx => ({ ok: true, txHash: `0x${tx.action.padEnd(64, '0')}` }),
        });
        const borrowed = await adapter.borrow('starter-float');
        expect(borrowed.ok).toBe(true);
        expect(borrowed.mode).toBe('chain-fixture-settled');
        expect(borrowed.loan.debtCell.outPoint.txHash.startsWith('0x')).toBe(true);
        let snapshot = await inventoryAdapter.read();
        expect(snapshot.pending).toBe(false);
        expect(snapshot.currencies.get('ckb')).toBe(16250);
        expect(Object.keys(indexer.bankState.lockedCollateral).length).toBe(1);

        const repaid = await adapter.repay('max');
        expect(repaid.ok).toBe(true);
        expect(repaid.mode).toBe('chain-fixture-settled');
        snapshot = await inventoryAdapter.read();
        expect(snapshot.pending).toBe(false);
        expect(snapshot.currencies.get('ckb')).toBe(19812.5);
        expect(loanBook.activeLoan()).toBeNull();
        expect(Object.keys(indexer.bankState.lockedCollateral).length).toBe(0);
    });

    it('keeps real CCC bank submits out of fixture settlement', async () => {
        const storage = fakeStorage();
        const loanBook = new BankLoanBook();
        let settled = false;
        const adapter = new ChainBankAdapter({
            storage,
            owner: 'ckt1buyer',
            loanBook,
            treasury: new HouseTreasury(),
            priceSnapshot: fixedPriceSnapshot(),
            inventoryAdapter: {
                async read() {
                    return { currencies: new Map([['ckb', 20000]]) };
                },
                settleBankBorrowTx() {
                    settled = true;
                    return { ok: true };
                },
                addPendingDelta(delta) {
                    this.pending = delta;
                },
            },
            currentEpoch: () => 14400,
            submit: async () => ({ ok: true, mode: 'ccc-joyid-real', txHash: '0xrealbank' }),
        });
        const borrowed = await adapter.borrow('starter-float');
        expect(borrowed.ok).toBe(true);
        expect(borrowed.mode).toBe('chain-ccc-real');
        expect(settled).toBe(false);
        expect(loanBook.activeLoan().borrowTxHash).toBe('0xrealbank');
    });
});
