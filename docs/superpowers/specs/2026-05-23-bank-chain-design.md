# Bank Chain Design — Collateralised Debt Path

**Status:** first fixture slice implemented 2026-05-25

## Goal

Define how the local Bank prototype
([`2026-05-21-bank-loan-economy.md`](2026-05-21-bank-loan-economy.md))
becomes a chain-backed system once the currency spec and property
snapshot writer are live. The chain bank must turn house treasury
liquidity into enforceable player credit without trust assumptions
about player honesty.

## Non-goals

- Replacing the local Bank prototype. Local stays the dev path and the
  testnet flag-gated chain path runs alongside it.
- Mainnet-grade risk pricing, default insurance, or credit scoring.
- Auction-based liquidation. v2 uses a fixed-window seizure.
- Peer-to-peer lending. That is v3 and out of scope here.
- Variable interest, compounding, or epoch-indexed rates. v2 stays flat-
  fee.

## Decision

**Three-phase plan:**

| Phase | Status | Surface |
|---|---|---|
| v1 — local prototype | shipped | `cellshire:bank-loans:v1:local`; UI in Bank interior |
| v2 — collateralised debt cells | this spec | Borrow locks collateral, mints debt cell. Repay burns debt, releases collateral. Default after due epoch lets bank seize collateral |
| v3 — peer-to-peer lending | future | Order book of player-funded loan offers |

v2 is gated on:

- `Currency On-Chain — sUDT Read Slice` shipped (loans denominated in CKB,
  but repayment may include sUDT cuts; treasury accounting needs the
  currency adapter).
- Property snapshot writer shipped (collateral candidate).
- Open Asset Standard prop cells shipped (alternate collateral).

## Collateral Choices

A player borrows by pledging one of:

| Collateral kind | Cell pledged | Notes |
|---|---|---|
| Property snapshot | Latest `cellshire.property.snapshot` v1 cell for owner | High thematic value ("mortgage your house"); seizure means the bank can list the snapshot in the marketplace |
| Crafted prop | One placed-prop cell, Open Asset Standard | Lower value, easier liquidation |
| sUDT balance | One currency balance cell, full balance pledged | Fungible, easy to value at quote time |
| Native CKB | Plain CKB cell at the collateral lock | Simplest; ratio above 100% required since CKB is the loan currency |

v2 ships with **CKB collateral first** as the simplest path, then
property snapshot as the second supported kind. Crafted prop and sUDT
collateral are flagged as follow-ups inside v2.

## Loan Lifecycle

```text
healthy
  → BORROW tx       (inputs: bank reserve, player funding | outputs: player CKB, debt_cell, collateral_locked)
  → REPAY tx        (inputs: debt_cell, player CKB | outputs: collateral_unlocked, bank reserve, treasury fee)
  → done

defaulted
  → BORROW tx       ...
  → SEIZE tx (epoch_due passed without REPAY)  (inputs: debt_cell, collateral_locked, bank seize proof | outputs: collateral → bank lock)
  → done
```

### Borrow

Inputs:

- Bank reserve cell(s) covering the principal CKB amount.
- Player funding cell(s) for tx fee and any minimum capacity deltas.
- Player asset to pledge as collateral.

Outputs:

- Player CKB cell with credited principal.
- Debt cell (see Cell Shapes below).
- Collateral cell now under the **collateral lock** (player + bank
  multisig-like lock).
- Bank reserve change cells.

Validation:

- Principal MUST match one of the published offer amounts.
- Fee MUST match `principal * BANK_LOAN_FEE_BPS / 10000`.
- Due epoch MUST equal `current_epoch + BANK_LOAN_TERM_EPOCHS`.
- Collateral cell value MUST meet the loan's collateralisation ratio
  (e.g. 150% for CKB collateral).
- Player lock owns the credited CKB and the debt cell's beneficiary
  field.

### Repay

Inputs:

- Debt cell.
- Player CKB cell(s) covering `principal + fee` plus tx fee.
- Locked collateral cell.

