/**
 * Character catalog — the list of characters the player can choose
 * from. v0 returns the three starter defaults. Future versions append
 * player-owned extras (kind: 'unique' | 'common' | 'locked').
 *
 * Keeping this in its own module so the picker UI never hard-codes
 * the slot list, and on-chain wallet/cell sources have a clean home.
 */

const DEFAULTS = [
    { id: 'player_miner',  name: 'Miner',  tagline: 'Stout Prospector',     accent: '#F2C744', kind: 'default' },
    { id: 'player_seeker', name: 'Seeker', tagline: 'Robed Crystalwright',  accent: '#5BD5E8', kind: 'default' },
    { id: 'player_tinker', name: 'Tinker', tagline: 'Goggled Engineer',     accent: '#C77A3B', kind: 'default' },
];

export function getAvailableCharacters() {
    return DEFAULTS.slice();
}

export function isEnabled(character) {
    return character.kind !== 'locked';
}
