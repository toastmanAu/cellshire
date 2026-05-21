# RPG Building Interior Windows

Status: implemented for township landmark entry points.

## Goal

Township buildings should feel like old-school RPG storefronts: clicking a
landmark opens a stylized interior scene first, then the player chooses an
in-room action that routes into the existing game systems.

## Runtime Shape

`installBuildingInteriorHUD(game)` installs a shared building window and
registers it on:

```js
game.townshipInterior
```

Township landmark roles use `Game.openTownshipBuilding(role)`, which opens the
interior window when the UI is installed and falls back to a toast in tests or
headless paths.

The existing Store, Market, and Trader HUD installers now expose small public
methods:

```js
{ open, close, render, dismiss }
```

`main.js` registers those handles on:

```js
game.hudPanels.store
game.hudPanels.market
game.hudPanels.trader
```

The building window calls those handles rather than duplicating purchase,
listing, or swap logic.

## Landmark Actions

- General Store opens the existing Store panel.
- Market opens the existing Player Marketplace panel.
- Bank opens the existing Trader panel through an exchange-desk action.
- Bank loan office, Gallery wall, and Community Hall notice board remain
  future-only actions and show scoped toasts.

## Visual Treatment

The shared window renders a compact room illustration with scene-specific
styling for Store, Market, Bank, Gallery, and Hall. It supports click-away
close, a close button, and `Escape`; closing returns focus to the game canvas
when available.

## Test Coverage

`BuildingInteriorHUD.test.js` covers:

- Data-driven definitions for all township landmarks.
- Store/Market/Bank routing into existing HUD handles.
- Future-only actions staying in the interior window and surfacing a toast.

## Next Slice

Route trader fees into an explicit game/house treasury so economy fees become
visible liquidity for future bank, community, and reward loops.
