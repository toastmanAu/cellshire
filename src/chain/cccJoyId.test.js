import { describe, it, expect } from '../test/harness.js';
import {
    BANK_RESERVE_SIGNER_RESPONSE_PROTOCOL,
    bankLoanReceiptPayload,
    buildCccBankCollateralTransaction,
    buildCccBankLoanTransaction,
    buildCccMarketplacePurchaseTransaction,
    buildCccStorePurchaseTransaction,
    buildCccTraderSwapTransaction,
    buildCccPropertySnapshotTransaction,
    buildCccMiningTransaction,
    cccBankScriptConfigIssues,
    cccJoyIdEnabled,
    cccJoyIdMiningEnabled,
    classifyCccJoyIdError,
    connectCccJoyId,
    createHttpBankReserveSigner,
    marketplacePurchaseReceiptPayload,
    miningReceiptPayload,
    normalizeBankReserveSignerResponse,
    propertySnapshotReceiptPayload,
    resolveCccBankReserveSignerConfig,
    resolveCccBankScriptConfig,
    resolveCccJoyIdConfig,
    submitCccJoyIdBankLoanTx,
    submitCccJoyIdMarketplacePurchaseTx,
    submitCccJoyIdStorePurchaseTx,
    submitCccJoyIdTraderSwapTx,
    submitCccJoyIdPropertySnapshotTx,
    submitCccJoyIdMiningTx,
    storePurchaseReceiptPayload,
    traderSwapReceiptPayload,
} from './cccJoyId.js';
import { BANK_LOAN_OFFERS, loanFeeAmount, loanTotalOwed } from '../bank/bankLoans.js';
import { buildPropertySnapshotPayload } from '../property/propertySnapshotWriter.js';
import { createStarterPropertyMap } from '../property/propertyZone.js';
import {
    buildBankBorrowTransaction,
    buildBankRepayTransaction,
} from './bankTx.js';
import { buildMarketplacePurchaseTransaction } from './marketplacePurchaseTx.js';
import { buildPropertySnapshotTransaction } from './propertySnapshotTx.js';
import { buildStorePurchaseTransaction } from './storePurchaseTx.js';
import { buildTraderSwapTransaction } from './traderSwapTx.js';
import { generalStoreItem } from '../store/generalStoreCatalog.js';
import { loadMarketplaceState, marketplaceListings } from '../marketplace/playerMarketplace.js';

const address = 'ckt1qyq9xcellshirejoyidreal00000000000000000000';
const bankWitnessHex = '0x62616e6b726573657276657769746e657373';
const bankExtraWitnessHex = '0x62616e6b6578747261';

