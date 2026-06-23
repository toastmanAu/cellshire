import { describe, expect, it } from '../test/harness.js';
import { clearOpenAssetDefinitions } from '../assets/assetRegistry.js';
import { openAssetIdForCell } from '../assets/openAssetStandard.js';
import { buildStorePurchaseTransaction } from '../chain/storePurchaseTx.js';
import { Inventory } from '../core/Inventory.js';
import {
    FixtureCurrencyIndexer,
    ReadOnlyChainCurrencyAdapter,
} from '../economy/currencyAdapter.js';
import { PendingCurrencyDeltaStore } from '../economy/pendingCurrencyDeltas.js';
import { PropInventory } from '../property/propInventory.js';
import { generalStoreItem } from '../store/generalStoreCatalog.js';
import {
    createMarketplaceListing,
    loadMarketplaceState,
    marketplaceListings,
} from './playerMarketplace.js';
import {
    chainMarketplaceEnabled,
    chainMarketplaceSubmitMode,
    ChainMarketplaceAdapter,
    LocalMarketplaceAdapter,
    makeMarketplaceAdapterFromParams,
} from './marketplaceAdapter.js';

function fakeStorage() {
    const m = new Map();
    return {
        get: k => (m.has(k) ? m.get(k) : null),
        set: (k, v) => m.set(k, String(v)),
    };
}