Outputs:

- Unlocked collateral cell at the player's lock.
- Bank reserve cell crediting `principal`.
- House treasury cell crediting `fee` (per the
  [house treasury spec](2026-05-21-game-house-treasury.md)).
- Player change cells.

Validation:

- Debt cell's `beneficiary` MUST match the player lock.
- Repayment amount MUST equal `principal + fee`.
- Collateral release MUST match the cell originally pledged in BORROW
  (via the debt cell's `collateral_outpoint` field, recorded at borrow
  time).
- Tx MUST be signed by the player; no bank signature required (the
  collateral lock script accepts proof-of-debt-burn).

### Seize

Inputs:

- Debt cell, past its due epoch.
- Locked collateral cell.
- Bank's seize-authority cell (treasury-signed).

Outputs:

- Collateral cell at the bank treasury lock.
- House treasury cell crediting the seized collateral's redeemable value
  (for accounting; the actual asset moves to the bank lock).

Validation:

- Tx header dep MUST include a header at epoch ≥ debt cell's
  `due_epoch + GRACE_EPOCHS`.
- Tx MUST be signed by the bank seize-authority.
- Collateral lock script accepts the seize-proof path when the
  authority signature and the grace window are both satisfied.

## Cell Shapes

### Debt Cell

```js
{
  lock: <bank book lock>,             // bank owns the debt record
  type: cellshireDebtTypeScript,
  capacity: minCellCapacity,
  data: encodeDebt({
    version: 1,
    beneficiary_lock_hash: '0x...',    // player's lock hash
    principal: 5_000_00000000,         // CKB shannons
    fee: 150_00000000,                 // CKB shannons
    due_epoch: 14462,
    collateral_kind: 'ckb' | 'property_snapshot' | 'prop' | 'sudt',
    collateral_outpoint: { tx_hash, index },
    issued_at_epoch: 14455,
    offer_id: 'starter_float'
  })
}
```

### Collateral Lock

The collateral lock is a single deployed script that accepts two
unlock branches:

1. **Repay branch:** inputs include a debt cell with matching
   `collateral_outpoint`, and that debt cell is being consumed in the
   same tx without recreation.
2. **Seize branch:** inputs include the bank seize-authority cell, the
   tx header dep includes a block past the debt cell's
   `due_epoch + GRACE_EPOCHS`, and the matching debt cell is being
   consumed.

Type-script args encode the original owner lock hash so the player can
recover collateral mechanics if the bank treasury key rotates. The full
key-rotation policy is out of scope here.

### Bank Reserve

The bank treasury maintains liquid CKB cells under a treasury lock. The
existing local treasury (`cellshire:house-treasury:v1`) becomes the
authoritative reserve once the house treasury spec is fully chain-backed
(separate follow-up).

## Reserve Policy

Loan availability uses:

```text
available = bank_reserve_ckb - sum(active_principals)
```

Treasury fees from trader swaps continue to top up the reserve. The
prototype's `BANK_LOAN_BASE_RESERVE_USD` constant becomes irrelevant
once the reserve is real chain liquidity; until then, the chain bank
adapter falls back to the local computation when reserve cells are
unavailable.

## Risk Model

v2 stays simple:

- **Collateralisation ratio:** 150% for CKB-denominated collateral. Higher
  for non-CKB collateral once those branches ship.
- **Term:** flat `BANK_LOAN_TERM_EPOCHS` (current local default is 7 days
  ≈ 42 epochs at 4 hours/epoch). Spec-level decision needed; see Open
  Questions.
- **Grace period:** `GRACE_EPOCHS = 6` (one CKB day) before bank may
  seize.
- **Liquidation:** seizure transfers the collateral to the bank lock.
  Liquidation listing/auction is a follow-up.

A player may repay early (any time before seize). Fee is not pro-rated;
the prototype's flat-fee semantics carry forward.

## Adapter Boundary

