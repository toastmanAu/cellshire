# Cellshire Visual Asset Gap — Generation Queue

Survey date: 2026-05-23.

Most visual assets are already shipped (tools, buildings, resource nodes,
farm plots, starter homes, characters, branding). Remaining gaps fall
into four tiers, ordered by gameplay impact.

The existing Flux.1 Schnell ComfyUI pipeline (see
`scripts/run_cellshire_asset_batch.py` and friends) is the established
tool. New scripts should follow that pattern: candidates → contact
sheet → user selection → install script.

## Tier 1 — Township Building Sprites (gameplay-relevant)

`src/township/townshipZone.js` lines 52-55 currently use generic
`cube_house`, `terrace_house`, `two_story`, `villa`, and similar for
what should be five distinct landmarks. The asset id slots already
exist in code (`township_store`, `township_market`, `township_bank`,
`township_gallery`, `township_community_hall`) — they just need real
sprites.

| Asset id | Role | Prompt direction |
|---|---|---|
| `township_store` | General Store | Trade stall facade with awning, crates of goods, hanging sign |
| `township_market` | Player Marketplace | Open-air market stalls, baskets, multiple banners |
| `township_bank` | Bank | Solid two-story stone with vault-style door, treasury motif |
| `township_gallery` | Gallery | Tall narrow building with display windows showing art |
| `township_community_hall` | Community Hall | Wide single-story timber lodge, central chimney, gathering space |

All must match the existing Cellshire isometric voxel style (chunky
pixel-grid, 30° iso, plain solid light grey background, top-left
lighting). Same negative prompts and seed strategy as `run_cellshire_building_candidates.py`.

## Tier 2 — RPG Interior Backdrops

The `RPG Building Interior Windows` card shipped — interiors currently
render programmatically. A painted backdrop per scene would massively
lift the feel. Five backdrops:

| Backdrop id | Scene |
|---|---|
| `interior_store` | Storekeeper's counter, shelves of crates/jars, lantern |
| `interior_market` | Open-air market with stalls, hung banners, distant figures |
| `interior_bank` | Vault door, polished counter, ledger book, money chests |
| `interior_gallery` | Lit display walls with framed art, polished floor |
| `interior_hall` | Long timber hall, hearth in centre, benches |

These are NOT isometric voxel — they're stylized illustrations sized to
the interior window aspect ratio. Different art direction than the
existing voxel tile assets.

## Tier 3 — NPCs

The interior windows mention storekeeper / trader / teller etc. but
have no NPC sprites yet. Five small character sprites in the same
2-direction-facing format as the player characters:

- `npc_storekeeper`
- `npc_trader`
- `npc_bank_teller`
- `npc_gallery_curator`
- `npc_hall_keeper`

Style must match `player_miner.png` / `player_seeker.png` /
`player_tinker.png` so NPCs and players read as the same world.

## Tier 4 — Polish

| Asset | Use |
|---|---|
| Boot screen scenery | A wider title card behind the Cellshire shield |
| Marketplace skin pool (5 chars) | Additional character variants for Player Marketplace seed listings |
| Yield FX sprite | Sparkle/burst overlay for mining hits |
| Coin pop FX sprite | Bouncing coin for currency credit |
| Pickup glow sprite | Soft halo for harvest nodes when adjacent |
| High-value epoch overlay | Decorative frame/banner for 3x epoch HUD |

## Estimated Counts

| Tier | Prompts | Candidates each | Total gens |
|---|---|---|---|
| 1 (township buildings) | 5 | 3 | 15 |
| 2 (interior backdrops) | 5 | 3 | 15 |
| 3 (NPCs) | 5 | 4 | 20 |
| 4 (polish) | 10 | 2 | 20 |
| **Total** | **25** | | **70** |

At ~30-60s per Flux.1 Schnell gen, full visual queue is roughly
40-70 minutes. Faster than SFX since fewer prompts × fewer candidates
on average.

## Sequencing Notes

- Run Tier 1 first; it unblocks the township feeling correct
- Tier 2 can run in parallel with Tier 3 if the user is around to audition
- Tier 4 is genuinely optional polish; skip if time is tight
- The existing `scripts/run_cellshire_building_candidates.py` is the
  closest template — clone it per tier rather than writing a single
  monolithic visual orchestrator
