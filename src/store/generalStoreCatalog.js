import { ASSET_INDEX } from '../assets/assetManifest.js';
import { formatCurrencyAmount } from '../mining/cryptoEconomy.js';
import { normalizePropertyTier } from '../property/propertyExpansion.js';

export const GENERAL_STORE_ITEMS = Object.freeze([
    Object.freeze({ assetId: 'blue_railing',    rarity: 'common',   unlockTier: 1, price: Object.freeze({ currency: 'ckb', amount: 500 }) }),
    Object.freeze({ assetId: 'hay_bale',        rarity: 'common',   unlockTier: 1, price: Object.freeze({ currency: 'ckb', amount: 650 }) }),
    Object.freeze({ assetId: 'stone_lantern',   rarity: 'common',   unlockTier: 1, price: Object.freeze({ currency: 'ckb', amount: 900 }) }),
    Object.freeze({ assetId: 'stone_basin',     rarity: 'common',   unlockTier: 2, price: Object.freeze({ currency: 'ckb', amount: 1250 }) }),
    Object.freeze({ assetId: 'well',            rarity: 'common',   unlockTier: 2, price: Object.freeze({ currency: 'ckb', amount: 1600 }) }),
    Object.freeze({ assetId: 'veg_garden',      rarity: 'common',   unlockTier: 2, price: Object.freeze({ currency: 'ckb', amount: 1800 }) }),
    Object.freeze({ assetId: 'small_bridge',    rarity: 'uncommon', unlockTier: 3, price: Object.freeze({ currency: 'ckb', amount: 2400 }) }),
    Object.freeze({ assetId: 'house',           rarity: 'uncommon', unlockTier: 3, price: Object.freeze({ currency: 'ckb', amount: 6500 }) }),
    Object.freeze({ assetId: 'windmill',        rarity: 'rare',     unlockTier: 4, price: Object.freeze({ currency: 'ckb', amount: 12000 }) }),
]);

const STORE_INDEX = new Map(GENERAL_STORE_ITEMS.map(item => [item.assetId, item]));

export function generalStoreItem(assetId) {
    const item = STORE_INDEX.get(assetId);
    if (!item) return null;
    const asset = ASSET_INDEX[item.assetId];
    if (!asset) return null;
    return {
        ...item,
        name: asset.name,
        category: asset.category,
        footprint: asset.footprint,
    };
}

export function generalStoreCatalog() {
    return GENERAL_STORE_ITEMS
        .map(item => generalStoreItem(item.assetId))
        .filter(Boolean);
}

export function formatStorePrice(item) {
    return formatCurrencyAmount(item.price.currency, item.price.amount);
}

export function canBuyStoreItem({ item, propertyTier, inventory }) {
    if (!item) return { ok: false, reason: 'missing-item' };
    if (normalizePropertyTier(propertyTier) < item.unlockTier) {
        return { ok: false, reason: 'locked-tier' };
    }
    const balance = inventory?.get?.(item.price.currency) ?? 0;
    if (balance < item.price.amount) {
        return { ok: false, reason: 'insufficient-funds', balance };
    }
    return { ok: true };
}

export function buyStoreItem({ assetId, inventory, propInventory, propertyTier }) {
    const item = generalStoreItem(assetId);
    const check = canBuyStoreItem({ item, propertyTier, inventory });
    if (!check.ok) return { ...check, item };
    inventory.add(item.price.currency, -item.price.amount);
    propInventory.add(item.assetId, 1);
    return {
        ok: true,
        item,
        assetId: item.assetId,
        count: propInventory.get(item.assetId),
    };
}
