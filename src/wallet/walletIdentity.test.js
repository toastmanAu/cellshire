import { describe, it, expect } from '../test/harness.js';
import {
    clearWalletIdentity,
    loadWalletIdentity,
    makeWalletState,
    saveWalletIdentity,
    shortAddress,
    walletDisplayLabel,
    walletFeatureEnabled,
} from './walletIdentity.js';

function fakeStorage(initial = {}) {
    const m = new Map(Object.entries(initial));
    return {
        get: k => (m.has(k) ? m.get(k) : null),
        set: (k, v) => m.set(k, String(v)),
        remove: k => m.delete(k),
    };
}

describe('walletFeatureEnabled', () => {
    it('is enabled only by ?wallet=1', () => {
        expect(walletFeatureEnabled(new URLSearchParams('wallet=1'))).toBe(true);
        expect(walletFeatureEnabled(new URLSearchParams('wallet=0'))).toBe(false);
        expect(walletFeatureEnabled(new URLSearchParams(''))).toBe(false);
    });
});

describe('makeWalletState', () => {
    it('normalizes unknown states to disconnected', () => {
        expect(makeWalletState('banana').status).toBe('disconnected');
        expect(makeWalletState('connecting').status).toBe('connecting');
    });
});

describe('wallet identity persistence', () => {
    it('loads disconnected when storage is empty or malformed', () => {
        expect(loadWalletIdentity(fakeStorage()).status).toBe('disconnected');
        expect(loadWalletIdentity(fakeStorage({ 'cellshire:walletIdentity': 'not json' })).status)
            .toBe('disconnected');
    });

    it('saves and loads only non-sensitive account metadata', () => {
        const s = fakeStorage();
        saveWalletIdentity(s, {
            provider: 'joyid',
            address: 'ckt1qyq9xabcdefghijklmnopqrstuvwxyz',
            label: 'JoyID Dev',
            connectedAt: 123,
            signer: 'ccc-joyid',
            network: 'testnet',
            pubkey: '0xpublic',
            token: 'must-not-persist',
        });
        const raw = JSON.parse(s.get('cellshire:walletIdentity'));
        expect(raw.provider).toBe('joyid');
        expect(raw.address).toBe('ckt1qyq9xabcdefghijklmnopqrstuvwxyz');
        expect(raw.label).toBe('JoyID Dev');
        expect(raw.connectedAt).toBe(123);
        expect(raw.signer).toBe('ccc-joyid');
        expect(raw.network).toBe('testnet');
        expect(raw.pubkey).toBe('0xpublic');
        expect(raw.token).toBe(undefined);

        const loaded = loadWalletIdentity(s);
        expect(loaded.status).toBe('connected');
        expect(loaded.account.provider).toBe('joyid');
    });

    it('clears persisted identity on disconnect', () => {
        const s = fakeStorage({ 'cellshire:walletIdentity': '{}' });
        clearWalletIdentity(s);
        expect(s.get('cellshire:walletIdentity')).toBeNull();
    });
});

describe('wallet display labels', () => {
    it('uses label when available and shortens long addresses otherwise', () => {
        expect(walletDisplayLabel({ label: 'JoyID Dev', address: 'ckt1abc' })).toBe('JoyID Dev');
        expect(shortAddress('ckt1qyq9xabcdefghijklmnopqrstuvwxyz')).toBe('ckt1qyq9...uvwxyz');
        expect(walletDisplayLabel(null)).toBe('Connect JoyID');
    });
});
