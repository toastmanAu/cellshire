# Property Snapshot Cell Writer

Status: implemented for local fixture cells with wallet-owner gating.

## Goal

Editable wallet-owned homes can produce the same `cellshire.property.snapshot`
v1 cell shape that the visit/read adapter already consumes. Local property
storage remains the fallback and source of truth for offline play.

## Payload Shape

`buildPropertySnapshotPayload()` exports:

```json
{
  "schema": "cellshire.property.snapshot",
  "version": 1,
  "ownerId": "ckt1...",
  "savedAt": 1779294900000,
  "propertyTier": 2,
  "tileMap": {},
  "camera": { "offsetX": 0, "offsetY": 0, "zoom": 1 }
}
```

The local fixture writer wraps this payload with the existing cell metadata from
`localPropertySnapshotCell()`, including `kind`, `cellId`, and `blockNumber`.
The latest cell is stored under the owner-keyed fixture index:

```txt
cellshire:property-snapshot-cells:v1:<encoded owner id>
```

## Write Gate

`propertySnapshotWriteGate(walletState, ownerId)` permits snapshot-cell writes
only when:

- `ownerId` is not `local`.
- Wallet state is `connected`.
- `walletState.account.address` exactly matches `ownerId`.

Rejected writes return a reason such as `local-owner`, `wallet-disconnected`,
or `owner-mismatch`.

## Save Behavior

`savePropertyZoneWithSnapshotWriter()` always attempts the local property save
first. If local storage succeeds, it then tries the snapshot writer. A rejected
snapshot write does not fail the property save; this keeps local/offline play
working while the chain path is still fixture-backed.

`Game.save()` and property autosave now use this helper. The default game
writer is `LocalStoragePropertySnapshotWriter`, so wallet-owned home saves
produce visit-readable fixture cells when the connected wallet identity matches
the active property owner.

## Next Slice

- Replace or wrap the fixture writer with a submit adapter that prepares a real
  CKB transaction.
- Add pending/stale write status once snapshot publication is asynchronous.
