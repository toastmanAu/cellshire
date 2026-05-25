import { describe, it, expect } from '../test/harness.js';
import { Inventory } from '../core/Inventory.js';
import { PropInventory } from '../property/propInventory.js';
import {
    buyMarketplaceListing,
    cancelMarketplaceListing,
    createMarketplaceListing,
    formatMarketplacePrice,
    loadMarketplaceState,
    marketplaceCanMutate,
    marketplaceListings,
    saveMarketplaceState,
} from './playerMarketplace.js';

function wallet(address = 'ckt1buyer') {
    return { status: 'connected', account: { address, label: 'Buyer' } };
}

describe('playerMarketplace', () => {
    it('loads seed listings and remains non-mutating without a wallet', () => {
        const state = loadMarketplaceState({ get: () => null });
        const listings = marketplaceListings(state);
        expect(listings.length).toBe(3);
        expect(listings.some(item => item.itemType === 'skin')).toBe(true);
        expect(marketplaceCanMutate({ status: 'disconnected' })).toBe(false);
        expect(formatMarketplacePrice(listings[0]).endsWith('CKB')).toBe(true);
    });

    it('creates a player listing by consuming one owned prop', () => {
        const state = loadMarketplaceState({ get: () => null });
        const props = new PropInventory([['blue_railing', 2]]);
        const out = createMarketplaceListing({
            assetId: 'blue_railing',
            price: { currency: 'ckb', amount: 1500 },
            seller: wallet('ckt1seller').account,
            propInventory: props,
            state,
            now: () => 123,
        });
        expect(out.ok).toBe(true);
        expect(props.get('blue_railing')).toBe(1);
        expect(marketplaceListings(state)[0].seller).toBe('ckt1seller');
    });

    it('rejects raw materials before marketplace asset lookup', () => {
        const state = loadMarketplaceState({ get: () => null });
        const props = new PropInventory([['wood', 10]]);
        const out = createMarketplaceListing({
            assetId: 'wood',
            price: { currency: 'ckb', amount: 1500 },
            seller: wallet('ckt1seller').account,
            propInventory: props,
            state,
        });
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('raw-resource-not-listable');
        expect(props.get('wood')).toBe(10);
        expect(marketplaceListings(state).length).toBe(3);
    });

    it('buys a seed prop listing once and adds it to prop inventory', () => {
        const state = loadMarketplaceState({ get: () => null });
        const props = new PropInventory();
        const inventory = new Inventory();
        inventory.add('ckb', 5000);
        const listing = marketplaceListings(state).find(item => item.assetId === 'olive');
        const out = buyMarketplaceListing({
            listingId: listing.id,
            buyer: wallet('ckt1buyer').account,
            inventory,
            propInventory: props,
            state,
        });
        expect(out.ok).toBe(true);
        expect(props.get('olive')).toBe(1);
        expect(marketplaceListings(state).some(item => item.id === listing.id)).toBe(false);
    });

    it('cancels an owned listing and returns the listed prop', () => {
        const state = loadMarketplaceState({ get: () => null });
        const props = new PropInventory([['blue_railing', 1]]);
        const seller = wallet('ckt1seller').account;
        const listed = createMarketplaceListing({
            assetId: 'blue_railing',
            price: { currency: 'ckb', amount: 1500 },
            seller,
            propInventory: props,
            state,
            now: () => 456,
        });
        expect(props.get('blue_railing')).toBe(0);
        const out = cancelMarketplaceListing({
            listingId: listed.listing.id,
            seller,
            propInventory: props,
            state,
        });
        expect(out.ok).toBe(true);
        expect(props.get('blue_railing')).toBe(1);
    });

    it('persists closed listings and local listings', () => {
        const store = new Map();
        const storage = {
            get: key => store.get(key) ?? null,
            set: (key, value) => store.set(key, value),
        };
        const state = loadMarketplaceState(storage);
        state.closedListingIds.push('market:seed:olive-001');
        expect(saveMarketplaceState(storage, state)).toBe(true);
        const loaded = loadMarketplaceState(storage);
        expect(marketplaceListings(loaded).some(item => item.id === 'market:seed:olive-001')).toBe(false);
    });
});
