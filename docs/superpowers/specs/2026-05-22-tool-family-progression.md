# Tool Family Progression

## Goal

Split the single pickaxe upgrade path into resource-specific tool families so
yield/efficiency progression can be tuned per material.

## Tool Families

- `pickaxe`: improves `stone` yield. Future mining/ore effects should stay
  behind explicit economy tuning.
- `woodaxe`: improves `wood` yield from harvestable trees.
- `hoe_scythe`: improves `crop` yield from farm harvests.

Each line has independent tier state and its own Tool Rack upgrade action.
Target tiers are baseline, reinforced, steel, silver, gold, and diamond. Costs
use Wood, Stone, Crop, and CKB so progression remains tied to trading and
treasury-fee pressure. Exact cost/yield numbers should be tabled after the
tool assets are locked.

## Initial Cost/Yield Table

These numbers are intentionally conservative placeholders for playtesting. Every
paid step consumes Wood, Stone, Crop, and CKB; each tool leans hardest on the
resource it improves.

| Tool | Tier | Name | Tool Rack | Yield Bonus | Wood | Stone | Crop | CKB |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Pickaxe | 1 | Rusted Pickaxe | 0 | +0 | - | - | - | - |
| Pickaxe | 2 | Reinforced Pickaxe | 1 | +1 | 6 | 7 | 3 | 1,100 |
| Pickaxe | 3 | Steel Pickaxe | 2 | +2 | 24 | 32 | 10 | 7,800 |
| Pickaxe | 4 | Silver Pickaxe | 3 | +3 | 55 | 78 | 24 | 18,000 |
| Pickaxe | 5 | Gold Pickaxe | 4 | +4 | 110 | 150 | 50 | 42,000 |
| Pickaxe | 6 | Diamond Pickaxe | 5 | +6 | 210 | 280 | 95 | 95,000 |
| Woodaxe | 1 | Rusted Woodaxe | 0 | +0 | - | - | - | - |
| Woodaxe | 2 | Reinforced Woodaxe | 1 | +1 | 7 | 5 | 3 | 1,100 |
| Woodaxe | 3 | Steel Woodaxe | 2 | +2 | 32 | 24 | 10 | 7,600 |
| Woodaxe | 4 | Silver Woodaxe | 3 | +3 | 78 | 55 | 24 | 17,500 |
| Woodaxe | 5 | Gold Woodaxe | 4 | +4 | 150 | 110 | 50 | 40,000 |
| Woodaxe | 6 | Diamond Woodaxe | 5 | +6 | 280 | 210 | 95 | 90,000 |
| Hoe / Scythe | 1 | Worn Hoe | 0 | +0 | - | - | - | - |
| Hoe / Scythe | 2 | Reinforced Hoe | 1 | +1 | 5 | 4 | 7 | 1,000 |
| Hoe / Scythe | 3 | Steel Scythe | 2 | +2 | 20 | 18 | 32 | 7,200 |
| Hoe / Scythe | 4 | Silver Scythe | 3 | +3 | 45 | 42 | 78 | 16,500 |
| Hoe / Scythe | 5 | Gold Scythe | 4 | +4 | 90 | 85 | 150 | 38,000 |
| Hoe / Scythe | 6 | Diamond Scythe | 5 | +6 | 175 | 165 | 280 | 85,000 |

Tool Rack now gates tool progression up to level 5. This is a tuning lever:
later economy passes can raise building requirements, split rare-material costs,
or flatten yield bonuses without changing save shape.

## Asset Direction

Tool visuals are UI/marketplace assets, not placeable tile props. Generate
standalone voxel tool icons with no tile base unless a later UI explicitly needs
one. The selected bases are `pickaxe_b_side`, `woodaxe_b_side`, and
`hoe_b_side`. Generate variants using a real reference/edit adaptor such as
Flux.2 `ReferenceLatent`, not plain low-denoise img2img.

Installed icon ladder:
`assets/tool_pickaxe_t1.png` through `assets/tool_pickaxe_t6.png`,
`assets/tool_woodaxe_t1.png` through `assets/tool_woodaxe_t6.png`, and
`assets/tool_hoe_scythe_t1.png` through `assets/tool_hoe_scythe_t6.png`.
The Home Buildings panel renders the current tier icon for each line.

Current approval sheet:
`tmp/resource-asset-generation/selected-tool-variants/contact-sheet.png`.

Diamond v2 refinement sheet:
`tmp/resource-asset-generation/tool-diamond-v2/contact-sheet.png`. Direction is
smooth clear-glass diamond with pale edge glints, avoiding bumpy bright-blue
crystal clusters.

Transparent installed preview sheet:
`tmp/resource-asset-generation/farm-tool-installed/contact-sheet.png`.

## Verification

- Browser test harness: `288 passed, 0 failed`.
- `node netlify-build.mjs`.
- `git diff --check`.