function expectThrows(fn) {
    let threw = false;
    try {
        fn();
    } catch {
        threw = true;
    }
    expect(threw).toBe(true);
}

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
            capture.signer = this;
        }

        async connect() {
            this.connected = true;
        }

        async getRecommendedAddress() {
            return address;
        }

        async sendTransaction(tx) {
            capture.sent = tx;
            return '0xrealhash';
        }
    }

    class FakeClient {
        constructor(options) {
            this.options = options;
            capture.client = this;
        }
    }

    return {
        ClientPublicTestnet: FakeClient,
        ClientPublicMainnet: FakeClient,
        JoyId: { CkbSigner: FakeSigner },
        Address: {
            async fromString(addr, client) {
                capture.address = { addr, client };
                return {
                    script: {
                        codeHash: '0xjoy',
                        hashType: 'type',
                        args: '0x01',
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

function miningTx() {
    return {
        action: 'mine',
        tx_nonce: 'nonce-1',
        inputs: {
            ore_cell: {
                ore_id: 'ore:mine:14455:5:7:coal_seam',
                map_id: 'mine:14455',
                epoch: '14455',
                gx: 5,
                gy: 7,
                ore_type: 'coal_seam',
                capacity_remaining: 3,
            },
        },
        outputs: {
            ore_cell: { capacity_remaining: 2 },
            yield_cell: {
                currency: 'zec',
                amount: 0.00190934,
                source_ore_type: 'coal_seam',
            },
        },
        witness: {
            address,
        },
    };
}

function lazyBirthMiningTx() {
    return {
        action: 'birth',
        tx_nonce: 'birth-1',
        inputs: {
            ore_cell: null,
        },
        outputs: {
            ore_cell: {
                ore_id: 'ore:mine:14455:5:7:coal_seam',
                map_id: 'mine:14455',
                epoch: '14455',
                gx: 5,
                gy: 7,
                ore_type: 'coal_seam',
                capacity_remaining: 2,
                capacity_max: 3,
            },
            yield_cell: {
                currency: 'zec',
                amount: 0.00190934,
                source_ore_type: 'coal_seam',
            },
        },
        witness: {
            address,
            mining_receipt: {
                ore_id: 'ore:mine:14455:5:7:coal_seam',
                map_id: 'mine:14455',
                epoch: '14455',
                gx: 5,
                gy: 7,
                ore_type: 'coal_seam',
                mined_capacity_before: 3,
                mined_capacity_after: 2,
            },
        },
    };
}

function propertySnapshotTx() {
    return buildPropertySnapshotTransaction({
        walletAccount: {
            provider: 'joyid',
            address,
        },
        snapshot: buildPropertySnapshotPayload({
            ownerId: address,
            tileMap: createStarterPropertyMap(),
            propertyTier: 2,
            savedAt: 123,
        }),
        txNonce: 'property-1',
        blockNumber: 4,
    });
}

function bankBorrowTx() {
    const offer = {
        ...BANK_LOAN_OFFERS[0],
        currency: 'ckb',
        totalOwed: loanTotalOwed(BANK_LOAN_OFFERS[0]),
        feeAmount: loanFeeAmount(BANK_LOAN_OFFERS[0]),
    };
    return buildBankBorrowTransaction({
        walletAccount: {
            provider: 'joyid',
            address,
        },
        offer,
        collateral: {
            kind: 'ckb',
            amount: 11250,
            outpoint: {
                txHash: `0x${'3'.repeat(64)}`,
                index: 0,
            },
        },
        currentEpoch: 14400,
        txNonce: 'bank-borrow-1',
    });
}

function bankBorrowTxWithInputs() {
    const offer = {
        ...BANK_LOAN_OFFERS[0],
        currency: 'ckb',
        totalOwed: loanTotalOwed(BANK_LOAN_OFFERS[0]),
        feeAmount: loanFeeAmount(BANK_LOAN_OFFERS[0]),
    };
    return buildBankBorrowTransaction({
        walletAccount: {
            provider: 'joyid',
            address,
        },
        offer,
        collateral: {
            kind: 'ckb',
            amount: 11250,
            outpoint: {
                txHash: `0x${'8'.repeat(64)}`,
                index: 1,
            },
            cell: {
                outPoint: {
                    txHash: `0x${'8'.repeat(64)}`,
                    index: 1,
                },
                amount: 11250,
            },
        },
        bankReserveCell: {
            outPoint: {
                txHash: `0x${'7'.repeat(64)}`,
                index: 0,
            },
            amount: 100000,
        },
        currentEpoch: 14400,
        txNonce: 'bank-borrow-inputs-1',
    });
}

function bankRepayTx() {
    const borrow = bankBorrowTx();
    return buildBankRepayTransaction({
        walletAccount: {
            provider: 'joyid',
            address,
        },
        loan: {
            id: 'loan-1',
            offerId: 'starter-float',
            principal: 7500,
            feeAmount: 187.5,
            totalOwed: 7687.5,
            remainingOwed: 7687.5,
            feeBps: 250,
            collateralAmount: 11250,
        },
        debtCell: borrow.outputs.debt_cell,
        txNonce: 'bank-repay-1',
    });
}

function bankRepayTxWithInputs() {
    const repay = bankRepayTx();
    return buildBankRepayTransaction({
        walletAccount: {
            provider: 'joyid',
            address,
        },
        loan: {
            id: 'loan-1',
            offerId: 'starter-float',
            principal: 7500,
            feeAmount: 187.5,
            totalOwed: 7687.5,
            remainingOwed: 7687.5,
            feeBps: 250,
            collateralAmount: 11250,
        },
        debtCell: {
            ...repay.inputs.debt_cell,
            outPoint: { txHash: `0x${'9'.repeat(64)}`, index: 0 },
        },
        lockedCollateralCell: {
            ...repay.inputs.collateral_locked_cell,
            outPoint: { txHash: `0x${'a'.repeat(64)}`, index: 2 },
        },
        txNonce: 'bank-repay-inputs-1',
    });
}

function bankScriptParams() {
    return new URLSearchParams([
        ['chainBankDebtTypeCodeHash', `0x${'1'.repeat(64)}`],
        ['chainBankBookLockCodeHash', `0x${'2'.repeat(64)}`],
        ['chainBankBookLockArgs', '0x1234'],
        ['chainBankCollateralLockCodeHash', `0x${'3'.repeat(64)}`],
        ['chainBankReserveLockCodeHash', `0x${'4'.repeat(64)}`],
        ['chainBankTreasuryLockCodeHash', `0x${'5'.repeat(64)}`],
        ['chainBankDebtTypeDepTxHash', `0x${'6'.repeat(64)}`],
        ['chainBankDebtTypeDepIndex', '1'],
    ]);
}

function productionBankScriptParams() {
    return new URLSearchParams([
        ['chainBankScriptMode', 'production'],
        ['chainBankDebtTypeCodeHash', `0x${'a'.repeat(64)}`],
        ['chainBankBookLockCodeHash', `0x${'b'.repeat(64)}`],
        ['chainBankBookLockArgs', '0xabcd'],
        ['chainBankCollateralLockCodeHash', `0x${'c'.repeat(64)}`],
        ['chainBankReserveLockCodeHash', `0x${'d'.repeat(64)}`],
        ['chainBankTreasuryLockCodeHash', `0x${'e'.repeat(64)}`],
        ['chainBankDebtTypeDepTxHash', `0x${'f'.repeat(64)}`],
        ['chainBankDebtTypeDepIndex', '0'],
    ]);
}

function traderSwapTx() {
    return buildTraderSwapTransaction({
        walletAccount: {
            provider: 'joyid',
            address,
            network: 'testnet',
        },
        quote: {
            ok: true,
            fromCurrency: 'bch',
            fromAmount: 0.1,
            toCurrency: 'zec',
            toAmount: 0.03818112,
            rate: 0.3818112,
            feeBps: 200,
            feeUsd: 1.12,
            grossUsd: 56,
            netUsd: 54.88,
        },
        txNonce: 'trader-swap-1',
    });
}

function storePurchaseTx() {
    return buildStorePurchaseTransaction({
        walletAccount: {
            provider: 'joyid',
            address,
            network: 'testnet',
        },
        item: generalStoreItem('blue_railing'),
        txNonce: 'store-purchase-1',
    });
}

function marketplacePurchaseTx() {
    const state = loadMarketplaceState({ get: () => null });
    const listing = marketplaceListings(state).find(item => item.assetId === 'olive');
    return buildMarketplacePurchaseTransaction({
        walletAccount: {
            provider: 'joyid',
            address,
            network: 'testnet',
        },
        listing,
        txNonce: 'marketplace-purchase-1',
    });
}

describe('CCC JoyID flags', () => {
    it('enables wallet and mining submit modes through explicit flags', () => {
        expect(cccJoyIdEnabled(new URLSearchParams('wallet=joyid'))).toBe(true);
        expect(cccJoyIdEnabled(new URLSearchParams('wallet=1'))).toBe(false);
        expect(cccJoyIdMiningEnabled(new URLSearchParams('chainMiningSubmit=ccc'))).toBe(true);
        expect(cccJoyIdMiningEnabled(new URLSearchParams('chainMiningReal=1'))).toBe(true);
    });

    it('resolves testnet config without requiring browser globals', () => {
        const config = resolveCccJoyIdConfig({
            params: new URLSearchParams('node=https%3A%2F%2Fexample.test'),
            location: { href: 'https://cellshire.test/play/' },
            now: () => 123,
        });
        expect(config.network).toBe('testnet');
        expect(config.rpcURL).toBe('https://example.test');
        expect(config.connectedAt).toBe(123);
        expect(config.logo).toBe('https://cellshire.test/assets/cellshire_logo.png');
    });

    it('resolves real bank script config from URL params', () => {
        const config = resolveCccBankScriptConfig({ params: bankScriptParams() });
        expect(config.complete).toBe(true);
        expect(config.production).toBe(false);
        expect(config.issues.length).toBe(0);
        expect(config.debtType.codeHash).toBe(`0x${'1'.repeat(64)}`);
        expect(config.bankBookLock.args).toBe('0x1234');
        expect(config.cellDeps.length).toBe(1);
        expect(config.cellDeps[0].outPoint.index).toBe(1);
    });

    it('flags smoke placeholder hashes when production bank scripts are required', () => {
        const placeholderParams = bankScriptParams();
        placeholderParams.set('chainBankScriptMode', 'production');
        const placeholderConfig = resolveCccBankScriptConfig({ params: placeholderParams });
        expect(placeholderConfig.production).toBe(true);
        expect(placeholderConfig.issues.includes('bank-script-placeholder-code-hash')).toBe(true);

        const productionConfig = resolveCccBankScriptConfig({ params: productionBankScriptParams() });
        expect(productionConfig.production).toBe(true);
        expect(cccBankScriptConfigIssues(productionConfig).length).toBe(0);
    });

    it('resolves the optional bank reserve signer endpoint from URL params', () => {
        const config = resolveCccBankReserveSignerConfig({
            params: new URLSearchParams('chainBankReserveSignerUrl=https%3A%2F%2Fbank.test%2Fsign&chainBankReserveSignerToken=secret'),
        });
        expect(config.enabled).toBe(true);
        expect(config.url).toBe('https://bank.test/sign');
        expect(config.token).toBe('secret');
    });

    it('validates the bank reserve signer response contract', () => {
        const normalized = normalizeBankReserveSignerResponse({
            protocol: BANK_RESERVE_SIGNER_RESPONSE_PROTOCOL,
            version: 1,
            bankWitness: bankWitnessHex,
        });
        expect(normalized.bankWitness).toBe(bankWitnessHex);
        expectThrows(() => normalizeBankReserveSignerResponse({
            protocol: 'wrong',
            version: 1,
            bankWitness: bankWitnessHex,
        }));
        expectThrows(() => normalizeBankReserveSignerResponse({
            protocol: BANK_RESERVE_SIGNER_RESPONSE_PROTOCOL,
            version: 1,
            bankWitness: '0xnot-hex',
        }));
        expectThrows(() => normalizeBankReserveSignerResponse({
            protocol: BANK_RESERVE_SIGNER_RESPONSE_PROTOCOL,
            version: 1,
        }));
    });
});

describe('CCC JoyID connector', () => {
    it('connects through a CCC JoyID signer and returns public wallet metadata', async () => {
        const capture = {};
        const account = await connectCccJoyId({
            ccc: fakeCcc(capture),
            params: new URLSearchParams(''),
            now: () => 123,
        });
        expect(account.provider).toBe('joyid');
        expect(account.signer).toBe('ccc-joyid');
        expect(account.address).toBe(address);
        expect(account.network).toBe('testnet');
        expect(capture.signer.connected).toBe(true);
    });
});

describe('CCC mining submit', () => {
    it('builds a compact mining receipt payload', () => {
        const payload = miningReceiptPayload(miningTx());
        expect(payload.protocol).toBe('cellshire.mining');
        expect(payload.ore_id).toBe('ore:mine:14455:5:7:coal_seam');
        expect(payload.capacity_before).toBe(3);
        expect(payload.capacity_after).toBe(2);
        expect(payload.yield_currency).toBe('zec');
    });

    it('builds a compact mining receipt payload for lazy BIRTH transactions', () => {
        const payload = miningReceiptPayload(lazyBirthMiningTx());
        expect(payload.action).toBe('birth');
        expect(payload.ore_id).toBe('ore:mine:14455:5:7:coal_seam');
        expect(payload.capacity_before).toBe(3);
        expect(payload.capacity_after).toBe(2);
        expect(payload.yield_currency).toBe('zec');
    });

    it('prepares a CCC transaction with a receipt witness', async () => {
        const capture = {};
        const ccc = fakeCcc(capture);
        const client = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev' });
        const signer = new ccc.JoyId.CkbSigner(client, 'Cellshire', 'logo.png');
        const prepared = await buildCccMiningTransaction({
            ccc,
            client,
            signer,
            miningTx: miningTx(),
        });
        expect(prepared.tx.completedInputs).toBe(true);
        expect(prepared.tx.completedFee).toBe(true);
        expect(prepared.tx.outputs[0].capacity).toBe('fixed:61');
        expect(prepared.tx.witnesses[0]).toBe('0x');
        expect(prepared.tx.witnesses.length).toBe(2);
        expect(prepared.payload.ore_type).toBe('coal_seam');
        expect(prepared.payload.yield_currency).toBe('zec');
    });

    it('signs and submits through CCC JoyID', async () => {
        const capture = {};
        const out = await submitCccJoyIdMiningTx(miningTx(), {
            ccc: fakeCcc(capture),
        });
        expect(out.ok).toBe(true);
        expect(out.mode).toBe('ccc-joyid');
        expect(out.txHash).toBe('0xrealhash');
        expect(capture.sent).toBe(capture.tx);
    });

    it('normalizes cancellation and funding failures', () => {
        expect(classifyCccJoyIdError(new Error('User rejected request'))).toBe('signature-cancelled');
        expect(classifyCccJoyIdError(new Error('Insufficient capacity'))).toBe('insufficient-capacity');
        expect(classifyCccJoyIdError(new Error('boom'))).toBe('tx-failed');
    });
});

describe('CCC property snapshot submit', () => {
    it('builds a compact property snapshot receipt payload', () => {
        const payload = propertySnapshotReceiptPayload(propertySnapshotTx());
        expect(payload.protocol).toBe('cellshire.property.snapshot');
        expect(payload.owner_id).toBe(address);
        expect(payload.property_tier).toBe(2);
        expect(payload.tile_map.width).toBe(24);
    });

    it('prepares a CCC transaction with a property snapshot witness', async () => {
        const capture = {};
        const ccc = fakeCcc(capture);
        const client = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev' });
        const signer = new ccc.JoyId.CkbSigner(client, 'Cellshire', 'logo.png');
        const prepared = await buildCccPropertySnapshotTransaction({
            ccc,
            client,
            signer,
            propertySnapshotTx: propertySnapshotTx(),
        });
        expect(prepared.tx.completedInputs).toBe(true);
        expect(prepared.tx.completedFee).toBe(true);
        expect(prepared.tx.outputs[0].capacity).toBe('fixed:61');
        expect(prepared.tx.witnesses.length).toBe(2);
        expect(prepared.payload.owner_id).toBe(address);
    });

    it('signs and submits property snapshots through CCC JoyID', async () => {
        const capture = {};
        const out = await submitCccJoyIdPropertySnapshotTx(propertySnapshotTx(), {
            ccc: fakeCcc(capture),
        });
        expect(out.ok).toBe(true);
        expect(out.mode).toBe('ccc-joyid');
        expect(out.txHash).toBe('0xrealhash');
        expect(capture.sent).toBe(capture.tx);
    });

    it('normalizes cancellation and funding failures for property snapshots', async () => {
        const cancelled = await submitCccJoyIdPropertySnapshotTx(propertySnapshotTx(), {
            ccc: fakeCcc(),
            shouldFail: true,
        });
        expect(cancelled.ok).toBe(false);
        expect(cancelled.reason).toBe('signature-cancelled');
    });
});

describe('CCC bank loan submit', () => {
    it('builds a compact bank loan receipt payload', () => {
        const payload = bankLoanReceiptPayload(bankBorrowTx());
        expect(payload.protocol).toBe('cellshire.bank.loan');
        expect(payload.action).toBe('borrow');
        expect(payload.offer_id).toBe('starter-float');
        expect(payload.principal).toBe(7500);
        expect(payload.collateral_amount).toBe(11250);
        expect(payload.due_epoch).toBe(14442);
    });

    it('prepares a CCC transaction with a bank loan witness', async () => {
        const capture = {};
        const ccc = fakeCcc(capture);
        const client = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev' });
        const signer = new ccc.JoyId.CkbSigner(client, 'Cellshire', 'logo.png');
        const prepared = await buildCccBankLoanTransaction({
            ccc,
            client,
            signer,
            bankTx: bankBorrowTx(),
        });
        expect(prepared.tx.completedInputs).toBe(true);
        expect(prepared.tx.completedFee).toBe(true);
        expect(prepared.tx.outputs[0].capacity).toBe('fixed:61');
        expect(prepared.tx.witnesses.length).toBe(2);
        expect(prepared.payload.collateral_kind).toBe('ckb');
    });

    it('signs and submits bank loan receipts through CCC JoyID', async () => {
        const capture = {};
        const out = await submitCccJoyIdBankLoanTx(bankBorrowTx(), {
            ccc: fakeCcc(capture),
        });
        expect(out.ok).toBe(true);
        expect(out.mode).toBe('ccc-joyid');
        expect(out.txHash).toBe('0xrealhash');
        expect(capture.sent).toBe(capture.tx);
    });

    it('prepares a real-shaped CCC borrow transaction when bank scripts are configured', async () => {
        const capture = {};
        const ccc = fakeCcc(capture);
        const client = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev' });
        const signer = new ccc.JoyId.CkbSigner(client, 'Cellshire', 'logo.png');
        const prepared = await buildCccBankCollateralTransaction({
            ccc,
            client,
            signer,
            bankTx: bankBorrowTx(),
            scriptConfig: resolveCccBankScriptConfig({ params: bankScriptParams() }),
        });
        expect(prepared.tx.completedInputs).toBe(true);
        expect(prepared.tx.completedFee).toBe(true);
        expect(prepared.tx.outputs.length).toBe(3);
        expect(prepared.tx.outputs[0].capacity).toBe('fixed:7500');
        expect(prepared.tx.outputs[1].type.codeHash).toBe(`0x${'1'.repeat(64)}`);
        expect(prepared.tx.outputsData[1]).toBe(bankBorrowTx().outputs.debt_cell.data);
        expect(prepared.tx.cellDeps.length).toBe(1);
    });

    it('includes provider-selected borrow inputs in real-shaped CCC bank transactions', async () => {
        const capture = {};
        const ccc = fakeCcc(capture);
        const client = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev' });
        const signer = new ccc.JoyId.CkbSigner(client, 'Cellshire', 'logo.png');
        const prepared = await buildCccBankCollateralTransaction({
            ccc,
            client,
            signer,
            bankTx: bankBorrowTxWithInputs(),
            scriptConfig: resolveCccBankScriptConfig({ params: bankScriptParams() }),
        });
        expect(prepared.tx.inputs.length).toBe(2);
        expect(prepared.tx.inputs[0].previousOutput.txHash).toBe(`0x${'7'.repeat(64)}`);
        expect(prepared.tx.inputs[1].previousOutput.index).toBe(1);
    });

    it('applies a bank reserve co-signature when building real-shaped borrow transactions', async () => {
        const capture = {};
        const ccc = fakeCcc(capture);
        const client = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev' });
        const signer = new ccc.JoyId.CkbSigner(client, 'Cellshire', 'logo.png');
        let seenPayload = null;
        const prepared = await buildCccBankCollateralTransaction({
            ccc,
            client,
            signer,
            bankTx: bankBorrowTxWithInputs(),
            scriptConfig: resolveCccBankScriptConfig({ params: bankScriptParams() }),
            bankReserveSigner: async ({ tx, payload }) => {
                seenPayload = payload;
                expect(tx.inputs.length).toBe(2);
                return {
                    protocol: BANK_RESERVE_SIGNER_RESPONSE_PROTOCOL,
                    version: 1,
                    bankWitness: bankWitnessHex,
                };
            },
        });
        expect(prepared.bankReserveSigned).toBe(true);
        expect(seenPayload.action).toBe('borrow');
        expect(prepared.tx.witnesses[prepared.tx.witnesses.length - 1]).toBe(bankWitnessHex);
    });

    it('posts real-shaped borrow transactions to a configured bank reserve signer', async () => {
        const calls = [];
        const reserveSigner = createHttpBankReserveSigner({
            url: 'https://bank.test/sign',
            token: 'secret',
            fetchImpl: async (url, init) => {
                calls.push({ url, init, body: JSON.parse(init.body) });
                return {
                    ok: true,
                    async json() {
                        return {
                            ok: true,
                            protocol: BANK_RESERVE_SIGNER_RESPONSE_PROTOCOL,
                            version: 1,
                            extraWitnesses: [bankExtraWitnessHex],
                        };
                    },
                };
            },
        });
        const capture = {};
        const ccc = fakeCcc(capture);
        const client = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev' });
        const signer = new ccc.JoyId.CkbSigner(client, 'Cellshire', 'logo.png');
        const prepared = await buildCccBankCollateralTransaction({
            ccc,
            client,
            signer,
            bankTx: bankBorrowTxWithInputs(),
            scriptConfig: resolveCccBankScriptConfig({ params: bankScriptParams() }),
            bankReserveSigner: reserveSigner,
        });
        expect(calls.length).toBe(1);
        expect(calls[0].init.headers.authorization).toBe('Bearer secret');
        expect(calls[0].body.protocol).toBe('cellshire.bank.reserve-sign');
        expect(calls[0].body.tx.inputs.length).toBe(2);
        expect(prepared.tx.witnesses[prepared.tx.witnesses.length - 1]).toBe(bankExtraWitnessHex);
    });

    it('prepares a real-shaped CCC repay transaction when bank scripts are configured', async () => {
        const capture = {};
        const ccc = fakeCcc(capture);
        const client = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev' });
        const signer = new ccc.JoyId.CkbSigner(client, 'Cellshire', 'logo.png');
        const prepared = await buildCccBankCollateralTransaction({
            ccc,
            client,
            signer,
            bankTx: bankRepayTx(),
            scriptConfig: resolveCccBankScriptConfig({ params: bankScriptParams() }),
        });
        expect(prepared.tx.outputs.length).toBe(3);
        expect(prepared.tx.outputs[0].capacity).toBe('fixed:11250');
        expect(prepared.tx.outputs[1].lock.codeHash).toBe(`0x${'4'.repeat(64)}`);
        expect(prepared.tx.outputs[2].capacity).toBe('fixed:187.5');
    });

    it('includes provider-selected repay inputs in real-shaped CCC bank transactions', async () => {
        const capture = {};
        const ccc = fakeCcc(capture);
        const client = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev' });
        const signer = new ccc.JoyId.CkbSigner(client, 'Cellshire', 'logo.png');
        const prepared = await buildCccBankCollateralTransaction({
            ccc,
            client,
            signer,
            bankTx: bankRepayTxWithInputs(),
            scriptConfig: resolveCccBankScriptConfig({ params: bankScriptParams() }),
        });
        expect(prepared.tx.inputs.length).toBe(2);
        expect(prepared.tx.inputs[0].previousOutput.txHash).toBe(`0x${'9'.repeat(64)}`);
        expect(prepared.tx.inputs[1].previousOutput.index).toBe(2);
    });

    it('signs and submits real-shaped bank collateral transactions through CCC JoyID', async () => {
        const capture = {};
        const out = await submitCccJoyIdBankLoanTx(bankBorrowTx(), {
            ccc: fakeCcc(capture),
            params: bankScriptParams(),
            realBankTx: true,
        });
        expect(out.ok).toBe(true);
        expect(out.mode).toBe('ccc-joyid-real');
        expect(out.txHash).toBe('0xrealhash');
        expect(capture.sent).toBe(capture.tx);
    });

    it('co-signs and submits real-shaped bank collateral borrow transactions through CCC JoyID', async () => {
        const capture = {};
        const out = await submitCccJoyIdBankLoanTx(bankBorrowTxWithInputs(), {
            ccc: fakeCcc(capture),
            params: bankScriptParams(),
            realBankTx: true,
            bankReserveSigner: async () => ({
                protocol: BANK_RESERVE_SIGNER_RESPONSE_PROTOCOL,
                version: 1,
                bankWitness: bankWitnessHex,
            }),
        });
        expect(out.ok).toBe(true);
        expect(out.mode).toBe('ccc-joyid-real');
        expect(out.bankReserveSigned).toBe(true);
        expect(capture.sent.witnesses.includes(bankWitnessHex)).toBe(true);
    });

    it('normalizes bank reserve signer failures', async () => {
        const out = await submitCccJoyIdBankLoanTx(bankBorrowTxWithInputs(), {
            ccc: fakeCcc(),
            params: bankScriptParams(),
            realBankTx: true,
            bankReserveSigner: async () => {
                throw new Error('bank reserve signer failed: rejected');
            },
        });
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('bank-signer-failed');
    });

    it('rejects real bank collateral transactions without script config', async () => {
        const out = await submitCccJoyIdBankLoanTx(bankBorrowTx(), {
            ccc: fakeCcc(),
            realBankTx: true,
        });
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('tx-failed');
    });

    it('rejects production real bank transactions with smoke placeholder scripts', async () => {
        const params = bankScriptParams();
        params.set('chainBankScriptMode', 'production');
        const out = await submitCccJoyIdBankLoanTx(bankBorrowTx(), {
            ccc: fakeCcc(),
            params,
            realBankTx: true,
        });
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('tx-failed');
    });
});

describe('CCC trader swap submit', () => {
    it('builds a compact trader swap receipt payload', () => {
        const payload = traderSwapReceiptPayload(traderSwapTx());
        expect(payload.protocol).toBe('cellshire.trader.swap');
        expect(payload.action).toBe('swap');
        expect(payload.owner).toBe(address);
        expect(payload.from_currency).toBe('bch');
        expect(payload.to_currency).toBe('zec');
        expect(payload.fee_bps).toBe(200);
    });

    it('prepares a CCC transaction with a trader swap witness', async () => {
        const capture = {};
        const ccc = fakeCcc(capture);
        const client = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev' });
        const signer = new ccc.JoyId.CkbSigner(client, 'Cellshire', 'logo.png');
        const prepared = await buildCccTraderSwapTransaction({
            ccc,
            client,
            signer,
            traderTx: traderSwapTx(),
        });
        expect(prepared.tx.completedInputs).toBe(true);
        expect(prepared.tx.completedFee).toBe(true);
        expect(prepared.tx.outputs[0].capacity).toBe('fixed:61');
        expect(prepared.tx.witnesses.length).toBe(2);
        expect(prepared.payload.from_currency).toBe('bch');
    });

    it('signs and submits trader swap receipts through CCC JoyID', async () => {
        const capture = {};
        const out = await submitCccJoyIdTraderSwapTx(traderSwapTx(), {
            ccc: fakeCcc(capture),
        });
        expect(out.ok).toBe(true);
        expect(out.mode).toBe('ccc-joyid');
        expect(out.txHash).toBe('0xrealhash');
        expect(capture.sent).toBe(capture.tx);
    });
});

describe('CCC store purchase submit', () => {
    it('builds a compact store purchase receipt payload', () => {
        const payload = storePurchaseReceiptPayload(storePurchaseTx());
        expect(payload.protocol).toBe('cellshire.store.purchase');
        expect(payload.action).toBe('purchase');
        expect(payload.owner).toBe(address);
        expect(payload.asset_id).toBe('blue_railing');
        expect(payload.price_currency).toBe('ckb');
        expect(payload.price_amount).toBe(350);
        expect(payload.open_asset_mint.schema).toBe('cellshire.store.open_asset_mint');
        expect(payload.open_asset_mint.cell.cellId).toBe(`store:${address}:blue_railing:store-purchase-1`);
        expect(payload.open_asset_mint.cell.render.source.assetId).toBe('blue_railing');
    });

    it('prepares a CCC transaction with a store purchase witness', async () => {
        const capture = {};
        const ccc = fakeCcc(capture);
        const client = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev' });
        const signer = new ccc.JoyId.CkbSigner(client, 'Cellshire', 'logo.png');
        const prepared = await buildCccStorePurchaseTransaction({
            ccc,
            client,
            signer,
            storeTx: storePurchaseTx(),
        });
        expect(prepared.tx.completedInputs).toBe(true);
        expect(prepared.tx.completedFee).toBe(true);
        expect(prepared.tx.outputs[0].capacity).toBe('fixed:61');
        expect(prepared.tx.witnesses.length).toBe(2);
        expect(prepared.payload.asset_id).toBe('blue_railing');
        expect(prepared.payload.open_asset_mint.cell.metadata.traits.source).toBe('general_store');
    });

    it('signs and submits store purchase receipts through CCC JoyID', async () => {
        const capture = {};
        const out = await submitCccJoyIdStorePurchaseTx(storePurchaseTx(), {
            ccc: fakeCcc(capture),
        });
        expect(out.ok).toBe(true);
        expect(out.mode).toBe('ccc-joyid');
        expect(out.txHash).toBe('0xrealhash');
        expect(capture.sent).toBe(capture.tx);
    });
});

describe('CCC marketplace purchase submit', () => {
    it('builds a compact marketplace purchase receipt payload', () => {
        const payload = marketplacePurchaseReceiptPayload(marketplacePurchaseTx());
        expect(payload.protocol).toBe('cellshire.marketplace.purchase');
        expect(payload.action).toBe('purchase');
        expect(payload.buyer).toBe(address);
        expect(payload.asset_id).toBe('olive');
        expect(payload.price_currency).toBe('ckb');
        expect(payload.price_amount).toBe(2200);
        expect(payload.seller_amount).toBe(2200);
    });

    it('prepares a CCC transaction with a marketplace purchase witness', async () => {
        const capture = {};
        const ccc = fakeCcc(capture);
        const client = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev' });
        const signer = new ccc.JoyId.CkbSigner(client, 'Cellshire', 'logo.png');
        const prepared = await buildCccMarketplacePurchaseTransaction({
            ccc,
            client,
            signer,
            marketplaceTx: marketplacePurchaseTx(),
        });
        expect(prepared.tx.completedInputs).toBe(true);
        expect(prepared.tx.completedFee).toBe(true);
        expect(prepared.tx.outputs[0].capacity).toBe('fixed:61');
        expect(prepared.tx.witnesses.length).toBe(2);
        expect(prepared.payload.asset_id).toBe('olive');
    });

    it('signs and submits marketplace purchase receipts through CCC JoyID', async () => {
        const capture = {};
        const out = await submitCccJoyIdMarketplacePurchaseTx(marketplacePurchaseTx(), {
            ccc: fakeCcc(capture),
        });
        expect(out.ok).toBe(true);
        expect(out.mode).toBe('ccc-joyid');
        expect(out.txHash).toBe('0xrealhash');
        expect(capture.sent).toBe(capture.tx);
    });
});
