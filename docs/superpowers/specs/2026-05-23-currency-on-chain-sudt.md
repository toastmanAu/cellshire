# Currency On-Chain — sUDT Model

**Status:** read-only fixture slice, pending overlay,
chain Trader/Store/Marketplace prototypes, and CCC receipt submits implemented
2026-05-25

## Goal

Define how Cellshire's twelve proof-of-work mined currencies map onto CKB
cells so Trader, Marketplace, Mining yield, and Bank can all settle in real
on-chain balances. This spec is the chain-side answer to the existing
[crypto ore economy mapping](../../assets/) — same 12 currency ids, but
each currency id now resolves to a concrete cell representation.

## Non-goals

- Final tokenomics for mainnet launch.
- Cross-chain bridging to the real BTC/LTC/DOGE/etc. networks. The Cellshire
  currencies are in-game proof-of-work-themed tokens; the cosmetics borrow
  external branding without claiming on-chain peg.
- Replacing the existing local inventory path. Local mode remains the dev
  and fallback runtime.
- Final liquidity, treasury cap, or supply curve. The first slice intentionally
  uses an admin-minted reserve so gameplay can iterate.
- Marketplace settlement schema. That gets its own follow-up spec once
  currencies can move on chain.

## Decision

Use one **Cellshire UDT issuance type script** with twelve deterministic
type-args (one per currency id) to represent the eleven non-CKB currencies.
Native CKB stays as native CKB capacity.

Reasons:

- Single deployed script is dramatically cheaper to maintain than twelve
  bespoke typed-cell scripts.
- sUDT is the most battle-tested CKB token standard; CCC, JoyID, indexers,
  marketplace tooling, and Cellswap-shaped DEX flows all expect it.
- Per-currency type-args give clean wallet-side balance separation and
  deterministic addresses (no admin lookup table needed).
- Provenance fields the local model carries (`source_ore_id`,
  `mined_at_epoch`, `yield_nonce`) can live in mining-tx witnesses and an
  off-chain indexer keyed by ore_id, without bloating cell data.

What this spec deliberately does **not** pick yet:

- Whether mint authority is a pure admin key, a mining-receipt verifier
  script, or a hybrid co-sig flow. v1 ships with admin-minted reserve;
  the mint-policy follow-up is listed in Open Questions.

## Currency Surface

The on-chain currency identity layer:

| Currency Id | Symbol | Mapped Ore | Representation |
|---|---|---|---|
| `btc`  | BTC  | `gold_ore`        | sUDT |
| `ltc`  | LTC  | `silver_ore`      | sUDT |
| `doge` | DOGE | `copper_ore`      | sUDT |
| `dash` | DASH | `iron_ore`        | sUDT |
| `xmr`  | XMR  | `cobalt_ore`      | sUDT |
| `zec`  | ZEC  | `silicon_quartz`  | sUDT |
| `ckb`  | CKB  | `ckb_cluster`     | native CKB capacity |
| `kas`  | KAS  | `lithium_ore`     | sUDT |
| `erg`  | ERG  | `bismuth_ore`     | sUDT |
| `bch`  | BCH  | `coal_seam`       | sUDT |
| `dgb`  | DGB  | `tin_ore`         | sUDT |
| `rvn`  | RVN  | `nickel_ore`      | sUDT |

The exact ore→currency mapping is owned by
`src/mining/cryptoEconomy.js`; this table is illustrative and any drift
must be resolved by the catalog.

## Type Script Identity

```text
type_script.code_hash = <CELLSHIRE_UDT_CODE_HASH>   // deployed once
type_script.hash_type = type
type_script.args      = blake2b256(
                          utf8("cellshire:udt:v1") || utf8(currency_id)
                        )[0..32]
```

Properties:

- `args` is 32 bytes, deterministic per `currency_id`, and independent of
  any admin key. Two wallets independently computing the args for `btc`
  arrive at byte-identical type scripts.
- A future v2 issuance script can rotate the prefix to `cellshire:udt:v2`
  without colliding with v1 supply.
- The eleven type scripts each have their own address that indexers,
  Cellswap, and JoyID can treat as ordinary sUDT.

The CKB currency stays as native capacity. Mining `ckb_cluster` mints
no UDT; it moves CKB into the player's lock. Trader swaps involving CKB
move native capacity in/out.

## Cell Shapes

### Player Balance Cell

Standard sUDT shape, one cell per currency type script per lock:

