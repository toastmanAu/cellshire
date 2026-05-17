# On-Chain Mining Transaction — Architecture Spec

**Status:** approved 2026-05-17

## Goal

Define the first chain-backed mining path before implementation. The
current game already has deterministic per-epoch ore placement, local
`OreState`, local inventory balances, and per-epoch mined-state
persistence. This spec defines how that model maps onto CKB cells so the
next implementation card can replace local-only mining for one supported
ore type with a signed testnet transaction.

## Non-goals

- Full mainnet economics.
- Full marketplace / Trader / General Store integration.
- Final molecule schemas for every future item type.
- Multi-player real-time presence or Fiber settlement.
- Full anti-grief policy. This spec leaves cooldowns and per-player
  throttles for a later balancing pass.
- Replacing the local mining loop entirely. Local/offline mode remains
  a dev and fallback path.

## Approved Decisions

| Decision | Choice |
|---|---|
| First network | CKB testnet |
| First live scope | One ore type, then expand |
| Wallet surface | Existing `?wallet=1` JoyID identity stub first; real JoyID connector later |
| Runtime model | Optimistic local UX, reconcile after tx result |
| Local fallback | Keep current local mining path when wallet/chain is unavailable |
| Ore identity | `map_id + epoch + gx + gy + ore_type` |
| Depletion model | Consume ore cell, recreate it with lower `capacity_remaining`; omit output at zero |
| Yield model | Credit a player-owned currency cell; exact currency type is adapter-configured |

## Terms

- **Map id:** deterministic id for the world/map containing the ore.
  For the current public mine MVP, use `mine:<epoch>` because there is
  one epoch-derived mine map. Future multi-map work can use ids like
  `mine:<region>:<epoch>` or `property:<owner>`.
- **Ore id:** deterministic identity string:
  `ore:<map_id>:<epoch>:<gx>:<gy>:<ore_type>`.
- **Ore cell:** CKB cell representing one mineable deposit.
- **Yield cell:** player-owned cell credited by a mining hit.
- **Mining adapter:** JS boundary between `Game._mineOre` and chain tx
  construction/submission. Local mode and testnet mode implement the
  same interface.

## Cell Model

### Ore Cell Data

First-version logical shape:

```js
{
  version: 1,
  kind: 'cellshire_ore',
  ore_id: 'ore:mine:14455:14455:42:17:coal_seam',
  map_id: 'mine:14455',
  epoch: '14455',
  gx: 42,
  gy: 17,
  ore_type: 'coal_seam',
  capacity_remaining: 3,
  capacity_max: 5,
  yield_nonce: '0x...',
  owner_lock_if_claimed: null
}
```

**Notes:**

- `ore_id` is redundant but useful for indexers and client assertions.
- `gx` / `gy` are grid coordinates from the deterministic procgen map.
- `capacity_remaining` is the authoritative on-chain value after chain
  mining ships.
- `capacity_max` is optional but useful for UI and validation.
- `yield_nonce` can be derived from the epoch hash + ore id for
  deterministic yield, or omitted until the epoch modifier/yield spec
  lands.
- `owner_lock_if_claimed` stays `null` for public first-come-first-serve
  mining. Claimed/private ores can be added later without changing the
  local identity model.

### Capacity

The current `OreState` capacity is already deterministic per seed and
ore type. The first chain-backed version should source initial
`capacity_max` from the same algorithm, so local previews and chain
state agree.

If an indexed ore cell is missing, the client treats the ore as
unavailable for chain mining and falls back to local-only mode only when
the player explicitly has no connected wallet or is in dev/offline mode.

### Yield Cell Data

First-version logical shape:

```js
{
  version: 1,
  kind: 'cellshire_currency',
  currency: 'coal_seam',
  amount: 2,
  source_ore_id: 'ore:mine:14455:14455:42:17:coal_seam',
  mined_at_epoch: '14455'
}
```

The currency representation is deliberately adapter-configured:

- Local adapter: increment `Inventory` balance by `{currency, amount}`.
- Testnet adapter v0: create/update a simple typed test cell.
- Later production adapter: sUDT or the chosen Cellshire currency cell.

`ckb_cluster` is special later because it credits real CKB; the first
prototype should avoid making it the first live ore unless we explicitly
want to test real capacity transfers.

## Mining Transaction

### Inputs

- Ore cell for `ore_id`.
- Player funding cell(s) for tx fee and any minimum capacity top-up.
- Existing player currency cell, if the chosen currency uses a
  single-balance cell model.

### Outputs

If `capacity_remaining > 1` before the hit:

- Recreated ore cell with `capacity_remaining - 1`.
- Player yield cell or updated player currency cell.
- Player change cell(s).

If `capacity_remaining === 1` before the hit:

