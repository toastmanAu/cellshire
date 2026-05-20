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

    it('lets a connected wallet opt into and out of wallet-owned home', async () => {
        cleanup();
        const storage = fakeStorage();
        const game = {
            propertyOwner: 'local',
            async setHomePropertyOwner(ownerId) {
                this.propertyOwner = ownerId;
                return { ok: true, ownerId };
            },
        };
        const hud = installWalletHUD({
            storage,
            game,
            connector: async () => ({
                provider: 'joyid',
                address: 'ckt1owner',
                label: 'JoyID Dev',
            }),
        });

        hud.root.querySelector('.wallet-hud__action').click();
        await new Promise(r => setTimeout(r, 0));
        const propertyAction = hud.root.querySelector('.wallet-hud__property');
        expect(propertyAction.textContent).toBe('Use wallet home');

        propertyAction.click();
        await new Promise(r => setTimeout(r, 0));
        expect(game.propertyOwner).toBe('ckt1owner');
        expect(JSON.parse(storage.get('cellshire:propertyOwnerBinding:v1')).mode).toBe('wallet');
        expect(propertyAction.textContent).toBe('Use local home');

        propertyAction.click();
        await new Promise(r => setTimeout(r, 0));
        expect(game.propertyOwner).toBe('local');
        expect(storage.get('cellshire:propertyOwnerBinding:v1')).toBeNull();
        cleanup();
    });
});