```js
{
  lock: playerJoyIdLock,
  type: cellshireUdtTypeFor(currencyId),
  capacity: minCellCapacity, // typically 142 CKB at default occupied size
  data: u128LeBytes(amount)   // 16 bytes
}
```

Rules:

- One canonical balance cell per `(lock, currency)`. Multiple cells are
  legal but the client should consolidate on first sight.
- Empty balance MUST consume the cell (no zero-balance dust).
- Decimal precision: the local UI already formats fractional amounts; on
  chain the amount is a `u128` of base units. Base unit for each currency
  is `10^-8` of the display amount, matching the precision already used by
  `formatCurrencyAmount` in `src/mining/cryptoEconomy.js`.

### House Treasury Currency Cells

The existing local house treasury records fee entries with source-currency
context. On chain, the treasury holds one balance cell per currency under
a Cellshire treasury lock. Treasury policy details belong to a separate
treasury spec; this currency spec only commits to "treasury sUDT balances
are valid output destinations for swap fees."

## Mint Policy (v1)

The first slice uses **admin-minted reserve**:

- A Cellshire treasury wallet pre-mints a generous supply per currency at
  testnet deployment.
- Mining yield is paid by **transferring from treasury → player** inside
  the mining transaction.
- The mining receipt witness (already implemented for `chainMiningSubmit=ccc`)
  records the ore identity and yielded amount.
- The treasury wallet co-signs mining transactions through a small relay,
  or alternatively a multisig lock that the local mining adapter knows how
  to construct.

Tradeoffs accepted for v1:

- Trust assumption: players trust the treasury not to over-mint. Fine for
  testnet, not acceptable for mainnet.
- Throughput: every chain mine requires treasury participation. Tolerable
  while only one ore type is live (`coal_seam`) and mining is opt-in via
  `?chainMining=1`.

Mint-policy upgrades are listed under Open Questions and are explicitly
out of scope for the first implementation card.

## Mining Yield Integration

Extends [`2026-05-17-on-chain-mining-design.md`](2026-05-17-on-chain-mining-design.md).
The mining transaction now resolves yield through the currency surface:

1. Look up the currency id for the mined ore type
   (`oreType → currencyId` via `cryptoEconomy`).
2. If currency is `ckb`: yield is native CKB capacity, transferred from
   treasury → player as a normal CKB cell.
3. Otherwise: yield is the matching sUDT amount, transferred from the
   treasury balance cell → player balance cell (creating the player cell
   if absent).
4. The mining receipt witness gains a `yieldCurrencyId` field alongside
   the existing ore identity fields.

Per-tx amount uses the deterministic yield function once
`epochModifier` and `epochValueRange` are folded into the on-chain
verification path. Until then, the adapter computes amount client-side
and the treasury co-signer enforces an upper bound to prevent client
exploits.

## Trader Swap Integration

Extends the local trader path (`src/trader/traderAdapter.js`). The chain
adapter must build a transaction that:

- Consumes the player's source-currency balance cell.
- Consumes the player's destination-currency balance cell if one exists.
- Optionally consumes a treasury cell when liquidity is sourced from the
  house book.
- Produces an updated player source-currency cell (or omits it on zero).
- Produces an updated player destination-currency cell.
- Produces a treasury cut cell denominated in the source currency at the
  configured fee bps.

The local quote math from `traderRates` remains the source of truth for
preview UX; chain settlement asserts the quote within an allowed slippage
window once price snapshots become an on-chain reference.

Implemented 2026-05-25 prototype:

- `?chainTrader=1` switches the Trader HUD to a chain-shaped swap path.
- Trader balances are read from the chain currency adapter when chain Trader is
  active, so quotes can use indexed plus pending wallet balances.
- Added `cellshire_trader_swap_tx` request construction with source balance
  input, target balance output, treasury fee receipt, and quote witness.
- Prototype submit records pending deltas for both sides of the swap
  (`-source`, `+target`), applies an immediate fixture settlement to indexed
  balances, and leaves local inventory untouched.
- `?chainTraderSubmit=ccc` signs and submits a CCC/JoyID Trader receipt,
  matching the mining/property/bank receipt-submit pattern. Full real sUDT
  settlement remains deferred to the Cellswap/settlement slice.
- `?chainStore=1` switches General Store purchases to the chain wallet fixture,
  builds `cellshire_store_purchase_tx`, spends indexed CKB, grants the bought
  prop locally, and lets pending CKB reconcile once the fixture indexer catches
  up. Store prop receipts are fixture/local until Open Asset minting is wired.
