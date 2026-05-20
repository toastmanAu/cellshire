import { describe, it, expect } from '../test/harness.js';
import { Inventory } from '../core/Inventory.js';
import { PropInventory } from '../property/propInventory.js';
import {
    buyStoreItem,
    canBuyStoreItem,
    formatStorePrice,
    generalStoreCatalog,
    generalStoreItem,
} from './generalStoreCatalog.js';

describe('generalStoreCatalog', () => {
    it('exposes fixed placeable items with prices, rarity, and unlock tiers', () => {
        const items = generalStoreCatalog();
        expect(items.length).toBe(9);
        expect(items.every(item => item.name && item.price.currency === 'ckb')).toBe(true);
        expect(generalStoreItem('blue_railing').unlockTier).toBe(1);
        expect(generalStoreItem('windmill').rarity).toBe('rare');
    });

    it('checks unlock tier and local CKB balance before purchase', () => {
        const inventory = new Inventory();
        inventory.add('ckb', 1000);
        expect(canBuyStoreItem({
            item: generalStoreItem('stone_lantern'),
            propertyTier: 1,
            inventory,
        }).ok).toBe(true);
        expect(canBuyStoreItem({
            item: generalStoreItem('well'),
            propertyTier: 1,
            inventory,
        }).reason).toBe('locked-tier');
        expect(canBuyStoreItem({
            item: generalStoreItem('house'),
            propertyTier: 3,
            inventory,
        }).reason).toBe('insufficient-funds');
    });

    it('buys one prop instance into prop inventory and spends CKB', () => {
        const inventory = new Inventory();
        const props = new PropInventory();
        inventory.add('ckb', 1000);
        const out = buyStoreItem({
            assetId: 'blue_railing',
            inventory,
            propInventory: props,
            propertyTier: 1,
        });
        expect(out.ok).toBe(true);
        expect(inventory.get('ckb')).toBe(500);
        expect(props.get('blue_railing')).toBe(1);
    });

    it('formats store prices through the economy display layer', () => {
        expect(formatStorePrice(generalStoreItem('blue_railing'))).toBe('500.00 CKB');
    });
});
