/**
 * oreCatalog.js
 *
 * Tunable per-ore-type mining config. Each entry says how many mining
 * hits an ore takes (capacity) and how much currency drops per hit
 * (yield). Currency keys are the ore asset IDs themselves — the Trader
 * store will convert between them later, so we don't need to invent
 * token names yet.
 *
 * Design intent (DESIGN.md §72): common ores have moderate capacity and
 * small per-hit drops (the bread-and-butter grind); rare ores have
 * tiny capacity but each hit is a small jackpot. ckb_cluster sits in
 * the rare band — but its drops eventually represent real on-chain CKB,
 * so its weighting matters for live economics.
 *
 * Numbers here are first-pass — tune after a few minutes of actual play.
 */

const DEFAULT = {
    capacityRange: [2, 4],
    yieldRange:    [1, 2],
    displayName:   'Ore',
    dustColor:     '#9d8e74',  // muted earth — generic chip
    textColor:     '#1b5ba8',  // cobalt — generic floating-number tint
};

// `dustColor` is the colour of mining chips that puff out per hit.
// `textColor` is the floating "+N" popup tint. Both kept here so all
// per-ore visual flavour lives in one tunable table.
const ORE_CATALOG = {
    coal_seam:      { capacityRange: [4, 7], yieldRange: [1, 3], displayName: 'Coal',        dustColor: '#2a2520', textColor: '#1b5ba8' },
    iron_ore:       { capacityRange: [3, 6], yieldRange: [1, 3], displayName: 'Iron',        dustColor: '#7a5a3c', textColor: '#c4622e' },
    copper_ore:     { capacityRange: [3, 5], yieldRange: [1, 2], displayName: 'Copper',      dustColor: '#b56a3a', textColor: '#c4622e' },
    silver_ore:     { capacityRange: [2, 4], yieldRange: [1, 2], displayName: 'Silver',      dustColor: '#c7c9c9', textColor: '#6a7882' },
    gold_ore:       { capacityRange: [2, 3], yieldRange: [1, 2], displayName: 'Gold',        dustColor: '#e5c065', textColor: '#a87a1a' },
    lithium_ore:    { capacityRange: [2, 4], yieldRange: [1, 2], displayName: 'Lithium',     dustColor: '#e7d5e8', textColor: '#9b6a9d' },
    cobalt_ore:     { capacityRange: [2, 4], yieldRange: [1, 2], displayName: 'Cobalt',      dustColor: '#214fc7', textColor: '#1b5ba8' },
    silicon_quartz: { capacityRange: [2, 4], yieldRange: [1, 2], displayName: 'Silicon',     dustColor: '#d7dde0', textColor: '#6a7882' },
    amethyst_geode: { capacityRange: [1, 2], yieldRange: [1, 2], displayName: 'Amethyst',    dustColor: '#8a6cb8', textColor: '#6a3aa8' },
    bismuth_ore:    { capacityRange: [1, 2], yieldRange: [1, 2], displayName: 'Bismuth',     dustColor: '#35bfc2', textColor: '#a87a1a' },
    diamond_ore:    { capacityRange: [1, 2], yieldRange: [1, 1], displayName: 'Diamond',     dustColor: '#cfe6f4', textColor: '#1b5ba8' },
    ckb_cluster:    { capacityRange: [1, 3], yieldRange: [1, 2], displayName: 'CKB Cluster', dustColor: '#4cc6e8', textColor: '#1b5ba8' },
};

/** Returns the catalog entry for an ore asset ID, or null if unknown. */
export function oreConfig(assetId) {
    return ORE_CATALOG[assetId] ?? null;
}

/** True if an asset ID is a mineable ore (has a catalog entry). */
export function isOre(assetId) {
    return assetId in ORE_CATALOG;
}

/** Display name for inventory + toasts. Falls back to the asset id. */
export function oreDisplayName(assetId) {
    return ORE_CATALOG[assetId]?.displayName ?? assetId;
}

/** Roll an inclusive random integer in [lo, hi] using the given rand fn. */
export function randInt(rand, lo, hi) {
    return lo + Math.floor(rand() * (hi - lo + 1));
}

export { ORE_CATALOG, DEFAULT };