- `?chainStoreSubmit=ccc` signs and submits a compact
  `cellshire.store.purchase` receipt through CCC/JoyID. Like Trader, this is
  receipt-only until real vendor settlement and Open Asset prop minting are
  wired.
- `?chainMarketplace=1` switches Marketplace buys to the chain wallet fixture,
  builds `cellshire_marketplace_purchase_tx`, spends indexed CKB, grants the
  bought prop/skin locally, closes the listing, and lets pending CKB reconcile
  once the fixture indexer catches up. Listing and cancel stay local
  wallet-gated actions in this slice.

## Indexer & Provenance

Off-chain indexer maintains:

- `(lock, currency)` → latest balance cell out-point.
- `mining_receipt_witness.ore_id` → tx hash, yielded currency, yielded
  amount, mined epoch, mined block number.
- Per-currency total minted and burned across treasury activity.

The indexer is part of the larger Cellshire backend track; this spec only
fixes the witness fields and currency type-args that the indexer reads.

## Adapter Boundary

Add a currency adapter that mirrors the existing inventory adapter:

```js
// src/economy/currencyAdapter.js
export class LocalCurrencyAdapter {
  async getBalance(currencyId) { /* read from Inventory */ }
  async credit(currencyId, amount, context) { /* mutate Inventory */ }
  async debit(currencyId, amount, context) { /* mutate Inventory */ }
}

export class ChainCurrencyAdapter {
  async getBalance(currencyId, { lock }) { /* indexer read */ }
  async credit(currencyId, amount, context) { /* settle via mining/trader tx */ }
  async debit(currencyId, amount, context) { /* settle via trader/marketplace tx */ }
}
```

The mining adapter and trader adapter delegate balance mutation to the
currency adapter so that swapping local↔chain is a one-line factory choice
in `src/main.js`.

## Feature Flags

- `?chainCurrency=1`
  Routes balance reads through the chain currency adapter.
- `?chainCurrencyMint=relay`
  Allows mining/trader settle paths to call the treasury relay endpoint.
  Without this flag the chain adapter is read-only.

Default with no flags stays local-only. `?chainMiningSubmit=ccc` already
exists and continues to drive the mining tx submit path; combining
`?chainMining=1&chainCurrency=1` flips both mining and balance to chain.

## First Implementation Slice

Target: **read-only** chain balance surface for one currency (`bch`, since
it maps to `coal_seam` which already has the chain mining prototype).

### Files To Add

| File | Purpose |
|---|---|
| `src/economy/currencyTypeId.js` | Compute deterministic UDT args from currency id and Cellshire app prefix |
| `src/economy/currencyTypeId.test.js` | Pure tests covering args determinism and per-currency uniqueness |
| `src/economy/currencyAdapter.js` | Local + chain currency adapter interface |
| `src/economy/currencyAdapter.test.js` | Local adapter behavior; chain adapter against indexer fixture |
| `src/chain/udtBalance.js` | sUDT cell data pack/unpack and balance read helpers |
| `src/chain/udtBalance.test.js` | u128 LE round-trip tests and minimum-capacity assertions |

### Files To Modify

| File | Change |
|---|---|
| `src/main.js` | Install currency adapter based on `?chainCurrency=1` |
| `src/core/Inventory.js` | Route reads through adapter when a chain adapter is installed |
| `src/ui/InventoryHUD.js` | Show pending/stale states for chain-sourced balances |
| `src/mining/miningAdapter.js` | Hand currency-write back to currency adapter on success |
| `src/trader/traderAdapter.js` | Same — currency-write delegated to adapter |
| `src/chain/cccJoyId.js` | Add helpers for transferring sUDT inside JoyID-signed txs |
| `docs/DESIGN.md` | Link this spec under the economy section |

### Acceptance For First Slice

- `currencyTypeId(currencyId)` is deterministic and unique per currency.
- Local mode behavior is unchanged; all existing tests still pass.
- With `?chainCurrency=1`, the Inventory HUD reads `bch` balance from an
  indexer fixture; other currencies fall back to local.
- Pending/stale state is visible when the indexer fixture is mocked offline.
- No mint path is enabled yet — the slice is read-only.

Implemented 2026-05-24:

- Added deterministic `currencyTypeId(...)` / `currencyTypeScript(...)`
  helpers in `src/economy/currencyTypeId.js`.
