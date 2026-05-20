# Visiting + Presence

Status: snapshot visiting implemented; real-time presence deferred.

## Goal

Players should be able to inspect another property without gaining mutation
rights. The first slice is a read-only snapshot route, not live multiplayer.

## Visit Route

`?visit=<owner id>` boots the normal mine, then travels the local player avatar
to the requested property map in read-only mode. The owner id is also used for
the property map id:

```txt
property:<encodeURIComponent(owner id)>
```

Local development can seed owner snapshots under:

```txt
cellshire:property:v1:<encodeURIComponent(owner id)>
```

`local` continues to use the legacy key:

```txt
cellshire:property:v1:local
```

If no snapshot exists for an owner, the route displays the starter property as
a placeholder snapshot. This keeps the route testable before chain/indexer
property cells exist.

## Read-Only Rules

Visit mode sets `Game.propertyReadOnly = true` and `mode = "visit"`.

Visitors can:

- walk around the loaded property snapshot;
- return to the public mine;
- inspect the owner id in the property HUD.

Visitors cannot:

- place props or terrain;
- erase props or terrain;
- save or reset the visited property;
- expand the owner claim;
- trigger property autosave.

The toolbar and palette are hidden in visit mode. Runtime guards still block
mutation methods so UI visibility is not the security boundary.

## Presence Options

Snapshot visiting is intentionally enough for this card. Real-time presence can
be layered on later without changing the route shape.

Options considered:

- Poll indexed resume/property snapshots: simplest, high latency, no live
  movement.
- WebSocket relay: straightforward real-time transport, but introduces a
  server-operated coordination layer.
- Fiber channels: likely long-term direction for Nervos-native peer presence
  and eventually signed state/event exchange.

Recommendation: ship snapshot visits first, then prototype Fiber presence once
the property cell/indexer path exists. Until then, any live movement sync would
be detached from ownership state and would add complexity ahead of the chain
model.

## Next Slice

- Add a chain/indexer property snapshot adapter for owner ids.
- Surface a share/copy visit link from wallet identity.
- Add optional visitor list/presence once transport is selected.
