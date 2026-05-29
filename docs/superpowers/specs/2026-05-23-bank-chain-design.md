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

## Implementation Notes 2026-05-28

- Added a bank input provider boundary for `ccc-real` bank transactions:
  BORROW can carry selected bank reserve and CKB collateral inputs, and REPAY
  can carry selected debt and locked-collateral inputs.
- Added URL smoke params for selected input cells:
  `chainBankReserveCell*`, `chainBankCollateralCell*`,
  `chainBankDebtCell*`, and `chainBankLockedCollateralCell*`.
- Added optional bank reserve co-sign plumbing for BORROW via
  `chainBankReserveSignerUrl` and `chainBankReserveSignerToken`.
- Added `scripts/bank_reserve_signer_fixture.py` as a local HTTP fixture:

```bash
python3 scripts/bank_reserve_signer_fixture.py --port 8791
curl -s http://127.0.0.1:8791/reserve-inputs
curl -s 'http://127.0.0.1:8791/smoke-params?game=http://127.0.0.1:8766/'
```

The game can then be opened with `?chainBank=1&chainBankCollateral=ckb`
plus `chainBankSubmit=ccc-real`, the script config params, selected input
params or `chainBankInputProviderUrl`, and
`chainBankReserveSignerUrl=http://127.0.0.1:8791/sign`. For local repeatability,
`/smoke-params` returns one complete query bundle with placeholder script
params, `chainBankInputProviderUrl`, and the signer URL.

- Remaining gap: the fixture returns deterministic witness data for frontend
  smoke only. Production settlement still needs a real bank backend that
  indexes spendable reserve cells, signs with the bank key, and enforces the
  deployed script's witness format.
- Verification: full browser harness `385 passed, 0 failed`,
  `node netlify-build.mjs`, `git diff --check`, and
  `python3 scripts/bank_reserve_signer_fixture.py --self-test`.

## Implementation Notes 2026-05-29

- Added an end-to-end flagged browser-harness smoke that starts at URL params
  and runs through `makeBankAdapterFromParams`, the URL bank input provider,
  real-shaped CCC bank tx preparation, HTTP reserve-signer request creation,
  bank witness append, JoyID submit, and `chain-ccc-real` adapter result.
- The smoke uses fake CCC/JoyID and fake HTTP fetch inside the browser harness,
  so it verifies the frontend contract without needing deployed script deps or
  real CKB testnet capacity.
- Extended the reserve signer fixture with `GET /smoke-params`; the response
  includes:
  - `params`: full key/value params for the flagged borrow smoke.
  - `queryString`: URL-encoded params for appending to a local game URL.
  - `url`: returned when `?game=<base-url>` is provided.
- The fixture still exposes `/reserve-inputs` for callers that want only the
  bank reserve cell params.
- Remaining production gap: `/smoke-params` uses deterministic placeholder
  script hashes. A real testnet run must provide deployed code hashes, cell
  deps, spendable bank reserve inputs, and backend witness validation.
- Verification: full browser harness `386 passed, 0 failed`,
  `node netlify-build.mjs`, `git diff --check`, and
  `python3 scripts/bank_reserve_signer_fixture.py --self-test`. A local HTTP
  check of `GET /smoke-params?game=...` returned the expected query bundle.

### Bank Reserve Signer Response Contract

Reserve signer success responses use a versioned envelope:

```json
{
  "ok": true,
  "protocol": "cellshire.bank.reserve-sign.response",
  "version": 1,
  "bankWitness": "0x..."
}
```

The frontend accepts any one of:

- `tx`: a replacement CCC transaction object.
- `witnesses`: a full replacement witness array.
- `bankWitness`: one hex witness appended to the prepared transaction.
- `extraWitnesses`: additional hex witnesses appended to the prepared
  transaction.

Validation now rejects invalid protocol/version values, non-hex witness
strings, malformed witness arrays, and otherwise-empty success responses before
JoyID submission. These failures normalize to `bank-signer-failed`. The local
fixture emits the same protocol/version envelope.

Verification 2026-05-29: full browser harness `387 passed, 0 failed`,
`node netlify-build.mjs`, `git diff --check`, and
`python3 scripts/bank_reserve_signer_fixture.py --self-test`.

### Bank Reserve Indexer HTTP Input Provider

The frontend can now ask a backend/indexer for BORROW or REPAY inputs instead
of embedding bank outpoints directly in URL params.

Flags:

