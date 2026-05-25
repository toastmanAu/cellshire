import { assetDefinitionFor } from '../assets/assetRegistry.js';
import { formatCurrencyAmount } from '../mining/cryptoEconomy.js';
import { RESOURCE_CATALOG } from '../resources/resourceInventory.js';

export const MARKETPLACE_STORAGE_KEY = 'cellshire:marketplace:v1:local';

export const MARKETPLACE_SEED_LISTINGS = Object.freeze([
    Object.freeze({
        id: 'market:seed:olive-001',
        cellId: 'spore:prop:olive-001',
        itemType: 'prop',
        assetId: 'olive',
        seller: 'ckt1qyqcellshirevendorolive000000000000000000',
        sellerLabel: 'Olive Grove',
        rarity: 'uncommon',
        price: Object.freeze({ currency: 'ckb', amount: 2200 }),
    }),
    Object.freeze({
        id: 'market:seed:archway-001',
        cellId: 'spore:prop:archway-001',
        itemType: 'prop',
        assetId: 'archway',
        seller: 'ckt1qyqcellshirevendorarch0000000000000000000',
        sellerLabel: 'Stonewright',
        rarity: 'rare',
        price: Object.freeze({ currency: 'ckb', amount: 5200 }),
    }),
    Object.freeze({
        id: 'market:seed:seeker-skin-001',
        cellId: 'spore:skin:seeker-001',
        itemType: 'skin',
        assetId: 'player_seeker',
        seller: 'ckt1qyqcellshirevendorskin0000000000000000000',
        sellerLabel: 'Tailor',
        rarity: 'rare',
        price: Object.freeze({ currency: 'ckb', amount: 8000 }),
    }),
]);

function emptyState() {
    return {
        v: 1,
        listings: [],
        closedListingIds: [],
        ownedSkinIds: [],
    };
}

function normalizeState(data) {
    const state = emptyState();
    if (data?.v !== 1) return state;
    state.listings = Array.isArray(data.listings)
        ? data.listings.map(normalizeStoredListing).filter(Boolean)
        : [];
    state.closedListingIds = Array.isArray(data.closedListingIds)
        ? data.closedListingIds.filter(id => typeof id === 'string')
        : [];
    state.ownedSkinIds = Array.isArray(data.ownedSkinIds)
        ? data.ownedSkinIds.filter(id => typeof id === 'string')
        : [];
    return state;
}

function normalizeStoredListing(entry) {
    if (!entry || typeof entry !== 'object') return null;
    if (!assetDefinitionFor(entry.assetId)) return null;
    if (entry.itemType !== 'prop' && entry.itemType !== 'skin') return null;
    if (!entry.price || typeof entry.price.currency !== 'string' || !Number.isFinite(Number(entry.price.amount))) {
        return null;
    }
    if (typeof entry.seller !== 'string' || entry.seller === '') return null;
    return {
        id: typeof entry.id === 'string' ? entry.id : `market:local:${entry.cellId}`,
        cellId: typeof entry.cellId === 'string' ? entry.cellId : `local:${entry.assetId}`,
        itemType: entry.itemType,
        assetId: entry.assetId,
        seller: entry.seller,
        sellerLabel: typeof entry.sellerLabel === 'string' ? entry.sellerLabel : 'Player',
        rarity: typeof entry.rarity === 'string' ? entry.rarity : 'player',
        price: {
            currency: entry.price.currency,
            amount: Number(entry.price.amount),
        },
        active: entry.active !== false,
        createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : 0,
    };
}

export function loadMarketplaceState(storage) {
    const raw = storage?.get?.(MARKETPLACE_STORAGE_KEY);
    if (!raw) return emptyState();
    try {
        return normalizeState(JSON.parse(raw));
    } catch {
        return emptyState();
    }
}

export function saveMarketplaceState(storage, state) {
    try {
        storage?.set?.(MARKETPLACE_STORAGE_KEY, JSON.stringify(normalizeState({ ...state, v: 1 })));
        return true;
    } catch {
        return false;
    }
}

export function marketplaceCanMutate(walletState) {
    return walletState?.status === 'connected' && !!walletState.account?.address;
}

export function enrichListing(listing, source = 'local') {
    const asset = assetDefinitionFor(listing.assetId);
    if (!asset) return null;
    return {
        ...listing,
        source,
        name: asset.name,
        category: asset.category,
        footprint: asset.footprint,
    };
}

