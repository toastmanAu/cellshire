import { ASSET_INDEX } from '../assets/assetManifest.js';
import { formatCurrencyAmount } from '../mining/cryptoEconomy.js';
import { formatResourceAmount } from '../resources/resourceInventory.js';

export const WORKBENCH_RECIPES = Object.freeze([
    Object.freeze({
        id: 'herb_planter',
        name: 'Herb Planter',
        workbenchLevel: 1,
        cost: Object.freeze({
            resources: Object.freeze({ wood: 6, stone: 2, crop: 4 }),
            ckb: 1200,
        }),
        output: Object.freeze({ resourceId: 'herb', amount: 2 }),
    }),
    Object.freeze({
        id: 'stone_lantern_kit',
        name: 'Stone Lantern Kit',
        workbenchLevel: 1,
        cost: Object.freeze({
            resources: Object.freeze({ wood: 4, stone: 10, crop: 3 }),
            ckb: 650,
        }),
        output: Object.freeze({ assetId: 'stone_lantern', amount: 1 }),
    }),
    Object.freeze({
        id: 'storage_crate_kit',
        name: 'Storage Crate Kit',
        workbenchLevel: 1,
        cost: Object.freeze({
            resources: Object.freeze({ wood: 12, stone: 2, crop: 4 }),
            ckb: 900,
        }),
        output: Object.freeze({ assetId: 'crate', amount: 1 }),
    }),
    Object.freeze({
        id: 'herbal_garden_kit',
        name: 'Herbal Garden Kit',
        workbenchLevel: 1,
        cost: Object.freeze({
            resources: Object.freeze({ wood: 4, stone: 4, crop: 6, herb: 2 }),
            ckb: 1000,
        }),
        output: Object.freeze({ assetId: 'garden_bed', amount: 1 }),
    }),
    Object.freeze({
        id: 'prospecting_pan',
        name: 'Prospecting Pan',
        workbenchLevel: 2,
        cost: Object.freeze({
            resources: Object.freeze({ wood: 12, stone: 12, crop: 6 }),
            ckb: 3200,
        }),
        output: Object.freeze({ resourceId: 'gold', amount: 1 }),
    }),
    Object.freeze({
        id: 'stone_basin_kit',
        name: 'Stone Basin Kit',
        workbenchLevel: 2,
        cost: Object.freeze({
            resources: Object.freeze({ wood: 8, stone: 24, crop: 8 }),
            ckb: 2200,
        }),
        output: Object.freeze({ assetId: 'stone_basin', amount: 1 }),
    }),
    Object.freeze({
        id: 'gold_lantern_kit',
        name: 'Gold Lantern Kit',
        workbenchLevel: 2,
        cost: Object.freeze({
            resources: Object.freeze({ wood: 6, stone: 14, crop: 6, herb: 3, gold: 1 }),
            ckb: 2800,
        }),
        output: Object.freeze({ assetId: 'hanging_lantern', amount: 1 }),
    }),
]);

const RECIPE_INDEX = new Map(WORKBENCH_RECIPES.map(recipe => [recipe.id, recipe]));

export function recipeById(recipeId) {
    return RECIPE_INDEX.get(recipeId) ?? null;
}

export function availableRecipes(workbenchLevel = 0) {
    const level = Math.max(0, Math.floor(Number(workbenchLevel) || 0));
    return WORKBENCH_RECIPES.filter(recipe => recipe.workbenchLevel <= level);
}

export function recipeSummary({ recipe, buildingProgression, resourceInventory, currencyInventory, activeBuildingProgression = null } = {}) {
    if (!recipe) return null;
    const progression = activeBuildingProgression ?? buildingProgression;
    const workbenchLevel = progression?.getLevel?.('workbench') ?? 0;
    const unlocked = workbenchLevel >= recipe.workbenchLevel;
    return {
        ...recipe,
        unlocked,
        canCraft: unlocked && canAffordRecipe({ recipe, resourceInventory, currencyInventory }),
        costLabel: formatRecipeCost(recipe.cost),
        outputLabel: formatRecipeOutput(recipe.output),
        requiredLabel: `Workbench ${recipe.workbenchLevel}`,
    };
}

export function recipeSummaries({ buildingProgression, resourceInventory, currencyInventory, activeBuildingProgression = null } = {}) {
    return WORKBENCH_RECIPES.map(recipe => recipeSummary({
        recipe,
        buildingProgression,
        resourceInventory,
        currencyInventory,
        activeBuildingProgression,
    }));
}

export function formatRecipeCost(cost) {
    if (!cost) return '';
    const resources = Object.entries(cost.resources ?? {})
        .map(([resourceId, amount]) => formatResourceAmount(resourceId, amount));
    return [...resources, formatCurrencyAmount('ckb', cost.ckb ?? 0)].join(' · ');
}

export function formatRecipeOutput(output) {
    if (!output) return '';
    if (output.assetId) {
        const name = ASSET_INDEX[output.assetId]?.name ?? output.assetId;
        return `${Math.floor(output.amount ?? 1)} ${name}`;
    }
    return formatResourceAmount(output.resourceId, output.amount);
}

export function canAffordRecipe({ recipe, resourceInventory, currencyInventory } = {}) {
    if (!recipe) return false;
    const resourcesOk = Object.entries(recipe.cost.resources ?? {})
        .every(([resourceId, amount]) => (resourceInventory?.get?.(resourceId) ?? 0) >= amount);
    const ckbOk = (currencyInventory?.get?.('ckb') ?? 0) >= (recipe.cost.ckb ?? 0);
    return resourcesOk && ckbOk;
}

export function craftRecipe({ recipeId, buildingProgression, activeBuildingProgression = null, resourceInventory, currencyInventory, propInventory } = {}) {
    const recipe = recipeById(recipeId);
    if (!recipe) return { ok: false, reason: 'missing-recipe' };
    const progression = activeBuildingProgression ?? buildingProgression;
    const workbenchLevel = progression?.getLevel?.('workbench') ?? 0;
    if (workbenchLevel < recipe.workbenchLevel) {
        return { ok: false, reason: 'locked', recipe, requiredLevel: recipe.workbenchLevel };
    }
    if (!canAffordRecipe({ recipe, resourceInventory, currencyInventory })) {
        return { ok: false, reason: 'insufficient-funds', recipe };
    }
    for (const [resourceId, amount] of Object.entries(recipe.cost.resources ?? {})) {
        resourceInventory.add(resourceId, -amount);
    }
    if (recipe.cost.ckb) currencyInventory.add('ckb', -recipe.cost.ckb);
    if (recipe.output.resourceId) {
        resourceInventory.add(recipe.output.resourceId, recipe.output.amount);
    }
    if (recipe.output.assetId) {
        propInventory?.add?.(recipe.output.assetId, recipe.output.amount ?? 1);
    }
    return { ok: true, recipe, output: recipe.output };
}
