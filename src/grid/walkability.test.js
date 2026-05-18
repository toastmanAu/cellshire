import { describe, it, expect } from '../test/harness.js';
import { ORE_CATALOG } from '../mining/oreCatalog.js';
import { isInteractable } from './walkability.js';

function mapWithObject(obj) {
    return {
        objectAt() {
            return obj;
        },
    };
}

describe('walkability interactions', () => {
    it('treats every catalog ore as interactable', () => {
        for (const assetId of Object.keys(ORE_CATALOG)) {
            expect(isInteractable(mapWithObject({ assetId }), 0, 0)).toBe(true);
        }
    });

    it('does not treat inert blockers as interactable', () => {
        expect(isInteractable(mapWithObject({ assetId: 'boulder' }), 0, 0)).toBe(false);
    });
});
