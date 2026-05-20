# Chain Property Snapshot Adapter

Status: local fixture-backed chain adapter implemented.

## Goal

The visit route needs to load property snapshots by owner through the same
shape as local property storage. This card adds the adapter boundary and a
testable chain/indexer fixture path; a live CKB indexer can replace the fixture
without changing `Game` or the visit HUD.

## Snapshot Shape

Adapters return a read result:

```js
{
  source: 'local' | 'chain',
  ownerId,
  status: 'found' | 'missing' | 'stale',
  stale,
  snapshot,
}
```

When `snapshot` is present, it is the same shape as `loadPropertyZone()`:

```js
{
  ownerId,
  tileMap,
  camera,
  savedAt,
  propertyTier,
}
```

## Chain Cell Fixture

Property snapshot cells normalize from `cellshire.property.snapshot` v1:

```js
{
  schema: 'cellshire.property.snapshot',
  version: 1,
  ownerId,
  blockNumber,
  savedAt,
  propertyTier,
  tileMap,
  camera,
}
```

The chain adapter asks an indexer for:

```js
indexer.getPropertySnapshotCells({ ownerId })
```

and chooses the newest active owner cell by `blockNumber`, then `savedAt`.
Cells below `visitMinBlock` are reported as stale. If only stale cells exist,
the visit route loads the read-only starter view and the HUD reports that the
snapshot is pending.

## Runtime Flags

- `?visit=<owner id>` enters read-only property visit mode.
- `?visitSource=local` uses owner-keyed local storage. This is the default.
- `?visitSource=chain` uses the chain adapter.
- `?visitMinBlock=<n>` filters old chain fixture cells.

For offline development, the chain adapter reads fixture cells from:

```txt
cellshire:property-snapshot-cells:v1:<encodeURIComponent(owner id)>
```

## Next Slice

- Replace the local fixture indexer with a real testnet indexer query.
- Add share-link UI from connected wallet identity.
- Add stale snapshot retry/refresh controls once the live indexer exists.
