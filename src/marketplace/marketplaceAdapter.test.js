import { describe, expect, it } from '../test/harness.js';
import { Inventory } from '../core/Inventory.js';
import {
    FixtureCurrencyIndexer,
    ReadOnlyChainCurrencyAdapter,
} from '../economy/currencyAdapter.js';
import { PendingCurrencyDeltaStore } from '../economy/pendingCurrencyDeltas.js';
import { PropInventory } from '../property/propInventory.js';
import {
    loadMarketplaceState,
    marketplaceListings,
} from './playerMarketplace.js';
import {
    chainMarketplaceEnabled,
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

    it('selects the chain marketplace adapter only behind the explicit flag', () => {
        expect(chainMarketplaceEnabled(new URLSearchParams('chainMarketplace=1'))).toBe(true);
        expect(makeMarketplaceAdapterFromParams({ params: new URLSearchParams('') }).constructor.name)
            .toBe('LocalMarketplaceAdapter');
        expect(makeMarketplaceAdapterFromParams({ params: new URLSearchParams('chainMarketplace=1') }).constructor.name)
            .toBe('ChainMarketplaceAdapter');
    });
});
