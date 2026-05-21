# Game House Treasury

Status: implemented for local trader fee accounting and Bank inspection.

## Goal

Economy fees should accumulate into a visible game/house treasury instead of
disappearing. This gives later Bank, community, public works, liquidity, event,
and reward loops a concrete funding source.

## Ledger Shape

The local treasury is stored at:

```txt
cellshire:house-treasury:v1
```

Entries are normalized into:

```js
{
  id,
  source: 'trader',
  amountUsd,
  at,
  detail: {
    fromCurrency,
    fromAmount,
    toCurrency,
    toAmount,
    feeBps,
    mode,
  },
}
```

For this first slice, fee accounting is USD-denominated while preserving source
currency context. That keeps the prototype simple and transparent; a later
on-chain treasury can decide whether fees settle as CKB, UDT balances, typed
cells, or a hybrid.

## Trader Fee Flow

`quoteTrade()` already computes `feeUsd`. `LocalTraderAdapter.swap()` now
returns `feeUsd` and `feeBps`, and `TraderHUD` calls:

```js
game.recordTraderFee({ quote, swap })
```

after a successful swap. Failed swaps and zero-fee quotes do not create
treasury entries.

## Bank View

The Bank interior window now has a `House treasury` action. The Bank room also
shows a compact summary line:

```txt
House treasury $X.XX · N fee records
```

Opening the treasury action lists the total and recent fee records. This is the
first visible surface for the house economy before loans or community spending
exist.

## Test Coverage

- Treasury records trader fee entries from prepared quotes.
- Treasury persists/reloads from local storage.
- Treasury summary formats totals and recent rows for Bank views.
- Invalid/zero fee entries are ignored.
- Local trader swaps return fee data.
- Bank interior renders treasury details.

## Next Slice

Write the Bank + Loan Economy spec before shipping live lending behavior. The
spec should define loan terms, repayment cadence, interest/fee model, default
handling, and whether collateral is required.
