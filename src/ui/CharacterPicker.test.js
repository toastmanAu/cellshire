import { describe, it, expect } from '../test/harness.js';
import { installCharacterPicker } from './CharacterPicker.js';
import { getAvailableCharacters } from '../characters/catalog.js';

function cleanup() {
    document.querySelectorAll('.char-picker').forEach(n => n.remove());
}

describe('CharacterPicker (mount + selection)', () => {
    it('mounts a dialog to document.body', () => {
        cleanup();
        installCharacterPicker({
            catalog: getAvailableCharacters(),
            onConfirm: () => {},
        });
        const root = document.querySelector('.char-picker');
        expect(root !== null).toBe(true);
        expect(root.getAttribute('role')).toBe('dialog');
        cleanup();
    });

    it('renders one card per catalog entry', () => {
        cleanup();
        installCharacterPicker({
            catalog: getAvailableCharacters(),
            onConfirm: () => {},
        });
        expect(document.querySelectorAll('.char-card').length).toBe(3);
        cleanup();
    });

    it('confirm button is disabled until a card is selected', () => {
        cleanup();
        installCharacterPicker({
            catalog: getAvailableCharacters(),
            onConfirm: () => {},
        });
        const btn = document.querySelector('.char-picker__confirm');
        expect(btn.disabled).toBe(true);
        document.querySelector('.char-card').click();
        expect(btn.disabled).toBe(false);
        cleanup();
    });

    it('selecting a card sets aria-checked on that card only', () => {
        cleanup();
        installCharacterPicker({
            catalog: getAvailableCharacters(),
            onConfirm: () => {},
        });
        const cards = document.querySelectorAll('.char-card');
        cards[1].click();
        expect(cards[0].getAttribute('aria-checked')).toBe('false');
        expect(cards[1].getAttribute('aria-checked')).toBe('true');
        expect(cards[2].getAttribute('aria-checked')).toBe('false');
        cleanup();
    });

    it('confirm fires onConfirm with the selected id and unmounts', async () => {
        cleanup();
        let fired = null;
        installCharacterPicker({
            catalog: getAvailableCharacters(),
            onConfirm: id => { fired = id; },
        });
        document.querySelector('.char-card').click();
        document.querySelector('.char-picker__confirm').click();
        expect(fired).toBe('player_miner');
        // Wait past the 320ms leaving animation before checking unmount.
        await new Promise(r => setTimeout(r, 400));
        expect(document.querySelector('.char-picker')).toBeNull();
    });
});
