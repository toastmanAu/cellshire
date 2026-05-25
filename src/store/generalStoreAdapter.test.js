import { describe, expect, it } from '../test/harness.js';
import { Inventory } from '../core/Inventory.js';
import {
    FixtureCurrencyIndexer,
    ReadOnlyChainCurrencyAdapter,
} from '../economy/currencyAdapter.js';
import { PendingCurrencyDeltaStore } from '../economy/pendingCurrencyDeltas.js';
import { PropInventory } from '../property/propInventory.js';
import {
    chainStoreEnabled,
    chainStoreSubmitMode,
    ChainGeneralStoreAdapter,
    LocalGeneralStoreAdapter,
    makeGeneralStoreAdapterFromParams,
} from './generalStoreAdapter.js';

function fakeStorage(initial = {}) {
    const m = new Map(Object.entries(initial));
    return {
        get: k => (m.has(k) ? m.get(k) : null),
        set: (k, v) => m.set(k, String(v)),
    };
}

describe('general store adapters', () => {
    it('keeps the local adapter path unchanged', async () => {
        const inventory = new Inventory();
        const props = new PropInventory();
        inventory.add('ckb', 1000);
        const out = await new LocalGeneralStoreAdapter().buy({
            assetId: 'blue_railing',
            inventory,
            propInventory: props,
            propertyTier: 1,
        });
        expect(out.ok).toBe(true);
        expect(inventory.get('ckb')).toBe(650);
        expect(props.get('blue_railing')).toBe(1);
    });

    it('settles chain fixture purchases and clears pending CKB after indexer catch-up', async () => {
        const storage = fakeStorage();
        const pendingDeltas = new PendingCurrencyDeltaStore({ storage, owner: 'ckt1owner' });
        const indexer = new FixtureCurrencyIndexer({
            balances: { ckb: { amount: 1000, stale: false } },
        });
        const chainAdapter = new ReadOnlyChainCurrencyAdapter({
            localInventory: new Inventory(),
            owner: 'ckt1owner',
            chainCurrencyIds: ['ckb'],
            indexer,
            pendingDeltas,
        });
        const props = new PropInventory();
        const out = await new ChainGeneralStoreAdapter({
            storage,
            owner: 'ckt1owner',
            inventoryAdapter: chainAdapter,
        }).buy({
            assetId: 'blue_railing',
            propInventory: props,
            propertyTier: 1,
        });
        expect(out.ok).toBe(true);
        expect(out.mode).toBe('chain-fixture-settled');
        expect(props.get('blue_railing')).toBe(1);
        expect(pendingDeltas.list().length).toBe(1);
        const reconciled = await chainAdapter.read();
        expect(reconciled.pending).toBe(false);
        expect(reconciled.currencies.get('ckb')).toBe(650);
    });

    it('selects the chain store adapter only behind the explicit flag', () => {
        expect(chainStoreEnabled(new URLSearchParams('chainStore=1'))).toBe(true);
        expect(chainStoreSubmitMode(new URLSearchParams('chainStoreSubmit=ccc'))).toBe('ccc-joyid');
        expect(makeGeneralStoreAdapterFromParams({
            params: new URLSearchParams(''),
            storage: fakeStorage(),
        }).constructor.name).toBe('LocalGeneralStoreAdapter');
        expect(makeGeneralStoreAdapterFromParams({
            params: new URLSearchParams('chainStore=1'),
            storage: fakeStorage(),
        }).constructor.name).toBe('ChainGeneralStoreAdapter');
    });

    it('requires a connected wallet for CCC-backed store purchases', async () => {
        const indexer = new FixtureCurrencyIndexer({
            balances: { ckb: { amount: 1000, stale: false } },
        });
        const chainAdapter = new ReadOnlyChainCurrencyAdapter({
            localInventory: new Inventory(),
            owner: 'ckt1owner',
            chainCurrencyIds: ['ckb'],
            indexer,
        });
        const out = await makeGeneralStoreAdapterFromParams({
            params: new URLSearchParams('chainStore=1&chainStoreSubmit=ccc'),
            storage: fakeStorage(),
            inventoryAdapter: chainAdapter,
        }).buy({
            assetId: 'blue_railing',
            propInventory: new PropInventory(),
            propertyTier: 1,
        });
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('wallet-disconnected');
    });
});
