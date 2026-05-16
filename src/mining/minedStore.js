/**
 * minedStore.js
 *
 * Per-epoch persistence of mined-ore remaining capacity. Lets a reload
 * mid-epoch see ores in the state the player left them (no double-mine
 * exploit). Cross-epoch reloads naturally reset (the storage key
 * includes the epoch number).
 *
 * Cheat-proofness: this is the off-chain best-effort layer. Clearing
 * localStorage bypasses it. Full anti-cheat lands when on-chain mining
 * ships; this module's position-keyed map shape carries over directly
 * as the read-through cache.
 */

/**
 * Returns the storage key for an epoch's mined-state, or null when
 * epoch is missing (null, undefined, or empty string — random-seed
 * boot path or unset state). Numeric 0 IS a valid epoch (epoch 0
 * exists on the CKB chain) so we don't reject all falsy values.
 */
export function minedStoreKey(epochNumber) {
    if (epochNumber === null || epochNumber === undefined || epochNumber === '') {
        return null;
    }
    return `cellshire:mined:${epochNumber}`;
}

/**
 * Read the persisted mined-state. Returns {} on missing key, malformed
 * JSON, or null epoch.
 */
export function loadMinedState(storage, epochNumber) {
    const key = minedStoreKey(epochNumber);
    if (!key) return {};
    const raw = storage.get(key);
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

/**
 * Record one position's remaining capacity. Read-modify-write on the
 * JSON blob. No-op when epoch is null.
 */
export function recordMine(storage, epochNumber, gx, gy, remainingCapacity) {
    const key = minedStoreKey(epochNumber);
    if (!key) return;
    // Spread to avoid mutating the object returned by loadMinedState —
    // matches the codebase's immutability convention and future-proofs
    // against loadMinedState ever returning a cached reference.
    const state = {
        ...loadMinedState(storage, epochNumber),
        [`${gx},${gy}`]: remainingCapacity,
    };
    storage.set(key, JSON.stringify(state));
}
