# Bank + Loan Economy

Status: implemented as a local prototype with tunable pricing constants.

## Goal

The Bank should turn house liquidity into short-term player credit without
locking the design into final item, expansion, or chain pricing. This slice
adds a local loan book and Bank UI so the loop can be tested while the economy
is still being tuned.

## Prototype Policy

The first implementation is intentionally conservative:

- One active loan at a time.
- Loans are denominated in CKB.
- Loans use a flat fee, not compounding interest.
- Repayment is manual from the player CKB balance.
- Defaults, collateral, liquidation, and on-chain debt cells are not implemented
  yet.

The tuning constants live in `src/bank/bankLoans.js`:

```js
BANK_LOAN_FEE_BPS = 250
BANK_LOAN_TERM_DAYS = 7
BANK_LOAN_BASE_RESERVE_USD = 100
```

Current offers:

- `Starter float`: `7,500 CKB`, repay `7,687.5 CKB`.
- `Builder credit`: `18,000 CKB`, repay `18,450 CKB`.
- `Expansion note`: `42,000 CKB`, repay `43,050 CKB`.

These are placeholders. They should move as store prices, expansion costs,
mining yield, and treasury fee volume settle.

## Reserve Model

Loan availability is based on:

```txt
base prototype reserve + house treasury fees - active principal
```

The base reserve exists so the prototype is usable before enough trader fees
have accumulated. House treasury fees already contribute to the reserve, so the
later path can reduce or remove the base reserve once the live economy has
enough fee flow.

## Runtime Flow

The Bank interior `Loan office` action opens the loan view.

When no loan is active:

- The player sees available loan offers.
- Disabled offers show as locked when reserve is insufficient.
- Borrowing credits local CKB and persists a loan record in
  `cellshire:bank-loans:v1:local`.

When a loan is active:

- The player sees the remaining CKB due.
- `Repay balance` pays the full remaining amount if the player has enough CKB.
- Paid loans remain in the local loan book as history.

## Test Coverage

- Loan offers are generated from tunable constants and reserve state.
- Borrowing credits CKB and enforces one active loan.
- Repayment supports partial payment and paid completion.
- Short balances reject repayment without mutating debt.
- Loan state persists and summarizes for the Bank UI.
- Bank interior renders loan offers and calls the borrow action.

## Next Decisions

- Whether loans should be local prototype balances, wallet-backed debt cells,
  collateralized positions, or a hybrid.
- Whether repayment should be flat-fee, fixed-term interest, epoch-indexed
  interest, or risk-tiered.
- Whether loan eligibility should depend on property tier, wallet age, treasury
  balance, collateral, or marketplace reputation.
