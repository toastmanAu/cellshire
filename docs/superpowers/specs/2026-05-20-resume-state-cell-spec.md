# Resume State Cell Spec

**Status:** approved 2026-05-20

## Goal

Define the first chain-backed save/load model for Cellshire resume state.
This covers the small "where was I?" state that is not already represented by
inventory, mining, property props, or marketplace cells.

## Non-goals

- Replacing ore, inventory, prop, listing, or currency cells.
- Persisting full public mine tilemaps. Mine maps remain epoch-derived.
- Persisting full property prop ownership. Placed props become their own
  property/item cells later.
- Final marketplace, Trader, or General Store schemas.
- Real-time presence or visitor snapshots.

## Decision

Use a custom minimum-capacity Cellshire resume state cell for the first
implementation, not CKBFS V3.

Reasons:

- The resume blob is deliberately small and structured.
- The game needs consume-and-recreate semantics for one current state, not file
  history or arbitrary file storage.
- A custom cell makes validation and migration explicit.
- CKBFS V3 remains a good later fit for larger player-authored blobs, exported
  property blueprints, screenshots, or documents.

## State Boundary

### Saved By Normal Game Cells

These are not duplicated into resume state:

- Currency balances.
- Owned items and props.
- Placed prop ownership.
- Ore cell capacity or depletion.
- Marketplace listings.
- Map seeds and epoch hashes.
- Active wallet identity.

### Saved By Resume State

Resume state stores only lightweight session continuity:

- Current map id and map kind.
- Last player cell on that map.
- Camera offset and zoom.
- Selected character id.
- UI preferences and selected tool state.
- Property tier.
- Save prompt bookkeeping.

## Logical Shape

Version 1 logical JSON shape:

```json
{
  "v": 1,
  "kind": "cellshire_resume_state",
  "updatedAt": 1790000000000,
  "schema": "cellshire.resume.v1",
  "player": {
    "lockHash": "0x...",
    "displayId": "joyid:..."
  },
  "session": {
    "mapId": "mine:14455",
    "mapKind": "mine",
    "playerCell": { "gx": 42, "gy": 17 },
    "camera": { "offsetX": 123.4, "offsetY": -88.2, "zoom": 1.6 },
    "selectedCharacter": "player_miner"
  },
  "ui": {
    "tool": "place",
    "category": "terrain",
    "selectedAssetId": "grass",
    "showGrid": false,
    "ambientOcclusion": true,
    "showBorders": true,
    "autoSave": false
  },
  "property": {
    "tier": 2
  },
  "save": {
    "dirtyCount": 0,
    "lastPromptAt": 1790000000000,
    "lastSavedLocalRev": 12
  }
}
```

## Compact Wire Shape

The on-chain data should be encoded as compact JSON bytes first. Molecule can
replace this later if validation pressure warrants it.

Compact v1 keys:

```json
{
  "v": 1,
  "k": "resume",
  "t": 1790000000000,
  "p": ["0x...", "joyid:..."],
  "s": ["mine:14455", "mine", 42, 17, 123.4, -88.2, 1.6, "player_miner"],
  "u": ["place", "terrain", "grass", 0, 1, 1, 0],
  "h": [2],
  "d": [0, 1790000000000, 12]
}
```

Field mapping:

| Compact | Meaning |
|---|---|
| `v` | schema version |
| `k` | kind, must be `resume` |
| `t` | updated Unix ms |
| `p[0]` | owner lock hash |
| `p[1]` | optional display id |
| `s[0]` | map id |
| `s[1]` | map kind: `mine`, `property`, or later registry id |
| `s[2]`, `s[3]` | player `gx`, `gy` |
| `s[4]`, `s[5]`, `s[6]` | camera offset X, offset Y, zoom |
| `s[7]` | selected character id |
| `u[0]` | selected tool |
| `u[1]` | selected palette category |
| `u[2]` | selected asset id |
| `u[3]` | show grid, `0/1` |
| `u[4]` | ambient occlusion, `0/1` |
| `u[5]` | object borders, `0/1` |
| `u[6]` | auto-save, `0/1` |
| `h[0]` | property tier |
| `d[0]` | dirty count at save time |
| `d[1]` | last prompt Unix ms |
| `d[2]` | local revision counter |

Expected size is under 512 bytes for v1 and should remain below 1 KB.

## Cell Model

Logical cell:

```js
{
  lock: playerJoyIdLock,
  type: cellshireResumeType,
  capacity: minimumCapacityFor(data),
  data: utf8JsonBytes(compactResumeState)
}
```

Rules:

- One current resume state cell per player lock.
- Client loads the newest valid cell by `updatedAt` when duplicates exist.
- Saving consumes the previous resume cell and creates one replacement cell.
- If no previous cell exists, saving creates the first cell.
- The cell lock is the player's JoyID lock.
- Type args should include a short Cellshire app id plus schema major version,
  so v2 can coexist while v1 clients still find their state.

## Validation

Client-side validation for v1:

