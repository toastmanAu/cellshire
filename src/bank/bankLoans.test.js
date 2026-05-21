import { describe, it, expect } from '../test/harness.js';
import { Inventory } from '../core/Inventory.js';
import { fixedPriceSnapshot } from '../mining/cryptoEconomy.js';
import { HouseTreasury } from '../treasury/houseTreasury.js';
import {
    BANK_LOANS_STORAGE_KEY,
    BankLoanBook,
    availableBankLoanOffers,
    bankLoanSummary,
    borrowBankLoan,
    loadBankLoanBook,
    repayBankLoan,
    saveBankLoanBook,
} from './bankLoans.js';

function fakeStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        get: key => data.get(key) ?? null,
        set: (key, value) => data.set(key, value),
    };
}

describe('bank loans', () => {
    it('builds tunable CKB loan offers from available reserve', () => {
        const offers = availableBankLoanOffers({
            treasury: new HouseTreasury(),
            loanBook: new BankLoanBook(),
            priceSnapshot: fixedPriceSnapshot(),
        });
        expect(offers.length).toBe(3);
        expect(offers[0].currency).toBe('ckb');
        expect(offers[0].amount).toBe(5000);
        expect(offers[0].totalOwed).toBe(5150);
        expect(offers[0].enabled).toBe(true);
    });

    it('borrows one active loan at a time and credits local CKB', () => {
        const loanBook = new BankLoanBook();
        const inventory = new Inventory();
        const result = borrowBankLoan({
            offerId: 'starter-float',
            loanBook,
            inventory,
            treasury: new HouseTreasury(),
            priceSnapshot: fixedPriceSnapshot(),
            now: () => 1000,
        });
        expect(result.ok).toBe(true);
        expect(inventory.get('ckb')).toBe(5000);
        expect(loanBook.activeLoan().remainingOwed).toBe(5150);
        expect(borrowBankLoan({
            offerId: 'builder-credit',
            loanBook,
            inventory,
            treasury: new HouseTreasury(),
            priceSnapshot: fixedPriceSnapshot(),
        }).reason).toBe('active-loan');
    });

    it('repays loans partially and then marks them paid', () => {
        const loanBook = new BankLoanBook();
        const inventory = new Inventory();
        borrowBankLoan({
            offerId: 'starter-float',
            loanBook,
            inventory,
            treasury: new HouseTreasury(),
            priceSnapshot: fixedPriceSnapshot(),
            now: () => 1000,
        });
        inventory.add('ckb', 1000);
        const part = repayBankLoan({ loanBook, inventory, amount: 150 });
        expect(part.ok).toBe(true);
        expect(part.loan.remainingOwed).toBe(5000);
        expect(part.loan.status).toBe('active');
        const paid = repayBankLoan({ loanBook, inventory, amount: 'max' });
        expect(paid.ok).toBe(true);
        expect(paid.paid).toBe(true);
        expect(loanBook.activeLoan()).toBeNull();
    });

    it('rejects repayment when CKB balance is short', () => {
        const loanBook = new BankLoanBook();
        const inventory = new Inventory();
        borrowBankLoan({
            offerId: 'starter-float',
            loanBook,
            inventory,
            treasury: new HouseTreasury(),
            priceSnapshot: fixedPriceSnapshot(),
        });
        const result = repayBankLoan({ loanBook, inventory, amount: 'max' });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('insufficient-funds');
        expect(result.loan.remainingOwed).toBe(5150);
    });

    it('persists and summarizes loan state', () => {
        const storage = fakeStorage();
        const loanBook = new BankLoanBook();
        const inventory = new Inventory();
        borrowBankLoan({
            offerId: 'builder-credit',
            loanBook,
            inventory,
            treasury: new HouseTreasury(),
            priceSnapshot: fixedPriceSnapshot(),
            now: () => 2000,
        });
        expect(saveBankLoanBook(storage, loanBook)).toBe(true);
        const loaded = loadBankLoanBook(storage);
        expect(storage.get(BANK_LOANS_STORAGE_KEY) !== null).toBe(true);
        expect(loaded.activeLoan().principal).toBe(15000);
        expect(bankLoanSummary({
            loanBook: loaded,
            treasury: new HouseTreasury(),
            priceSnapshot: fixedPriceSnapshot(),
        }).detail).toBe('15450.00 CKB due');
    });
});