- No recreated ore cell. The ore is depleted.
- Player yield cell or updated player currency cell.
- Player change cell(s).

### Validation Rules

The transaction path must assert:

- Input ore cell `ore_id` equals the clicked ore's deterministic id.
- Input ore cell `map_id`, `epoch`, `gx`, `gy`, and `ore_type` match the
  current game object.
- Input `capacity_remaining > 0`.
- Output ore cell, when present, decrements capacity by exactly 1 and
  preserves identity fields.
- Yield output uses the configured currency for `ore_type`.
- Yield amount matches the deterministic yield function once the epoch
  modifier spec lands. Until then, local/testnet adapter may use the
  current `OreState.mine()` result as provisional dev yield.
- Player lock owns the yield cell.

## Client Adapter Boundary

Add a mining adapter rather than putting tx logic inside `Game._mineOre`.

```js
export class LocalMiningAdapter {
  async mine({ game, obj, state, result }) {
    return {
      ok: true,
      mode: 'local',
      capacityRemaining: state.capacityRemaining,
      yield: result,
    };
  }
}

export class ChainMiningAdapter {
  async mine({ wallet, mapId, epoch, obj, state, result }) {
    // 1. resolve deterministic ore id
    // 2. fetch/index ore cell
    // 3. build tx
    // 4. request JoyID signature
    // 5. submit tx
    // 6. return pending/success/failure result
  }
}
```

`Game._mineOre` should eventually become:

1. Compute/preview local mining result.
2. If chain mining is active, call adapter before permanently mutating
   local state.
3. Show pending UI while signature/submit is in progress.
4. Commit local capacity/inventory only on success, or rollback on
   failure/cancel.

For the first prototype, it is acceptable to keep the current local
mutation code path and add a guarded chain path for one ore type only,
but the chain path must use the adapter boundary from the start.

## Optimistic UX And Reconciliation

### Happy Path

1. Player clicks ore.
2. Player walks adjacent and triggers mining.
3. UI shows pending hit state on the ore.
4. Wallet signature opens.
5. Tx submits successfully.
6. Local `OreState` decrements, inventory updates, local mined-state
   writes, and normal FX/audio play.

### Cancel / Failure

- If the player cancels signing, local ore capacity remains unchanged.
- If tx construction fails, local ore capacity remains unchanged.
- If tx submission fails, local ore capacity remains unchanged.
- UI shows a short failure toast and clears pending state.

### Stale Chain State

If the ore was already mined by someone else:

- Adapter returns stale/depleted.
- Client fetches current ore cell state.
- If capacity is lower but nonzero, call `OreState.restoreCapacity`.
- If depleted, remove the ore from the tilemap without granting yield.
- Persist the reconciled state into `cellshire:mined:<epoch>` so the
  local view stays aligned for reloads.

This makes the current local mined-store a read-through cache of chain
truth instead of an anti-cheat mechanism.

## First Implementation Slice

The next implementation card should target one ore type, preferably
`coal_seam`, because it is common, low-value, and visually easy to find.

### Files To Add

| File | Purpose |
|---|---|
| `src/mining/oreIdentity.js` | Pure `mapIdForEpoch`, `oreIdForObject`, and parse helpers |
| `src/mining/miningAdapter.js` | Local adapter + chain adapter interface |
| `src/chain/miningTx.js` | Testnet tx construction helpers |
| `src/chain/miningTx.test.js` | Pure tx-shape tests with fixtures |

### Files To Modify

| File | Change |
|---|---|
| `src/core/Game.js` | Call mining adapter from `_mineOre`; guard rollback |
| `src/main.js` | Install adapter based on wallet/feature flag |
| `src/ui/WalletHUD.js` | Expose connected account to runtime once real JoyID lands |
| `src/mining/minedStore.js` | Treat chain reconciliation as another writer |

## Feature Flags

- `?wallet=1` keeps exposing the wallet identity surface.
- Add `?chainMining=1` for the first live mining path.
- Add `?chainMiningOre=coal_seam` if we want to test only one ore type
  without code edits.

Default without flags stays local-only.

## Open Questions

1. Exact on-chain encoding: raw molecule schema vs JSON-in-cell for the
   first testnet prototype.
2. Currency representation for non-CKB ores: sUDT vs custom typed cells.
3. Whether initial ore cells are pre-minted per epoch by a service or
   lazily created/claimed on first mining interaction.
4. Whether `owner_lock_if_claimed` is needed in v1 or should stay out
   until property/private-map mining.
5. Which CKB indexer path the client uses to resolve `ore_id` to live
   cells.

## Acceptance Checklist

- Ore cell data shape is specified.
- Mine tx inputs/outputs and validation rules are specified.
- The optimistic local UX and rollback/reconciliation rules are
  specified.
- First implementation slice, file boundaries, and feature flags are
  specified.