```js
// src/bank/bankAdapter.js
export class LocalBankAdapter {
  async listOffers() { /* tunables */ }
  async borrow(offerId, collateralRef) { /* local book */ }
  async repay() { /* local book */ }
}

export class ChainBankAdapter {
  async listOffers() { /* read bank reserve + offer template */ }
  async borrow(offerId, collateralRef) {
    // build BORROW tx; collateralRef points to a player cell
  }
  async repay() {
    // build REPAY tx referencing debt cell + collateral outpoint
  }
  async checkSeizureRisk() { /* expose due-epoch + grace for UI nag */ }
}
```

Seize is **not** a client-side action. Defaulted positions are handled
by a bank-side worker (off-chain Cellshire backend) that submits SEIZE
txs once grace expires. v2 ships without that worker; defaults just sit
until manual treasury action.

## Feature Flags

- `?chainBank=1` — routes Bank reads through the chain adapter.
- `?chainBankSubmit=ccc` — enables BORROW/REPAY tx submission via CCC.
- `?chainBankCollateral=ckb` — restricts collateral choice to CKB only
  (the v2 first-shipping branch). Add `property_snapshot` later.

Default with no flags stays local-only.

## First Implementation Slice (v2.0)

Target: BORROW + REPAY for CKB collateral, behind
`?chainBank=1&chainBankCollateral=ckb`. SEIZE is specified but not
implemented; defaulted positions are read-only until a backend worker ships.
`?chainBankSubmit=ccc` now signs/submits a CCC JoyID bank-loan receipt
transaction, matching the current mining/property CCC pattern. Full real
collateral-lock settlement is still the next CCC slice.

### Files To Add

| File | Purpose |
|---|---|
| `src/bank/bankAdapter.js` | Local + chain bank adapter interface |
| `src/bank/bankAdapter.test.js` | Local behavior; chain behavior against indexer fixture |
| `src/chain/bankTx.js` | BORROW + REPAY tx builders |
| `src/chain/bankTx.test.js` | Pure tx-shape tests |
| `src/chain/debtCell.js` | Encode/decode debt cell data; validation |
| `src/chain/debtCell.test.js` | Round-trip + boundary tests |

### Files To Modify

| File | Change |
|---|---|
| `src/bank/bankLoans.js` | Expose offers through adapter; preserve local fallback |
| `src/ui/BankHUD.js` (or equivalent in interior windows) | Add collateral pledge UI for chain path |
| `src/main.js` | Install bank adapter per feature flag |
| `src/chain/cccJoyId.js` | Helpers for bank tx witness + collateral lock dep |
| `docs/DESIGN.md` | Link this spec under the bank section |

### Acceptance For First Slice

- `encodeDebt` round-trips deterministically. Shipped in
  `src/chain/debtCell.js`.
- Collateral lock args derive from the player's owner lock hash. Shipped in
  `src/chain/debtCell.js`.
- BORROW tx pure tests pass: correct principal, fee, due epoch,
  collateral pointer. Shipped in `src/chain/bankTx.js`.
- REPAY tx pure tests pass: debt cell consumed, collateral released to
  player. Shipped in `src/chain/bankTx.js`.
- Local mode unchanged when flags are off. Covered by
  `src/bank/bankAdapter.test.js`.
- With chain flags on, a CKB-collateralised loan can be borrowed and
  repaid through a prototype fixture submit path, recording pending CKB deltas
  over the chain wallet view.
- `?chainBankSubmit=ccc` can sign and submit a bank loan receipt through JoyID,
  but does not yet build the final collateral-lock script transaction.

## Implementation Notes 2026-05-25

- Added `src/bank/bankAdapter.js` with `LocalBankAdapter` and
  `ChainBankAdapter`.
- `?chainBank=1&chainBankCollateral=ckb` routes the Bank interior through the
  chain adapter while preserving the local bank path by default.
- Chain borrow builds a BORROW-shaped tx, pledges 150% CKB collateral, records
  pending `+principal` and `-collateral` CKB deltas, and persists the active
  debt metadata in the existing loan book.
