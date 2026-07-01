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

- ✅ **Procgen mine world**
  CKB epoch-derived seeds drive deterministic maps with adaptive cache
  rendering, biome terrain, harvest resources, ore scatter, high-value epoch
  modifiers, and reload-safe local fallback play.
- ✅ **Mining economy and chain-shaped ore cells**
  Local mining, fixture chain mining, CCC/JoyID submit receipts, lazy ore
  BIRTH/DECREMENT/DEPLETE tx shapes, fixed-point USD/reward math, and
  owner-visible currency balances are covered by tests.
- ✅ **Verifiable mining pipeline**
  Mining hits journal into per-epoch/per-ore replay tapes. Replayed sessions
  serialize to canonical `CSMS` bytes, commit with CKB-personalized blake2b-256,
  and have matching JS/Rust golden vectors in `verifier/mining-parity`.
- ✅ **Wallet-owned property and township loop**
  Player homes, property saves, wallet owner binding, expansion tiers, building
  progression, township landmarks, and read-only visit links are implemented.
- ✅ **Three-store economy**
  General Store, Trader, Bank, and Marketplace have local/fixture-chain adapter
  boundaries, pending currency deltas, CCC/JoyID receipt paths, and indexed
  readback coverage where real submit mode needs it.
- ✅ **Open Asset standard and marketplace transfer path**
  Store purchases mint deterministic Open Asset prop cells, wallet inventory
  readback hydrates `open:<cell_id>` props, and marketplace listings transfer
  exact indexed Open Asset ownership from seller to buyer.
- ⏳ **Next verifier work**
  Rust currently reproduces canonical bytes and commitment hashes from the
  frozen fixture. The next step is a Rust reducer that derives final mining
  state and rewards from compact hit actions before the on-chain verifier lock.

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