- Added u128 little-endian sUDT amount helpers in `src/chain/udtBalance.js`.
- Added local and read-only fixture chain currency adapters in
  `src/economy/currencyAdapter.js`.
- `?chainCurrency=1` overlays the Economy HUD's `bch` balance from a fixture
  indexer while keeping other balances local. `?chainCurrencyOffline=1`
  exercises the stale/pending state, and `?chainCurrencyBch=<amount>` controls
  the fixture amount.

Verification: browser test harness `302 passed, 0 failed`;
`node netlify-build.mjs`; `git diff --check`.

Implemented 2026-05-25:

- Economy HUD accepts multiple read adapters and exposes a compact source
  switch when `?chainCurrency=1` is active.
- `Local wallet` reads the prototype local inventory; `Chain wallet` reads the
  read-only fixture chain adapter.
- `?walletSource=local|chain` or `?inventorySource=local|chain` selects the
  initial source, and player selection persists in local storage.
- Chain mode remains display-only in this slice. Trader, Store, expansion, and
  crafting spends still use local balances until wallet-signed settlement is
  implemented.

Verification: browser test harness `318 passed, 0 failed`;
`node netlify-build.mjs`; `git diff --check`; boot smoke with
`?chainCurrency=1&walletSource=chain`.

Implemented 2026-05-25 pending overlay:

- Added a persisted owner-keyed pending currency delta store.
- Chain currency reads apply pending deltas on top of indexed balances and mark
  the snapshot pending.
- Pending entries clear once indexed balances reach the stored expected amount.
- Successful chain mining records the mined reward as a pending delta and
  refreshes the Economy HUD, so the chain wallet view updates immediately while
  waiting for indexer catch-up.
- Economy HUD labels the chain source as `Chain wallet · pending` while pending
  deltas or stale reads are active.

Verification: browser test harness `321 passed, 0 failed`;
`node netlify-build.mjs`; `git diff --check`; boot smoke with
`?chainCurrency=1&walletSource=chain`.

Implemented 2026-05-25 chain Trader prototype:

- Added `src/chain/traderSwapTx.js` for pure swap request shape.
- Added `ChainTraderAdapter` and `?chainTrader=1` factory wiring.
- Trader HUD can source balances from the chain currency adapter and records
  pending swap deltas without mutating local inventory.
- `?chainTraderSubmit=ccc` now emits a compact `cellshire.trader.swap`
  receipt witness and submits it through CCC/JoyID.
- Default prototype chain Trader now applies fixture settlement against the
  indexed wallet balances: source balance decreases or is spent to zero,
  target balance is created/updated, and the pending overlay clears after the
  indexed fixture catches up. CCC receipt submit stays receipt-only.

Verification: browser test harness `325 passed, 0 failed`;
`node netlify-build.mjs`; `git diff --check`; boot smoke with
`?chainCurrency=1&walletSource=chain&chainTrader=1`.
CCC Trader receipt addendum verification: focused CCC/Trader module tests
`24 passed, 0 failed`; `node netlify-build.mjs`; `git diff --check`.
Trader fixture settlement addendum verification: focused
CCC/Trader/currency-adapter module tests `33 passed, 0 failed`;
`node netlify-build.mjs`; `git diff --check`.
Chain Store fixture purchase addendum verification: focused store/currency
module tests `22 passed, 0 failed`; `node netlify-build.mjs`;
`git diff --check`.
CCC Store receipt addendum verification: focused CCC/store module tests
`35 passed, 0 failed`; `node netlify-build.mjs`; `git diff --check`.
Chain Marketplace fixture buy addendum verification: focused
marketplace/store/trader/currency module tests `30 passed, 0 failed`;
`node netlify-build.mjs`; `git diff --check`.

## Store Integration Order Decision

Resolved 2026-06-23: harden **General Store first**, then wallet inventory
readback, then Trader, then Marketplace.

Reasons:

- General Store is the narrowest chain-facing store path already in the app:
  one buyer, one fixed catalog item, one CKB payment, one prop output, no seller
  state, no order matching, and no multi-currency liquidity.
- `?chainStore=1` already has fixture settlement, pending CKB reconciliation,
  and `?chainStoreSubmit=ccc` receipt submit coverage. The next missing piece
  is not price math; it is turning the bought prop into a durable Open Asset
  cell-shaped output.
- Trader should wait until the treasury-liquidity, slippage, and Cellswap reuse
  questions are resolved. The current Trader fixture is useful, but it touches
  every currency and can easily force a larger settlement design than the next
  slice needs.