describe('marketplace adapters', () => {
    it('keeps the local marketplace buy path unchanged', async () => {
        const state = loadMarketplaceState({ get: () => null });
        const listing = marketplaceListings(state).find(item => item.assetId === 'olive');
        const inventory = new Inventory();
        const props = new PropInventory();
        inventory.add('ckb', 5000);
        const out = await new LocalMarketplaceAdapter().buy({
            listingId: listing.id,
            buyer: { address: 'ckt1buyer' },
            inventory,
            propInventory: props,
            state,
        });
        expect(out.ok).toBe(true);
        expect(inventory.get('ckb')).toBe(2800);
        expect(props.get('olive')).toBe(1);
    });

    it('settles chain fixture marketplace buys and clears pending CKB', async () => {
        const storage = fakeStorage();
        const pendingDeltas = new PendingCurrencyDeltaStore({ storage, owner: 'ckt1buyer' });
        const indexer = new FixtureCurrencyIndexer({
            balances: { ckb: { amount: 5000, stale: false } },
        });
        const chainAdapter = new ReadOnlyChainCurrencyAdapter({
            localInventory: new Inventory(),
            owner: 'ckt1buyer',
            chainCurrencyIds: ['ckb'],
            indexer,
            pendingDeltas,
        });
        const state = loadMarketplaceState({ get: () => null });
        const listing = marketplaceListings(state).find(item => item.assetId === 'olive');
        const props = new PropInventory();
        const out = await new ChainMarketplaceAdapter({
            owner: 'ckt1buyer',
            inventoryAdapter: chainAdapter,
        }).buy({
            listingId: listing.id,
            buyer: { address: 'ckt1buyer', provider: 'joyid' },
            propInventory: props,
            state,
        });
        expect(out.ok).toBe(true);
        expect(out.mode).toBe('chain-fixture-settled');
        expect(props.get('olive')).toBe(1);
        expect(pendingDeltas.list().length).toBe(1);
        const reconciled = await chainAdapter.read();
        expect(reconciled.pending).toBe(false);
        expect(reconciled.currencies.get('ckb')).toBe(2800);
        expect(marketplaceListings(state).some(item => item.id === listing.id)).toBe(false);
    });

    it('transfers fixture Open Asset listing cells to the chain buyer', async () => {
        clearOpenAssetDefinitions();
        const indexer = new FixtureCurrencyIndexer({
            balances: { ckb: { amount: 5000, stale: false } },
        });
        const storeTx = buildStorePurchaseTransaction({
            walletAccount: { provider: 'joyid', address: 'ckt1seller', network: 'testnet' },
            item: generalStoreItem('blue_railing'),
            txNonce: 'market-transfer-1',
        });
        const storeSettlement = indexer.applyStorePurchaseTx(storeTx, { txHash: '0xstore' });
        expect(storeSettlement.ok).toBe(true);

        const openAssetId = openAssetIdForCell('store:ckt1seller:blue_railing:market-transfer-1');
        const sellerProps = new PropInventory();
        const sellerAdapter = new ReadOnlyChainCurrencyAdapter({
            localInventory: new Inventory(),
            props: sellerProps,
            owner: 'ckt1seller',
            chainCurrencyIds: ['ckb'],
            indexer,
        });
        await sellerAdapter.read();
        const state = loadMarketplaceState({ get: () => null });
        const listed = createMarketplaceListing({
            assetId: openAssetId,
            price: { currency: 'ckb', amount: 1500 },
            seller: { address: 'ckt1seller', label: 'Seller' },
            propInventory: sellerProps,
            state,
            now: () => 123,
        });
        expect(listed.ok).toBe(true);
        expect(listed.listing.cellId).toBe('store:ckt1seller:blue_railing:market-transfer-1');

        const buyerProps = new PropInventory();
        const buyerAdapter = new ReadOnlyChainCurrencyAdapter({
            localInventory: new Inventory(),
            props: buyerProps,
            owner: 'ckt1buyer',
            chainCurrencyIds: ['ckb'],
            indexer,
        });
        const out = await new ChainMarketplaceAdapter({
            owner: 'ckt1buyer',
            inventoryAdapter: buyerAdapter,
        }).buy({
            listingId: listed.listing.id,
            buyer: { address: 'ckt1buyer', provider: 'joyid' },
            propInventory: buyerProps,
            state,
        });

        expect(out.ok).toBe(true);
        expect(out.mode).toBe('chain-fixture-settled');
        expect(out.settlement.outputs.open_asset_cell.owner).toBe('ckt1buyer');
        expect(buyerProps.get(openAssetId)).toBe(1);
        expect((await indexer.getOpenAssetCells({ owner: 'ckt1seller' })).length).toBe(0);
        expect((await indexer.getOpenAssetCells({ owner: 'ckt1buyer' }))[0].cellId)
            .toBe('store:ckt1seller:blue_railing:market-transfer-1');
        expect(marketplaceListings(state).some(item => item.id === listed.listing.id)).toBe(false);
    });

    it('selects the chain marketplace adapter only behind the explicit flag', () => {
        expect(chainMarketplaceEnabled(new URLSearchParams('chainMarketplace=1'))).toBe(true);
        expect(chainMarketplaceSubmitMode(new URLSearchParams('chainMarketplaceSubmit=ccc'))).toBe('ccc-joyid');
        expect(makeMarketplaceAdapterFromParams({ params: new URLSearchParams('') }).constructor.name)
            .toBe('LocalMarketplaceAdapter');
        expect(makeMarketplaceAdapterFromParams({ params: new URLSearchParams('chainMarketplace=1') }).constructor.name)
            .toBe('ChainMarketplaceAdapter');
    });

    it('requires a CCC-backed JoyID wallet for CCC marketplace purchases', async () => {
        const state = loadMarketplaceState({ get: () => null });
        const listing = marketplaceListings(state).find(item => item.assetId === 'olive');
        const out = await new ChainMarketplaceAdapter({
            owner: 'ckt1buyer',
            requireWallet: true,
            inventoryAdapter: {
                async read() {
                    return { currencies: new Map([['ckb', 5000]]) };
                },
            },
        }).buy({
            listingId: listing.id,
            buyer: { address: 'ckt1buyer', provider: 'joyid' },
            propInventory: new PropInventory(),
            state,
        });
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('wallet-disconnected');
    });

    it('submits CCC marketplace receipts without fixture-settling the listing payment', async () => {
        const state = loadMarketplaceState({ get: () => null });
        const listing = marketplaceListings(state).find(item => item.assetId === 'olive');
        const props = new PropInventory();
        let settled = false;
        const out = await new ChainMarketplaceAdapter({
            owner: 'ckt1buyer',
            requireWallet: true,
            submit: async tx => ({
                ok: true,
                mode: 'ccc-joyid',
                txHash: '0xmarketreal',
                payload: tx.witness.marketplace_purchase,
            }),
            inventoryAdapter: {
                async read() {
                    return { currencies: new Map([['ckb', 5000]]) };
                },
                settleMarketplacePurchaseTx() {
                    settled = true;
                    return { ok: true };
                },
                addPendingDelta(delta) {
                    this.pending = delta;
                },
            },
        }).buy({
            listingId: listing.id,
            buyer: { address: 'ckt1buyer', provider: 'joyid', signer: 'ccc-joyid' },
            propInventory: props,
            state,
        });
        expect(out.ok).toBe(true);
        expect(out.mode).toBe('chain-ccc-receipt');
        expect(settled).toBe(false);
        expect(props.get('olive')).toBe(1);
    });
});
