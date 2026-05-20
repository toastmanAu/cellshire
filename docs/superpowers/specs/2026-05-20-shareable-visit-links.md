# Shareable Visit Links

Status: implemented for property HUD copy/share.

## Goal

Players need a stable URL that opens a read-only view of a property snapshot.
The link should work for local preview mode now and wallet/chain owner ids
later.

## Link Shape

Visit links are normal Cellshire URLs with:

```txt
?visit=<owner id>&visitSource=<local|chain>
```

The formatter preserves unrelated useful query params such as `prices=fixed`,
but strips editor/session params that should not be shared:

- `wallet`
- `dev`
- `character`

Examples:

```txt
https://example.test/games/cellshire/?visit=local&visitSource=local
https://example.test/games/cellshire/?visit=ckt1...&visitSource=chain
```

## Runtime Behavior

The property HUD exposes a `Share` button. It copies the current
`Game.shareableVisitLink()` to the clipboard when browser clipboard access is
available. If clipboard access is blocked, the HUD shows the generated link in
the toast so the player can still use it manually.

The owner id currently comes from `Game.propertyOwner`. Local/disconnected
property mode shares `local`; chain/visited property mode shares the owner id
already loaded by the visit route. The formatter also includes an
`ownerIdForVisit(account)` helper so wallet identity can feed the same link
shape directly when property ownership is bound to wallet accounts.

## Next Slice

- Bind local property owner to connected wallet identity when appropriate.
- Add a dedicated wallet HUD share action once wallet-owned property cells are
  live.
- Add a visible copied/failed state if the toast becomes too transient.
