/**
 * Audio.js
 *
 * Tiny one-shot SFX player for in-game cues. Each clip is loaded once,
 * decoded into an AudioBuffer, and played via short-lived
 * AudioBufferSourceNodes so that rapid-fire triggers overlap cleanly
 * (instead of restarting / cutting off a single shared <audio> element).
 *
 * Audio policies on every modern browser require a user gesture before
 * sound can play, so we lazily resume the AudioContext on the first
 * trigger and silently ignore the call if the context is still suspended.
 */

const DEFAULT_VOLUME = 0.55;

let _audioCtx = null;
let _enabled = true;

// Per-clip state. Each entry is { buffer, loading, lastPlayAt, minIntervalMs }.
const _clips = new Map();

function getCtx() {
    if (_audioCtx) return _audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
        _audioCtx = new Ctx();
    } catch {
        return null;
    }
    return _audioCtx;
}

/**
 * Fetch + decode a clip and register it under `name`. Safe to call
 * multiple times — re-registering with the same name returns the
 * memoised promise. Failures are logged and swallowed: a missing
 * sound file should never break the UI.
 *
 * `minIntervalMs` debounces rapid-fire triggers (default 18ms keeps a
 * keyboard-repeat from machine-gunning the clip).
 */
export async function registerClip(name, url, { minIntervalMs = 18 } = {}) {
    let entry = _clips.get(name);
    if (entry?.buffer || entry?.loading) return entry.loading ?? Promise.resolve();
    if (!entry) {
        entry = { buffer: null, loading: null, lastPlayAt: 0, minIntervalMs };
        _clips.set(name, entry);
    } else {
        entry.minIntervalMs = minIntervalMs;
    }
    entry.loading = (async () => {
        const ctx = getCtx();
        if (!ctx) return;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.arrayBuffer();
            entry.buffer = await new Promise((resolve, reject) => {
                ctx.decodeAudioData(data, resolve, reject);
            });
        } catch (err) {
            console.warn(`[audio] failed to load clip "${name}":`, err);
        }
    })();
    return entry.loading;
}

/**
 * Trigger a registered clip. Returns false when audio is disabled, the
 * buffer has not loaded yet, or playback fails. Callers with critical
 * feedback can use that to fall back to direct HTMLAudioElement playback.
 */
export function play(name, volume = DEFAULT_VOLUME) {
    if (!_enabled) return false;
    const entry = _clips.get(name);
    if (!entry || !entry.buffer) return false;
    const ctx = getCtx();
    if (!ctx) return false;

    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
    }

    const now = performance.now();
    if (now - entry.lastPlayAt < entry.minIntervalMs) return false;
    entry.lastPlayAt = now;

    try {
        const src = ctx.createBufferSource();
        src.buffer = entry.buffer;
        const gain = ctx.createGain();
        gain.gain.value = volume;
        src.connect(gain).connect(ctx.destination);
        src.start(0);
        return true;
    } catch {
        return false;
    }
}

function playDirect(url, volume = DEFAULT_VOLUME) {
    if (!_enabled) return false;
    try {
        const audio = new Audio(url);
        audio.volume = volume;
        audio.play().catch(() => {});
        return true;
    } catch {
        return false;
    }
}

/* ── Convenience wrappers for the clips we ship ─────────────────── */

export async function loadUiAudio() {
    // Seven clips: a soft click for menus / palette / toolbar / shortcuts,
    // a generic "thud" fallback, a wet splash for water tiles, a chunky
    // knock for stone / brick / plaster masonry, a hollow tap for fences
    // / wooden decorations, a soft rustle for small vegetation, and a
    // leafier whoosh for trees / large vegetation. All loaded in parallel.
    await Promise.all([
        registerClip('ui',                'menu_select_lightbulb.ogg',   { minIntervalMs: 18 }),
        // Brushing across cells fires very rapidly; allow modest overlap
        // but throttle a touch more aggressively than the UI click.
        registerClip('placement',         'new-placement.ogg',            { minIntervalMs: 35 }),
        registerClip('placementWater',    'waterPlacement.ogg',           { minIntervalMs: 50 }),
        registerClip('placementStone',    'brick-stone.ogg',              { minIntervalMs: 35 }),
        registerClip('placementWood',     'fence-woodenDecorations.ogg',  { minIntervalMs: 35 }),
        registerClip('placementVeg',      'small-vegetations.ogg',        { minIntervalMs: 30 }),
        registerClip('placementTree',     'large-vegetations.ogg',        { minIntervalMs: 40 }),
        ...CELLSHIRE_SFX.map(([name, minIntervalMs]) =>
            registerClip(name, `assets/sfx/${name}.ogg`, { minIntervalMs })
        ),
    ]);
}

