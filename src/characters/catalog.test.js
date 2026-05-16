import { describe, it, expect } from '../test/harness.js';
import { getAvailableCharacters } from './catalog.js';
import { PLAYER_SKIN_IDS } from '../assets/assetManifest.js';

describe('getAvailableCharacters', () => {
    it('returns three default characters', () => {
        expect(getAvailableCharacters().length).toBe(3);
    });

    it('each entry has the required shape', () => {
        for (const c of getAvailableCharacters()) {
            expect(typeof c.id).toBe('string');
            expect(typeof c.name).toBe('string');
            expect(typeof c.tagline).toBe('string');
            expect(typeof c.accent).toBe('string');
            expect(c.kind).toBe('default');
        }
    });

    it('all default ids exist in PLAYER_SKIN_IDS', () => {
        for (const c of getAvailableCharacters()) {
            expect(PLAYER_SKIN_IDS.includes(c.id)).toBe(true);
        }
    });

    it('returns a fresh array each call (caller cannot mutate internals)', () => {
        const a = getAvailableCharacters();
        a.push({ id: 'rogue' });
        expect(getAvailableCharacters().length).toBe(3);
    });
});
