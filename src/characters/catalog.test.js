import { describe, it, expect } from '../test/harness.js';
import { getAvailableCharacters, resolveCharacterChoice, TIERS } from './catalog.js';
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
            expect(TIERS.includes(c.tier)).toBe(true);
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

describe('resolveCharacterChoice', () => {
    const catalog = getAvailableCharacters();

    function fakeStorage(initial = {}) {
        const m = new Map(Object.entries(initial));
        return {
            get: k => (m.has(k) ? m.get(k) : null),
            set: (k, v) => m.set(k, v),
            remove: k => m.delete(k),
        };
    }

    it('returns null when URL and storage are both empty', () => {
        expect(resolveCharacterChoice({
            url: null, storage: fakeStorage(), catalog,
        })).toBeNull();
    });

    it('returns the URL choice when valid (full id)', () => {
        expect(resolveCharacterChoice({
            url: 'player_miner', storage: fakeStorage(), catalog,
        })).toBe('player_miner');
    });

    it('returns the URL choice when valid (short form)', () => {
        expect(resolveCharacterChoice({
            url: 'seeker', storage: fakeStorage(), catalog,
        })).toBe('player_seeker');
    });

    it('URL beats storage when both are valid', () => {
        const s = fakeStorage({ 'cellshire:character': 'player_tinker' });
        expect(resolveCharacterChoice({
            url: 'miner', storage: s, catalog,
        })).toBe('player_miner');
    });

    it('falls through to storage when URL is invalid', () => {
        const s = fakeStorage({ 'cellshire:character': 'player_tinker' });
        expect(resolveCharacterChoice({
            url: 'banana', storage: s, catalog,
        })).toBe('player_tinker');
    });

    it('returns null when storage points to an id no longer in catalog', () => {
        const s = fakeStorage({ 'cellshire:character': 'player_obsolete' });
        expect(resolveCharacterChoice({
            url: null, storage: s, catalog,
        })).toBeNull();
    });
});
