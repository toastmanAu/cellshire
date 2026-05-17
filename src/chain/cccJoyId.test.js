import { describe, it, expect } from '../test/harness.js';
import {
    buildCccMiningTransaction,
    cccJoyIdEnabled,
    cccJoyIdMiningEnabled,
    classifyCccJoyIdError,
    connectCccJoyId,
    miningReceiptPayload,
    resolveCccJoyIdConfig,
    submitCccJoyIdMiningTx,
} from './cccJoyId.js';

const address = 'ckt1qyq9xcellshirejoyidreal00000000000000000000';

function fakeCcc(capture = {}) {
    class FakeTransaction {
        constructor(def) {
            this.outputs = def.outputs || [];
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
                currency: 'coal_seam',
                amount: 1,
            },
        },
        witness: {
            address,
        },
    };
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
        expect(config.logo).toBe('https://cellshire.test/assets/player_miner.png');
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
