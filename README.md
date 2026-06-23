# Cellshire

An isometric 2D mining game on CKB. Procedurally generated maps reset every
on-chain epoch. Ore tiles are real CKB cells with capacity-as-remaining-ore.
Mining drops in-game currencies, items, and on-chain props. Players own a
property zone and trade through three on-chain stores (trader, general store,
marketplace). Asset standards are open so anyone can mint compliant items and
have them appear in-game.

This repo started as a fork-and-strip of [boona13/mykonos-island-voxels][m]
(MIT) — Mykonos's iso renderer, tilemap, asset pipeline, and audio routing
were structurally sound, so we kept the engine and built the game on top.

[m]: https://github.com/boona13/mykonos-island-voxels

## Status

- ✅ **Procgen world** at 100–300 cells/side
  Two-octave value noise, water/sand/dirt/dark-stone biomes, Poisson-disc
  ore scatter on stone, cypress accents on dirt.
- ✅ **Mining-mood asset pack v0** — generated via HiDream-O1 ref-image edits
  Terrain: `dark_stone`, `dirt`
  Ores: `coal_seam`, `copper_ore`, `iron_ore`, `gold_ore`, `amethyst_geode`,
  `diamond_ore`, `ckb_cluster` (signature landmark with inner glow)
- ✅ **World-size adaptive cache renderer**
  `CACHE_SCALE` auto-degrades to keep the cache canvas under the browser's
  Canvas2D dimension cap, allowing 300×300+ worlds without engine rewrite.
- ✅ **Playable local mining loop**
  Click-to-walk, click-to-interact, collision, local ore capacity,
  per-ore drops, inventory HUD, and per-epoch reload-safe mined-state.
- ✅ **CKB epoch procgen seed**
  Live RPC → cached → random fallback; PerfHUD surfaces epoch/source.
- ⏳ Ore-as-cell mining transactions
- ⏳ Player property zone + expansion mechanics
- ⏳ Three-store marketplace layer
- ⏳ Open asset standard + mint-to-game pipeline

See **[docs/DESIGN.md](docs/DESIGN.md)** for the full game design.
See **[docs/superpowers/kanban.md](docs/superpowers/kanban.md)** for the
current implementation backlog.
See **[docs/ASSET-PROMPTS.md](docs/ASSET-PROMPTS.md)** for the prompt cookbook
used to generate the asset pack via Wyltek Studio / HiDream-O1.

## Run it

```bash
cd ~/cellshire
python3 -m http.server 8766
# open http://127.0.0.1:8766/
# optional: ?size=200 to procgen a bigger world
# optional: ?wallet=joyid&chainMining=1&chainMiningSubmit=ccc for CCC/JoyID testnet signing
```

There's no build step — vanilla ES modules, no bundler, no transpiler, no
`node_modules`. Drop a PNG into `assets/raw_pending/`, run
`python3 tools/process_assets.py --pending`, add a line to `assetManifest.js`,
and it's live on next page load.

The real CCC/JoyID path loads `@ckb-ccc/ccc` from an ESM CDN at runtime so the
offline prototype remains available without adding a package manager step.

## Smoke deployed app

```bash
node scripts/production_demo_smoke.mjs
```

The smoke checks the live custom domain and Pages hostname, verifies the hashed
production module graph, and boots the guarded first-session URL in headless
Chrome. Use `--base` and `--pages-base` for preview/demo targets.

## License

MIT — inherited from the upstream Mykonos engine. The PNG asset pack
under `assets/` includes both Mykonos-original tiles (MIT) and Cellshire
mining-mood tiles generated via HiDream-O1 (MIT, same project license).