- `chainBankInputProviderUrl=<url>` — shared POST endpoint for selecting bank
  inputs.
- `chainBankBorrowInputProviderUrl=<url>` — BORROW-specific POST endpoint.
- `chainBankRepayInputProviderUrl=<url>` — REPAY-specific POST endpoint.
- `chainBankInputProviderToken=<token>` — optional bearer token for the input
  provider.
- `chainBankReserveIndexerUrl` / `chainBankReserveIndexerToken` are accepted as
  BORROW-focused aliases.
- `chainBankRepayIndexerUrl` is accepted as a REPAY-focused alias.
- Manual `chainBankReserveCell*` and `chainBankCollateralCell*` params still
  work as a local BORROW fallback. Manual `chainBankDebtCell*` and
  `chainBankLockedCollateralCell*` params still work as a local REPAY fallback.

BORROW request:

```json
{
  "protocol": "cellshire.bank.inputs.select",
  "version": 1,
  "action": "borrow",
  "walletAccount": {
    "provider": "joyid",
    "address": "ckt1...",
    "network": "testnet"
  },
  "offer": {
    "id": "starter-float",
    "amount": 7500,
    "currency": "ckb",
    "totalOwed": 7687.5,
    "feeAmount": 187.5
  },
  "collateralAmount": 11250
}
```

BORROW response:

```json
{
  "ok": true,
  "protocol": "cellshire.bank.inputs.response",
  "version": 1,
  "borrow": {
    "bankReserveCell": {
      "outPoint": { "txHash": "0x...", "index": 0 },
      "capacity": 100000,
      "amount": 100000
    },
    "collateralCell": {
      "outPoint": { "txHash": "0x...", "index": 1 },
      "capacity": 11250,
      "amount": 11250
    }
  }
}
```

The frontend validates protocol/version and requires both borrow cells before
building the real-shaped CCC bank transaction.

REPAY request:

```json
{
  "protocol": "cellshire.bank.inputs.select",
  "version": 1,
  "action": "repay",
  "walletAccount": {
    "provider": "joyid",
    "address": "ckt1...",
    "network": "testnet"
  },
  "loan": {
    "id": "chain-loan:...",
    "offerId": "starter-float",
    "principal": 7500,
    "feeAmount": 187.5,
    "totalOwed": 7687.5,
    "remainingOwed": 7687.5,
    "collateralAmount": 11250,
    "collateralKind": "ckb",
    "borrowTxHash": "0x...",
    "debtOutPoint": { "txHash": "0x...", "index": 0 },
    "lockedCollateralOutPoint": { "txHash": "0x...", "index": 1 }
  }
}
```

REPAY response:

```json
{
  "ok": true,
  "protocol": "cellshire.bank.inputs.response",
  "version": 1,
  "repay": {
    "debtCell": {
      "outPoint": { "txHash": "0x...", "index": 0 },
      "capacity": 61,
      "amount": 61
    },
    "lockedCollateralCell": {
      "outPoint": { "txHash": "0x...", "index": 2 },
      "capacity": 11250,
      "amount": 11250
    }
  }
}
```

The frontend validates protocol/version and requires both repay cells before
building the real-shaped CCC bank transaction. The local fixture now exposes
`POST /borrow-inputs` and `POST /repay-inputs`; `/smoke-params` emits
`chainBankInputProviderUrl=http://127.0.0.1:8791/borrow-inputs` and
`chainBankRepayInputProviderUrl=http://127.0.0.1:8791/repay-inputs` so local
smoke runs no longer need manual bank-cell URL params.

Verification 2026-05-29: full browser harness `388 passed, 0 failed`,
`node netlify-build.mjs`, `git diff --check`,
`python3 scripts/bank_reserve_signer_fixture.py --self-test`, and a local HTTP
check of `POST /borrow-inputs`.

Verification 2026-05-29 after REPAY provider: full browser harness
`389 passed, 0 failed`, `node netlify-build.mjs`, `git diff --check`,
`python3 scripts/bank_reserve_signer_fixture.py --self-test`, and a local HTTP
check of `POST /repay-inputs`.

### Bank Production Script/Backend Integration Guard

Production-intended bank smoke flows can now opt into an explicit script guard:

- `chainBankScriptMode=production`
- `chainBankProduction=1`
- `chainBankRequireProductionScripts=1`

