# Wallet Owner Property Binding

Status: implemented for explicit wallet/local home selection.

## Goal

Players can keep the existing offline `local` home while opting a connected
wallet into a wallet-owned home id. The active owner id feeds property travel,
property saves, and shareable visit links.

## Storage

The selected ownership mode is stored separately from property snapshots:

```txt
cellshire:propertyOwnerBinding:v1
```

Shape:

```json
{ "mode": "wallet", "ownerId": "ckt1...", "boundAt": 1779276360000 }
```

No binding, malformed binding, or a disconnected wallet resolves to local mode.
Clearing the binding removes only the binding key. The local property save and
owner-keyed wallet property save remain untouched:

```txt
cellshire:property:v1:local
cellshire:property:v1:<encoded wallet address>
```

## Runtime Behavior

When wallet features are enabled, startup reads the persisted wallet identity
and owner binding before configuring the map registry. If the wallet is
connected and the binding mode is `wallet`, the home property owner id is the
connected wallet address. Otherwise it remains `local`.

The Wallet HUD exposes an explicit property action:

- `Use wallet home` stores the wallet binding and switches the home property
  owner to the connected wallet address.
- `Use local home` clears the binding and switches the home property owner back
  to `local`.
- Disconnecting the wallet switches the live home owner back to `local`, while
  leaving saved property snapshots intact.

`Game.setHomePropertyOwner()` autosaves the current editable property before
switching owners, rebuilds the map registry with the selected owner, and reloads
the editable property snapshot for that owner. While the player is in the mine,
the property portal and share link target the selected home owner.

## Share Links

`Game.shareableVisitLink()` already uses `Game.propertyOwner`, so once the
wallet-owned home is selected the copied link includes the wallet address:

```txt
?visit=ckt1...&visitSource=local
```

Switching back to local mode returns share links to:

```txt
?visit=local&visitSource=local
```

## Next Slice

- Persist wallet-owned property snapshots to chain cells.
- Add a visible owner label to the Wallet HUD if the property action needs more
  context after real wallets are common.
