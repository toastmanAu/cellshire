import { describe, it, expect } from '../test/harness.js';
import {
    MINE_PROPERTY_PORTAL_ROLE,
    PROPERTY_EDIT_BOUNDS,
    PROPERTY_MINE_PORTAL_ROLE,
    PROPERTY_SIZE,
    addMinePropertyPortal,
    canEditPropertyCell,
    canPlacePropertyAsset,
    createStarterPropertyMap,
    isStarterPropertyAsset,
} from './propertyZone.js';
import { TileMap } from '../grid/TileMap.js';
import { TOWNSHIP_PORTAL_ROLE } from '../township/townshipZone.js';
import { farmBoundsForTier } from '../farm/farmZone.js';

describe('property zone starter map', () => {
    it('creates a bounded starter property with terrain and a return portal', () => {
        const map = createStarterPropertyMap();
        expect(map.width).toBe(PROPERTY_SIZE);
        expect(map.height).toBe(PROPERTY_SIZE);
        expect(map.getTerrain(PROPERTY_EDIT_BOUNDS.minGx, PROPERTY_EDIT_BOUNDS.minGy)).toBe('grass');
        const farm = farmBoundsForTier(1);
        expect(map.getTerrain(farm.minGx, farm.minGy)).toBe('farm_plot_empty');
        expect(map.objectAt(12, PROPERTY_EDIT_BOUNDS.minGy).role).toBe(PROPERTY_MINE_PORTAL_ROLE);
        expect(map.objectAt(PROPERTY_EDIT_BOUNDS.minGx + 2, PROPERTY_EDIT_BOUNDS.minGy + 1).role)
            .toBe(TOWNSHIP_PORTAL_ROLE);
        expect(map.objectAt(PROPERTY_EDIT_BOUNDS.minGx - 1, PROPERTY_EDIT_BOUNDS.minGy - 1).assetId)
            .toBe('home_fence');
        expect(map.objectAt(PROPERTY_EDIT_BOUNDS.minGx + 3, PROPERTY_EDIT_BOUNDS.minGy + 3).assetId)
            .toBe('house');
    });

    it('allows edits only inside the starter claim bounds', () => {
        expect(canEditPropertyCell(PROPERTY_EDIT_BOUNDS.minGx, PROPERTY_EDIT_BOUNDS.minGy)).toBe(true);
        expect(canEditPropertyCell(PROPERTY_EDIT_BOUNDS.minGx - 1, PROPERTY_EDIT_BOUNDS.minGy)).toBe(false);
    });

    it('allows only starter-owned assets inside the claim footprint', () => {
        expect(isStarterPropertyAsset('bench')).toBe(true);
        expect(isStarterPropertyAsset('house')).toBe(true);
        expect(isStarterPropertyAsset('home_fence')).toBe(true);
        expect(canPlacePropertyAsset('bench', PROPERTY_EDIT_BOUNDS.minGx, PROPERTY_EDIT_BOUNDS.minGy)).toBe(true);
        expect(canPlacePropertyAsset('coal_seam', PROPERTY_EDIT_BOUNDS.minGx, PROPERTY_EDIT_BOUNDS.minGy)).toBe(false);
        expect(canPlacePropertyAsset('bench', PROPERTY_EDIT_BOUNDS.maxGx + 1, PROPERTY_EDIT_BOUNDS.maxGy)).toBe(false);
    });

    it('allows bought non-starter assets inside the claim footprint', () => {
        expect(canPlacePropertyAsset('blue_railing', PROPERTY_EDIT_BOUNDS.minGx, PROPERTY_EDIT_BOUNDS.minGy)).toBe(false);
        expect(canPlacePropertyAsset('blue_railing', PROPERTY_EDIT_BOUNDS.minGx, PROPERTY_EDIT_BOUNDS.minGy, PROPERTY_EDIT_BOUNDS, {
            isOwned: assetId => assetId === 'blue_railing',
        })).toBe(true);
    });

    it('allows unlocked standard building assets through the owned predicate', () => {
        expect(canPlacePropertyAsset('workbench', PROPERTY_EDIT_BOUNDS.minGx, PROPERTY_EDIT_BOUNDS.minGy)).toBe(false);
        expect(canPlacePropertyAsset('workbench', PROPERTY_EDIT_BOUNDS.minGx, PROPERTY_EDIT_BOUNDS.minGy, PROPERTY_EDIT_BOUNDS, {
            isOwned: assetId => assetId === 'workbench',
        })).toBe(true);
    });

    it('adds a mine-side property portal near a target cell', () => {
        const map = new TileMap(8, 8);
        for (let gy = 0; gy < 8; gy++)
        for (let gx = 0; gx < 8; gx++) map.setTerrain(gx, gy, 'dirt');
        const portal = addMinePropertyPortal(map, { gx: 4, gy: 4 });
        expect(portal.role).toBe(MINE_PROPERTY_PORTAL_ROLE);
        expect(map.objectAt(portal.gx, portal.gy).assetId).toBe('signpost');
    });
});
