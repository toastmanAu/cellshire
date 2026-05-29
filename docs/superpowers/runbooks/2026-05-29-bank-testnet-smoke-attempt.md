# Bank Testnet Smoke Attempt

Date: 2026-05-29

## Result

Status: blocked before BORROW.

The workspace does not contain a filled `bank-testnet-values.json` or any other
Cellshire bank deployment values file. The real smoke cannot proceed without:

- deployed Cellshire bank script code hashes and cell deps,
- production bank input provider URL(s),
- production bank reserve signer URL,
- at least one funded bank reserve cell indexed by the backend,
- backend/indexer support for BORROW and REPAY input selection.

## Checks Run

Searched the Cellshire workspace for real deployment values:

```bash
rg --files -g '*bank*values*.json' -g '*testnet*.json' -g '*.env' -g '.env*' -g '*deploy*.json' .
find . -maxdepth 3 -type f \( -name '*values*.json' -o -name '*testnet*.json' -o -name '.env*' \) -print
```

Only the template exists:

```text
docs/superpowers/runbooks/bank-testnet-values.template.json
```

Checked local CKB tooling:

```bash
ckb-cli --version
```

Result:

```text
ckb-cli 2.0.0 (80efc21 2025-12-03)
```

Checked local CKB accounts and testnet capacity through `https://testnet.ckb.dev`:

```text
account 0: 499999.99686508 CKB
account 1: 1091878.95066703 CKB
account 2: 0.0 CKB
```

Checked nearby contract projects. `/home/phill/ckb-lending` contains a built
`lending-lock` binary, but it is not the Cellshire bank deployment set. It does
not provide the five frontend-required Cellshire bank scripts:

- `chainBankDebtType*`
- `chainBankBookLock*`
- `chainBankCollateralLock*`
- `chainBankReserveLock*`
- `chainBankTreasuryLock*`

Its `deployment/testnet` and `deploy` directories currently contain no recorded
testnet deploy artifact beyond `.gitkeep`.

## Next Action

Fill a local `bank-testnet-values.json` from
`docs/superpowers/runbooks/bank-testnet-values.template.json`, then run:

```bash
python3 scripts/bank_reserve_signer_fixture.py --validate-production-smoke \
  --deployment-values-json bank-testnet-values.json \
  --write-smoke-report bank-testnet-smoke-report.json
```

If that passes, open the generated smoke bundle URL, run BORROW, wait for
indexer catch-up, run REPAY, then complete `bank-testnet-smoke-report.json`
with tx hashes and backend/indexer evidence.