const CELLSHIRE_SFX = [
    ['wood_chop', 90],
    ['stone_strike', 70],
    ['crop_harvest', 80],
    ['herb_pluck', 70],
    ['mine_strike', 60],
    ['mine_deplete', 220],
    ['ore_yield', 80],
    ['craft_success', 120],
    ['tool_upgrade', 200],
    ['building_unlock', 240],
    ['recipe_fail', 160],
    ['coin_chime', 80],
    ['coin_shuffle', 140],
    ['loan_borrow', 180],
    ['loan_repay', 180],
    ['purchase_done', 160],
    ['portal_whoosh', 200],
    ['arrive_mine', 240],
    ['arrive_property', 240],
    ['arrive_township', 240],
    ['tier_unlock', 260],
    ['save_success', 120],
    ['toast_success', 90],
    ['toast_error', 120],
    ['toast_info', 90],
    ['wallet_connect', 140],
    ['modal_open', 90],
    ['footstep_grass', 120],
    ['footstep_stone', 120],
    ['shift_change', 260],
    ['high_value_sting', 260],
];

export function playUiClick(volume = DEFAULT_VOLUME)   { play('ui',             volume); }
export function playPlacement(volume = 0.6)            { play('placement',      volume); }
export function playWaterPlacement(volume = 0.6)       { play('placementWater', volume); }
export function playStonePlacement(volume = 0.6)       { play('placementStone', volume); }
export function playWoodPlacement(volume = 0.6)        { play('placementWood',  volume); }
export function playVegPlacement(volume = 0.6)         { play('placementVeg',   volume); }
export function playTreePlacement(volume = 0.6)        { play('placementTree',  volume); }

/** One pickaxe hit on an ore deposit, layered so it reads apart from placement. */
export function playMineHit(volume = 0.62) {
    if (!play('mine_strike', volume)) {
        playDirect('assets/sfx/mine_strike.ogg', volume);
    }
    setTimeout(() => {
        if (!play('ore_yield', 0.22)) playDirect('assets/sfx/ore_yield.ogg', 0.22);
    }, 70);
}

/** Crumble sound for ore depletion, with a small yield sparkle layered in. */
export function playMineDeplete() {
    if (!play('mine_deplete', 0.72)) {
        playDirect('assets/sfx/mine_deplete.ogg', 0.72);
    }
    setTimeout(() => {
        if (!play('ore_yield', 0.42)) playDirect('assets/sfx/ore_yield.ogg', 0.42);
    }, 90);
}

export function playHarvestResource(resourceId, volume = 0.62) {
    if (resourceId === 'wood') {
        play('wood_chop', volume);
        return;
    }
    if (resourceId === 'stone') {
        play('stone_strike', volume);
        return;
    }
    if (resourceId === 'crop') {
        play('crop_harvest', volume);
        return;
    }
    if (resourceId === 'herb') {
        play('herb_pluck', volume);
        return;
    }
    if (resourceId === 'gold') {
        play('coin_chime', volume);
        return;
    }
    playPlacement(volume);
}

