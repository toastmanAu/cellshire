import { describe, it, expect } from '../test/harness.js';
import { isInteractable, isWalkable } from '../grid/walkability.js';
import {
    TOWNSHIP_BUILDING_ROLES,
    TOWNSHIP_MINE_PORTAL_ROLE,
    TOWNSHIP_PROPERTY_PORTAL_ROLE,
    TOWNSHIP_SIZE,
    TOWNSHIP_SPAWN,
    addMineTownshipPortal,
    createTownshipMap,
    isTownshipBuildingRole,
    townshipBuildingLabel,
} from './townshipZone.js';
import { TileMap } from '../grid/TileMap.js';

describe('township zone', () => {
    it('creates a communal township with landmark buildings and exits', () => {
        const map = createTownshipMap();
        expect(map.width).toBe(TOWNSHIP_SIZE);
        expect(map.height).toBe(TOWNSHIP_SIZE);
        expect(isWalkable(map, TOWNSHIP_SPAWN.gx, TOWNSHIP_SPAWN.gy)).toBe(true);
        expect(map.objects.find(o => o.role === TOWNSHIP_BUILDING_ROLES.store).assetId).toBe('township_store');
        expect(map.objects.find(o => o.role === TOWNSHIP_BUILDING_ROLES.market).assetId).toBe('township_market');
        expect(map.objects.find(o => o.role === TOWNSHIP_BUILDING_ROLES.bank).assetId).toBe('township_bank');
        expect(map.objects.find(o => o.role === TOWNSHIP_BUILDING_ROLES.gallery).assetId).toBe('township_gallery');
        expect(map.objects.find(o => o.role === TOWNSHIP_BUILDING_ROLES.communityHall).assetId).toBe('township_community_hall');
        expect(map.objects.some(o => o.role === TOWNSHIP_MINE_PORTAL_ROLE)).toBe(true);
        expect(map.objects.some(o => o.role === TOWNSHIP_PROPERTY_PORTAL_ROLE)).toBe(true);
    });

    it('marks township landmarks and exits as interactable hotspots', () => {
        const map = createTownshipMap();
        const store = map.objects.find(o => o.role === TOWNSHIP_BUILDING_ROLES.store);
        const mineExit = map.objects.find(o => o.role === TOWNSHIP_MINE_PORTAL_ROLE);
        expect(isInteractable(map, store.gx, store.gy)).toBe(true);
        expect(isInteractable(map, mineExit.gx, mineExit.gy)).toBe(true);
        expect(isTownshipBuildingRole(TOWNSHIP_BUILDING_ROLES.bank)).toBe(true);
        expect(townshipBuildingLabel(TOWNSHIP_BUILDING_ROLES.communityHall)).toBe('Community Hall');
    });

    it('adds a mine-side township portal near the player spawn', () => {
        const map = new TileMap(10, 10);
        for (let gy = 0; gy < 10; gy++)
        for (let gx = 0; gx < 10; gx++) map.setTerrain(gx, gy, 'dirt');
        const portal = addMineTownshipPortal(map, { gx: 5, gy: 5 });
        expect(portal.role).toBe('township_portal');
        expect(map.objectAt(portal.gx, portal.gy).assetId).toBe('signpost');
    });
});
