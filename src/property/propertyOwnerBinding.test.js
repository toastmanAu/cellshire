import { describe, it, expect } from '../test/harness.js';
import {
    PROPERTY_OWNER_BINDING_KEY,
    bindPropertyOwnerToLocal,
    bindPropertyOwnerToWallet,
    loadPropertyOwnerBinding,
    propertyOwnerFromBinding,
} from './propertyOwnerBinding.js';

function fakeStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        get: key => data.get(key) ?? null,
        set: (key, value) => data.set(key, value),
        remove: key => data.delete(key),
    };
}

function connected(address = 'ckt1wallet') {
    return {
        status: 'connected',
        account: { provider: 'joyid', address, label: 'JoyID Dev' },
    };
}

describe('propertyOwnerBinding', () => {
    it('defaults to local property ownership', () => {
        const storage = fakeStorage();
        expect(loadPropertyOwnerBinding(storage).mode).toBe('local');
        expect(propertyOwnerFromBinding(connected(), { mode: 'local' })).toBe('local');
    });

    it('binds the selected home owner to the connected wallet address', () => {
        const storage = fakeStorage();
        const binding = bindPropertyOwnerToWallet(storage, connected('ckt1alice').account, {
            now: () => 123,
        });
        expect(binding.mode).toBe('wallet');
        expect(binding.ownerId).toBe('ckt1alice');
        expect(loadPropertyOwnerBinding(storage).ownerId).toBe('ckt1alice');
        expect(propertyOwnerFromBinding(connected('ckt1alice'), binding)).toBe('ckt1alice');
    });

    it('falls back to local mode while the wallet is disconnected', () => {
        const binding = { mode: 'wallet', ownerId: 'ckt1alice', boundAt: 123 };
        expect(propertyOwnerFromBinding({ status: 'disconnected', account: null }, binding)).toBe('local');
    });

    it('clears the wallet binding without touching property saves', () => {
        const storage = fakeStorage({
            [PROPERTY_OWNER_BINDING_KEY]: JSON.stringify({ mode: 'wallet', ownerId: 'ckt1alice' }),
            'cellshire:property:v1:local': '{"v":1}',
            'cellshire:property:v1:ckt1alice': '{"v":1}',
        });
        expect(bindPropertyOwnerToLocal(storage).mode).toBe('local');
        expect(storage.get(PROPERTY_OWNER_BINDING_KEY)).toBeNull();
        expect(storage.get('cellshire:property:v1:local')).toBe('{"v":1}');
        expect(storage.get('cellshire:property:v1:ckt1alice')).toBe('{"v":1}');
    });
});
