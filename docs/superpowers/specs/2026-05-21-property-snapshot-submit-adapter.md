# Property Snapshot Submit Adapter

Status: implemented for prototype and CCC/JoyID submit modes.

## Goal

Wallet-owned property snapshots now have a transaction boundary between local
payload export and real CKB submission. The local fixture writer remains the
default offline/dev path.

## Transaction Request

`buildPropertySnapshotTransaction()` turns a `cellshire.property.snapshot` v1
payload into a logical transaction request:

```json
{
  "version": 1,
  "kind": "cellshire_property_snapshot_tx",
  "network": "testnet",
  "action": "publish_property_snapshot",
  "inputs": { "funding_lock": "ckt1..." },
  "outputs": {
    "property_snapshot_cell": {},
    "change_lock": "ckt1..."
  },
  "witness": {
    "provider": "joyid",
    "address": "ckt1...",
    "signature": "pending"
  }
}
```

The builder rejects snapshots whose `ownerId` does not match the connected
wallet address.

## Submit Modes

`makePropertySnapshotWriterFromParams()` selects the writer:

- Default: `LocalStoragePropertySnapshotWriter`, which writes the latest
  owner-keyed fixture cell.
- `?propertySnapshotSubmit=ccc`, `?propertySnapshotMode=ccc`,
  `?propertySnapshotReal=1`, `?propertySnapshotSubmit=joyid`, or
  `?propertySnapshotSubmit=ccc-joyid`: `PropertySnapshotSubmitAdapter`.

The submit adapter keeps the existing wallet-owner gate. It builds a property
snapshot transaction request and passes it to a submitter. Submit failures
return normalized reasons such as `signature-cancelled`,
`insufficient-capacity`, or `tx-failed`; the local property save remains
successful.

## CCC/JoyID Path

`submitCccJoyIdPropertySnapshotTx()` mirrors the mining submit path:

- Resolves CCC/JoyID config.
- Connects a JoyID signer.
- Verifies the signer address matches the transaction witness.
- Builds a compact receipt payload with owner, cell id, block number, tier,
  camera, and tile map.
- Adds the payload as a witness and submits through the signer.

## Next Slice

- Add visible pending/published status for property snapshot saves.
- Replace witness-only prototype output with the final on-chain cell type/data
  once the exact CKB cell layout is locked.
