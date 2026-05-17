import { describe, it, expect } from '../test/harness.js';
import {
    ChainMiningAdapter,
    chainMiningEnabled,
    chainMiningOreTypes,
    chainMiningSubmitMode,
} from './miningAdapter.js';
import { OreState } from './OreState.js';

function fakeStorage(initial = {}) {
    const m = new Map(Object.entries(initial));
    return {
        get: k => (m.has(k) ? m.get(k) : null),
        set: (k, v) => m.set(k, String(v)),
        remove: k => m.delete(k),
    };
}

const account = {
    provider: 'joyid',
    address: 'ckt1qyq9xcellshirejoyidstub0000000000000000000',
    label: 'JoyID Dev',
    connectedAt: 123,
};

describe('chain mining flags', () => {
    it('enables only with ?chainMining=1', () => {
        expect(chainMiningEnabled(new URLSearchParams('chainMining=1'))).toBe(true);
        expect(chainMiningEnabled(new URLSearchParams('chainMining=0'))).toBe(false);
    });

    it('defaults to coal_seam and accepts a comma-list override', () => {
        expect(chainMiningOreTypes(new URLSearchParams(''))).toEqual(['coal_seam']);
        expect(chainMiningOreTypes(new URLSearchParams('chainMiningOre=coal_seam,iron_ore')))
            .toEqual(['coal_seam', 'iron_ore']);
    });

    it('uses prototype submit by default and CCC JoyID only when requested', () => {
        expect(chainMiningSubmitMode(new URLSearchParams('chainMining=1'))).toBe('prototype');
        expect(chainMiningSubmitMode(new URLSearchParams('chainMining=1&chainMiningSubmit=ccc')))
            .toBe('ccc-joyid');
    });
});

describe('ChainMiningAdapter', () => {
    it('handles only configured ore types', () => {
        const adapter = new ChainMiningAdapter({ storage: fakeStorage() });
        expect(adapter.canHandle({ assetId: 'coal_seam' })).toBe(true);
        expect(adapter.canHandle({ assetId: 'iron_ore' })).toBe(false);
    });

    it('requires a connected wallet for supported chain ore', async () => {
        const adapter = new ChainMiningAdapter({ storage: fakeStorage() });
        const state = new OreState('coal_seam', 2, 3);
        const out = await adapter.mine({
            epoch: '14455',
            obj: { gx: 5, gy: 7, assetId: 'coal_seam' },
            state,
            result: { currency: 'coal_seam', amount: 1, depleted: false },
        });
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('wallet-disconnected');
    });

    it('builds and submits a prototype mining tx when connected', async () => {
        const storage = fakeStorage({
            'cellshire:walletIdentity': JSON.stringify(account),
        });
        let submitted = null;
        const adapter = new ChainMiningAdapter({
            storage,
            submit: async (tx) => {
                submitted = tx;
                return { ok: true, txHash: '0xabc' };
            },
        });
        const out = await adapter.mine({
            epoch: '14455',
            obj: { gx: 5, gy: 7, assetId: 'coal_seam' },
            state: new OreState('coal_seam', 2, 3),
            result: { currency: 'coal_seam', amount: 1, depleted: false },
        });
        expect(out.ok).toBe(true);
        expect(out.txHash).toBe('0xabc');
        expect(submitted.outputs.ore_cell.capacity_remaining).toBe(2);
        expect(submitted.outputs.yield_cell.lock).toBe(account.address);
    });

    it('surfaces submit failure without success', async () => {
        const storage = fakeStorage({
            'cellshire:walletIdentity': JSON.stringify(account),
        });
        const adapter = new ChainMiningAdapter({
            storage,
            submit: async () => ({ ok: false, reason: 'signature-cancelled', message: 'cancelled' }),
        });
        const out = await adapter.mine({
            epoch: '14455',
            obj: { gx: 5, gy: 7, assetId: 'coal_seam' },
            state: new OreState('coal_seam', 2, 3),
            result: { currency: 'coal_seam', amount: 1, depleted: false },
        });
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('signature-cancelled');
    });
});
