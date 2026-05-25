import { describe, expect, it } from '../test/harness.js';
import { loadMarketplaceState, marketplaceListings } from '../marketplace/playerMarketplace.js';
import {
    buildMarketplacePurchaseTransaction,
    settleMarketplacePurchaseFixture,
} from './marketplacePurchaseTx.js';

describe('marketplace purchase transaction', () => {
    it('builds a chain-shaped marketplace purchase request', () => {
        const state = loadMarketplaceState({ get: () => null });
        const listing = marketplaceListings(state).find(item => item.assetId === 'olive');
        const tx = buildMarketplacePurchaseTransaction({
            walletAccount: { provider: 'joyid', address: 'ckt1buyer', network: 'testnet' },
            listing,
            txNonce: 'market-1',
        });
        expect(tx.kind).toBe('cellshire_marketplace_purchase_tx');
        expect(tx.inputs.payment_balance_cell.amount).toBe(2200);
        expect(tx.inputs.listing_cell.listing_id).toBe(listing.id);
        expect(tx.outputs.buyer_receipt.asset_id).toBe('olive');
        expect(tx.outputs.seller_receipt.owner).toBe(listing.seller);
    });

    it('settles a fixture purchase by spending buyer CKB and keeping listing receipt data', () => {
        const state = loadMarketplaceState({ get: () => null });
        const listing = marketplaceListings(state).find(item => item.assetId === 'olive');
        const tx = buildMarketplacePurchaseTransaction({
            walletAccount: { provider: 'joyid', address: 'ckt1buyer', network: 'testnet' },
            listing,
            txNonce: 'market-1',
        });
        const settlement = settleMarketplacePurchaseFixture({
            tx,
            txHash: '0xmarket',
            indexedBalances: {
                ckb: { amount: 5000, stale: false, outPoint: { txHash: '0xold', index: 0 } },
            },
        });
        expect(settlement.ok).toBe(true);
        expect(settlement.outputs.payment_balance_cell.amount).toBe(2800);
        expect(settlement.outputs.buyer_receipt.asset_id).toBe('olive');
        expect(settlement.outputs.seller_receipt.amount).toBe(2200);
    });
});
