# Property Snapshot Save Status

Status: implemented for explicit save toasts, HUD/debug state, and quiet
autosave updates.

## Goal

Property saves should tell the player what happened across the local save and
snapshot publication layers without making autosave noisy.

## Status Formatting

`formatPropertySnapshotSaveStatus()` formats the combined
`savePropertyZoneWithSnapshotWriter()` result.

Full messages are used for explicit saves:

- `Saved local property`
- `Saved local + visit snapshot`
- `Saved local + published snapshot`
- `Saved local; connect JoyID to publish`
- `Saved local; publish cancelled`
- `Saved local; not enough CKB to publish`

Compact labels are used by HUD/debug surfaces:

- `local saved`
- `snapshot ready`
- `snapshot published`
- `wallet needed`
- `publish cancelled`
- `needs CKB`

## Runtime Behavior

`Game.save()` now awaits the property snapshot writer result and uses the full
formatted status in the toast. If the local save fails, it still shows the
plain property-save failure path.

Property autosave calls the same helper but does not show a toast. It records
the latest combined result on `game.propertySnapshotSaveResult`, emits map
change state, and makes the compact label available through
`game.propertySnapshotSaveStatus()` and `propertyExpansionState().saveStatus`.

The Property HUD appends the compact status label to editable home details once
a save status exists.

## Next Slice

- Add a dedicated visual affordance if publish states need more room than the
  property detail line.
- Add pending state once real submit confirmation becomes asynchronous beyond
  the current awaited adapter result.
