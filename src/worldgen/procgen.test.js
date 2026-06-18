import { describe, it, expect } from '../test/harness.js';
import { TileMap } from '../grid/TileMap.js';
import { generateWorld } from './procgen.js';
import { HARVEST_RESOURCE_ROLES } from '../resources/harvestCatalog.js';

describe('generateWorld resources', () => {
    it('places epoch-refreshing wood, stone, and gold harvest resources', () => {
        const map = new TileMap(80, 80);
        const stats = generateWorld(map, 1337);
        expect(stats.treesPlaced > 0).toBe(true);
        expect(stats.stoneResourcesPlaced > 0).toBe(true);
        expect(stats.stoneResourcesGuaranteed).toBe(0);
        expect(stats.goldResourcesPlaced > 0).toBe(true);
        expect(map.objects.some(o => o.role === HARVEST_RESOURCE_ROLES.wood)).toBe(true);
        expect(map.objects.some(o => o.role === HARVEST_RESOURCE_ROLES.stone)).toBe(true);
        expect(map.objects.some(o => o.role === HARVEST_RESOURCE_ROLES.gold)).toBe(true);
        expect(map.objects.some(o => o.role === HARVEST_RESOURCE_ROLES.wood && o.assetId === 'harvest_tree')).toBe(true);
        expect(map.objects.some(o => o.role === HARVEST_RESOURCE_ROLES.stone && o.assetId === 'stone_outcrop')).toBe(true);
        expect(map.objects.some(o => o.role === HARVEST_RESOURCE_ROLES.gold && o.assetId === 'gold_nugget_node')).toBe(true);
    });

    it('tops up stone near the first mine spawn when scatter is sparse', () => {
        const map = new TileMap(80, 80);
        const stats = generateWorld(map, 20260523);
        expect(stats.stoneResourcesGuaranteed).toBe(1);
    });
});
