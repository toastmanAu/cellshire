import { describe, expect, it } from '../test/harness.js';
import { OreState } from '../mining/OreState.js';
import { buildOreCell } from './miningTx.js';
import {
    buildOreBirthTransaction,
    buildOreDecrementTransaction,
} from './miningTx.birth.js';

const walletAccount = {
    provider: 'joyid',
    address: 'ckt1qyq9xcellshirejoyidstub0000000000000000000',
};

describe('lazy mining transactions', () => {
    it('builds a BIRTH tx with ore args and max-1 capacity', () => {
        const oreCell = buildOreCell({
            epoch: '14455',
            obj: { gx: 5, gy: 7, assetId: 'coal_seam' },
            state: new OreState('coal_seam', 5, 5),
        });
        const tx = buildOreBirthTransaction({
            walletAccount,
            oreCell,
            result: { oreType: 'coal_seam', currency: 'zec', amount: 0.001, valueUsd: 1 },
            txNonce: 'birth-test',
        });
        expect(tx.action).toBe('birth');
        expect(tx.inputs.ore_cell).toBeNull();
        expect(tx.outputs.ore_cell.capacity_remaining).toBe(4);
        expect(/^0x[0-9a-f]{44}$/.test(tx.witness.mining_receipt.ore_args)).toBe(true);
        expect(tx.witness.mining_receipt.mined_capacity_before).toBe(5);
        expect(tx.witness.mining_receipt.mined_capacity_after).toBe(4);
    });

    it('builds a DEPLETE tx without a recreated ore cell', () => {
        const oreCell = buildOreCell({
            epoch: '14455',
            obj: { gx: 5, gy: 7, assetId: 'coal_seam' },
            state: new OreState('coal_seam', 1, 5),
        });
        const tx = buildOreDecrementTransaction({
            walletAccount,
            oreCell,
            result: { oreType: 'coal_seam', currency: 'zec', amount: 0.001, valueUsd: 1 },
            txNonce: 'deplete-test',
        });
        expect(tx.action).toBe('deplete');
        expect(tx.outputs.ore_cell).toBeNull();
        expect(tx.outputs.reclaimed_capacity_lock).toBe(walletAccount.address);
        expect(tx.witness.mining_receipt.mined_capacity_after).toBe(0);
    });

    it('records multi-capacity lazy mining before and after values', () => {
        const oreCell = buildOreCell({
            epoch: '14455',
            obj: { gx: 5, gy: 7, assetId: 'coal_seam' },
            state: new OreState('coal_seam', 5, 5),
        });
        const tx = buildOreDecrementTransaction({
            walletAccount,
            oreCell,
            result: { oreType: 'coal_seam', currency: 'zec', amount: 0.003, valueUsd: 3, capacitySpent: 3 },
            txNonce: 'multi-test',
        });
        expect(tx.action).toBe('decrement');
        expect(tx.outputs.ore_cell.capacity_remaining).toBe(2);
        expect(tx.witness.mining_receipt.mined_capacity_before).toBe(5);
        expect(tx.witness.mining_receipt.mined_capacity_after).toBe(2);
    });
});
