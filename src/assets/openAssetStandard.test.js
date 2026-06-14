import { describe, it, expect } from '../test/harness.js';
import {
    assetDefinitionFor,
    clearOpenAssetDefinitions,
} from './assetRegistry.js';
import {
    definitionFromOpenAssetCell,
    openAssetIdForCell,
    registerOpenAssetCell,
} from './openAssetStandard.js';
import { PlacementSystem } from '../building/PlacementSystem.js';
import { TileMap } from '../grid/TileMap.js';

function fixtureCell() {
    return {
        schema: 'cellshire.open_asset',
        version: 1,
        cellId: 'spore:test:prop:stone-lamp-01',
        itemType: 'prop',
        owner: 'ckt1fixtureowner',
        metadata: {
            name: 'Fixture Stone Lamp',
            description: 'A community-minted lamp fixture.',
            traits: { material: 'stone', light: 'warm' },
        },
        render: {
            renderer: 'cellshire.manifest-alias',
            version: 1,
            source: { assetId: 'stone_lantern' },
            overrides: {
                category: 'props',
                kind: 'object',
                footprint: { w: 1, d: 1 },
                sizeScale: 0.42,
            },
        },
    };
}

describe('open asset standard', () => {
    it('registers standard home-base building visuals in the manifest', () => {
        for (const assetId of ['workbench', 'tool_rack', 'sawmill', 'stone_yard', 'farm_storage']) {
            const def = assetDefinitionFor(assetId);
            expect(def.category).toBe('buildings');
            expect(def.kind).toBe('object');
        }
    });

    it('registers the home boundary fence as a prop asset', () => {
        const def = assetDefinitionFor('home_fence');
        expect(def.category).toBe('props');
        expect(def.kind).toBe('object');
        expect(def.filename).toBe('home_fence.png');
    });

    it('maps a compliant prop cell to a runtime asset definition', () => {
        clearOpenAssetDefinitions();
        const out = definitionFromOpenAssetCell(fixtureCell());
        expect(out.ok).toBe(true);
        expect(out.definition.id).toBe(openAssetIdForCell('spore:test:prop:stone-lamp-01'));
        expect(out.definition.renderSourceAssetId).toBe('stone_lantern');
        expect(out.definition.name).toBe('Fixture Stone Lamp');
    });

    it('registers the fixture as a placeable in-game prop without using a catalog id', () => {
        clearOpenAssetDefinitions();
        const out = registerOpenAssetCell(fixtureCell());
        expect(out.ok).toBe(true);
        const assetId = openAssetIdForCell('spore:test:prop:stone-lamp-01');
        expect(assetDefinitionFor(assetId).kind).toBe('object');

        const map = new TileMap(4, 4);
        const placement = new PlacementSystem(map);
        const placed = placement.place(assetId, 1, 1);
        expect(placed.kind).toBe('object');
        expect(map.objectAt(1, 1).assetId).toBe(assetId);
    });

    it('rejects unsupported versions and missing render sources', () => {
        clearOpenAssetDefinitions();
        expect(definitionFromOpenAssetCell({ ...fixtureCell(), version: 2 }).reason).toBe('unsupported-version');
        expect(definitionFromOpenAssetCell({
            ...fixtureCell(),
            render: { ...fixtureCell().render, source: { assetId: 'not_real' } },
        }).reason).toBe('missing-render-source');
    });
});
