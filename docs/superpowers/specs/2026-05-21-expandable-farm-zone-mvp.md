# Expandable Farm Zone MVP

Implemented May 21, 2026.

## Goal

Add the first farmable area to the user's home base. The farm should expand
independently from the decorative property claim and feed the local resource
inventory.

## Shipped Behavior

- Home maps expose a reserved farm zone, starting as a `2x2` dirt patch.
- Farm tiers expand from `2x2` to `4x4` to `6x6`.
- Farm expansion spends local resources plus CKB:
  - Tier 2: `10 Wood + 7 Stone + 500.00 CKB`
  - Tier 3: `28 Wood + 18 Stone + 4 Herb + 2,200.00 CKB`
- The home HUD shows farm tier, planted/ready counts, and a farm expansion
  button when another tier is available.
- Farm state persists per property owner under `cellshire:farm:v1:<owner>`.
- In home pan mode, clicking empty farm soil plants a starter crop.
- Planted crops are interactable objects. Clicking one walks adjacent, then
  harvests if the timer is ready.
- Starter crops use a short local timer and yield `3 Crop` into the local
  resource inventory.
- Expanded farms now deterministically mix in `herb_crop` plots from tier 2
  and `timber_plot` plots from tier 3. Herb plots grow faster and yield local
  `herb`; timber plots grow slower and yield local `wood`.
- Farm plots persist both elapsed-time readiness and optional chain epoch
  readiness metadata. Default gameplay uses elapsed timers for first-session
  pacing; `?farmTiming=epoch` switches crop readiness and visuals to the saved
  epoch bucket for deterministic smoke/testing.
- Active farm land is reserved from decorative placement and erase operations.

## Deliberate Limits

- Only one starter crop exists.
- Farming remains local-only and is not written into property snapshot cells.
- Epoch timing mode is an opt-in runtime mode, not the player-facing default,
  because live CKB epoch rollover is too slow for the current early-game crop
  loop.
