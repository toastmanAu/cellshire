# Bank Testnet Deployment Runbook

This runbook is the handoff from fixture smoke to CKB testnet smoke for the
Cellshire Bank `ccc-real` path. It assumes the frontend code already supports
real-shaped BORROW and REPAY transactions, HTTP bank input selection, and HTTP
bank reserve co-signing.

## Required Inputs

Copy `docs/superpowers/runbooks/bank-testnet-values.template.json` to a local
`bank-testnet-values.json` and fill in deployed testnet values. The unified file
can hold deployed script params, backend URLs, and funded outpoints:

```json
{
  "params": {
    "chainBankDebtTypeCodeHash": "0x<64 hex chars>",
    "chainBankDebtTypeHashType": "type",
    "chainBankDebtTypeArgs": "0x",
    "chainBankDebtTypeDepTxHash": "0x<64 hex chars>",
    "chainBankDebtTypeDepIndex": "0",
    "chainBankDebtTypeDepType": "code",

    "chainBankBookLockCodeHash": "0x<64 hex chars>",
    "chainBankBookLockHashType": "type",
    "chainBankBookLockArgs": "0x<bank book args>",
    "chainBankBookLockDepTxHash": "0x<64 hex chars>",
    "chainBankBookLockDepIndex": "0",
    "chainBankBookLockDepType": "code",

    "chainBankCollateralLockCodeHash": "0x<64 hex chars>",
    "chainBankCollateralLockHashType": "type",
    "chainBankCollateralLockArgs": "0x",
    "chainBankCollateralLockDepTxHash": "0x<64 hex chars>",
    "chainBankCollateralLockDepIndex": "0",
    "chainBankCollateralLockDepType": "code",

    "chainBankReserveLockCodeHash": "0x<64 hex chars>",
    "chainBankReserveLockHashType": "type",
    "chainBankReserveLockArgs": "0x<reserve signer args>",
    "chainBankReserveLockDepTxHash": "0x<64 hex chars>",
    "chainBankReserveLockDepIndex": "0",
    "chainBankReserveLockDepType": "code",

    "chainBankTreasuryLockCodeHash": "0x<64 hex chars>",
    "chainBankTreasuryLockHashType": "type",
    "chainBankTreasuryLockArgs": "0x<treasury args>",
    "chainBankTreasuryLockDepTxHash": "0x<64 hex chars>",
    "chainBankTreasuryLockDepIndex": "0",
    "chainBankTreasuryLockDepType": "code",

    "chainBankDebtCellCapacityCkb": "61"
  },
  "backend": {
    "inputProviderUrl": "https://bank.example/inputs",
    "borrowInputProviderUrl": "",
    "repayInputProviderUrl": "",
    "reserveSignerUrl": "https://bank.example/sign",
    "token": ""
  },
  "funding": {
    "bankReserveCells": [
      {
        "outPoint": { "txHash": "0x<64 hex chars>", "index": 0 },
        "amount": "100000"
      }
    ],
    "borrowerCollateralCells": [
      {
        "outPoint": { "txHash": "0x<64 hex chars>", "index": 0 },
        "amount": "11250"
      }
    ]
  }
}
```

The preflight rejects the known fixture placeholder code hashes and malformed
hashes. Keep the file out of source control if it contains sensitive deployment
metadata or private backend URLs.

## Backend Contract

The production bank backend must expose:

- BORROW input endpoint: accepts `cellshire.bank.inputs.select` with
  `action: "borrow"` and returns `borrow.bankReserveCell` plus
  `borrow.collateralCell`.
- REPAY input endpoint: accepts `cellshire.bank.inputs.select` with
  `action: "repay"` and returns `repay.debtCell` plus
  `repay.lockedCollateralCell`.
- Reserve signer endpoint: accepts `cellshire.bank.reserve-sign`, verifies the
  serialized CCC transaction and `script_config`, and returns
  `cellshire.bank.reserve-sign.response` with a bank witness, replacement
  witness array, or replacement tx.

One shared input provider URL may handle both BORROW and REPAY by inspecting the
request `action`. If the backend has separate routes, pass both URLs in the
preflight command.

