import { describe, it, expect } from '../test/harness.js';
import { ORE_CATALOG, isOre, oreDisplayName } from './oreCatalog.js';

describe('ORE_CATALOG', () => {
    it('contains the 12 current mineable deposits', () => {
        expect(Object.keys(ORE_CATALOG).sort()).toEqual([
            'amethyst_geode',
            'bismuth_ore',
            'ckb_cluster',
            'coal_seam',
            'cobalt_ore',
            'copper_ore',
            'diamond_ore',
            'gold_ore',
            'iron_ore',
            'lithium_ore',
            'silicon_quartz',
            'silver_ore',
        ]);
    });

    it('recognizes new energy and tech deposits as ores', () => {
        expect(isOre('silver_ore')).toBe(true);
        expect(isOre('lithium_ore')).toBe(true);
        expect(isOre('bismuth_ore')).toBe(true);
        expect(isOre('cobalt_ore')).toBe(true);
        expect(isOre('silicon_quartz')).toBe(true);
    });

    it('uses player-facing display names for the new deposits', () => {
        expect(oreDisplayName('silver_ore')).toBe('Silver');
        expect(oreDisplayName('lithium_ore')).toBe('Lithium');
        expect(oreDisplayName('bismuth_ore')).toBe('Bismuth');
        expect(oreDisplayName('cobalt_ore')).toBe('Cobalt');
        expect(oreDisplayName('silicon_quartz')).toBe('Silicon');
    });
});
