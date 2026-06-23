import { describe, expect, it } from '../test/harness.js';
import { openAssetIdForCell } from '../assets/openAssetStandard.js';
import { generalStoreItem } from '../store/generalStoreCatalog.js';
import {
    buildStoreOpenAssetMintIntent,
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
        expect(tx.outputs.prop_receipt.open_asset_id)
            .toBe(openAssetIdForCell('store:ckt1owner:blue_railing:store-1'));
        expect(tx.outputs.open_asset_mint.cell.schema).toBe('cellshire.open_asset');
        expect(tx.outputs.open_asset_mint.cell.cellId).toBe('store:ckt1owner:blue_railing:store-1');
        expect(tx.outputs.open_asset_mint.cell.render.source.assetId).toBe('blue_railing');
        expect(tx.witness.store_purchase.tx_nonce).toBe('store-1');
        expect(tx.witness.store_purchase.open_asset_cell_id).toBe('store:ckt1owner:blue_railing:store-1');
    });

    it('builds deterministic Open Asset mint intents for store props', () => {
        const mint = buildStoreOpenAssetMintIntent({
            owner: 'ckt1owner',
            item: generalStoreItem('stone_lantern'),
            txNonce: 'store-3',
        });
        expect(mint.schema).toBe('cellshire.store.open_asset_mint');
        expect(mint.cell.cellId).toBe('store:ckt1owner:stone_lantern:store-3');
        expect(mint.cell.itemType).toBe('prop');
        expect(mint.cell.owner).toBe('ckt1owner');
        expect(mint.cell.metadata.traits.source).toBe('general_store');
        expect(mint.cell.metadata.traits.sourceAssetId).toBe('stone_lantern');
        expect(mint.cell.render.renderer).toBe('cellshire.manifest-alias');
        expect(mint.cell.render.source.assetId).toBe('stone_lantern');
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
        expect(settlement.outputs.open_asset_cell.cellId).toBe('store:ckt1owner:blue_railing:store-1');
        expect(settlement.outputs.open_asset_cell.render.source.assetId).toBe('blue_railing');
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

    it('rejects fixture settlement when the Open Asset mint intent is missing', () => {
        const tx = buildStorePurchaseTransaction({
            walletAccount: { provider: 'joyid', address: 'ckt1owner', network: 'testnet' },
            item: generalStoreItem('blue_railing'),
            txNonce: 'store-4',
        });
        delete tx.outputs.open_asset_mint;
        const settlement = settleStorePurchaseFixture({
            tx,
            indexedBalances: { ckb: { amount: 1000, stale: false } },
        });
        expect(settlement.ok).toBe(false);
        expect(settlement.reason).toBe('invalid-open-asset-mint');
    });
});
