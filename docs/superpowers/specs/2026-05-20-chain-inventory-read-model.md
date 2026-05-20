# Chain Inventory Read Model

Status: implemented locally, ready for chain indexer wiring.

## Goal

Cellshire needs one inventory read boundary that can render local-dev balances
today and wallet-owned cells later. Gameplay systems may still mutate local
models while chain settlement is offline, but UI reads should go through the
same shape.

## Logical Cell Schema

Inventory cells normalize to `cellshire.inventory` v1 records:

- `currency`: `{ currency, amount, owner, cellId, blockNumber }`
- `prop`: `{ assetId, count, owner, cellId, blockNumber }`
- `skin`: `{ assetId, owner, cellId, blockNumber }`

The adapter rejects unknown schema versions, unknown kinds, empty ids, and
non-positive cell quantities. Counts are summed into the same local
`Inventory` / `PropInventory` interfaces already used by the HUD and stores.

## Adapter Contract

`LocalInventoryAdapter.read()` returns:

```js
{
  source: 'local',
  stale: false,
  staleCells: [],
  currencies,
  props,
  skins,
}
```

`ChainInventoryAdapter.read()` calls:

```js
indexer.getInventoryCells({ owner })
```

and returns the same snapshot shape after normalization.

## Reconciliation

The chain snapshot accepts:

- `minBlockNumber`: cells below this block are reported in `staleCells` and
  omitted from the active balance view.
- `pending`: optimistic deltas for submitted transactions that the indexer may
  not have observed yet.

This makes the HUD conservative during stale indexer reads while still showing
known pending local intent. Once the indexer catches up, callers refresh the
adapter and the pending set can be cleared.

## Runtime Wiring

`Game.inventoryAdapter` starts as a local adapter over the prop inventory, then
is rebound after `spawnPlayer()` so the player currency inventory and prop
inventory are read through one adapter. `installEconomyHUD()` accepts an
adapter and renders `snapshot.currencies`, so a future chain adapter can be
passed without changing the HUD display path.

## Next Chain Slice

- Replace the local adapter in wallet mode with a CKB testnet indexer adapter.
- Persist pending transaction deltas beside wallet identity.
- Add a refresh trigger after mining, store, marketplace, and trader submits.