The backend should reject any request where `script_config.production` is false
or `script_config.issues` is non-empty during production testnet smoke.

## Funding

Before running the smoke flow:

1. Fund the bank reserve lock with enough testnet CKB for the borrow principal,
   output capacities, and expected concurrency.
2. Fund the borrower JoyID wallet with enough testnet CKB for collateral,
   transaction fees, and any wallet-required minimum capacity.
3. Confirm the backend indexer can see the reserve cell and the borrower
   collateral cell before BORROW.
4. After BORROW, confirm the backend indexer can see the debt cell and locked
   collateral cell before REPAY.

## Preflight

Validate the deployed script params, backend URLs, and funded reserve outpoints
without starting the local fixture server:

```bash
python3 scripts/bank_reserve_signer_fixture.py --validate-production-smoke \
  --deployment-values-json bank-testnet-values.json
```

The older split-input form is still available:

```bash
python3 scripts/bank_reserve_signer_fixture.py --validate-production-smoke \
  --script-params-json bank-scripts.json \
  --bank-borrow-input-provider-url https://bank.example/borrow-inputs \
  --bank-repay-input-provider-url https://bank.example/repay-inputs \
  --bank-reserve-signer-url https://bank.example/sign
```

The command prints a JSON smoke bundle on success. It exits `2` and prints the
missing or invalid fields on failure.

To create a redacted execution report before opening the browser:

```bash
python3 scripts/bank_reserve_signer_fixture.py --validate-production-smoke \
  --deployment-values-json bank-testnet-values.json \
  --write-smoke-report bank-testnet-smoke-report.json
```

The report records the validated smoke bundle with tokens redacted and leaves
fields for BORROW tx hash, produced debt/locked-collateral outpoints, REPAY tx
hash, backend request ids, and final indexer evidence.

## Backend Readiness Probe

Before opening the browser, probe the production backend HTTP contract:

```bash
python3 scripts/bank_backend_readiness_probe.py \
  --deployment-values-json bank-testnet-values.json \
  --output-json bank-backend-readiness-report.json
```

The probe posts representative BORROW input, REPAY input, and reserve signer
requests. BORROW and REPAY must return valid
`cellshire.bank.inputs.response` envelopes with the required cell fields. The
reserve signer must either return a valid
`cellshire.bank.reserve-sign.response` envelope or an explicit JSON rejection;
use `--require-signer-success` when the backend is expected to sign the probe's
synthetic tx.

## Browser Smoke

Use the printed `url` from the preflight output, or start the helper server and
load `/smoke-params`:

```bash
python3 scripts/bank_reserve_signer_fixture.py --production-smoke \
  --deployment-values-json bank-testnet-values.json
```

Split-input form:

```bash
python3 scripts/bank_reserve_signer_fixture.py --production-smoke \
  --script-params-json bank-scripts.json \
  --bank-borrow-input-provider-url https://bank.example/borrow-inputs \
  --bank-repay-input-provider-url https://bank.example/repay-inputs \
  --bank-reserve-signer-url https://bank.example/sign
```

Append the returned query string to the game URL. The required frontend flags in
the final URL are:

- `chainBank=1`
- `chainBankCollateral=ckb`
- `chainBankSubmit=ccc-real`
- `chainBankScriptMode=production`
- `wallet=joyid`
- deployed `chainBank*` script params
- production input provider URLs
- production reserve signer URL

Run BORROW first, wait for indexer catch-up, then run REPAY. Capture the BORROW
tx hash, debt outpoint, locked collateral outpoint, REPAY tx hash, and any
backend rejection reason in `bank-testnet-smoke-report.json`.

## Done Criteria

- Frontend accepts the production bundle without placeholder/script-config
  rejection.
- BORROW submits through JoyID and the bank signer returns a valid witness.
- Backend indexer reports the produced debt cell and locked collateral cell.
- REPAY submits through JoyID using backend-selected debt and locked collateral
  inputs.
- Wallet pending CKB state clears after indexer catch-up.