Any of those flags mark the real bank script config as production mode. In
production mode the frontend rejects the deterministic smoke placeholder code
hashes (`0x111...`, `0x222...`, `0x333...`, `0x444...`, `0x555...`) and
requires at least one configured cell dep before building/submitting a
real-shaped CCC bank transaction. The bank reserve signer request includes the
script config's `production` flag and `issues` list in `script_config`, so a
backend can reject unexpected fixture or incomplete bundles independently.

The local bank fixture can also emit production smoke bundles without using the
deterministic localhost endpoints:

```bash
python3 scripts/bank_reserve_signer_fixture.py --production-smoke \
  --script-params-json bank-scripts.json \
  --bank-borrow-input-provider-url https://bank.example/borrow-inputs \
  --bank-repay-input-provider-url https://bank.example/repay-inputs \
  --bank-reserve-signer-url https://bank.example/sign
```

`bank-scripts.json` may be either a JSON object of URL params or an object with
a `params` field. The required production script params are:

- `chainBankDebtTypeCodeHash`
- `chainBankBookLockCodeHash`
- `chainBankCollateralLockCodeHash`
- `chainBankReserveLockCodeHash`
- `chainBankTreasuryLockCodeHash`

Cell dep params use the existing URL names, for example
`chainBankDebtTypeDepTxHash`, `chainBankDebtTypeDepIndex`, and
`chainBankDebtTypeDepType`. The production smoke server refuses to start when
backend URLs are missing or any required script code hash is still one of the
known fixture placeholders.

Verification 2026-05-29: full browser harness `391 passed, 0 failed`,
`node netlify-build.mjs`, `git diff --check`, and
`python3 scripts/bank_reserve_signer_fixture.py --self-test`.

### Bank Testnet Deployment Runbook

The testnet deployment handoff now lives at
`docs/superpowers/runbooks/2026-05-29-bank-testnet-deployment.md`. It records
the required deployed script params, backend endpoint contract, funding checks,
production preflight, browser smoke sequence, and done criteria for the guarded
BORROW/REPAY testnet run.

The fixture script also has a non-server preflight mode:

```bash
python3 scripts/bank_reserve_signer_fixture.py --validate-production-smoke \
  --script-params-json bank-scripts.json \
  --bank-borrow-input-provider-url https://bank.example/borrow-inputs \
  --bank-repay-input-provider-url https://bank.example/repay-inputs \
  --bank-reserve-signer-url https://bank.example/sign
```

The command prints the smoke bundle JSON on success and exits `2` with a
concrete issue list when production URLs, deployed script hashes, or script
cell deps are missing or malformed.

### Bank Testnet Deployment Values

The production smoke preflight now also accepts a unified deployment values
manifest:

```bash
python3 scripts/bank_reserve_signer_fixture.py --validate-production-smoke \
  --deployment-values-json bank-testnet-values.json
```

Use `docs/superpowers/runbooks/bank-testnet-values.template.json` as the local
fill-in template. The manifest can include:

- `params`: deployed `chainBank*` script params and cell deps.
- `backend`: `inputProviderUrl` or action-specific borrow/repay provider URLs,
  `reserveSignerUrl`, and optional `token`.
- `funding`: funded `bankReserveCells` and optional borrower collateral cells.

When `--deployment-values-json` is used, validation requires at least one
funded bank reserve cell outpoint and validates funded cell tx hash/index/amount
shape before printing the production smoke bundle.

The same preflight can write an execution report:

```bash
python3 scripts/bank_reserve_signer_fixture.py --validate-production-smoke \
  --deployment-values-json bank-testnet-values.json \
  --write-smoke-report bank-testnet-smoke-report.json
```

The report uses protocol `cellshire.bank.testnet-smoke.report`, redacts tokens,
and provides placeholders for BORROW/REPAY tx hashes plus backend/indexer
evidence.

### Bank Backend Readiness Probe

Added `scripts/bank_backend_readiness_probe.py` as the HTTP contract probe for a
filled `bank-testnet-values.json`:

```bash
python3 scripts/bank_backend_readiness_probe.py \
  --deployment-values-json bank-testnet-values.json \
  --output-json bank-backend-readiness-report.json
```

The probe posts representative BORROW input, REPAY input, and reserve signer
requests. It requires valid BORROW/REPAY input provider envelopes and accepts
either a valid reserve signer response envelope or an explicit signer rejection,
because a production signer may reject the synthetic tx while still proving the
endpoint and JSON contract. `--require-signer-success` makes signer rejection a
hard failure.

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
