import { describe, it, expect } from '../test/harness.js';
import { installCharacterPicker } from './CharacterPicker.js';
import { getAvailableCharacters } from '../characters/catalog.js';

function cleanup() {
    // Call each picker's own dismiss() so the global keydown listener
    // is removed too — bare node.remove() would leak the listener and
    // ghost-handle keystrokes in subsequent tests.
    document.querySelectorAll('.char-picker').forEach(n => {
        if (typeof n._dismiss === 'function') n._dismiss();
        else n.remove();
    });
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

function key(name) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
}

describe('CharacterPicker (keyboard)', () => {
    it('pressing 2 selects the second card', () => {
        cleanup();
        installCharacterPicker({
            catalog: getAvailableCharacters(), onConfirm: () => {},
        });
        key('2');
        const cards = document.querySelectorAll('.char-card');
        expect(cards[1].getAttribute('aria-checked')).toBe('true');
        cleanup();
    });

    it('ArrowRight cycles forward and wraps at the end', () => {
        cleanup();
        installCharacterPicker({
            catalog: getAvailableCharacters(), onConfirm: () => {},
        });
        key('3');               // select last
        key('ArrowRight');      // wraps to first
        const cards = document.querySelectorAll('.char-card');
        expect(cards[0].getAttribute('aria-checked')).toBe('true');
        cleanup();
    });

    it('ArrowLeft cycles backward and wraps at the start', () => {
        cleanup();
        installCharacterPicker({
            catalog: getAvailableCharacters(), onConfirm: () => {},
        });
        key('1');               // select first
        key('ArrowLeft');       // wraps to last
        const cards = document.querySelectorAll('.char-card');
        expect(cards[2].getAttribute('aria-checked')).toBe('true');
        cleanup();
    });

    it('Enter confirms when a card is selected', async () => {
        cleanup();
        let fired = null;
        installCharacterPicker({
            catalog: getAvailableCharacters(),
            onConfirm: id => { fired = id; },
        });
        key('1');
        key('Enter');
        expect(fired).toBe('player_miner');
        await new Promise(r => setTimeout(r, 400));
        cleanup();
    });

    it('Enter is ignored when nothing is selected', () => {
        cleanup();
        let fired = null;
        installCharacterPicker({
            catalog: getAvailableCharacters(),
            onConfirm: id => { fired = id; },
        });
        key('Enter');
        expect(fired).toBeNull();
        cleanup();
    });

    it('keydown listener is removed on dismiss', () => {
        cleanup();
        let fired = null;
        const { dismiss } = installCharacterPicker({
            catalog: getAvailableCharacters(),
            onConfirm: id => { fired = id; },
        });
        dismiss();
        key('1');                    // should no longer be intercepted
        key('Enter');
        expect(fired).toBeNull();
    });
});
