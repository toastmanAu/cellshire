import { describe, it, expect } from '../test/harness.js';
import {
    ChainMiningAdapter,
    chainMiningBirthMode,
    chainMiningEnabled,
    chainMiningOreTypes,
    chainMiningSubmitMode,
    makeMiningAdapterFromParams,
} from './miningAdapter.js';
import { OreState } from './OreState.js';
import { LocalOreIndexer } from '../chain/oreIndexer.js';

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

    it('enables lazy birth only through the explicit flag', () => {
        expect(chainMiningBirthMode(new URLSearchParams('chainMining=1'))).toBe('legacy');
        expect(chainMiningBirthMode(new URLSearchParams('chainMining=1&chainMiningBirth=lazy'))).toBe('lazy');
    });

    it('wires an HTTP ore indexer only for lazy chain mining when requested', () => {
        const adapter = makeMiningAdapterFromParams({
            params: new URLSearchParams('chainMining=1&chainMiningBirth=lazy&chainMiningIndexerUrl=https%3A%2F%2Findexer.example'),
            storage: fakeStorage(),
        });
        expect(adapter.lazyBirth).toBe(true);
        expect(adapter.oreIndexer.constructor.name).toBe('HttpOreIndexer');
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
            result: { oreType: 'coal_seam', currency: 'zec', amount: 0.00190934, depleted: false },
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
            result: { oreType: 'coal_seam', currency: 'zec', amount: 0.00190934, depleted: false },
        });
        expect(out.ok).toBe(true);
        expect(out.txHash).toBe('0xabc');
        expect(submitted.outputs.ore_cell.capacity_remaining).toBe(2);
        expect(submitted.outputs.yield_cell.lock).toBe(account.address);
        expect(submitted.outputs.yield_cell.currency).toBe('zec');
    });

    it('submits a lazy BIRTH tx for an untouched fixture ore', async () => {
        const storage = fakeStorage({
            'cellshire:walletIdentity': JSON.stringify(account),
        });
        const oreIndexer = new LocalOreIndexer();
        let submitted = null;
        const adapter = new ChainMiningAdapter({
            storage,
            lazyBirth: true,
            oreIndexer,
            submit: async (tx) => {
                submitted = tx;
                return { ok: true, txHash: '0xbirth' };
            },
        });
        const out = await adapter.mine({
            game: { currentMapId: 'mine:14455' },
            epoch: '14455',
            obj: { gx: 5, gy: 7, assetId: 'coal_seam' },
            state: new OreState('coal_seam', 2, 3),
            result: { oreType: 'coal_seam', currency: 'zec', amount: 0.00190934, depleted: false },
        });
        expect(out.ok).toBe(true);
        expect(out.mode).toBe('chain-lazy-birth');
        expect(submitted.action).toBe('birth');
        expect(submitted.inputs.ore_cell).toBeNull();
        expect((await oreIndexer.getOreCell(submitted.witness.mining_receipt.ore_id)).status).toBe('live');
    });

    it('submits a lazy DECREMENT tx for a live fixture ore', async () => {
        const storage = fakeStorage({
            'cellshire:walletIdentity': JSON.stringify(account),
        });
        const oreIndexer = new LocalOreIndexer();
        const liveCell = {
            version: 1,
            kind: 'cellshire_ore',
            ore_id: 'ore:mine%3A14455:14455:5:7:coal_seam',
            map_id: 'mine:14455',
            epoch: '14455',
            gx: 5,
            gy: 7,
            ore_type: 'coal_seam',
            capacity_remaining: 2,
            capacity_max: 3,
        };
        oreIndexer.recordMiningTx({
            action: 'birth',
            witness: { mining_receipt: { ore_id: liveCell.ore_id } },
            outputs: { ore_cell: liveCell },
        });
        let submitted = null;
        const adapter = new ChainMiningAdapter({
            storage,
            lazyBirth: true,
            oreIndexer,
            submit: async (tx) => {
                submitted = tx;
                return { ok: true, txHash: '0xdecrement' };
            },
        });
        const out = await adapter.mine({
            game: { currentMapId: 'mine:14455' },
            epoch: '14455',
            obj: { gx: 5, gy: 7, assetId: 'coal_seam' },
            state: new OreState('coal_seam', 1, 3),
            result: { oreType: 'coal_seam', currency: 'zec', amount: 0.00190934, depleted: false },
        });
        expect(out.ok).toBe(true);
        expect(out.mode).toBe('chain-lazy-decrement');
        expect(submitted.action).toBe('decrement');
        expect(submitted.outputs.ore_cell.capacity_remaining).toBe(1);
    });

    it('restores the local hit when a lazy indexer read is stale', async () => {
        const storage = fakeStorage({
            'cellshire:walletIdentity': JSON.stringify(account),
        });
        const adapter = new ChainMiningAdapter({
            storage,
            lazyBirth: true,
            oreIndexer: {
                async getOreCell() {
                    return { status: 'stale', reason: 'http-503', liveCell: null };
                },
            },
            submit: async () => {
                throw new Error('submit should not run');
            },
        });
        const out = await adapter.mine({
            game: { currentMapId: 'mine:14455' },
            epoch: '14455',
            obj: { gx: 5, gy: 7, assetId: 'coal_seam' },
            state: new OreState('coal_seam', 2, 3),
            result: { oreType: 'coal_seam', currency: 'zec', amount: 0.00190934, depleted: false },
        });
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('indexer-stale');
        expect(out.message).toBe('Mining indexer is not ready');
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
            result: { oreType: 'coal_seam', currency: 'zec', amount: 0.00190934, depleted: false },
        });
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('signature-cancelled');
    });
});
