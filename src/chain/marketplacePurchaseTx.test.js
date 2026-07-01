import { describe, expect, it } from '../test/harness.js';
import { clearOpenAssetDefinitions } from '../assets/assetRegistry.js';
import { openAssetIdForCell, registerOpenAssetCell } from '../assets/openAssetStandard.js';
import { loadMarketplaceState, marketplaceListings } from '../marketplace/playerMarketplace.js';
import {
    buildMarketplacePurchaseTransaction,
    settleMarketplacePurchaseFixture,
} from './marketplacePurchaseTx.js';

describe('marketplace purchase transaction', () => {
    function openAssetCell(cellId = 'store:ckt1seller:blue_railing:market-1') {
        return {
            schema: 'cellshire.open_asset',
            version: 1,
            cellId,
            itemType: 'prop',
            owner: 'ckt1seller',
            metadata: { name: 'Blue Railing' },
            render: {
                renderer: 'cellshire.manifest-alias',
                version: 1,
                source: { assetId: 'blue_railing' },
            },
        };
    }

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

    it('settles a fixture purchase by spending buyer CKB and crediting seller proceeds', () => {
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
                ckt1buyer: {
                    ckb: { amount: 5000, stale: false, outPoint: { txHash: '0xold', index: 0 } },
                },
                [listing.seller]: {
                    ckb: { amount: 300, stale: false, outPoint: { txHash: '0xsellerold', index: 0 } },
                },
            },
        });
        expect(settlement.ok).toBe(true);
        expect(settlement.outputs.payment_balance_cell.amount).toBe(2800);
        expect(settlement.outputs.buyer_receipt.asset_id).toBe('olive');
        expect(settlement.outputs.seller_receipt.amount).toBe(2200);
        expect(settlement.outputs.seller_balance_cell.owner).toBe(listing.seller);
        expect(settlement.outputs.seller_balance_cell.amount).toBe(2500);
        expect(settlement.balanceUpdates.length).toBe(2);
        expect(settlement.balanceUpdates[0].role).toBe('buyer');
        expect(settlement.balanceUpdates[0].amount).toBe(2800);
        expect(settlement.balanceUpdates[1].role).toBe('seller');
        expect(settlement.balanceUpdates[1].amount).toBe(2500);
    });

    it('carries Open Asset transfer intent through fixture settlement', () => {
        clearOpenAssetDefinitions();
        const cell = openAssetCell();
        const registered = registerOpenAssetCell(cell);
        expect(registered.ok).toBe(true);
        const listing = {
            id: 'market:local:open-1',
            cellId: cell.cellId,
            itemType: 'prop',
            assetId: openAssetIdForCell(cell.cellId),
            seller: 'ckt1seller',
            sellerLabel: 'Seller',
            rarity: 'player',
            price: { currency: 'ckb', amount: 1500 },
        };
        const tx = buildMarketplacePurchaseTransaction({
            walletAccount: { provider: 'joyid', address: 'ckt1buyer', network: 'testnet' },
            listing,
            txNonce: 'market-open-1',
        });
        expect(tx.inputs.listing_cell.cell_id).toBe(cell.cellId);
        expect(tx.outputs.open_asset_transfer.cell_id).toBe(cell.cellId);
        expect(tx.witness.marketplace_purchase.open_asset_cell_id).toBe(cell.cellId);

        const settlement = settleMarketplacePurchaseFixture({
            tx,
            txHash: '0xmarket',
            indexedBalances: {
                ckb: { amount: 5000, stale: false, outPoint: { txHash: '0xold', index: 0 } },
            },
        });
        expect(settlement.ok).toBe(true);
        expect(settlement.outputs.open_asset_transfer.from).toBe('ckt1seller');
        expect(settlement.outputs.open_asset_transfer.to).toBe('ckt1buyer');
    });
});
