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
import { BANK_RESERVE_SIGNER_RESPONSE_PROTOCOL } from '../chain/cccJoyId.js';
import { BankLoanBook } from './bankLoans.js';
import {
    ChainBankAdapter,
    LocalBankAdapter,
    chainBankEnabled,
    chainBankSubmitMode,
    makeBankAdapterFromParams,
} from './bankAdapter.js';
import {
    HttpBankInputProvider,
    StaticBankInputProvider,
    createBankInputProviderFromParams,
} from './bankInputProvider.js';

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

const smokeAddress = 'ckt1qyq9xcellshirebanksmoke0000000000000000000';
const smokeBankWitnessHex = '0x62616e6b666c61676765647769746e657373';

function fakeCcc(capture = {}) {
    class FakeTransaction {
        constructor(def) {
            this.inputs = def.inputs || [];
            this.outputs = def.outputs || [];
            this.outputsData = def.outputsData || [];
            this.cellDeps = def.cellDeps || [];
            this.witnesses = def.witnesses || [];
            capture.tx = this;
        }

        static from(def) {
            return new FakeTransaction(def);
        }

        async completeInputsByCapacity() {
            this.completedInputs = true;
        }

        async completeFeeBy() {
            this.completedFee = true;
        }
    }

    class FakeSigner {
        constructor(client, name, logo) {
            this.client = client;
            this.name = name;
            this.logo = logo;
        }

        async connect() {}

        async getRecommendedAddress() {
            return smokeAddress;
        }

        async sendTransaction(tx) {
            capture.sent = tx;
            return '0xbankflaggedsmoke';
        }
    }

    class FakeClient {
        constructor(options) {
            this.options = options;
        }
    }

    return {
        ClientPublicTestnet: FakeClient,
        ClientPublicMainnet: FakeClient,
        JoyId: { CkbSigner: FakeSigner },
        Address: {
            async fromString(addr) {
                return {
                    script: {
                        codeHash: '0xjoy',
                        hashType: 'type',
                        args: addr,
                    },
                };
            },
        },
        Transaction: FakeTransaction,
        fixedPointFrom(value) {
            return `fixed:${value}`;
        },
    };
}