export function playCraftSuccess(volume = 0.58) { play('craft_success', volume); }
export function playRecipeFail(volume = 0.55) { play('recipe_fail', volume); }
export function playToolUpgrade(volume = 0.62) { play('tool_upgrade', volume); }
export function playBuildingUnlock(volume = 0.58) { play('building_unlock', volume); }
export function playPurchaseDone(volume = 0.58) { play('purchase_done', volume); }
export function playLoanBorrow(volume = 0.58) { play('loan_borrow', volume); }
export function playLoanRepay(volume = 0.58) { play('loan_repay', volume); }
export function playTravelCue(kind, volume = 0.52) {
    play('portal_whoosh', volume * 0.75);
    const arrival = kind === 'property'
        ? 'arrive_property'
        : kind === 'township'
            ? 'arrive_township'
            : 'arrive_mine';
    setTimeout(() => play(arrival, volume), 160);
}
export function playToast(kind = 'info', volume = 0.42) {
    const id = kind === 'success'
        ? 'toast_success'
        : kind === 'error'
            ? 'toast_error'
            : 'toast_info';
    play(id, volume);
}
export function playHighValueSting(volume = 0.65) { play('high_value_sting', volume); }

/**
 * Asset ids whose placement / erase should trigger the brick-stone SFX.
 * Includes the obvious stone terrain + props plus the white-plastered
 * Mykonos buildings (which are masonry under the paint).
 *
 * Kept as flat Sets so membership checks stay O(1) inside the per-click
 * `playPlacementFor` lookup.
 */
const STONE_ASSET_IDS = new Set([
    // Terrain
    'stone', 'path', 'sea_wall', 'stairs',
    // Walls / arches / lanterns / basins
    'low_wall', 'corner_wall', 'archway',
    'stone_lantern', 'stone_basin', 'well',
    // Rock clutter
    'rocks', 'large_rock', 'mossy_stone', 'flat_stone',
    'pebbles', 'stone_pile', 'boulder',
    // Buildings (whitewashed masonry)
    'house', 'two_story', 'cube_house', 'terrace_house', 'pergola_house',
    'villa', 'altar', 'tower_chapel', 'main_chapel', 'windmill',
]);

/**
 * Asset ids whose placement / erase should trigger the wood / fence SFX.
 * Covers wooden fences and railings, wooden furniture and props, and
 * the wooden planter boxes / bridges in the water category.
 */
const WOOD_ASSET_IDS = new Set([
    // Fences / railings / gates
    'blue_railing', 'gate_fence',
    // Wooden furniture / signage
    'bench', 'signpost', 'banner',
    // Lantern posts (wooden mast)
    'lantern_post', 'hanging_lantern',
    // Wooden carryables
    'crate', 'hay_bale', 'storage_box', 'wood_pile', 'water_bucket',
    // Wooden water-category structures
    'small_bridge', 'garden_bed', 'crop_patch', 'veg_garden',
]);

/**
 * Asset ids whose placement / erase should trigger the small-vegetation
 * rustle. Includes the grass terrain plus low-lying plant props
 * (succulents, grass tufts, potted flowers).
 */
const SMALL_VEG_ASSET_IDS = new Set([
    'grass',
    'agave', 'dry_grass', 'flower_pot', 'terracotta_pot',
]);

/**
 * Asset ids whose placement / erase should trigger the large-vegetation /
 * tree whoosh. Reserved for full trees and tall flowering plants.
 */
const LARGE_VEG_ASSET_IDS = new Set([
    'cypress', 'olive', 'bougainvillea',
]);

/**
 * Pick the right placement SFX for a given asset id:
 *   - water tiles       → splash
 *   - stone / masonry   → brick knock
 *   - fence / wood      → hollow wood tap
 *   - small vegetation  → soft rustle
 *   - trees / large veg → leafy whoosh
 *   - everything else   → generic placement thud
 *
 * Centralising the lookup here means callers don't need to know the
 * asset taxonomy.
 */
export function playPlacementFor(assetId) {
    if (assetId === 'water') {
        playWaterPlacement();
        return;
    }
    if (STONE_ASSET_IDS.has(assetId)) {
        playStonePlacement();
        return;
    }
    if (WOOD_ASSET_IDS.has(assetId)) {
        playWoodPlacement();
        return;
    }
    if (SMALL_VEG_ASSET_IDS.has(assetId)) {
        playVegPlacement();
        return;
    }
    if (LARGE_VEG_ASSET_IDS.has(assetId)) {
        playTreePlacement();
        return;
    }
    playPlacement();
}

export function setUiAudioEnabled(on) { _enabled = !!on; }
export function isUiAudioEnabled() { return _enabled; }
