# Lazy-Mint Mining Cells

**Status:** first fixture + HTTP indexer boundary implemented 2026-05-24

## Goal

Define the on-chain lifecycle for Cellshire ore cells: how they are born,
decremented, depleted, and reconciled. The world has thousands of
deterministic ore positions per epoch; the chain must represent only the
ones players actually touch. This spec layers on top of
[`2026-05-17-on-chain-mining-design.md`](2026-05-17-on-chain-mining-design.md)
and depends on
[`2026-05-23-currency-on-chain-sudt.md`](2026-05-23-currency-on-chain-sudt.md)
for the yield-side surface.

## Non-goals

- Pre-minting all ore positions per epoch by a backend service.
- Mainnet anti-grief economics (per-player throttles, cooldowns).
- Replacing the optimistic local mining loop. Local stays the play-time
  source of truth.
- Reclaiming abandoned ore cells across epochs. Old-epoch ore cells become
  spendable dust later; out of scope for v1.
- Final mint-policy enforcement for the yield UDT. That is owned by the
  currency mint-policy follow-up.

## Decision

**Lazy birth on first mine, first-mempool-wins race resolution, optional
treasury subsidy for high-traffic seed ores.**

Reasons:

- Pre-minting thousands of ore cells per epoch ties up CKB capacity for
  ore positions players will never touch (the public mine map is ~32x32
  with dozens of ore types; only a small fraction get mined).
- A deterministic `ore_id` already exists. The indexer can resolve
  `ore_id → live cell` or "untouched"; no pre-mint registry needed.
- The race window between two players first-mining the same `ore_id` is
  small (sub-block) and game-bounded. Both txs settle; the indexer picks
  a canonical winner. Losers still receive their yield UDT, which is the
  player-facing outcome that matters. Capacity accounting drifts by at
  most one mine event per contested ore — acceptable for testnet.
- Treasury subsidy is an opt-in lever for spawn-area ores where lazy
  birth would feel slow on first contact.

## Cell Lifecycle

```text
untouched (no cell)
  → BIRTH tx       (input: funding | output: ore_cell @ cap_max-1, yield_cell)
  → DECREMENT tx   (input: ore_cell, funding | output: ore_cell @ cap-1, yield_cell)
  → DECREMENT tx   ...
  → DEPLETE tx     (input: ore_cell @ 1, funding | output: yield_cell only)
  → spent (no cell, epoch-bound)
```

### Untouched

No cell with the deterministic `type_script.args` for this `ore_id`
exists. Indexer reports `null`; client may chain-mine via a BIRTH tx
when chain mining is enabled.

### Birth

Inputs:

- Player funding cell(s) covering the new ore cell's capacity and tx fee.
- Treasury subsidy cell, if subsidy is enabled for this ore_id.

Outputs:

- New `cellshire_ore` cell with `capacity_remaining = capacity_max - 1`
  and the deterministic `ore_id` identity fields.
- Yield cell (sUDT or native CKB per currency spec).
- Player change cells.

Validation:

- The new ore cell's type-script args MUST equal
  `encodeOreArgs(map_id, epoch, gx, gy, ore_type)`.
- `capacity_max` MUST match the deterministic per-seed value (see
  `OreState`).
- `capacity_remaining` MUST equal `capacity_max - 1`.
- Yield amount MUST match the deterministic mining yield function for
  this epoch and ore.

### Decrement

Inputs:

- Existing ore cell with `capacity_remaining > 1`.
- Player funding cell(s) for tx fee.

Outputs:

- Recreated ore cell with `capacity_remaining - 1`, identity fields
  preserved.
- Yield cell.
- Player change cells.

Validation:

- Output ore cell args MUST equal input ore cell args.
- Capacity MUST decrement by exactly 1.
- Yield amount MUST match the deterministic mining yield function.

### Deplete

Inputs:

- Existing ore cell with `capacity_remaining === 1`.
- Player funding cell(s) for tx fee.

Outputs:

- No recreated ore cell.
- Yield cell.
- Player change cells (reclaim the ore cell's capacity).

The reclaimed capacity flows back to the player by default. A future
balance pass may redirect it to the house treasury.

## Ore Cell Type Script

```text
type_script.code_hash = <CELLSHIRE_ORE_CODE_HASH>   // deployed once
type_script.hash_type = type
type_script.args      = encodeOreArgs({
                          map_id, epoch, gx, gy, ore_type
                        })
```

`encodeOreArgs` is a fixed-width packed encoding:

| Field | Bytes | Notes |
|---|---|---|
| version | 1 | currently `0x01` |
| epoch | 8 | big-endian u64 of epoch number |
| map_id_hash | 8 | first 8 bytes of `blake2b256(map_id)` |
| gx | 2 | big-endian u16 |
| gy | 2 | big-endian u16 |
| ore_type_id | 1 | enum from `oreCatalog.js`, fixed table |

Total: 22 bytes. Two ore cells with identical args address the same
`ore_id`; the on-chain script does not need to enforce singleton at
script execution time — the indexer resolves canonical state.

### Script Verification

The ore type script enforces, per tx, that:

- For BIRTH: no input cell carries this type-script args, exactly one
  output does, and `capacity_remaining` equals `capacity_max - 1`.
- For DECREMENT: exactly one input and one output share the args, and
  output capacity equals input capacity minus one.
- For DEPLETE: exactly one input and no output carry the args, and input
  capacity equals 1.
- `capacity_max` derives from a per-epoch deterministic function the
  script can recompute from `args` + an epoch header dep.

If the deterministic yield function cannot be evaluated cheaply on chain
in v1, the script accepts the client-provided `capacity_max` and emits
the mining receipt witness; an off-chain validator audits drift. The
yield-amount check is enforced by the UDT mint-policy from the currency
spec, not by the ore script.

## Mining Transaction Shape

The mining transaction now bundles ore lifecycle and currency settlement
into one tx:

```text
inputs:
  - ore_cell (if not BIRTH)
  - player funding cells
  - treasury sUDT balance cell (currency spec)
  - treasury subsidy cell (optional)

outputs:
  - ore_cell @ next_capacity (if not DEPLETE)
  - player sUDT balance cell (or native CKB cell for ckb_cluster)
  - updated treasury sUDT balance cell
  - player change cells

witness[0]:
  - JoyID player signature
  - mining_receipt {
      ore_id, ore_type, map_id, epoch, gx, gy,
      mined_capacity_before, mined_capacity_after,
      yield_currency_id, yield_amount,
      tx_nonce
    }

cell_deps:
  - cellshire_ore script
  - cellshire_udt script
  - epoch header dep (for capacity_max + yield calc)

header_deps:
  - referenced epoch header (matches `epoch` field)
```

## Race Resolution

When two players submit BIRTH txs for the same `ore_id` in the same
mempool window:

1. Both txs are well-formed; the chain accepts both as independent
   transactions because their type-script args collisions do not violate
   tx-local validation (CKB has no global uniqueness primitive at the
   type-script-args level).
2. Both winners receive their yield UDT. Cellshire treats this as
   acceptable — the players each had the in-game intent to mine.
3. The indexer canonicalises by `(block_number, tx_index)` of the BIRTH
   tx. Older wins. Newer cell is marked orphaned.
4. Subsequent DECREMENT txs that reference the orphaned cell will still
   succeed on chain; the indexer just rolls them up to the orphan branch.
   Clients reading through the indexer see the canonical branch only.
5. At epoch rollover, both branches die. No long-term divergence.

The cost of the race is bounded: at most one "free" extra mine per
contested ore_id, paid for by the slight oversupply of the yield UDT.
The Cellshire treasury can audit and burn equivalent UDT supply at epoch
rollover if oversupply pressure becomes visible.

For mainnet, race elimination needs a different primitive — pre-minted
ore parent cells with Merkle proofs, or a global lock-per-ore service.
Both are deferred.

## Treasury Subsidy

Optional per-epoch subsidy for high-traffic ores (spawn area, tutorial
zone):

- Treasury creates a `cellshire_ore_subsidy` cell at epoch rollover
  listing eligible `ore_id`s and a capacity budget.
- BIRTH tx may include the subsidy cell as a dep and consume capacity
  from it instead of from the player.
- Subsidy cell is reclaimed by treasury at end of epoch.

This is purely a quality-of-life lever. Without subsidy, lazy birth
still works; first miner just sees a higher CKB cost on the first hit
of a given ore.

## Indexer Contract

The indexer exposes:

- `getOreCell(ore_id) → { liveCell, status }` where status is `untouched`,
  `live`, `depleted`, or `orphaned`.
- `listMineableForMap(map_id, epoch) → [{ ore_id, status, capacity_remaining }]`
  for HUD/debug overlays.
- `getMiningReceipt(tx_hash) → { receipt, canonical }` for audit.

The indexer is part of the broader Cellshire backend track. v1 ships a
local fixture indexer matching this contract, plus an HTTP indexer
adapter behind a feature flag.

## Adapter Boundary

Extend the existing mining adapter from
[`2026-05-17-on-chain-mining-design.md`](2026-05-17-on-chain-mining-design.md):

```js
// src/mining/miningAdapter.js
export class ChainMiningAdapter {
  constructor({ indexer, currencyAdapter, signer }) { ... }

  async mine({ game, obj, state, result, mapId, epoch }) {
    const oreId = oreIdForObject({ obj, mapId, epoch });
    const oreCell = await this.indexer.getOreCell(oreId);
    if (oreCell.status === 'untouched') {
      return this._birthAndMine({ oreId, ... });
    }
    if (oreCell.status === 'depleted') {
      return { ok: false, reason: 'depleted' };
    }
    return this._decrementAndMine({ oreCell: oreCell.liveCell, ... });
  }
}
```

The local adapter remains unchanged. Mode selection in `src/main.js` is
unchanged; this spec just adds the BIRTH branch inside the chain path.

## Feature Flags

- `?chainMining=1` — existing, routes mining through the chain adapter.
- `?chainMiningSubmit=ccc` — existing, real CCC/JoyID submit.
- `?chainMiningBirth=lazy` — explicit opt-in for the BIRTH path. Without
  this flag, the chain adapter falls back to local when `ore_id` is
  untouched, so the live testnet path stays guarded until subsidy is
  configured.
- `?chainMiningSubsidy=1` — enables consuming a treasury subsidy cell
  during BIRTH.

Default with no flags stays local-only.

## First Implementation Slice

Target: chain-backed BIRTH + DECREMENT + DEPLETE for `coal_seam` on
testnet, against a local fixture indexer, behind
`?chainMining=1&chainMiningBirth=lazy`. Real submit still gated on
`?chainMiningSubmit=ccc`.

**Implemented 2026-05-24:** the first slice is live behind
`?chainMining=1&chainMiningBirth=lazy`. The local mining path is unchanged
when chain flags are off. The slice currently uses a local fixture ore indexer
and prototype submit path unless `?chainMiningSubmit=ccc` is also enabled.

### Files To Add

| File | Purpose |
|---|---|
| `src/chain/oreArgs.js` | Pure `encodeOreArgs` + `decodeOreArgs` |
| `src/chain/oreArgs.test.js` | Round-trip + uniqueness tests across catalog |
| `src/chain/oreIndexer.js` | Local fixture indexer for untouched, live, depleted, orphaned |
| `src/chain/oreIndexer.test.js` | Fixture behavior for untouched, live, depleted, orphaned |
| `src/chain/miningTx.birth.js` | BIRTH, DECREMENT, and DEPLETE tx builders |
| `src/chain/miningTx.birth.test.js` | Pure tests for BIRTH and DEPLETE output shape |

### Files To Modify

| File | Change |
|---|---|
| `src/mining/miningAdapter.js` | Resolve cell via indexer; branch BIRTH vs DECREMENT vs DEPLETE; surface `depleted` and `orphaned` reasons |
| `src/main.js` | Existing mining-adapter factory now receives the lazy mode from query params |
| `tests.html` | Loads the new lazy-cell test modules |

Deferred from the first fixture slice: CCC cell deps for a deployed ore script,
epoch header deps, HTTP indexer wiring, subsidy cells, and final on-chain script
validation.

### Acceptance For First Slice

- [x] `encodeOreArgs` round-trips every entry in `oreCatalog.js` deterministically.
- [x] Local fixture indexer reports `untouched` for an unknown `ore_id` and
  `live` after the BIRTH tx fixture lands.
- [x] BIRTH tx shape passes pure tests: correct args, `capacity_remaining =
  capacity_max - 1`, yield witness fields populated.
- [x] DEPLETE tx shape passes pure tests: no recreated ore cell, capacity
  reclaimed to player change.
- [x] With `?chainMining=1&chainMiningBirth=lazy`, mining a `coal_seam` that
  the fixture indexer says is untouched submits a BIRTH-shaped tx; local
  capacity reconciles on success.
- [x] Existing local mining path remains unchanged when flags are off.
- [x] No subsidy, no real treasury cell handling, no on-chain script
  deployment yet. The script-side validation logic is documented but
  enforced only by client-side assertions plus mining receipt audit in
  v1.

### HTTP Indexer Boundary

**Implemented 2026-05-24:** lazy mining now has a swappable ore-indexer
boundary. The fixture indexer remains the default for
`?chainMining=1&chainMiningBirth=lazy`; `?chainMiningIndexer=http` or
`?chainMiningIndexerUrl=<base url>` switches to an HTTP adapter.

HTTP contract for v1:

```text
GET <base>/ore/<encodeURIComponent(ore_id)>

200 { "status": "untouched" }
200 { "status": "live", "liveCell": { ...cellshire_ore } }
200 { "status": "depleted" }
200 { "status": "orphaned" }
404 => untouched
non-2xx/network/malformed => stale
```

The chain adapter refuses to submit lazy mining txs when the indexer returns
`stale`, so the local optimistic hit is restored and no uncertain chain tx is
sent. CCC receipt payloads also accept lazy BIRTH txs whose ore identity comes
from the output cell or mining receipt rather than an input ore cell.

Verification 2026-05-24: browser test harness (`317 passed, 0 failed`),
`node netlify-build.mjs`, `git diff --check`, and a flagged boot smoke with
`?chainMining=1&chainMiningBirth=lazy&chainMiningIndexerUrl=...`.

## Open Questions

1. **Capacity_max source on chain.** Whether the ore script reads
   `capacity_max` from an epoch header dep + deterministic function, or
   accepts the client value with off-chain audit. Decision gated on
   cycle budget of the deterministic function.
2. **Race burn policy.** Whether the treasury burns the oversupply UDT
   from contested-BIRTH races at epoch rollover, or just accepts the
   drift.
3. **Yield-amount enforcement.** Whether the UDT mint policy script
   (currency spec follow-up) verifies yield amount against the ore
   identity, or trusts the mining receipt witness.
4. **Subsidy eligibility.** Which `ore_id`s qualify for treasury subsidy.
   Suggested first list: 8x8 grid centred on each map's spawn cell.
5. **Indexer authority.** Whether the v1 HTTP indexer is the Cellshire
   backend or a hosted CKB indexer (Mercury, ckb-indexer). Likely a thin
   Cellshire layer in front of a standard indexer.
6. **Epoch rollover.** Whether ore cells from past epochs get a
   reclaim-by-anyone sweeper script or just sit until their owner spends
   them.

## Acceptance Checklist

- Ore cell lifecycle (BIRTH/DECREMENT/DEPLETE) is specified with input,
  output, and validation rules.
- Type-script args encoding is fixed.
- Race resolution policy is named and bounded.
- Treasury subsidy is documented as opt-in.
- Indexer contract is named.
- Adapter boundary and feature flags are specified.
- First implementation slice and acceptance bounds are specified.
- Open questions captured for capacity_max source, mint enforcement, and
  subsidy eligibility.