function bankSmokeParams() {
    return new URLSearchParams([
        ['chainBank', '1'],
        ['chainBankCollateral', 'ckb'],
        ['chainBankSubmit', 'ccc-real'],
        ['chainBankInputProviderUrl', 'https://bank.test/borrow-inputs'],
        ['chainBankRepayInputProviderUrl', 'https://bank.test/repay-inputs'],
        ['chainBankReserveSignerUrl', 'https://bank.test/sign'],
        ['chainBankDebtTypeCodeHash', `0x${'1'.repeat(64)}`],
        ['chainBankBookLockCodeHash', `0x${'2'.repeat(64)}`],
        ['chainBankCollateralLockCodeHash', `0x${'3'.repeat(64)}`],
        ['chainBankReserveLockCodeHash', `0x${'4'.repeat(64)}`],
        ['chainBankTreasuryLockCodeHash', `0x${'5'.repeat(64)}`],
    ]);
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

    it('feeds provider-selected bank inputs into chain borrow and repay txs', async () => {
        const storage = fakeStorage();
        const loanBook = new BankLoanBook();
        const submitted = [];
        const provider = new StaticBankInputProvider({
            borrow: {
                bankReserveCell: {
                    outPoint: { txHash: `0x${'1'.repeat(64)}`, index: 0 },
                    amount: 100000,
                },
                collateralCell: {
                    outPoint: { txHash: `0x${'2'.repeat(64)}`, index: 1 },
                    amount: 11250,
                },
            },
            repay: {
                debtCell: {
                    outPoint: { txHash: `0x${'3'.repeat(64)}`, index: 0 },
                },
                lockedCollateralCell: {
                    outPoint: { txHash: `0x${'4'.repeat(64)}`, index: 2 },
                    amount: 11250,
                },
            },
        });
        const adapter = new ChainBankAdapter({
            storage,
            owner: 'ckt1buyer',
            loanBook,
            treasury: new HouseTreasury(),
            priceSnapshot: fixedPriceSnapshot(),
            inventoryAdapter: {
                async read() {
                    return { currencies: new Map([['ckb', 30000]]) };
                },
                addPendingDelta() {},
            },
            currentEpoch: () => 14400,
            bankInputProvider: provider,
            submit: async tx => {
                submitted.push(tx);
                return { ok: true, mode: 'ccc-joyid-real', txHash: `0x${tx.action.padEnd(64, '0')}` };
            },
        });
        const borrowed = await adapter.borrow('starter-float');
        expect(borrowed.ok).toBe(true);
        expect(submitted[0].inputs.bank_reserve_cell.outPoint.txHash).toBe(`0x${'1'.repeat(64)}`);
        expect(submitted[0].inputs.collateral_cell.outPoint.index).toBe(1);
        expect(loanBook.activeLoan().debt.collateralOutpoint.txHash).toBe(`0x${'2'.repeat(64)}`);

        const repaid = await adapter.repay('max');
        expect(repaid.ok).toBe(true);
        expect(submitted[1].inputs.debt_cell.outPoint.txHash).toBe(`0x${'3'.repeat(64)}`);
        expect(submitted[1].inputs.collateral_locked_cell.outPoint.index).toBe(2);
    });

    it('creates a URL-configured bank input provider for flagged smoke flows', async () => {
        const params = new URLSearchParams([
            ['chainBankReserveCellTxHash', `0x${'a'.repeat(64)}`],
            ['chainBankReserveCellIndex', '1'],
            ['chainBankReserveCellCapacityCkb', '50000'],
            ['chainBankDebtCellTxHash', `0x${'b'.repeat(64)}`],
            ['chainBankDebtCellIndex', '0'],
        ]);
        const provider = createBankInputProviderFromParams(params);
        const borrow = await provider.selectBorrowInputs();
        const repay = await provider.selectRepayInputs();
        expect(borrow.bankReserveCell.outPoint.index).toBe(1);
        expect(borrow.bankReserveCell.capacity).toBe(50000);
        expect(repay.debtCell.outPoint.txHash).toBe(`0x${'b'.repeat(64)}`);
    });

    it('selects borrow inputs from an HTTP bank input provider', async () => {
        const calls = [];
        const provider = createBankInputProviderFromParams(new URLSearchParams([
            ['chainBankInputProviderUrl', 'https://bank.test/borrow-inputs'],
            ['chainBankInputProviderToken', 'secret'],
        ]), {
            fetchImpl: async (url, init) => {
                calls.push({ url, init, body: JSON.parse(init.body) });
                return {
                    ok: true,
                    async json() {
                        return {
                            ok: true,
                            protocol: 'cellshire.bank.inputs.response',
                            version: 1,
                            borrow: {
                                bankReserveCell: {
                                    outPoint: { txHash: `0x${'7'.repeat(64)}`, index: 0 },
                                    amount: 100000,
                                },
                                collateralCell: {
                                    outPoint: { txHash: `0x${'8'.repeat(64)}`, index: 1 },
                                    amount: 11250,
                                },
                            },
                        };
                    },
                };
            },
        });
        expect(provider instanceof HttpBankInputProvider).toBe(true);
        const borrow = await provider.selectBorrowInputs({
            walletAccount: { provider: 'joyid', address: 'ckt1buyer', network: 'testnet' },
            offer: { id: 'starter-float', amount: 7500, currency: 'ckb' },
            collateralAmount: 11250,
        });
        expect(calls.length).toBe(1);
        expect(calls[0].init.headers.authorization).toBe('Bearer secret');
        expect(calls[0].body.protocol).toBe('cellshire.bank.inputs.select');
        expect(calls[0].body.walletAccount.address).toBe('ckt1buyer');
        expect(calls[0].body.collateralAmount).toBe(11250);
        expect(borrow.bankReserveCell.outPoint.txHash).toBe(`0x${'7'.repeat(64)}`);
        expect(borrow.collateralCell.outPoint.index).toBe(1);
    });

    it('selects repay inputs from an HTTP bank input provider', async () => {
        const calls = [];
        const provider = createBankInputProviderFromParams(new URLSearchParams([
            ['chainBankRepayInputProviderUrl', 'https://bank.test/repay-inputs'],
            ['chainBankInputProviderToken', 'secret'],
        ]), {
            fetchImpl: async (url, init) => {
                calls.push({ url, init, body: JSON.parse(init.body) });
                return {
                    ok: true,
                    async json() {
                        return {
                            ok: true,
                            protocol: 'cellshire.bank.inputs.response',
                            version: 1,
                            repay: {
                                debtCell: {
                                    outPoint: { txHash: `0x${'9'.repeat(64)}`, index: 0 },
                                },
                                lockedCollateralCell: {
                                    outPoint: { txHash: `0x${'a'.repeat(64)}`, index: 2 },
                                    amount: 11250,
                                },
                            },
                        };
                    },
                };
            },
        });
        const repay = await provider.selectRepayInputs({
            walletAccount: { provider: 'joyid', address: 'ckt1buyer', network: 'testnet' },
            loan: { id: 'loan-1', offerId: 'starter-float', remainingOwed: 7687.5 },
        });
        expect(calls.length).toBe(1);
        expect(calls[0].url).toBe('https://bank.test/repay-inputs');
        expect(calls[0].init.headers.authorization).toBe('Bearer secret');
        expect(calls[0].body.action).toBe('repay');
        expect(calls[0].body.loan.id).toBe('loan-1');
        expect(repay.debtCell.outPoint.txHash).toBe(`0x${'9'.repeat(64)}`);
        expect(repay.lockedCollateralCell.outPoint.index).toBe(2);
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

    it('runs the flagged ccc-real bank borrow smoke path from URL params', async () => {
        const storage = fakeStorage();
        const loanBook = new BankLoanBook();
        const capture = {};
        const inputCalls = [];
        const repayInputCalls = [];
        const signCalls = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (url, init) => {
            const body = JSON.parse(init.body);
            if (url === 'https://bank.test/borrow-inputs') {
                inputCalls.push({ url, init, body });
                return {
                    ok: true,
                    async json() {
                        return {
                            ok: true,
                            protocol: 'cellshire.bank.inputs.response',
                            version: 1,
                            borrow: {
                                bankReserveCell: {
                                    outPoint: { txHash: `0x${'7'.repeat(64)}`, index: 0 },
                                    amount: 100000,
                                },
                                collateralCell: {
                                    outPoint: { txHash: `0x${'8'.repeat(64)}`, index: 1 },
                                    amount: 11250,
                                },
                            },
                        };
                    },
                };
            }
            if (url === 'https://bank.test/repay-inputs') {
                repayInputCalls.push({ url, init, body });
                return {
                    ok: true,
                    async json() {
                        return {
                            ok: true,
                            protocol: 'cellshire.bank.inputs.response',
                            version: 1,
                            repay: {
                                debtCell: {
                                    outPoint: { txHash: `0x${'9'.repeat(64)}`, index: 0 },
                                },
                                lockedCollateralCell: {
                                    outPoint: { txHash: `0x${'a'.repeat(64)}`, index: 2 },
                                    amount: 11250,
                                },
                            },
                        };
                    },
                };
            }
            signCalls.push({ url, init, body });
            return {
                ok: true,
                async json() {
                    return {
                        ok: true,
                        protocol: BANK_RESERVE_SIGNER_RESPONSE_PROTOCOL,
                        version: 1,
                        bankWitness: smokeBankWitnessHex,
                    };
                },
            };
        };

        try {
            const adapter = makeBankAdapterFromParams({
                params: bankSmokeParams(),
                storage,
                owner: smokeAddress,
                loanBook,
                treasury: new HouseTreasury(),
                priceSnapshot: fixedPriceSnapshot(),
                inventoryAdapter: {
                    async read() {
                        return { currencies: new Map([['ckb', 30000]]) };
                    },
                    settleBankBorrowTx() {
                        throw new Error('ccc-real smoke must not fixture-settle');
                    },
                    addPendingDelta(delta) {
                        this.pending = delta;
                    },
                },
                currentEpoch: () => 14400,
                location: { href: 'http://127.0.0.1:8766/' },
                fetchImpl: globalThis.fetch,
                importModule: async () => fakeCcc(capture),
            });

            const borrowed = await adapter.borrow('starter-float');
            expect(borrowed.ok).toBe(true);
            expect(borrowed.mode).toBe('chain-ccc-real');
            expect(inputCalls.length).toBe(1);
            expect(inputCalls[0].body.action).toBe('borrow');
            expect(signCalls.length).toBe(1);
            expect(signCalls[0].url).toBe('https://bank.test/sign');
            expect(signCalls[0].body.protocol).toBe('cellshire.bank.reserve-sign');
            expect(signCalls[0].body.tx.inputs.length).toBe(2);
            expect(signCalls[0].body.tx.inputs[0].previousOutput.txHash).toBe(`0x${'7'.repeat(64)}`);
            expect(signCalls[0].body.script_config.complete).toBe(true);
            expect(capture.sent.witnesses[capture.sent.witnesses.length - 1]).toBe(smokeBankWitnessHex);
            expect(loanBook.activeLoan().borrowTxHash).toBe('0xbankflaggedsmoke');

            const repaid = await adapter.repay('max');
            expect(repaid.ok).toBe(true);
            expect(repaid.mode).toBe('chain-ccc-real');
            expect(repayInputCalls.length).toBe(1);
            expect(repayInputCalls[0].body.action).toBe('repay');
            expect(capture.sent.inputs[0].previousOutput.txHash).toBe(`0x${'9'.repeat(64)}`);
            expect(capture.sent.inputs[1].previousOutput.index).toBe(2);
            expect(loanBook.activeLoan()).toBeNull();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
