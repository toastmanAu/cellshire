import { describe, it, expect } from '../test/harness.js';
import { installWalletHUD } from './WalletHUD.js';

function fakeStorage(initial = {}) {
    const m = new Map(Object.entries(initial));
    return {
        get: k => (m.has(k) ? m.get(k) : null),
        set: (k, v) => m.set(k, String(v)),
        remove: k => m.delete(k),
    };
}

function cleanup() {
    document.querySelectorAll('#wallet-hud').forEach(n => n.remove());
}

describe('WalletHUD', () => {
    it('mounts disconnected by default', () => {
        cleanup();
        const hud = installWalletHUD({
            storage: fakeStorage(),
            connector: async () => ({ provider: 'joyid', address: 'ckt1abc', label: 'JoyID Dev' }),
        });
        expect(hud.root.dataset.state).toBe('disconnected');
        expect(hud.root.querySelector('.wallet-hud__action').textContent).toBe('Connect JoyID');
        cleanup();
    });

    it('connects, persists metadata, then disconnects', async () => {
        cleanup();
        const storage = fakeStorage();
        const hud = installWalletHUD({
            storage,
            connector: async () => ({
                provider: 'joyid',
                address: 'ckt1qyq9xabcdefghijklmnopqrstuvwxyz',
                label: 'JoyID Dev',
                connectedAt: 123,
                token: 'must-not-persist',
            }),
        });
        hud.root.querySelector('.wallet-hud__action').click();
        await new Promise(r => setTimeout(r, 0));
        expect(hud.root.dataset.state).toBe('connected');
        expect(JSON.parse(storage.get('cellshire:walletIdentity')).token).toBe(undefined);

        hud.root.querySelector('.wallet-hud__action').click();
        expect(hud.root.dataset.state).toBe('disconnected');
        expect(storage.get('cellshire:walletIdentity')).toBeNull();
        cleanup();
    });

    it('renders failed state when the connector throws', async () => {
        cleanup();
        const hud = installWalletHUD({
            storage: fakeStorage(),
            connector: async () => { throw new Error('cancelled'); },
        });
        hud.root.querySelector('.wallet-hud__action').click();
        await new Promise(r => setTimeout(r, 0));
        expect(hud.root.dataset.state).toBe('failed');
        expect(hud.root.querySelector('.wallet-hud__action').textContent).toBe('Retry');
        cleanup();
    });
});
