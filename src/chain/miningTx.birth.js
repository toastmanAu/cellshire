import { encodeOreArgs } from './oreArgs.js';
import { buildYieldCell, capacitySpentFromResult } from './miningTx.js';

export function buildOreBirthTransaction({
    walletAccount,
    oreCell,
    result,
    txNonce = 'birth',
}) {
    return buildLifecycleTransaction({
        walletAccount,
        oreCell,
        result,
        txNonce,
        action: 'birth',
        inputOreCell: null,
    });
}

export function buildOreDecrementTransaction({
    walletAccount,
    oreCell,
    result,
    txNonce = 'decrement',
}) {
    const capacitySpent = capacitySpentFromResult(result, oreCell?.capacity_remaining);
    const after = Math.max(0, (oreCell?.capacity_remaining ?? 0) - capacitySpent);
    return buildLifecycleTransaction({
        walletAccount,
        oreCell,
        result,
        txNonce,
        action: after <= 0 ? 'deplete' : 'decrement',
        inputOreCell: oreCell,
    });
}

export function buildOreDepleteTransaction(args) {
    return buildOreDecrementTransaction(args);
}

function buildLifecycleTransaction({
    walletAccount,
    oreCell,
    inputOreCell,
    result,
    txNonce,
    action,
}) {
    if (!walletAccount?.address) throw new Error('wallet account required');
    if (!oreCell?.ore_id) throw new Error('ore cell required');
    if (!result) throw new Error('mining result required');
    if (result.oreType && result.oreType !== oreCell.ore_type) {
        throw new Error(`yield source ore ${result.oreType} does not match ore ${oreCell.ore_type}`);
    }
    const before = action === 'birth'
        ? oreCell.capacity_max
        : oreCell.capacity_remaining;
    const capacitySpent = capacitySpentFromResult(result, before);
    const after = Math.max(0, before - capacitySpent);
    const nextOreCell = after > 0
        ? { ...oreCell, capacity_remaining: after }
        : null;
    const ore_args = encodeOreArgs({
        epoch: oreCell.epoch,
        mapId: oreCell.map_id,
        gx: oreCell.gx,
        gy: oreCell.gy,
        oreType: oreCell.ore_type,
    });
    return {
        version: 1,
        kind: 'cellshire_mining_tx',
        network: 'testnet',
        tx_nonce: txNonce,
        action,
        inputs: {
            ore_cell: inputOreCell,
            funding_lock: walletAccount.address,
        },
        outputs: {
            ore_cell: nextOreCell,
            yield_cell: buildYieldCell({ walletAccount, oreCell, result }),
            change_lock: walletAccount.address,
            reclaimed_capacity_lock: after === 0 ? walletAccount.address : null,
        },
        witness: {
            provider: walletAccount.provider,
            address: walletAccount.address,
            signature: 'pending',
            mining_receipt: {
                ore_id: oreCell.ore_id,
                ore_args,
                ore_type: oreCell.ore_type,
                map_id: oreCell.map_id,
                epoch: oreCell.epoch,
                gx: oreCell.gx,
                gy: oreCell.gy,
                mined_capacity_before: before,
                mined_capacity_after: after,
                yield_currency_id: result.currency,
                yield_amount: result.amount,
                tx_nonce: txNonce,
            },
        },
    };
}
