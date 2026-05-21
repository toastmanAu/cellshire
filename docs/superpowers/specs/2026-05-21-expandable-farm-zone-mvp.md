# Expandable Farm Zone MVP

Implemented May 21, 2026.

## Goal

Add the first farmable area to the user's home base. The farm should expand
independently from the decorative property claim and feed the local resource
inventory.

## Shipped Behavior

- Home maps expose a reserved farm zone, starting as a `2x2` dirt patch.
- Farm tiers expand from `2x2` to `4x4` to `6x6`.
- Farm expansion spends local resources:
  - Tier 2: `12 Wood + 8 Stone`
  - Tier 3: `30 Wood + 18 Stone`
- The home HUD shows farm tier, planted/ready counts, and a farm expansion
  button when another tier is available.
- Farm state persists per property owner under `cellshire:farm:v1:<owner>`.
- In home pan mode, clicking empty farm soil plants a starter crop.
- Planted crops are interactable objects. Clicking one walks adjacent, then
  harvests if the timer is ready.
- Starter crops use a short local timer and yield `2 Crop` into the local
  resource inventory.
- Active farm land is reserved from decorative placement and erase operations.

## Deliberate Limits

- Only one starter crop exists.
- Crop visual state does not yet distinguish planted from ready.
- Farming remains local-only and is not written into property snapshot cells.
- No crafting recipes consume crops yet.
