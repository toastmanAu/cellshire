import { oreIdentityForObject } from '../mining/oreIdentity.js';

export function buildOreCell({ epoch, obj, state, mapId, yieldNonce = '0x0' }) {
    const identity = oreIdentityForObject({ epoch, obj, mapId });
    return {
        version: 1,
        kind: 'cellshire_ore',
        ore_id: identity.oreId,
        map_id: identity.mapId,
        epoch: identity.epoch,
        gx: identity.gx,
        gy: identity.gy,
        ore_type: identity.oreType,
        capacity_remaining: state.capacityRemaining,
        capacity_max: state.maxCapacity,
        yield_nonce: yieldNonce,
        owner_lock_if_claimed: null,
    };
}

export function buildYieldCell({ walletAccount, oreCell, result }) {
    return {
        version: 1,
        kind: 'cellshire_currency',
        lock: walletAccount.address,
        currency: result.currency,
        amount: result.amount,
        usd_value: result.valueUsd ?? null,
        source_ore_type: oreCell.ore_type,
        source_ore_id: oreCell.ore_id,
        mined_at_epoch: oreCell.epoch,
    };
}

export function buildMiningTransaction({
    walletAccount,
    oreCell,
    result,
    txNonce = 'prototype',
}) {
    if (!walletAccount?.address) throw new Error('wallet account required');
    if (!oreCell?.ore_id) throw new Error('ore cell required');
    if (!result) throw new Error('mining result required');
    if (oreCell.capacity_remaining <= 0) throw new Error('ore cell is depleted');
    if (result.oreType && result.oreType !== oreCell.ore_type) {
        throw new Error(`yield source ore ${result.oreType} does not match ore ${oreCell.ore_type}`);
    }

    const nextCapacity = oreCell.capacity_remaining - 1;
    const nextOreCell = nextCapacity > 0
        ? { ...oreCell, capacity_remaining: nextCapacity }
        : null;

    return {
        version: 1,
        kind: 'cellshire_mining_tx',
        network: 'testnet',
        tx_nonce: txNonce,
        action: 'mine',
        inputs: {
            ore_cell: oreCell,
            funding_lock: walletAccount.address,
        },
        outputs: {
            ore_cell: nextOreCell,
            yield_cell: buildYieldCell({ walletAccount, oreCell, result }),
            change_lock: walletAccount.address,
        },
        witness: {
            provider: walletAccount.provider,
            address: walletAccount.address,
            signature: 'pending',
        },
    };
}
