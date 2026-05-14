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
- ⏳ Gameplay loop (movement, click-to-walk, click-to-interact, collision)
- ⏳ CKB epoch integration (epoch hash → procgen seed, ore-as-cell)
- ⏳ Player property zone + expansion mechanics
- ⏳ Three-store marketplace layer
- ⏳ Open asset standard + mint-to-game pipeline

See **[docs/DESIGN.md](docs/DESIGN.md)** for the full game design.
See **[docs/ASSET-PROMPTS.md](docs/ASSET-PROMPTS.md)** for the prompt cookbook
used to generate the asset pack via Wyltek Studio / HiDream-O1.

## Run it

```bash
cd ~/cellshire
python3 -m http.server 8766
# open http://127.0.0.1:8766/
# optional: ?size=200 to procgen a bigger world
```

There's no build step — vanilla ES modules, no bundler, no transpiler, no
`node_modules`. Drop a PNG into `assets/raw_pending/`, run
`python3 tools/process_assets.py --pending`, add a line to `assetManifest.js`,
and it's live on next page load.

## License

MIT — inherited from the upstream Mykonos engine. The PNG asset pack
under `assets/` includes both Mykonos-original tiles (MIT) and Cellshire
mining-mood tiles generated via HiDream-O1 (MIT, same project license).
