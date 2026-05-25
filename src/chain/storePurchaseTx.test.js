import { describe, expect, it } from '../test/harness.js';
import { generalStoreItem } from '../store/generalStoreCatalog.js';
import {
    buildStorePurchaseTransaction,
    settleStorePurchaseFixture,
} from './storePurchaseTx.js';

describe('store purchase transaction', () => {
    it('builds a chain-shaped store purchase request', () => {
        const tx = buildStorePurchaseTransaction({
            walletAccount: { provider: 'joyid', address: 'ckt1owner', network: 'testnet' },
            item: generalStoreItem('blue_railing'),
            txNonce: 'store-1',
        });
        expect(tx.kind).toBe('cellshire_store_purchase_tx');
        expect(tx.inputs.payment_balance_cell.currency).toBe('ckb');
        expect(tx.inputs.payment_balance_cell.amount).toBe(350);
        expect(tx.outputs.prop_receipt.asset_id).toBe('blue_railing');
        expect(tx.witness.store_purchase.tx_nonce).toBe('store-1');
    });

    it('settles a fixture purchase by spending CKB and emitting a prop receipt', () => {
        const tx = buildStorePurchaseTransaction({
            walletAccount: { provider: 'joyid', address: 'ckt1owner', network: 'testnet' },
            item: generalStoreItem('blue_railing'),
            txNonce: 'store-1',
        });
        const settlement = settleStorePurchaseFixture({
            tx,
            txHash: '0xstore',
            indexedBalances: {
                ckb: { amount: 1000, stale: false, outPoint: { txHash: '0xold', index: 0 } },
            },
        });
        expect(settlement.ok).toBe(true);
        expect(settlement.outputs.payment_balance_cell.amount).toBe(650);
        expect(settlement.outputs.prop_receipt.asset_id).toBe('blue_railing');
        expect(settlement.updates.ckb.amount).toBe(650);
    });

    it('omits the CKB output when the purchase spends the balance to zero', () => {
        const tx = buildStorePurchaseTransaction({
            walletAccount: { provider: 'joyid', address: 'ckt1owner', network: 'testnet' },
            item: generalStoreItem('blue_railing'),
            txNonce: 'store-2',
        });
        const settlement = settleStorePurchaseFixture({
            tx,
            indexedBalances: { ckb: { amount: 350, stale: false } },
        });
        expect(settlement.ok).toBe(true);
        expect(settlement.outputs.payment_balance_cell).toBeNull();
        expect(settlement.updates.ckb.spent).toBe(true);
    });
});
