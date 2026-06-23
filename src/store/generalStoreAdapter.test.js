import { describe, expect, it } from '../test/harness.js';
import {
    assetDefinitionFor,
    clearOpenAssetDefinitions,
} from '../assets/assetRegistry.js';
import { openAssetIdForCell } from '../assets/openAssetStandard.js';
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
        clearOpenAssetDefinitions();
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
        const openAssetId = openAssetIdForCell('store:ckt1owner:blue_railing:' + out.tx.tx_nonce);
        expect(out.ok).toBe(true);
        expect(out.mode).toBe('chain-fixture-settled');
        expect(out.assetId).toBe(openAssetId);
        expect(out.sourceAssetId).toBe('blue_railing');
        expect(props.get('blue_railing')).toBe(0);
        expect(props.get(openAssetId)).toBe(1);
        expect(assetDefinitionFor(openAssetId).renderSourceAssetId).toBe('blue_railing');
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

    it('submits CCC receipt purchases with mint intent and grants the open prop without fixture settlement', async () => {
        clearOpenAssetDefinitions();
        const storage = fakeStorage();
        const chainAdapter = new ReadOnlyChainCurrencyAdapter({
            localInventory: new Inventory(),
            owner: 'ckt1owner',
            chainCurrencyIds: ['ckb'],
            indexer: new FixtureCurrencyIndexer({
                balances: { ckb: { amount: 1000, stale: false } },
            }),
        });
        const props = new PropInventory();
        let settled = false;
        let submitted = null;
        const out = await new ChainGeneralStoreAdapter({
            storage,
            owner: 'ckt1owner',
            inventoryAdapter: {
                async read() {
                    return chainAdapter.read();
                },
                settleStorePurchaseTx() {
                    settled = true;
                    return { ok: true };
                },
                addPendingDelta(delta) {
                    this.pending = delta;
                },
            },
            requireWallet: true,
            loadWallet: () => ({
                status: 'connected',
                account: { provider: 'joyid', address: 'ckt1owner', network: 'testnet' },
            }),
            submit: async tx => {
                submitted = tx;
                return {
                    ok: true,
                    mode: 'ccc-joyid',
                    txHash: '0xstoreccc',
                    payload: {
                        protocol: 'cellshire.store.purchase',
                        open_asset_mint: tx.outputs.open_asset_mint,
                    },
                };
            },
        }).buy({
            assetId: 'blue_railing',
            propInventory: props,
            propertyTier: 1,
        });
        const openAssetId = openAssetIdForCell('store:ckt1owner:blue_railing:' + out.tx.tx_nonce);
        expect(out.ok).toBe(true);
        expect(out.mode).toBe('chain-ccc-receipt');
        expect(settled).toBe(false);
        expect(submitted.outputs.open_asset_mint.cell.render.source.assetId).toBe('blue_railing');
        expect(out.assetId).toBe(openAssetId);
        expect(props.get(openAssetId)).toBe(1);
        expect(assetDefinitionFor(openAssetId).openAsset.cellId).toBe(submitted.outputs.open_asset_mint.cell.cellId);
    });
});
