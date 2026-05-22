import { BuildingProgression } from '../buildings/buildingProgression.js';
import { Inventory } from '../core/Inventory.js';
import { PropInventory } from '../property/propInventory.js';
import { ResourceInventory } from '../resources/resourceInventory.js';
import {
    availableRecipes,
    craftRecipe,
    recipeSummaries,
} from './recipeCatalog.js';
import { describe, expect, it } from '../test/harness.js';

describe('workbench recipes', () => {
    it('gates recipes by workbench level', () => {
        expect(availableRecipes(0).length).toBe(0);
        expect(availableRecipes(1).map(recipe => recipe.id))
            .toEqual(['herb_planter', 'stone_lantern_kit', 'storage_crate_kit']);
        expect(availableRecipes(2).map(recipe => recipe.id))
            .toEqual([
                'herb_planter',
                'stone_lantern_kit',
                'storage_crate_kit',
                'prospecting_pan',
                'stone_basin_kit',
            ]);
    });

    it('summarizes recipe affordability with resources and CKB', () => {
        const resources = new ResourceInventory([
            ['wood', 6],
            ['stone', 2],
            ['crop', 4],
        ]);
        const currencies = new Inventory();
        currencies.add('ckb', 1200);
        const summaries = recipeSummaries({
            buildingProgression: new BuildingProgression({ workbench: 1 }),
            resourceInventory: resources,
            currencyInventory: currencies,
        });

        expect(summaries[0].canCraft).toBe(true);
        expect(summaries[0].outputLabel).toBe('2 Herb');
        expect(summaries[1].unlocked).toBe(true);
        expect(summaries[2].unlocked).toBe(true);
        expect(summaries[3].unlocked).toBe(false);
    });

    it('crafts a resource output by spending materials and CKB', () => {
        const resources = new ResourceInventory([
            ['wood', 10],
            ['stone', 5],
            ['crop', 6],
        ]);
        const currencies = new Inventory();
        currencies.add('ckb', 1500);

        const result = craftRecipe({
            recipeId: 'herb_planter',
            buildingProgression: new BuildingProgression({ workbench: 1 }),
            resourceInventory: resources,
            currencyInventory: currencies,
        });

        expect(result.ok).toBe(true);
        expect(resources.get('wood')).toBe(4);
        expect(resources.get('stone')).toBe(3);
        expect(resources.get('crop')).toBe(2);
        expect(resources.get('herb')).toBe(2);
        expect(currencies.get('ckb')).toBe(300);
    });

    it('crafts a placeable prop output into prop inventory', () => {
        const resources = new ResourceInventory([
            ['wood', 4],
            ['stone', 10],
            ['crop', 3],
        ]);
        const currencies = new Inventory();
        const props = new PropInventory();
        currencies.add('ckb', 650);

        const result = craftRecipe({
            recipeId: 'stone_lantern_kit',
            buildingProgression: new BuildingProgression({ workbench: 1 }),
            resourceInventory: resources,
            currencyInventory: currencies,
            propInventory: props,
        });

        expect(result.ok).toBe(true);
        expect(props.get('stone_lantern')).toBe(1);
        expect(resources.get('stone')).toBe(0);
        expect(currencies.get('ckb')).toBe(0);
    });

    it('crafts level 2 placeable prop recipes into prop inventory', () => {
        const resources = new ResourceInventory([
            ['wood', 8],
            ['stone', 24],
            ['crop', 8],
        ]);
        const currencies = new Inventory();
        const props = new PropInventory();
        currencies.add('ckb', 2200);

        const result = craftRecipe({
            recipeId: 'stone_basin_kit',
            buildingProgression: new BuildingProgression({ workbench: 2 }),
            resourceInventory: resources,
            currencyInventory: currencies,
            propInventory: props,
        });

        expect(result.ok).toBe(true);
        expect(props.get('stone_basin')).toBe(1);
        expect(resources.get('wood')).toBe(0);
        expect(currencies.get('ckb')).toBe(0);
    });

    it('rejects locked or underfunded recipes without spending', () => {
        const resources = new ResourceInventory([
            ['wood', 20],
            ['stone', 20],
            ['crop', 20],
        ]);
        const currencies = new Inventory();
        currencies.add('ckb', 999);

        const locked = craftRecipe({
            recipeId: 'prospecting_pan',
            buildingProgression: new BuildingProgression({ workbench: 1 }),
            resourceInventory: resources,
            currencyInventory: currencies,
        });
        const underfunded = craftRecipe({
            recipeId: 'herb_planter',
            buildingProgression: new BuildingProgression({ workbench: 1 }),
            resourceInventory: resources,
            currencyInventory: currencies,
        });

        expect(locked.reason).toBe('locked');
        expect(underfunded.reason).toBe('insufficient-funds');
        expect(resources.get('wood')).toBe(20);
        expect(currencies.get('ckb')).toBe(999);
    });
});
