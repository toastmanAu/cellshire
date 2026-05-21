import { describe, it, expect } from '../test/harness.js';
import { ResourceInventory } from '../resources/resourceInventory.js';
import { buildResourceSummary, installResourceHUD } from './ResourceHUD.js';

describe('ResourceHUD', () => {
    it('summarizes local resource inventory entries', () => {
        const inventory = new ResourceInventory();
        inventory.add('wood', 3);
        inventory.add('stone', 2);
        const summary = buildResourceSummary(inventory);
        expect(summary.hasResources).toBe(true);
        expect(summary.totalKinds).toBe(2);
        expect(summary.entries).toEqual([
            ['stone', 2],
            ['wood', 3],
        ]);
    });

    it('renders and updates compact resource balances', () => {
        document.querySelectorAll('#resource-hud').forEach(node => node.remove());
        const inventory = new ResourceInventory();
        const hud = installResourceHUD({ resourceInventory: inventory });

        expect(hud.root.textContent.includes('Harvest trees or stone.')).toBe(true);
        inventory.add('wood', 3);
        expect(hud.root.textContent.includes('Wood')).toBe(true);
        expect(hud.root.textContent.includes('3')).toBe(true);
        expect(hud.root.textContent.includes('Last +3 Wood')).toBe(true);
        hud.dismiss();
    });
});
