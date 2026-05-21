# Chain Visit Smoke Fixtures

Status: implemented for local fixture writer-to-reader compatibility.

## Goal

Prove that a wallet-owned property saved through the fixture snapshot writer can
be visited through the chain snapshot read path:

```txt
?visit=<owner>&visitSource=chain
```

This keeps the local fixture path aligned with the eventual live indexer path
before replacing the fixture storage with real CKB queries.

## Fixture Flow

1. Connect or seed a wallet identity whose account address matches the active
   home owner.
2. Switch the home owner from `local` to that wallet owner.
3. Save the property while using the default `local-fixture` snapshot writer.
4. The writer stores a `cellshire.property.snapshot` v1 cell under:

```txt
cellshire:property-snapshot-cells:v1:<encodeURIComponent(owner id)>
```

5. Open a visit URL with:

```txt
?visit=<owner id>&visitSource=chain
```

The chain snapshot adapter reads the fixture cell through
`LocalStoragePropertySnapshotIndexer`, normalizes it into the local property
snapshot shape, and loads the property in read-only visit mode.

## Expected Runtime State

A successful fixture visit should report:

```js
{
  source: 'chain',
  ownerId: '<owner id>',
  status: 'found',
  stale: false,
  snapshot: { ownerId: '<owner id>', tileMap, camera, propertyTier }
}
```

The Property HUD should label the route as a chain snapshot. Editing, erasing,
expanding, saving, resetting, and autosave remain blocked because visit mode is
read-only.

## Fallbacks

- No fixture cells for the owner returns `status: 'missing'` and loads the
  read-only starter property view.
- Fixture cells below `visitMinBlock` return `status: 'stale'`, preserve stale
  cell metadata for diagnostics, and load the read-only starter property view.
- Malformed fixture JSON is treated as missing by the local storage indexer.

## Test Coverage

`propertySnapshotAdapter.test.js` now covers:

- Writer-saved wallet fixture snapshots read back through
  `makePropertySnapshotAdapterFromParams()` with `visitSource=chain`.
- Missing owner fallback.
- Stale fixture fallback through `visitMinBlock`.

## Next Slice

- Add a live testnet indexer implementation that returns the same normalized
  cell shape as the fixture indexer.
- Add a refresh affordance for stale/pending snapshot visits once indexer lag is
  observable in the live path.
