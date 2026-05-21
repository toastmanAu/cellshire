import { describe, it, expect } from '../test/harness.js';
import {
    HARVEST_RESOURCE_ROLES,
    harvestResourceConfig,
    isHarvestResourceObject,
    isHarvestResourceRole,
} from './harvestCatalog.js';

describe('harvest resource catalog', () => {
    it('maps harvest roles to local resources and yields', () => {
        const wood = harvestResourceConfig(HARVEST_RESOURCE_ROLES.wood);
        expect(wood.resourceId).toBe('wood');
        expect(wood.yieldAmount).toBe(3);
        expect(harvestResourceConfig(HARVEST_RESOURCE_ROLES.stone).resourceId).toBe('stone');
    });

    it('identifies harvestable objects by role', () => {
        expect(isHarvestResourceRole('wood_resource')).toBe(true);
        expect(isHarvestResourceObject({ role: 'stone_resource' })).toBe(true);
        expect(isHarvestResourceObject({ assetId: 'cypress' })).toBe(false);
    });
});
