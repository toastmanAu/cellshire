# Open Asset Standard V1

Status: draft implemented as a local adapter and fixture tests.

## Cell Types

All open assets use a versioned molecule-compatible payload. The current local
adapter accepts the logical JSON shape below and maps it to a runtime asset id.
The chain version should encode the same fields as molecule structs.

Shared header:

- `schema`: `cellshire.open_asset`
- `version`: `1`
- `cell_id`: unique Spore/cell id
- `owner_lock_hash`: current owner lock hash
- `item_type`: one of `ground_tile`, `prop`, `character_skin`, `accessory`
- `metadata_hash`: hash of off-chain display metadata when present
- `render_rule_hash`: hash of the render rule payload

Ground tile cell:

- `terrain_kind`: game category hint, usually `terrain`
- `walkable`: boolean
- `footprint`: `{ w, d }`, currently `1x1`

Prop cell:

- `prop_kind`: decorative, structure, vendor, portal, crop, etc.
- `footprint`: `{ w, d }`, max `6x6` for v1
- `solid`: boolean, defaults true
- `placed_state`: optional `{ map_id, gx, gy, flip_h, flip_v }`

Character skin cell:

- `skin_kind`: base body, outfit, or variant
- `facing_set`: required facing sprites or an alias source
- `equip_slot`: `avatar`

Accessory cell:

- `slot`: hat, held_tool, backpack, aura, etc.
- `anchor`: render anchor on the character sprite
- `compat_tags`: character skins or body tags it supports

## Render Rule

V1 uses `cellshire.manifest-alias`: a safe adapter that maps cell metadata to
an existing Cellshire renderer source while preserving unique cell identity.

Logical shape:

```json
{
  "renderer": "cellshire.manifest-alias",
  "version": 1,
  "source": { "assetId": "stone_lantern" },
  "overrides": {
    "category": "props",
    "kind": "object",
    "footprint": { "w": 1, "d": 1 },
    "sizeScale": 0.42,
    "flatBase": false,
    "noShadow": false,
    "shadowStyle": "cast"
  }
}
```

The game registers the cell as `open:<cell_id>`. Rendering aliases the existing
`source.assetId` canvas and shadow data, but placement, ownership, listing, and
save state use the generated open asset id.

## Compatibility

- `schema` and `version` are mandatory. Unsupported versions are rejected.
- `item_type` must be one of the four v1 cell types.
- The render source must resolve to a known manifest or registered open asset.
- `footprint` must be integer `1..6` in both dimensions.
- Unknown metadata traits are preserved for future systems but ignored by v1
  rendering.
- Missing optional render overrides inherit from the source asset or the item
  type defaults.
- Runtime ids are deterministic and sanitized from `cell_id`.

## Implemented Slice

- `src/assets/openAssetStandard.js` normalizes and registers compliant cells.
- `src/assets/assetRegistry.js` extends manifest lookups with dynamic open
  definitions.
- Placement, property bounds, palette visibility, renderer preview, and
  marketplace validation now use the registry instead of only the frozen
  manifest.
- The browser test fixture registers a Spore-like prop cell, places it on a
  tile map as `open:<cell_id>`, and resolves rendering through the manifest
  alias rule without changing the core asset catalog.
