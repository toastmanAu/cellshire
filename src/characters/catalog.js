/**
 * Character catalog — the list of characters the player can choose
 * from. v0 returns the three starter defaults. Future versions append
 * player-owned extras (tier: 'unique' | 'common' | 'locked').
 *
 * Note: `tier` here is the availability/source tier. Don't confuse it
 * with the asset manifest's `kind` field, which is the render-layer
 * type (terrain | object). Same characters, different field, different
 * meaning.
 *
 * Keeping this in its own module so the picker UI never hard-codes
 * the slot list, and on-chain wallet/cell sources have a clean home.
 */

const DEFAULTS = [
    { id: 'player_miner',  name: 'Miner',  tagline: 'Stout Prospector',     accent: '#F2C744', tier: 'default' },
    { id: 'player_seeker', name: 'Seeker', tagline: 'Robed Crystalwright',  accent: '#5BD5E8', tier: 'default' },
    { id: 'player_tinker', name: 'Tinker', tagline: 'Goggled Engineer',     accent: '#C77A3B', tier: 'default' },
];

export const TIERS = ['default', 'unique', 'common', 'locked'];

export function getAvailableCharacters() {
    return DEFAULTS.slice();
}

export function isEnabled(character) {
    return character.tier !== 'locked';
}

/**
 * Resolve which character to spawn as, given a URL param value and a
 * safeStorage instance. Precedence:
 *
 *     URL (?character=...)  >  storage  >  null (caller shows picker)
 *
 * Accepts the short form ('miner') or the full id ('player_miner').
 * Returns null when nothing valid is available. Pure — does not write
 * to storage; the picker is the only thing that writes.
 */
export function resolveCharacterChoice({
    url, storage, catalog = getAvailableCharacters(),
}) {
    const validIds = new Set(
        catalog.filter(isEnabled).map(c => c.id),
    );

    if (url) {
        const candidate = url.startsWith('player_') ? url : `player_${url}`;
        if (validIds.has(candidate)) return candidate;
        console.warn('[cellshire] unknown ?character=', url,
            '— ignoring. Valid:', [...validIds].join(' | '));
    }

    if (storage) {
        const stored = storage.get('cellshire:character');
        if (stored && validIds.has(stored)) return stored;
    }

    return null;
}
