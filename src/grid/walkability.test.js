import { describe, it, expect } from '../test/harness.js';
import { ORE_CATALOG } from '../mining/oreCatalog.js';
import { isInteractable, isWalkable } from './walkability.js';

function mapWithObject(obj) {
    return {
        objectAt() {
            return obj;
        },
    };
}

describe('walkability interactions', () => {
    it('treats generated empty farm plots as walkable terrain', () => {
        const map = {
            inBounds: () => true,
            getTerrain: () => 'farm_plot_empty',
            objectAt: () => null,
        };
        expect(isWalkable(map, 0, 0)).toBe(true);
    });

    it('treats every catalog ore as interactable', () => {
        for (const assetId of Object.keys(ORE_CATALOG)) {
            expect(isInteractable(mapWithObject({ assetId }), 0, 0)).toBe(true);
        }
    });

    it('does not treat inert blockers as interactable', () => {
        expect(isInteractable(mapWithObject({ assetId: 'boulder' }), 0, 0)).toBe(false);
    });

    it('treats harvest resource roles as interactable', () => {
        expect(isInteractable(mapWithObject({ assetId: 'cypress', role: 'wood_resource' }), 0, 0)).toBe(true);
        expect(isInteractable(mapWithObject({ assetId: 'boulder', role: 'stone_resource' }), 0, 0)).toBe(true);
    });

    it('treats planted farm crops as interactable', () => {
        expect(isInteractable(mapWithObject({ assetId: 'crop_patch', role: 'farm_crop' }), 0, 0)).toBe(true);
    });
});