export function marketplaceListings(state) {
    const closed = new Set(state.closedListingIds ?? []);
    const seed = MARKETPLACE_SEED_LISTINGS
        .filter(listing => !closed.has(listing.id))
        .map(listing => enrichListing(listing, 'seed'))
        .filter(Boolean);
    const local = (state.listings ?? [])
        .filter(listing => listing.active !== false)
        .map(listing => enrichListing(listing, 'local'))
        .filter(Boolean);
    return [...local, ...seed];
}

export function formatMarketplacePrice(listing) {
    return formatCurrencyAmount(listing.price.currency, listing.price.amount);
}

export function createMarketplaceListing({
    assetId,
    itemType = 'prop',
    price,
    seller,
    propInventory,
    state,
    now = Date.now,
} = {}) {
    if (!seller?.address) return { ok: false, reason: 'wallet-disconnected' };
    if (RESOURCE_CATALOG[assetId]) return { ok: false, reason: 'raw-resource-not-listable' };
    if (!assetDefinitionFor(assetId)) return { ok: false, reason: 'missing-asset' };
    if (itemType !== 'prop' && itemType !== 'skin') return { ok: false, reason: 'invalid-item-type' };
    const amount = Number(price?.amount);
    const currency = price?.currency || 'ckb';
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid-price' };
    if (itemType === 'prop' && !propInventory?.consume?.(assetId, 1)) {
        return { ok: false, reason: 'missing-owned-item' };
    }

    const createdAt = now();
    const seq = (state.listings?.length ?? 0) + 1;
    const listing = normalizeStoredListing({
        id: `market:local:${createdAt}:${seq}`,
        cellId: `spore:${itemType}:${seller.address.slice(-8)}:${createdAt}:${seq}`,
        itemType,
        assetId,
        seller: seller.address,
        sellerLabel: seller.label || 'Player',
        rarity: 'player',
        price: { currency, amount },
        active: true,
        createdAt,
    });
    state.listings.push(listing);
    return { ok: true, listing: enrichListing(listing, 'local') };
}

export function buyMarketplaceListing({
    listingId,
    buyer,
    inventory,
    propInventory,
    state,
} = {}) {
    if (!buyer?.address) return { ok: false, reason: 'wallet-disconnected' };
    const listing = marketplaceListings(state).find(item => item.id === listingId);
    if (!listing) return { ok: false, reason: 'missing-listing' };
    if (listing.seller === buyer.address) return { ok: false, reason: 'own-listing', listing };
    const balance = inventory?.get?.(listing.price.currency) ?? 0;
    if (balance < listing.price.amount) {
        return { ok: false, reason: 'insufficient-funds', listing, balance };
    }

    inventory.add(listing.price.currency, -listing.price.amount);
    if (listing.itemType === 'prop') {
        propInventory.add(listing.assetId, 1);
    } else if (listing.itemType === 'skin' && !state.ownedSkinIds.includes(listing.assetId)) {
        state.ownedSkinIds.push(listing.assetId);
    }
    closeListing(state, listing);
    return { ok: true, listing };
}

export function grantMarketplaceListing({ listing, propInventory, state } = {}) {
    if (!listing) return { ok: false, reason: 'missing-listing' };
    if (listing.itemType === 'prop') {
        propInventory?.add?.(listing.assetId, 1);
    } else if (listing.itemType === 'skin' && !state.ownedSkinIds.includes(listing.assetId)) {
        state.ownedSkinIds.push(listing.assetId);
    }
    closeListing(state, listing);
    return { ok: true, listing };
}

export function cancelMarketplaceListing({
    listingId,
    seller,
    propInventory,
    state,
} = {}) {
    if (!seller?.address) return { ok: false, reason: 'wallet-disconnected' };
    const listing = state.listings.find(item => item.id === listingId && item.active !== false);
    if (!listing) return { ok: false, reason: 'missing-listing' };
    if (listing.seller !== seller.address) return { ok: false, reason: 'not-owner' };
    listing.active = false;
    if (listing.itemType === 'prop') propInventory.add(listing.assetId, 1);
    return { ok: true, listing: enrichListing(listing, 'local') };
}

function closeListing(state, listing) {
    if (listing.source === 'seed') {
        if (!state.closedListingIds.includes(listing.id)) state.closedListingIds.push(listing.id);
        return;
    }
    const stored = state.listings.find(item => item.id === listing.id);
    if (stored) stored.active = false;
}
