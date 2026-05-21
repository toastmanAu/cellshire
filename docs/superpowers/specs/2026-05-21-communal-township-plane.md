# Communal Township Plane

Status: implemented as the first shared hub map.

## Goal

Add a communal township plane that gives the existing economy surfaces a
physical place in the world without merging them into the mine or private
property maps.

## Runtime Shape

The map registry now contains three map kinds:

- `mine`
- `township`
- `property`

The township uses a fixed communal map id:

```txt
township:communal
```

Travel roles route through the map registry:

- `township_portal` enters the township.
- `township_mine_portal` returns to the public mine.
- `township_property_portal` enters the active home/visited property.

Mine boot now places a township signpost near the player spawn. Starter
property maps also include a township signpost, and the township itself includes
separate exits for mine and property.

## Township Layout

The first township map is a deterministic `32x32` hub with:

- General Store landmark.
- Market landmark.
- Bank landmark.
- Gallery landmark.
- Community Hall landmark.
- Central plaza, well, benches, banners, and lanterns.

Landmark buildings are interactable hotspots. For this slice, interacting with
one shows a lightweight coming-soon toast; the next slice will replace that
stub with RPG-style interior scene windows that can launch the real Store,
Market, Bank, Gallery, and Community Hall actions.

## State Preservation

Travel captures the current map runtime before entering the township and
restores the stored mine/property runtime when leaving. Editable property maps
still autosave before travel; visited property maps remain read-only.

## Test Coverage

- Map registry includes a township entry, id helper, spawn, and travel roles.
- Township map contains all five landmarks plus mine/property exits.
- Township landmarks and exits are interactable.
- Mine-side township portal placement is covered.
- Starter property maps include a township portal.

## Next Slice

Build `RPG Building Interior Windows`: a stylized interior scene window per
landmark that can route into the existing Shop, Market, Trader/Bank, Gallery,
and Community Hall flows.
