# Resource Inventory + Wood/Stone Harvesting

Implemented May 21, 2026.

## Goal

Add the first local gameplay resources before farming and crafting land. Wood and
stone should exist on the public map, harvest like epoch-refreshing nodes, and
feed a persistent local resource inventory.

## Shipped Behavior

- Local resource inventory persists under `cellshire:resources:v1:local`.
- Resource catalog includes `wood`, `stone`, `gold`, `crop`, and `herb` as the
  baseline economy materials.
- Procgen trees are tagged as `wood_resource`.
- Procgen stone outcrops are scattered on dark stone and tagged as
  `stone_resource`.
- Resource nodes are interactable, walk-adjacent targets.
- Harvesting grants fixed local yields, spawns the same feedback/depletion flow
  as mining, and records local epoch depleted state.
- A compact resources HUD shows the current material balances.

## Deliberate Limits

- No farming timers yet.
- No crafting recipes yet.
- No tool modifiers yet.
- Resource nodes use existing tree/stone visuals until the dedicated asset pass.