- Marketplace should wait until at least one store/crafting path can mint or
  register durable Open Asset props. Marketplace hardening needs seller listing,
  transfer/cancel semantics, and buyer/seller state, so it is the wrong first
  real asset settlement path.
- Wallet inventory readback should follow the Store mint bridge, not precede
  it. A readback-only inventory slice is less valuable until there is a
  repeatable in-game purchase path that creates a cell-shaped prop to read.

Next implementation card:

### General Store Open Asset Mint Intent

**Goal:** make chain General Store purchases emit a deterministic Open Asset
prop payload for the bought catalog item, register that fixture cell in the
runtime asset registry, and grant the resulting `open:<cell_id>` prop through
the existing prop inventory path while keeping local Store behavior unchanged.

**Acceptance:**

- Local General Store purchases still grant the catalog asset id unchanged.
- `cellshire_store_purchase_tx` includes an Open Asset prop payload or mint
  intent derived from the purchased catalog item, buyer owner, and tx nonce.
- Fixture chain Store settlement validates and returns that Open Asset payload.
- Successful `?chainStore=1` fixture purchases register the Open Asset cell and
  grant the corresponding `open:<cell_id>` prop id, so placement and rendering
  use the existing Open Asset Standard adapter.
- `?chainStoreSubmit=ccc` keeps receipt-only behavior but includes the same
  mint-intent payload for the backend/minter handoff.
- Tests cover the tx payload shape, fixture settlement, dynamic open-asset
  registration, prop inventory grant, and unchanged local path.

Implemented 2026-06-23:

- `cellshire_store_purchase_tx` now includes `outputs.open_asset_mint`, a
  deterministic `cellshire.store.open_asset_mint` payload carrying a compliant
  `cellshire.open_asset` prop cell for the bought catalog item.
- The mint intent cell id is deterministic from buyer owner, catalog asset id,
  and tx nonce: `store:<owner>:<asset_id>:<tx_nonce>`.
- Fixture Store settlement validates the Open Asset mint intent before
  spending CKB and returns the minted Open Asset cell in
  `settlement.outputs.open_asset_cell`.
- Successful chain Store purchases register the returned Open Asset cell via
  the existing Open Asset Standard adapter and grant the dynamic
  `open:<cell_id>` prop id through `PropInventory`.
- Local General Store purchases still grant the catalog asset id unchanged.
- CCC/JoyID Store receipt payloads include the same `open_asset_mint` handoff
  while keeping receipt submit out of fixture settlement.

Verification: focused Store/CCC module run `49 passed, 0 failed`;
full browser harness `427 passed, 0 failed`; `node netlify-build.mjs`;
`git diff --check`.

## Open Questions

1. **Mint policy v2.** When the admin-mint reserve becomes uncomfortable,
   do we move to (a) a mining-script-verified mint where the issuance type
   script accepts mints only when a valid mining receipt is present in
   inputs, (b) collateralised mint backed by treasury CKB, or (c) hybrid?
   This decision is gated on testnet usage data and is explicitly out of
   scope for the first slice.
2. **Treasury liquidity for Trader.** Whether the house book is the only
   counterparty for v1 trader swaps, or whether peer-to-peer order matching
   ships at the same time.
3. **Slippage policy.** The local trader has no slippage today because price
   is fixed per snapshot. On-chain trader needs an explicit slippage window
   against the indexed epoch price.
4. **Cellswap reuse.** Whether the Cellswap settlement path can be reused
   for Cellshire trader swaps, or whether a Cellshire-specific lighter
   contract is warranted.
5. **Decimal precision.** Confirm `10^-8` base unit per currency matches the
   precision required by mining yield amounts at low-value epochs; bump if
   needed before any mainnet supply is issued.
6. **Per-currency cell consolidation.** Whether the client should auto-merge
   multiple balance cells silently or surface them as separate entries until
   the player approves a consolidation tx.

## Acceptance Checklist

- Currency catalog mapping is captured.
- Type-script identity scheme (`cellshire:udt:v1` + `currency_id`) is fixed.
- Player and treasury cell shapes are specified.
- Mint policy for v1 is named and its trust assumptions are explicit.
- Mining and trader integration points are listed.
- Adapter boundary and feature flags are specified.
- First implementation slice, files, and read-only acceptance bounds are
  specified.
- Open questions captured for a future mint-policy follow-up.
