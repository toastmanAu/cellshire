import { describe, it, expect } from '../test/harness.js';
import { OreState } from '../mining/OreState.js';
import { buildMiningTransaction, buildOreCell } from './miningTx.js';

const walletAccount = {
    provider: 'joyid',
    address: 'ckt1qyq9xcellshirejoyidstub0000000000000000000',
};

describe('buildOreCell', () => {
    it('maps an in-game ore object and OreState to logical cell data', () => {
        const obj = { gx: 5, gy: 7, assetId: 'coal_seam' };
        const state = new OreState('coal_seam', 3, 5);
        const out = buildOreCell({ epoch: '14455', obj, state });
        expect(out.ore_id).toBe('ore:mine%3A14455:14455:5:7:coal_seam');
        expect(out.capacity_remaining).toBe(3);
        expect(out.capacity_max).toBe(5);
    });
});

describe('buildMiningTransaction', () => {
    it('recreates the ore cell with one less capacity when not depleted', () => {
        const oreCell = buildOreCell({
            epoch: '14455',
            obj: { gx: 5, gy: 7, assetId: 'coal_seam' },
            state: new OreState('coal_seam', 3, 5),
        });
        const tx = buildMiningTransaction({
            walletAccount,
            oreCell,
            result: { oreType: 'coal_seam', currency: 'zec', amount: 0.00381869, valueUsd: 2, depleted: false },
            txNonce: 'test',
        });
        expect(tx.outputs.ore_cell.capacity_remaining).toBe(2);
        expect(tx.outputs.yield_cell.currency).toBe('zec');
        expect(tx.outputs.yield_cell.amount).toBe(0.00381869);
        expect(tx.outputs.yield_cell.usd_value).toBe(2);
        expect(tx.outputs.yield_cell.source_ore_type).toBe('coal_seam');
        expect(tx.witness.signature).toBe('pending');
    });

    it('recreates the ore cell with multiple extracted capacity chunks', () => {
        const oreCell = buildOreCell({
            epoch: '14455',
            obj: { gx: 5, gy: 7, assetId: 'coal_seam' },
            state: new OreState('coal_seam', 5, 5),
        });
        const tx = buildMiningTransaction({
            walletAccount,
            oreCell,
            result: {
                oreType: 'coal_seam',
                currency: 'zec',
                amount: 0.005,
                valueUsd: 3,
                capacitySpent: 3,
                depleted: false,
            },
            txNonce: 'test',
        });
        expect(tx.outputs.ore_cell.capacity_remaining).toBe(2);
    });

    it('omits the ore output when the hit depletes the ore', () => {
        const oreCell = buildOreCell({
            epoch: '14455',
            obj: { gx: 5, gy: 7, assetId: 'coal_seam' },
            state: new OreState('coal_seam', 1, 5),
        });
        const tx = buildMiningTransaction({
            walletAccount,
            oreCell,
            result: { oreType: 'coal_seam', currency: 'zec', amount: 0.00190934, depleted: true },
        });
        expect(tx.outputs.ore_cell).toBeNull();
    });

    it('omits the ore output when a multi-capacity hit depletes the ore', () => {
        const oreCell = buildOreCell({
            epoch: '14455',
            obj: { gx: 5, gy: 7, assetId: 'coal_seam' },
            state: new OreState('coal_seam', 2, 5),
        });
        const tx = buildMiningTransaction({
            walletAccount,
            oreCell,
            result: { oreType: 'coal_seam', currency: 'zec', amount: 0.003, capacitySpent: 3, depleted: true },
        });
        expect(tx.outputs.ore_cell).toBeNull();
    });

    it('allows mapped crypto currency when the source ore matches', () => {
        const oreCell = buildOreCell({
            epoch: '14455',
            obj: { gx: 5, gy: 7, assetId: 'coal_seam' },
            state: new OreState('coal_seam', 3, 5),
        });
        const tx = buildMiningTransaction({
            walletAccount,
            oreCell,
            result: { oreType: 'coal_seam', currency: 'zec', amount: 0.00190934, depleted: false },
        });
        expect(tx.outputs.yield_cell.currency).toBe('zec');
    });

    it('throws when result source ore does not match the ore cell', () => {
        const oreCell = buildOreCell({
            epoch: '14455',
            obj: { gx: 5, gy: 7, assetId: 'coal_seam' },
            state: new OreState('coal_seam', 3, 5),
        });
        let threw = false;
        try {
            buildMiningTransaction({
                walletAccount,
                oreCell,
                result: { oreType: 'iron_ore', currency: 'erg', amount: 3.5462829, depleted: false },
            });
        } catch {
            threw = true;
        }
        expect(threw).toBe(true);
    });
});
