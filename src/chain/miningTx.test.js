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
            result: { currency: 'coal_seam', amount: 2, depleted: false },
            txNonce: 'test',
        });
        expect(tx.outputs.ore_cell.capacity_remaining).toBe(2);
        expect(tx.outputs.yield_cell.amount).toBe(2);
        expect(tx.witness.signature).toBe('pending');
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
            result: { currency: 'coal_seam', amount: 1, depleted: true },
        });
        expect(tx.outputs.ore_cell).toBeNull();
    });

    it('throws when yield currency does not match the ore type', () => {
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
                result: { currency: 'iron_ore', amount: 1, depleted: false },
            });
        } catch {
            threw = true;
        }
        expect(threw).toBe(true);
    });
});