- `v === 1`.
- `k === "resume"`.
- `mapKind` is one of `mine`, `property`.
- `mapId` matches `mapKind`:
  - mine ids start with `mine:`.
  - property ids start with `property:`.
- Player cell coordinates are finite integers.
- Camera offsets and zoom are finite numbers.
- Zoom is clamped to the current camera supported range.
- Selected character id must exist in the local character catalog, otherwise
  fall back to no selected character.
- Tool/category/asset ids must exist in current UI/catalog, otherwise fall back
  to `place`, `terrain`, `grass`.
- Property tier is clamped through `normalizePropertyTier`.

Invalid fields should be repaired independently where possible. A malformed
root blob should be ignored and the player should start from default local
state.

## Migration Rules

### Local v0 Sources

Current local sources:

- `cellshire:property:v1:local` stores property tilemap, camera, and
  `propertyTier`.
- `cellshire:character` stores selected character.
- Legacy `CONFIG.storageKey` map saves may contain tilemap/camera for the old
  builder path.
- HUD preferences currently live in runtime state only.

Migration to v1:

1. Read chain resume state if wallet is connected.
2. If a valid chain cell exists, use it as authoritative resume state.
3. If no chain cell exists, synthesize v1 from local storage:
   - map kind: `property` if a property snapshot exists and the player last
     entered home in this session, otherwise `mine`;
   - camera: property camera if available, otherwise current camera;
   - selected character: `cellshire:character`;
   - property tier: property snapshot tier, clamped to known tiers;
   - UI defaults for missing prefs.
4. Mark the synthesized state as local-only dirty and show a save prompt when
   wallet support is enabled.

### Future Versions

- v2 readers must include a `migrateResumeState(data)` path.
- v1 readers must ignore unknown root keys and extra array entries.
- Removing a field requires a new major version.
- Adding an optional field may stay on v1 only if old clients can safely ignore
  it.

## Save UX

### Dirty State

Increment a local `resumeDirtyCount` when any of these change:

- Map travel between mine/property/region.
- Player cell changes across a map boundary or intentional "set home" action.
- Camera changes after a debounce interval.
- Selected character changes.
- UI preference changes.
- Property tier unlocks.

Do not dirty resume state for mining hits, inventory changes, ore depletion, or
placed prop ownership once those are chain-backed by their own cells.

### Prompt Rules

- On significant changes, show a compact "Save progress" toast/action for about
  5 seconds.
- If ignored, keep the pending-save badge visible but do not block play.
- If signing is cancelled, keep dirty state and show a short cancellation toast.
- If save succeeds, clear dirty state and update `lastSavedLocalRev`.
- If save fails, keep dirty state and show a retryable failure toast.

### Pending-Save Badge

Add a small badge near the HUD/title stack when `resumeDirtyCount > 0`.

States:

- `Unsaved` with count while dirty.
- `Saving` while the JoyID signature/submit is in progress.
- `Saved` briefly after success.
- `Save failed` briefly after failure, then return to `Unsaved`.

## Load UX

On boot:

1. Start with deterministic mine/property defaults.
2. If wallet is connected and a valid resume cell exists, apply it after core
   assets and procgen load.
3. If the saved map is unavailable, fall back to the current mine and keep the
   camera/player fallback spawn.
4. If the saved character is unavailable, show the character picker.
5. If property tier is higher than local property snapshot supports, apply the
   tier and keep the property map data; tier only widens edit bounds.

No modal prompt is needed for a valid restore. Bad or missing chain state should
not block boot.

## Adapter Boundary

Add a resume-state adapter instead of embedding chain code in `Game`:

```js
export class LocalResumeStateAdapter {
  async load() {}
  async save(state) {}
}

export class ChainResumeStateAdapter {
  async load({ wallet }) {}
  async save({ wallet, previousCell, state }) {}
}
```

The local adapter should use the same compact shape so test fixtures match the
future chain adapter.

## First Implementation Slice

### Files To Add

| File | Purpose |
|---|---|
| `src/state/resumeState.js` | Build, compact, expand, validate, migrate resume state |
| `src/state/resumeState.test.js` | Pure tests for v1 validation and migration |
| `src/state/resumeStateAdapter.js` | Local adapter plus chain adapter interface |
| `src/ui/ResumeSaveHUD.js` | Pending-save badge and save action |

### Files To Modify

| File | Change |
|---|---|
| `src/core/Game.js` | Capture/apply resume state; dirty on map/property/UI changes |
| `src/main.js` | Load adapter after wallet resolution; apply restored state |
| `src/property/propertyStore.js` | Remain local property snapshot until property cells exist; expose tier for migration |
| `src/ui/HUD.js` | Surface UI prefs in capture/apply paths |
| `docs/DESIGN.md` | Link this spec from the save/persistence section |

## Open Follow-ups

- Final type script deployment details and type args.
- Whether "latest valid cell" should be selected by block number, `updatedAt`,
  or both.
- Exact debounce timing for camera-only dirty state.
- Whether autosave is hidden until JoyID save friction is tested with real
  redirects.