- Chain repay builds a REPAY-shaped tx, records pending `-owed` and
  `+collateral` CKB deltas, and marks the debt paid locally after the fixture
  submit succeeds.
- The chain currency fixture now includes CKB when `chainBank=1`; use
  `?chainCurrencyCkb=<amount>` to tune the test balance.
- Verification: browser test harness `336 passed, 0 failed`,
  `node netlify-build.mjs`, `git diff --check`, and a flagged boot smoke with
  `?chainBank=1&chainBankCollateral=ckb&chainCurrencyCkb=30000`.

## Implementation Notes 2026-05-26

- Added fixture settlement for CKB-collateral BORROW/REPAY:
  `settleBankBorrowFixture` creates debt and locked-collateral records, and
  `settleBankRepayFixture` consumes them while releasing collateral on full
  repayment.
- `FixtureCurrencyIndexer` now owns bank debt/locked-collateral fixture state
  alongside indexed CKB balances.
- `ChainBankAdapter` uses fixture settlement for prototype submits and keeps
  CCC/JoyID submit receipt-only until real collateral-lock script transactions
  are wired.
- Bank pending CKB deltas are netted per transaction, because principal,
  repayment, and collateral all move in CKB inside the same wallet balance.
- Verification: full browser harness `368 passed, 0 failed`,
  `node netlify-build.mjs`, and `git diff --check`.

## Implementation Notes 2026-05-27

- Added `?chainBankSubmit=ccc-real` / `?chainBankMode=ccc-real` as the opt-in
  script-configured CCC/JoyID bank transaction path.
- Added URL-resolved bank script config for debt type, bank book lock,
  collateral lock, reserve lock, treasury lock, and optional cell deps.
- Added a real-shaped CCC bank collateral tx builder:
  - BORROW outputs player principal, debt cell with encoded debt data/type,
    and CKB collateral under the configured collateral lock.
  - REPAY outputs released collateral to the player, principal to the bank
    reserve lock, and fee to the treasury lock.
- Existing `?chainBankSubmit=ccc` remains the compact receipt path.
- Remaining gap: BORROW still needs a real bank reserve input/signing provider
  and REPAY needs real debt/collateral input selection before this is
  end-to-end settlement.
- Verification: full browser harness `374 passed, 0 failed`,
  `node netlify-build.mjs`, and `git diff --check`.

## Open Questions

1. **Term length.** Current local prototype uses 7 days; chain v2 needs
   an epoch-denominated value. Decide whether terms align to CKB epoch
   boundaries or to wall-clock days via header timestamps.
2. **Liquidation listing.** When the bank seizes property snapshot
   collateral, does it auto-list on the marketplace at a starting price,
   or sit in treasury until manual action?
3. **Multiple active loans.** Local prototype enforces one active loan.
   Chain v2 could allow one per collateral kind. Decision needed before
   UI changes.
4. **Property snapshot as collateral.** What happens when the player
   wants to save a new property snapshot while the previous snapshot is
   locked as collateral? Snapshot writer must refuse, or pledge the new
   snapshot atomically.
5. **Seize-authority key model.** Whether the bank seize-authority is a
   single key, multisig, or a script-enforced cron pattern. Affects
   trust assumptions and backend worker complexity.
6. **Treasury reserve cell sharding.** Whether the bank reserve is one
   large CKB cell (concurrency-hostile) or many smaller cells the
   adapter selects from. Recommend sharding before any meaningful
   borrow throughput.

## Acceptance Checklist

- Three-phase plan and v2 dependencies named.
- Borrow / Repay / Seize tx shapes specified.
- Debt cell and collateral lock surface specified.
- Risk model (ratio, term, grace) named.
- Adapter boundary and feature flags specified.
- First implementation slice scoped to CKB collateral borrow + repay.
- Open questions captured for term length, liquidation, multi-loan,
  snapshot collision, seize authority, and reserve sharding.
