# Cellshire Kanban

Status captured 2026-06-23. This board tracks the next implementation
cards needed to turn the current prototype into the game described in
`docs/DESIGN.md`.

## Session Update 2026-06-23

**Latest completed card:** `General Store Open Asset Mint Intent`.

**What landed since the last board save:**
- Completed the guarded sparse-seed first-session proof on seed `20260523` and
  recorded the pass in
  [`2026-06-19-first-session-playability-proof.md`](runbooks/2026-06-19-first-session-playability-proof.md).
- Committed and pushed the proof docs to `main` as
  `ebf0377 Record first-session playability proof`.
- Rechecked the live Cloudflare Pages deployment and custom domains after the
  push.
- Added `scripts/production_demo_smoke.mjs`, a zero-dependency live smoke
  runner for the custom domain plus Pages/demo hostname.
- Updated the Cloudflare Pages runbook and README with the repeatable smoke
  command.
- Resolved the store integration order in
  [`2026-05-23-currency-on-chain-sudt.md`](specs/2026-05-23-currency-on-chain-sudt.md):
  harden General Store first, then wallet inventory readback, then Trader, then
  Marketplace.
- Implemented `General Store Open Asset Mint Intent`: chain Store purchases now
  emit deterministic Open Asset mint payloads, fixture settlement validates and
  returns the minted cell, and successful chain Store purchases register/grant
  the resulting `open:<cell_id>` prop.

**Production/demo smoke verification saved on board:**
- `git status --short --branch` returned `## main...origin/main` with no
  worktree changes before this board refresh.
- `curl -I --max-time 20 https://cellshire.com/` returned `HTTP/2 200` with
  `Cache-Control: public, max-age=0, must-revalidate`.
- `curl -I --max-time 20 https://www.cellshire.com/` returned `HTTP/2 200`
  with the same root HTML cache policy.
- `curl -s --max-time 20 https://cellshire.com/` and
  `curl -s --max-time 20 https://cellshire.pages.dev/` both served the same
  hashed production module graph:
  `src-73cba931c538/main.js?v=73cba931c538`.
- `curl -I --max-time 20 https://cellshire.com/src-73cba931c538/main.js`
  returned `HTTP/2 200`; the custom-domain JavaScript response still showed
  the known zone-level `Cache-Control: public, max-age=14400, must-revalidate`
  override.
- The same module URL on `cellshire.pages.dev` returned `HTTP/2 200` with the
  repo `_headers` policy, `Cache-Control: public, max-age=0, must-revalidate`.
- Headless Chrome booted
  `https://cellshire.com/?seed=20260523&character=miner&firstSessionGrant=1`
  to `body data-cellshire-boot="ready"` with the app visible and the
  `src-73cba931c538` module graph loaded. No uncaught JavaScript exceptions or
  module-load failures were reported. Console output was limited to the known
  Canvas2D readback performance warning, the existing deprecated Apple mobile
  web app meta tag warning, and Chrome/browser-service noise outside the app.
- `node scripts/production_demo_smoke.mjs` passed against the live custom
  domain and Pages hostname. The script verified root HTML revalidation, the
  shared `src-73cba931c538/main.js?v=73cba931c538` module graph, hashed module
  `200` responses, and guarded first-session boot readiness.
- `node --check scripts/production_demo_smoke.mjs` passed.
- `node scripts/production_demo_smoke.mjs --self-test` passed.
- Store-order evidence pass reviewed the existing chain Store, Trader,
  Marketplace, currency adapter, Open Asset Standard, and Prop Inventory code
  plus their focused tests. General Store is the lowest-risk first hardening
  target because it is a fixed-catalog CKB spend with one buyer and one prop
  output; Trader still needs liquidity/slippage decisions, Marketplace still
  needs seller/listing/transfer semantics, and wallet inventory readback is
  more useful after a repeatable store mint path exists.
- General Store Open Asset verification: focused Store/CCC module run
  `49 passed, 0 failed`; full browser harness `427 passed, 0 failed`;
  `node netlify-build.mjs`; `git diff --check`.

**Current Next card:** `Wallet Open Asset Inventory Readback` — teach the
chain wallet inventory surface to read fixture Open Asset prop cells created by
Store mint intents, register them at boot/read time, and surface their
`open:<cell_id>` counts without relying on the one-session Store purchase
grant.

**Why this next:** Store purchases now create cell-shaped props, but the dynamic
Open Asset registration is still driven by the purchase result. Wallet
inventory readback is the next bridge needed to make those cells durable across
reloads and to give Marketplace hardening a real owned asset source.

## Session Update 2026-05-31

**Latest completed card:** `Economy Pricing Pass`.

**What landed since the last board save:**
- Verified public DNS now uses Cloudflare nameservers:
  `alexia.ns.cloudflare.com` and `arnold.ns.cloudflare.com`.
- Verified both `cellshire.com` and `www.cellshire.com` resolve through
  Cloudflare A/AAAA addresses and serve the Pages deployment over HTTPS.
- Verified `https://cellshire.com/` and `https://www.cellshire.com/` return
  `200` with the expected security headers.
- Verified `https://cellshire.com/assets/cellshire_logo.png` and the `www`
  variant return `200` with `Cache-Control: public, max-age=31536000,
  immutable`.
- Confirmed the Pages hostname still applies the repo `_headers` rule for
  `/src/main.js` (`max-age=0`), while the custom domains currently return
  `Cache-Control: public, max-age=14400, must-revalidate` for `/src/main.js`.
  That points to a Cloudflare zone/browser-cache policy override rather than
  a build artifact issue.

**Verification saved on board:**
- `dig +short NS cellshire.com` returned Cloudflare nameservers.
- `dig +short A cellshire.com` and `dig +short A www.cellshire.com` returned
  `172.67.151.126` and `104.21.0.246`.
- `dig +short AAAA cellshire.com` and `dig +short AAAA www.cellshire.com`
  returned Cloudflare IPv6 addresses.
- `curl -I --max-time 15 https://cellshire.com/` returned `HTTP/2 200`.
- `curl -I --max-time 15 https://www.cellshire.com/` returned `HTTP/2 200`.
- `curl -I --max-time 15 https://cellshire.com/src/main.js` returned
  `HTTP/2 200`, but with the zone-overridden `max-age=14400` cache header.
- `curl -I --max-time 15 https://cellshire.pages.dev/src/main.js` returned
  `HTTP/2 200` with the repo `_headers` cache policy, `max-age=0`.
- Headless Chrome loaded `https://cellshire.com/` without module load failures
  or uncaught JavaScript errors. The only console output was existing Canvas2D
  readback performance advice and a deprecated Apple mobile web app meta tag
  warning.
- `git diff --check` passed.

**Current Next card:** `First-Session Playability Proof` — run the guarded
first-session path in-game on pinned seed `20260523`, capture actual friction
notes, and only then tune costs beyond the deterministic Economy Pricing Pass
guards.

**Known Cloudflare follow-up:** `Cloudflare Custom-Domain Cache Policy` remains
unfixed at the zone-header level, but it is no longer release-blocking. Change
the Cloudflare zone browser cache behavior so custom domains respect the Pages
`_headers` policy for `/src/*`, or add an equivalent cache rule, when a token
or dashboard access with Zone Settings edit permission is available.

**2026-05-31 attempt note:** Rechecked the custom-domain headers and confirmed
`cellshire.com/src/main.js` and `www.cellshire.com/src/main.js` still return
`Cache-Control: public, max-age=14400, must-revalidate`, while
`cellshire.pages.dev/src/main.js` returns the expected `max-age=0` policy.
Wrangler is authenticated for Pages and can list the `cellshire.com` zone, but
the current OAuth token cannot read the zone `browser_cache_ttl` setting:
Cloudflare API returned `403 Authentication error` for
`/zones/<zone_id>/settings/browser_cache_ttl`. Finish this card from the
Cloudflare dashboard or with a Cloudflare API token that has Zone Settings edit
permission by setting Browser Cache TTL to `Respect Existing Headers`
(`browser_cache_ttl = 0`), then rerun the smoke checks.

**Pickaxe progression addendum:** Completed the ore-specific mining balance
pass without increasing total ore-cell value. Pickaxe tiers now control how
many ore capacity chunks a mining action extracts: Tier 1-2 extract `1`,
Tier 3-4 extract `2`, and Tier 5-6 extract `3`. `OreState.mine()` pays the
corresponding larger slice of the ore's existing remaining USD value, so higher
pickaxes clear veins faster but do not inflate the base value in the vein.
Legacy and lazy chain mining tx builders now use `result.capacitySpent` when
recreating ore cells and recording mining receipt before/after capacity. The
Tool Rack HUD surfaces the ore extraction multiplier on pickaxe rows.

**Pickaxe verification saved on board:**
- Full browser harness: `396 passed, 0 failed`.
- `node netlify-build.mjs` passed.
- `git diff --check` passed.

**Cloudflare cache mitigation addendum:** The Cloudflare zone still returns
`Cache-Control: public, max-age=14400, must-revalidate` for custom-domain CSS
and JS, including cache-busted MISS responses, so the underlying zone Cache/Page
Rule override remains active. To remove the release blocker anyway, the static
build now publishes a duplicate content-hashed ES-module tree at
`dist/src-<hash>/` and rewrites production `index.html` to load
`src-<hash>/main.js?v=<hash>`. Because `/` keeps `max-age=0`, each deploy can
point browsers at a fresh module graph even if Cloudflare keeps a 4-hour
browser TTL on JS modules. `styles.css` also gets a content-hash query in
production HTML. Deployed this mitigation to Cloudflare Pages production at
`https://4dfc4c29.cellshire.pages.dev`.

**Cloudflare mitigation verification saved on board:**
- `node netlify-build.mjs` produced `dist/src-246c43faaf15/` and rewrote
  `dist/index.html` to load `src-246c43faaf15/main.js?v=246c43faaf15` plus
  `styles.css?v=92b945e08153`.
- Local `dist/` browser smoke loaded modules from the hashed source directory
  without module load failures.
- `wrangler pages deploy dist --project-name cellshire --branch main
  --commit-dirty=true` completed and deployed
  `https://4dfc4c29.cellshire.pages.dev`.
- `https://cellshire.com/` now serves the hashed module script tag.
- `https://cellshire.com/src-246c43faaf15/main.js` returns `200`.
- Headless Chrome loaded `https://cellshire.com/` without module load failures
  or uncaught JavaScript errors.
- `git diff --check` passed after the runbook/board update.

**Farm timing policy addendum:** Completed the farm timer decision slice on
2026-06-15. Default farming remains elapsed-time based so first-session crop
progression stays playable, but planted plots now persist `plantedEpoch` and
`readyEpoch` metadata when the current chain epoch is known. `?farmTiming=epoch`
switches crop readiness, visuals, HUD ready counts, and harvest to the saved
epoch bucket for deterministic shift-boundary smoke tests. Legacy farm saves
that only contain `readyAt` still mature through the elapsed-time fallback.

**Farm timing verification saved on board:**
- Focused farm module run: `9 passed, 0 failed`.
- Full browser harness: `400 passed, 0 failed`.
- `node netlify-build.mjs` passed.
- `git diff --check` passed.

**Placed utility building activation addendum:** Completed the building
capability placement slice on 2026-06-15. Owner-level building progression
still grants palette placement rights and preserves upgrade state, but
Workbench recipes, Tool Rack upgrades, and Sawmill/Stone Yard/Farm Storage
resource bonuses now use an active building view. The baseline home remains
active by default; other utility capabilities require the matching standard
building to be placed on the owner's home plot. The Home Buildings panel now
labels unlocked-but-unplaced utilities as `Place on property to activate`.

**Placed utility verification saved on board:**
- Focused building/recipe/tool module run: `28 passed, 0 failed`.
- Full browser harness: `404 passed, 0 failed`.
- `node netlify-build.mjs` passed.
- `git diff --check` passed.

**Farm variety + local gold material addendum:** Completed three small
progression slices on 2026-06-16. Expanded farms now choose crop type from the
farm catalog by tier/cell: starter crops remain the baseline, tier 2 introduces
fast herb plots that harvest into local `herb`, and tier 3 introduces slower
timber plots that harvest into local `wood`. Public mine maps now place rare
`gold_nugget_node` objects with a distinct `gold_resource` role, keeping local
crafting `gold` separate from crypto `gold_ore` / BTC payout logic. Resource
interaction, walkability, procgen stats, crop visuals, crop persistence, and
crop-specific elapsed/epoch timing are covered by the browser harness.

**Farm variety verification saved on board:**
- Full browser harness: `407 passed, 0 failed`.

**Material sinks + mixed farm expansion addendum:** Completed the next three
progression slices on 2026-06-17. Farm expansion now spends both local
materials and CKB, with the final tier also requiring Herb so expanded farms
feed back into progression. Workbench recipes now include Herb and Gold sinks:
`Herbal Garden Kit` crafts a placeable garden bed and `Gold Lantern Kit` crafts
a placeable hanging lantern. Higher tool tiers now consume Herb and Gold while
preserving the existing conservative harvest and ore-capacity effects.

**Material sink verification saved on board:**
- Full browser harness: `409 passed, 0 failed`.

**Township interior wrap sprint addendum:** Completed the final three
township-interior slices on 2026-06-17. Gallery wall is now a real collection
view backed by local prop inventory. Community Hall notice board now reports
home claim, farm, building, treasury, and loan summaries from existing game
state. The shared interior window gained a compact scrollable board panel for
these in-room detail views, replacing the remaining gallery/hall coming-soon
toasts.

**Township interior wrap verification saved on board:**
- Full browser harness: `410 passed, 0 failed`.

**Cleanup verification 2026-06-18:**
- Full browser harness: `410 passed, 0 failed`.
- `node netlify-build.mjs` passed.
- `git diff --check` passed.

**Bank fee treasury loop addendum:** Completed the first Economy Pricing Pass
follow-up on 2026-06-18. Paid bank loan fees now record into the same house
treasury ledger as Trader fees, using the active CKB price snapshot to convert
the CKB fee into treasury USD liquidity. Entries are keyed by loan id so a paid
loan cannot double-count its fee. Bank reserve availability already includes
house treasury totals, so repaid loan fees now visibly increase future bank
liquidity in the Bank and Community Hall summaries.

**Bank fee loop verification saved on board:**
- Full browser harness: `412 passed, 0 failed`.
- `git diff --check` passed.

**Early resource measurement addendum:** Completed the first resource pacing
measurement slice on 2026-06-18. The runtime mine spawn picker is now shared
from `src/worldgen/spawnCell.js`, and `summarizeNearbyHarvestResources()` walks
the reachable area around representative first mine spawns to count adjacent
harvest nodes and expected yields. Current representative seeds show abundant
nearby Wood, but nearby Stone can bottom out at one node within 36 steps, so
the next pricing pass should decide whether to raise near-spawn stone support
or keep Stone as the intended early limiter.

**Early resource measurement verification saved on board:**
- Full browser harness: `413 passed, 0 failed`.

**Near-spawn stone guarantee addendum:** Completed the near-spawn resource
support slice on 2026-06-18. Procgen now keeps normal Stone scatter intact,
then computes the runtime first mine spawn and deterministically adds only the
missing `stone_outcrop` nodes needed to guarantee at least two reachable Stone
nodes within the 36-step early resource budget. The sparse representative seed
`20260523` now receives one guaranteed Stone top-up, bringing its nearby Stone
yield from `3` to `6`.

**Near-spawn stone verification saved on board:**
- Full browser harness: `414 passed, 0 failed`.

**Starter farm crop pacing addendum:** Completed the crop timer review slice on
2026-06-18. No tuning change was needed: tier 1 already has four starter beds,
starter crops mature in `12s`, and a full starter harvest yields `12 Crop`.
That covers the current first-session `6 Crop` pacing target with one short
harvest cycle, so crop timers are not the intended first-tier bottleneck at
the current numbers.

**Starter farm crop verification saved on board:**
- Full browser harness: `415 passed, 0 failed`.

**Trader fee visibility addendum:** Completed the Trader fee review slice on
2026-06-18. No tuning change was needed: the live Trader fee remains `2%`,
which keeps a representative early `10,000 CKB` swap at `98%` retained USD
value while recording `$0.2871` into the house treasury. The pacing guard
checks the local swap path and the HUD-ready treasury summary entry, so the fee
loop stays visible without becoming the first-session limiter.

**Trader fee visibility verification saved on board:**
- Full browser harness: `416 passed, 0 failed`.

**Stone price review addendum:** Completed the sparse-spawn Stone pricing pass
on 2026-06-18. The two-node near-spawn guarantee gives the sparse path
`6 Stone`, so Tool Rack level 1 moved from `4 Stone` to `3 Stone` and
Reinforced Woodaxe moved from `5 Stone` to `3 Stone`. The focused first-session
guard now starts from `10,000 CKB + 16 Wood + 6 Stone + 6 Crop` and still funds
first property expansion, one cheap store prop, Tool Rack level 1, and a
Reinforced Woodaxe. Higher-tier Stone prices remain unchanged.

**Stone price review verification saved on board:**
- Full browser harness: `416 passed, 0 failed`.

## Session Wrap 2026-05-30

**Latest completed card:** `Cloudflare Pages Custom Domain Binding`.

**What landed since the last board save:**
- Added a browser-harness smoke test that drives URL-style
  `?chainBank=1&chainBankSubmit=ccc-real&chainBankCollateral=ckb` params
  through `makeBankAdapterFromParams`, the URL bank input provider, fake
  CCC/JoyID signing, and the configured HTTP bank reserve signer.
- The smoke test verifies the real-shaped borrow tx carries provider-selected
  reserve and collateral inputs, posts the serialized CCC tx plus script config
  summary to `chainBankReserveSignerUrl`, appends the returned bank witness,
  skips fixture settlement, and records a `chain-ccc-real` loan.
- Extended `scripts/bank_reserve_signer_fixture.py` with
  `GET /smoke-params`, returning a complete flagged smoke query bundle:
  base chain-bank flags, deterministic placeholder script params, reserve-cell
  params, signer URL, and optional signer token.
- Documented the repeatable smoke contract in the bank chain spec so a real
  bank backend can replace the fixture without changing the frontend flags.
- Added `cellshire.bank.reserve-sign.response` as the bank signer response
  protocol and versioned it at `1`.
- Frontend signer handling now rejects malformed signer responses before
  appending witnesses: invalid protocol/version, non-hex `bankWitness`,
  invalid witness arrays, and empty signature responses all surface as
  `bank-signer-failed`.
- The local signer fixture now emits the response protocol/version so fixture
  smoke and production backend replacement use the same envelope.
- Added `chainBankInputProviderUrl` and `chainBankInputProviderToken` for an
  HTTP bank input provider that selects BORROW reserve/collateral cells instead
  of relying on manual `chainBankReserveCell*` and `chainBankCollateralCell*`
  URL params.
- The HTTP input provider posts `cellshire.bank.inputs.select` requests with
  wallet, offer, and collateral context, validates
  `cellshire.bank.inputs.response` responses, and feeds normalized cells into
  the existing real-shaped CCC bank tx builder.
- The static URL cell provider remains as a fallback/local override, and
  `chainBankReserveIndexerUrl` / `chainBankReserveIndexerToken` are accepted as
  aliases for the new BORROW input provider.
- Extended the local bank fixture with `POST /borrow-inputs`; `/smoke-params`
  now emits `chainBankInputProviderUrl` instead of manual reserve-cell params.
- Added `chainBankRepayInputProviderUrl` and `chainBankRepayIndexerUrl` for
  HTTP REPAY input selection, while `chainBankInputProviderUrl` remains usable
  as a shared BORROW/REPAY endpoint.
- The HTTP input provider now posts `action: "repay"` requests with public
  wallet and loan context, validates returned debt and locked-collateral cells,
  and feeds them into the existing real-shaped CCC REPAY tx builder.
- The flagged CCC-real bank smoke now exercises BORROW and then REPAY with
  HTTP-selected inputs, verifying the submitted repay tx consumes the selected
  debt and locked-collateral outpoints.
- Extended the local bank fixture with `POST /repay-inputs`; `/smoke-params`
  now emits both borrow and repay provider URLs.
- Added `chainBankScriptMode=production` / `chainBankProduction=1` handling for
  real bank script config. Production mode rejects the known deterministic
  smoke placeholder code hashes and requires cell deps before a real-shaped
  CCC bank transaction can be submitted.
- Bank reserve signer requests now include production-mode script config
  diagnostics in their script summary, so the bank backend can distinguish
  fixture smoke from production-intended script bundles.
- Extended `scripts/bank_reserve_signer_fixture.py` with production smoke
  config inputs: deployed `chainBank*` script params from JSON plus explicit
  borrow input, repay input, and reserve signer backend URLs. `--production-smoke`
  refuses to start if those URLs are missing or the script params still use
  placeholder hashes.
- Added `docs/superpowers/runbooks/2026-05-29-bank-testnet-deployment.md`,
  covering the required deployed script params, backend endpoint contract,
  reserve/borrower funding checks, preflight command, browser smoke sequence,
  and done criteria for BORROW then REPAY on CKB testnet.
- Added `--validate-production-smoke` to the local bank fixture script so
  production smoke bundles can be validated and printed without starting a
  server. The preflight now checks URL shape, required script code-hash shape,
  placeholder hashes, and at least one configured script cell dep.
- Added `--deployment-values-json` for a single bank testnet values manifest
  containing deployed `chainBank*` params, backend URLs/tokens, and funded bank
  reserve/borrower collateral outpoints.
- Added `docs/superpowers/runbooks/bank-testnet-values.template.json` as the
  exact fill-in shape for real deployment values. The preflight now validates
  funded reserve cell tx hash/index/amount shape and requires at least one bank
  reserve cell when a deployment values manifest is provided.
- Added `--write-smoke-report` to the bank fixture preflight. It writes a
  redacted `cellshire.bank.testnet-smoke.report` JSON with the validated smoke
  bundle and explicit evidence fields for BORROW tx, indexer-after-borrow,
  REPAY tx, and indexer-after-repay.
- Ran the real smoke readiness check against the local environment. `ckb-cli`
  is installed, local testnet accounts exist, and two accounts have testnet
  capacity, but no filled `bank-testnet-values.json`, Cellshire bank deployed
  script set, or production backend URLs are present in the workspace.
- Added `docs/superpowers/runbooks/2026-05-29-bank-testnet-smoke-attempt.md`
  with the real readiness evidence and blocker list.
- Added `scripts/bank_backend_readiness_probe.py`, a deployment-values driven
  HTTP contract probe for production bank endpoints. It posts representative
  BORROW input, REPAY input, and reserve signer requests, then emits
  `cellshire.bank.backend-readiness.report` JSON.
- Documented the readiness probe in the bank testnet runbook and bank chain
  spec as the standard step between production preflight and browser smoke.
- Added Cloudflare Pages hosting prep for `cellshire.com`: `_headers` now
  carries cache/security headers and is copied into `dist/` by the static build.
- Added `docs/superpowers/runbooks/2026-05-30-cloudflare-pages-cellshire.md`
  with the Cloudflare Pages project settings, custom-domain notes, and smoke
  checks for `cellshire.com` / `www.cellshire.com`.
- Created the Cloudflare Pages project `cellshire` and deployed the current
  `dist/` build to production.
- Downloaded the Pages project config into `wrangler.toml` and added
  `pages_build_output_dir = "dist"` for repeatable Wrangler deploys.
- Verified Wrangler `4.81.1` still has no Pages custom-domain command, then
  attached `cellshire.com` and `www.cellshire.com` to the `cellshire` Pages
  project through the official Cloudflare Pages Domains API.
- Cloudflare accepted both domain bindings, but both remain pending because
  the public DNS is still on Namecheap parking records instead of
  `cellshire.pages.dev`.

**Verification saved on board:**
- Full browser harness after flagged smoke: `386 passed, 0 failed`.
- Full browser harness after signer response validation: `387 passed, 0 failed`.
- Full browser harness after BORROW HTTP input provider: `388 passed, 0 failed`.
- Full browser harness after REPAY HTTP input provider: `389 passed, 0 failed`.
- Full browser harness after production script guard: `391 passed, 0 failed`.
- `node netlify-build.mjs` passed after the flagged smoke slice.
- `git diff --check` passed after the flagged smoke slice.
- `python3 scripts/bank_reserve_signer_fixture.py --self-test` passed.
- Local fixture HTTP check passed for `GET /smoke-params?game=...`.
- Local fixture HTTP check passed for `POST /borrow-inputs`.
- Local fixture HTTP check passed for `POST /repay-inputs`.
- `python3 scripts/bank_reserve_signer_fixture.py --production-smoke` correctly
  rejected missing production URLs and placeholder script hashes.
- `python3 scripts/bank_reserve_signer_fixture.py --validate-production-smoke`
  passed with a temporary deployment-values JSON containing valid non-placeholder
  script hashes, backend URLs, and funded reserve/collateral outpoints.
- `--write-smoke-report` passed with the same temporary deployment-values JSON
  and produced a report with redacted smoke bundle plus pending BORROW/REPAY
  evidence fields.
- `ckb-cli --url https://testnet.ckb.dev wallet get-capacity` succeeded for
  local accounts: account 0 has `499999.99686508 CKB`, account 1 has
  `1091878.95066703 CKB`, and account 2 has `0.0 CKB`.
- `python3 scripts/bank_backend_readiness_probe.py --deployment-values-json ...`
  passed against the local bank fixture: BORROW input provider, REPAY input
  provider, and reserve signer all returned valid protocol envelopes.
- `node netlify-build.mjs` now copies `_headers` into `dist/`.
- `wrangler whoami` confirmed Wrangler is authenticated with Pages write access.
- After auth, `wrangler pages project create cellshire --production-branch main`
  succeeded.
- `wrangler pages deploy dist --project-name cellshire --branch main
  --commit-dirty=true` uploaded 355 files and deployed production URL
  `https://cellshire.pages.dev/` plus deployment URL
  `https://b122b71e.cellshire.pages.dev/`.
- `curl -I` smoke checks passed for `/`, `/src/main.js`, and
  `/assets/cellshire_logo.png`; cache/security headers from `_headers` are live.
- `wrangler pages project list` now shows `cellshire` with only
  `cellshire.pages.dev` before the API attach; the Pages Domains API returned
  both custom domains as attached, then pending with `CNAME record not set`.
- `curl -I --max-time 10 https://cellshire.pages.dev/`,
  `/src/main.js`, and `/assets/cellshire_logo.png` returned `200` with the
  expected cache/security headers.
- DNS checks show `cellshire.com` still uses Namecheap nameservers,
  `cellshire.com` points at `162.255.119.133`, and `www.cellshire.com` points
  at `parkingpage.namecheap.com`.

**Current Next card:** `Cloudflare DNS Cutover` — update registrar/DNS records
so `cellshire.com` and `www.cellshire.com` point at `cellshire.pages.dev`, wait
for Pages validation/certificate activation, then run the custom-domain smoke
checks.

**Known caveat:** the new smoke path proves the frontend contract with fake
CCC/JoyID and deterministic fixture witness data. Real testnet submission still
needs deployed scripts, real cell deps, spendable bank reserve cells, and a
production bank signer/indexer whose selected cells and witness bytes match the
deployed script.

## Session Wrap 2026-05-28

**Latest completed card:** `Bank Backend Reserve Smoke Fixture`.

**What landed since the last board save:**
- Added `?chainBankSubmit=ccc-real` / `?chainBankMode=ccc-real` routing for
  script-configured CCC/JoyID bank collateral transactions.
- Added URL-driven bank script config parsing for debt type, bank book lock,
  collateral lock, reserve lock, treasury lock, and optional cell deps.
- Added a real-shaped CCC bank transaction builder:
  BORROW emits player principal, debt cell data/type, and locked collateral
  outputs; REPAY emits collateral release, bank reserve, and treasury fee
  outputs.
- Real CCC bank mode skips fixture settlement and returns `chain-ccc-real`,
  while existing `?chainBankSubmit=ccc` remains the compact receipt path.
- Added a bank input provider boundary so BORROW can consume provider-selected
  bank reserve and player collateral cells, while REPAY can consume
  provider-selected debt and locked-collateral cells.
- Added URL-configured smoke params for bank input cells:
  `chainBankReserveCell*`, `chainBankCollateralCell*`,
  `chainBankDebtCell*`, and `chainBankLockedCollateralCell*`.
- Real-shaped CCC bank transactions now include provider-selected input
  outpoints when available, while prototype and fixture paths keep their
  existing fallback behavior.
- Added optional bank reserve co-signing for `ccc-real` BORROW transactions.
- Added `chainBankReserveSignerUrl` and `chainBankReserveSignerToken` params
  for a bank-side HTTP co-sign endpoint. The request carries the real-shaped
  CCC tx, bank loan receipt payload, action, and script config summary.
- Bank signer responses can replace witnesses or append bank reserve witness
  data before JoyID submits the transaction, and signer failures now surface as
  `bank-signer-failed`.
- Added `scripts/bank_reserve_signer_fixture.py`, a dependency-free local
  HTTP fixture with `/health`, `/reserve-inputs`, and `/sign` endpoints.
- The fixture returns URL-param-compatible reserve cell data and deterministic
  bank witness payloads for frontend `chainBankReserveSignerUrl` smoke flows.
- Added a `--self-test` path to validate signer success, missing reserve input
  rejection, and generated smoke params.

**Verification saved on board:**
- Full browser harness: `385 passed, 0 failed`.
- `node netlify-build.mjs` passed after the bank reserve signer slice.
- `git diff --check` passed after the bank reserve signer slice.
- `python3 scripts/bank_reserve_signer_fixture.py --self-test` passed.

**Current Next card:** `Bank End-to-End Flagged Smoke Flow` — run and document
the browser flow using the fixture signer, real-shaped bank script params, and
reserve input params together so future backend replacement has a known-good
frontend contract.

**Known caveat:** `ccc-real` now has frontend input selection and co-sign
plumbing, but end-to-end settlement still depends on a real bank signer/backend
and deployed script validation.

## Session Wrap 2026-05-26

**Latest completed cards:** `CCC Marketplace Receipt Submit` and
`Bank Chain Design — v2 CKB collateral fixture settlement`.

**What landed since the last board save:**
- Chain Marketplace purchases now support CCC/JoyID receipt submit behind
  `?chainMarketplace=1&chainMarketplaceSubmit=ccc`.
- Added `cellshire.marketplace.purchase` receipt payload, CCC transaction
  preparation, submitter factory, and adapter wiring.
- Marketplace CCC mode is receipt-only: it skips fixture settlement, records
  the pending CKB spend, grants the bought prop locally, and leaves real
  marketplace settlement/Open Asset transfer deferred.
- CCC receipt flags now opt the wallet connector into the real CCC/JoyID path
  for Bank, Store, Trader, and Marketplace submit modes.
- Chain Bank prototype submit now fixture-settles BORROW/REPAY against an
  indexer-owned debt/locked-collateral state, so CKB collateral is locked on
  borrow and released only by full repay in the fixture path.
- Bank pending CKB reconciliation now records one net CKB delta per bank tx,
  matching the indexed post-settlement balance when collateral and principal
  move in the same transaction.

**Verification saved on board:**
- Full browser harness after Marketplace CCC receipt: `364 passed, 0 failed`.
- Full browser harness after Bank fixture settlement: `368 passed, 0 failed`.
- `node netlify-build.mjs` passed after both slices.
- `git diff --check` passed after both slices.

**Current Next card:** `Bank CCC Real Collateral Lock Transaction` — replace
the bank-loan CCC receipt tx with the real CKB collateral-lock transaction
once script deps and lock/type code hashes are available.

**Known caveat:** Marketplace and Bank CCC submit paths are still compact
receipts. The new Bank settlement is a fixture/indexer model, not a deployed
CKB collateral-lock script.

## Session Wrap 2026-05-25

**Latest completed card:** `Currency On-Chain — chain economy fixture
settlement expansion`.

**What landed since the last board save:**
- Chain wallet source switching now supports pending deltas over indexed
  balances and reconciliation once fixture indexer balances catch up.
- Lazy mining cell slice is implemented behind
  `?chainMining=1&chainMiningBirth=lazy`, including deterministic ore args,
  local/HTTP indexer boundaries, and BIRTH/DECREMENT/DEPLETE tx shapes.
- Chain Trader prototype is implemented behind `?chainTrader=1`:
  `cellshire_trader_swap_tx`, fixture settlement, pending reconciliation, and
  CCC/JoyID receipt submit via `?chainTraderSubmit=ccc`.
- Chain General Store prototype is implemented behind `?chainStore=1`:
  `cellshire_store_purchase_tx`, fixture CKB spend, local prop grant, pending
  reconciliation, and CCC/JoyID receipt submit via `?chainStoreSubmit=ccc`.
- Chain Marketplace buy prototype is implemented behind
  `?chainMarketplace=1`: `cellshire_marketplace_purchase_tx`, fixture CKB
  spend, local prop/skin grant, listing close, and pending reconciliation.
- Bank chain fixture slice is implemented behind
  `?chainBank=1&chainBankCollateral=ckb`, with CCC/JoyID receipt submit via
  `?chainBankSubmit=ccc`; full collateral-lock settlement is still deferred.
- Audio, music, township/interior/NPC visuals, boot screen, farm/tool assets,
  economy tuning, and overlay/layout fixes remain in the current dirty
  workspace and are reflected in the detailed Done/Backlog sections below.

**Verification saved on board:**
- Latest focused marketplace/store/trader/currency module run:
  `30 passed, 0 failed`.
- Latest focused CCC/store/trader run: `35 passed, 0 failed`.
- `node netlify-build.mjs` passed after the latest chain marketplace slice.
- `git diff --check` passed after the latest chain marketplace slice.

**Current Next card:** `CCC Marketplace Receipt Submit` — mirror the
Trader/Store receipt pattern for `cellshire.marketplace.purchase`, keeping it
receipt-only until real marketplace settlement/Open Asset transfer is wired.

**Known caveat:** full browser harness was not rerun in this sandbox because
the installed Chromium snap cannot create its runtime directory here. Focused
module tests and build checks are current.

## Session Wrap 2026-05-23 (late)

Two parallel tracks landed while Codex was rate-limited:

**Chain & Data Model specs (5 specs)**
- Resolved every open decision in the Chain & Data Model cluster of the
  Needs Decision section: currency model, save-state storage, first
  on-chain mining path, resource model, gold disambiguation, bank chain
  design.
- New specs (all dated 2026-05-23):
  - [`2026-05-23-currency-on-chain-sudt.md`](specs/2026-05-23-currency-on-chain-sudt.md)
    — sUDT issuance script, 11 deterministic per-currency type-args
    (plus native CKB), admin-mint reserve for v1.
  - [`2026-05-23-lazy-mint-mining-cells.md`](specs/2026-05-23-lazy-mint-mining-cells.md)
    — lazy BIRTH/DECREMENT/DEPLETE lifecycle, deterministic 22-byte ore
    args, first-mempool-wins race resolution with indexer canonicalisation.
  - [`2026-05-23-resource-model-boundary.md`](specs/2026-05-23-resource-model-boundary.md)
    — wood/stone/crop/herb/gold stay local; crafted outputs cross the
    boundary via Open Asset Standard cells.
  - [`2026-05-23-bank-chain-design.md`](specs/2026-05-23-bank-chain-design.md)
    — three-phase plan, v2 CKB-collateralised debt cells with repay/seize
    dual-branch lock script.

**Asset generation pass (audio + visuals)**
- Generated 92 SFX clips via Meta AudioGen medium (SA3 small-sfx produced
  buzzsaw output; switched backends). 31 winners installed at
  `assets/sfx/<id>.ogg`.
- Generated 13 music tracks via Stable Audio 3 medium. 6 final winners
  (4 originals + 2 from a follow-up alternatives batch) installed at
  `assets/music/<id>.ogg`.
- Generated 45 township-tier visuals (5 township buildings × 3 candidates,
  5 RPG interior backdrops × 3, 5 NPCs × 3) plus 6 boot-screen iterations
  and 4 harvest-tree redo iterations via Flux.1 Schnell GGUF on ComfyUI.
- 17 visual winners installed: 5 township building sprites, 5 RPG interior
  backdrops, 5 NPC sprites, 1 boot screen background, 1 replacement
  harvest tree.
- Boot screen already wired into `styles.css` (three-layer background:
  gradient overlay + image + cream-gradient fallback).
- Latest completed card: `Asset Generation — Township + Interiors + NPCs +
  Audio Pass`.
- Current Next card at that time: `Economy Pricing Pass`.
- Known local-only files: untracked `cs_logo.png`,
  `assets/assets_cellshire.zip`, `scripts/__pycache__/`, `tmp/`, and the
  new `scripts/_sa3_stubs/` torchcodec workaround.
- Pipeline scripts shipped under `scripts/`: `cellshire_sfx_catalog.py`,
  `run_cellshire_sfx_audiogen_batch.py`, `cellshire_music_catalog.py`,
  `run_cellshire_music_batch.py`, `cellshire_township_visual_catalog.py`,
  `run_cellshire_township_visual_batch.py`, plus matching audition page
  builders and install scripts.
- Last verification: SFX, music, and visual batches all completed with
  zero failures; install scripts emitted expected manifest/wiring
  snippets; new boot screen renders correctly in browser smoke at
  `http://localhost:8888`.

## Current Baseline

- Playable isometric procgen map.
- Click-to-walk, pathfinding, collision, and click-to-interact mining.
- Local ore capacity, local inventory balances, mining FX/audio, and HUD.
- CKB epoch hash drives procgen seed with live/cached/random fallback.
- Per-epoch local mined-state persistence prevents reload double-mining.
- Epoch hash modifiers produce standard/high-yield/rich shifts that
  multiply mining yield and surface in the epoch HUD.
- Local-first property zone with a fenced starter claim, mine/home travel,
  bounded placement, starter owned-asset allow-list, and local persistence.
- Starter property maps now include a baseline `house` plus the reserved farm
  soil footprint, using the cleaned HiDream house sprite.
- Communal township map reachable by signposts from the mine and starter
  property, with Store, Market, Bank, Gallery, and Community Hall hotspots.
- Township landmark interactions open stylized interior windows that route into
  Store, Market, and exchange flows or show future-only building actions.
- Trader swap fees are recorded into a local house treasury visible from the
  Bank interior window.
- Bank loans can issue and repay local CKB credit from the Bank interior, with
  tunable offer/fee/reserve constants.
- Farming/resource/crafting progression is specified, including home farm
  expansion, epoch-refreshing trees/stone, crafting buildings, and pickaxe
  upgrade direction.
- Twelve mineable deposit visuals/catalog entries, including silver,
  lithium, bismuth, cobalt, and silicon quartz.
- Character picker, persisted character choice, starter character PNGs,
  and directional facing.
- Flux2 Kleingenerated Cellshire shield/logo integrated across the boot
  screen, title card, browser icon, touch icon, and JoyID app metadata.
- Build mode remains available via `?dev=1` for property-zone tooling.

## Done

### Character PNG Asset Pass

**Completed:** 2026-05-17

Added `assets/player_miner.png`, `assets/player_seeker.png`, and
`assets/player_tinker.png`. Browser smoke now serves the character
assets as `200`, and the picker tests still pass.

### Epoch Status UX

**Completed:** 2026-05-17

Added a non-debug epoch badge, cached/random fallback states, estimated
time-to-new-shift text, and a `New shift` reload action when the local
estimate says the epoch has rolled. Added pure tests for countdown and
status formatting.

### Wallet Identity Spike

**Completed:** 2026-05-17

Added a wallet/domain module, non-sensitive identity persistence, and a
JoyID-labeled connect/disconnect UI stub behind `?wallet=1`. Covered
disconnected, connecting, connected, and failed states with tests. Mining
and economy behavior remain independent of wallet state.

### On-Chain Mining Architecture Spec

**Completed:** 2026-05-17

Captured in
[`2026-05-17-on-chain-mining-design.md`](specs/2026-05-17-on-chain-mining-design.md).
The spec defines ore cell data, mine tx inputs/outputs, validation
rules, optimistic UX, stale-chain reconciliation, testnet-first feature
flags, and the first implementation slice.

### Mining Transaction Prototype

**Completed:** 2026-05-17

Added deterministic ore identity, tx-shaped ore/yield cell builders,
and a feature-flagged mining adapter boundary. `?chainMining=1` routes
`coal_seam` through a prototype JoyID/testnet-style adapter; unsupported
ores remain local. Failed/cancelled prototype submissions restore local
ore capacity and grant no yield.

### Real JoyID + CCC Mining Submit

**Completed:** 2026-05-17

Added optional `?wallet=joyid` / `?chainMiningSubmit=ccc` runtime wiring
for CCC-backed JoyID connection and CKB testnet mining submit. The real
path loads `@ckb-ccc/ccc` from an ESM CDN, prepares a CCC transaction
with a compact Cellshire mining receipt witness, signs/submits through
JoyID, and preserves the prototype/local adapters for offline dev. Failed
signature or submit still bubbles through the mining adapter failure path,
so local ore capacity is restored before yield is granted.

### Epoch Modifier + High-Value Epochs

**Completed:** 2026-05-17

Added deterministic epoch modifier bucketing from the epoch hash, high-value
HUD state/toast, and multiplier-aware ore yield. Documented the 5% `3x` /
20% `2x` tuning constants in `docs/DESIGN.md`.

### Property Zone MVP

**Completed:** 2026-05-18

Added a home/property map reachable from the mine through the property HUD
or mine-side signpost. The starter claim is fenced, uses the existing
placement toolbar/palette with a starter owned-asset allow-list, rejects
placement outside the editable bounds, and autosaves locally through a
property-specific storage key. Chain-backed placed prop cells remain a
later integration.

### HUD Layout + Cellshire Polish

**Completed:** 2026-05-18

Reworked the desktop HUD stack: inventory bottom-right, time/toggles
top-right, epoch top-middle, map label under time, and debug overlay under
the Cellshire title block. Replaced first-load Mykonos copy with Cellshire
language. Fixed play-mode desktop clicks so walking/mining are not consumed
by builder brush input, added visible walk bob and mining hit pulse, and
added contextual cursors for walk, mining, POI, build, erase, pan, and
blocked states.

### Mineable Asset Expansion

**Completed:** 2026-05-18

Generated and integrated five new mineable deposit blocks: `silver_ore`,
`lithium_ore`, `bismuth_ore`, `cobalt_ore`, and `silicon_quartz`. The game
now has 12 mineable catalog entries, procgen includes the new deposits, and
tests assert the mineable set.

### Crypto Ore Economy Mapping

**Completed:** 2026-05-18

Mapped all 12 mineable deposits to proof-of-work internal currencies:
BTC, LTC, DOGE, DASH, XMR, ZEC, CKB, KAS, ERG, BCH, DGB, and RVN. Mining now
credits crypto currency IDs instead of ore asset IDs, inventory displays
crypto labels/symbols, and mined amounts are value-normalized through the
fixed CoinGecko testnet price snapshot captured on 2026-05-18 at 14:06:32 UTC.

### Epoch Price Snapshot Adapter

**Completed:** 2026-05-18

Added a CoinGecko price adapter with live, cached, and fixed fallback modes.
Boot now fetches/caches one price snapshot alongside the epoch procgen seed,
the debug overlay surfaces snapshot source/time, and each spawned mineable
receives a deterministic `$50-$200` USD value budget that is converted into
the mapped crypto quantity as it is mined.

### Epoch-Deterministic Ore Value Bands

**Completed:** 2026-05-19

Added a two-word epoch hash value-band derivation. Each epoch now rolls a
lower bound from `$1-$100` and a spread from `$20-$200`, allowing lean
`$1-$21` epochs through rich `$100-$300` epochs. Individual mineables still
roll deterministically inside the epoch band, so all players see the same
ore values for the same epoch/world seed.

### Cellshire Brand Logo Integration

**Completed:** 2026-05-20

Promoted the final `cs_logo.png` into the served `assets/cellshire_logo.png`
slot, bumped the browser cache key, added favicon and Apple touch icon links,
and switched the CCC/JoyID default app logo from the miner sprite to the
Cellshire brand mark. Verified with the browser test harness
(`151 passed, 0 failed`) and `node netlify-build.mjs`.

### Economy HUD + Token Detail

**Completed:** 2026-05-20

**Goal:** make the crypto economy legible to players while keeping the
current HUD compact.

Added currency logo marks, symbol/name rows, approximate USD balances, and a
recent-hit detail line for the compact economy HUD. Added a disclosure for
price snapshot mode/source/capture metadata. Added a `?dev=1` ore budget debug
panel that lists every live ore's remaining/total USD budget, cell, capacity,
and mapped currency. The balance model still uses internal currency IDs so the
local path remains compatible with a later Nervos UDT-backed inventory adapter.

Verified with the browser test harness (`155 passed, 0 failed`), a dev-mode
headless page load, and `node netlify-build.mjs`.

### Property Expansion Tiers

**Completed:** 2026-05-20

**Goal:** make the property zone grow through gameplay.

Added four tested claim tiers that expand the editable property bounds from
the starter `16x16` claim up to a `22x22` max claim. The property HUD now
shows the current tier, next expansion cost, and an unlock action while at
home. Unlocking spends local CKB from the existing inventory model, refreshes
the property-mode canvas preview overlay, and autosaves the unlocked tier with
the property snapshot for the future resume-state path. Existing starter
fences remain placeable/erasable objects once they fall inside an unlocked
claim.

Verified with the browser test harness (`162 passed, 0 failed`) and
`node netlify-build.mjs`.

### Resume State Cell Spec

**Completed:** 2026-05-20

**Goal:** turn save/load into the designed one-cell resume snapshot.

Captured in
[`2026-05-20-resume-state-cell-spec.md`](specs/2026-05-20-resume-state-cell-spec.md).
The spec defines the resume-state boundary, logical and compact v1 blob
shapes, validation rules, local-to-chain migration, prompt and pending-save
badge behavior, load UX, adapter boundaries, and the first implementation
slice. Decision: use a custom minimum-capacity Cellshire resume state cell for
v1; keep CKBFS V3 for larger player-authored files/exported blueprints.

### Multiple Map Travel

**Completed:** 2026-05-20

**Goal:** support mine/property/region transitions without one huge world.

Added a tested map registry with deterministic ids, display names, seed
sources, and entry spawns. Public mine maps are keyed by epoch
(`mine:<epoch>` with `mine:local` fallback); property maps are keyed by player
owner (`property:<owner>`, currently `property:local`). Portal roles now resolve
through the registry, and the game captures/restores map runtime by map id so
mine/property travel preserves camera, player position, epoch state, ore state,
and property tier. The registry tests cover deterministic map selection, role
targets, and spawn fallback.

Verified with the browser test harness (`166 passed, 0 failed`) and
`node netlify-build.mjs`.

### Trader Store MVP

**Completed:** 2026-05-20

**Goal:** make mined ore balances useful before full marketplace work.

Added a local Trader HUD that quotes deterministic currency swaps from the
active/fixed price snapshot with a trader fee. Players can choose source and
target proof-of-work currencies, use a Max affordance against local balances,
preview the quote/rate, and swap through the local inventory model. The rate
table and quote math live in a tested trader module, and the local swap path
sits behind a trader adapter with an explicit future Cellswap boundary.

Verified with the browser test harness (`174 passed, 0 failed`), a headless
app smoke load, and `node netlify-build.mjs`.

### General Store

**Completed:** 2026-05-20

**Goal:** sell common props at fixed game-set prices.

Added a fixed General Store catalog with placeable props, CKB prices, rarity,
and property-tier unlocks. Purchases spend local CKB and add instances to a
persisted local prop inventory. Bought non-starter props become visible in the
property palette, placement consumes one owned instance, and erasing a bought
prop returns it to inventory. The local path is documented against the future
chain vendor-script flow in
[`2026-05-20-general-store-vendor-script.md`](specs/2026-05-20-general-store-vendor-script.md).

Verified with the browser test harness (`182 passed, 0 failed`),
`node netlify-build.mjs`, and module import checks for the new HUD/Game
wiring.

### Player Marketplace

**Completed:** 2026-05-20

**Goal:** support unique player-listed items.

Added a local-first marketplace model for unique prop/skin listing cells,
including seed listings for offline browsing, player-created prop listings,
buy, and cancel flows. Listing player props consumes one owned prop instance;
cancel returns it; buying spends local CKB and adds the purchased prop or skin
to local marketplace state. The Marketplace HUD stays browse-only when no
wallet identity is connected, and the live Cellswap/Spore settlement path is
documented in
[`2026-05-20-player-marketplace-cellswap-spore.md`](specs/2026-05-20-player-marketplace-cellswap-spore.md).

Verified with the browser test harness (`187 passed, 0 failed`),
`node netlify-build.mjs`, marketplace module import checks, and a headless
app smoke load confirming the browse-only Market HUD mounts cleanly.

### Open Asset Standard

**Completed:** 2026-05-20

**Goal:** let community-minted assets appear in game.

Captured the v1 schema draft in
[`2026-05-20-open-asset-standard.md`](specs/2026-05-20-open-asset-standard.md),
covering ground tile, prop, character skin, and accessory cells. Added a
`cellshire.manifest-alias` render rule that maps compliant cell metadata to
existing renderer sources while preserving a generated `open:<cell id>` runtime
asset id. Placement, property bounds, palette visibility, renderer preview,
and marketplace validation now resolve assets through a registry that includes
dynamic open definitions. The browser fixture registers a Spore-like prop cell
and places it as an in-game prop without adding its id to the static catalog.

Verified with the browser test harness (`190 passed, 0 failed`),
`node netlify-build.mjs`, open-asset module import checks, and a headless app
smoke load.

### Chain Inventory Read Model

**Completed:** 2026-05-20

**Goal:** replace local inventory balances with wallet-owned cells.

Added a local/chain inventory adapter boundary that normalizes currency, prop,
and skin cells into the existing inventory interfaces. The chain snapshot path
filters stale indexer cells by `minBlockNumber`, applies pending transaction
deltas, and reports stale cells for reconciliation UX. The Economy HUD now reads
through an adapter snapshot while preserving the local player inventory path.
The read-model contract is documented in
[`2026-05-20-chain-inventory-read-model.md`](specs/2026-05-20-chain-inventory-read-model.md).

Verified with the browser test harness (`196 passed, 0 failed`),
`node netlify-build.mjs`, and module import checks.

### Visiting + Presence

**Completed:** 2026-05-20

**Goal:** let other players see property zones and eventually each other.

Added `?visit=<owner id>` as a read-only property snapshot route. Property
storage now supports owner-keyed local snapshots while preserving the existing
`local` key, and map registry entries carry owner/read-only metadata. Visit
mode lets the local avatar walk around the loaded property but blocks place,
erase, save, reset, expand, and autosave paths. The toolbar/palette are hidden
for visitors, and the property HUD labels the inspected owner. Presence options
and the Fiber-later recommendation are captured in
[`2026-05-20-visiting-presence.md`](specs/2026-05-20-visiting-presence.md).

Verified with the browser test harness (`200 passed, 0 failed`),
`node netlify-build.mjs`, and module import checks.

### Chain Property Snapshot Adapter

**Completed:** 2026-05-20

**Goal:** load visited property snapshots from indexed owner cells.

Added a property snapshot adapter boundary with local and chain/indexer
implementations. The chain adapter normalizes `cellshire.property.snapshot` v1
cells into the same snapshot shape returned by local storage, chooses the
newest owner cell, reports stale cells below `visitMinBlock`, and leaves the
visit route in a clear read-only starter/pending state when no current snapshot
is indexed. `?visitSource=chain` now routes visits through the chain adapter;
the default remains local owner-keyed storage. The fixture/indexer contract is
documented in
[`2026-05-20-chain-property-snapshot-adapter.md`](specs/2026-05-20-chain-property-snapshot-adapter.md).

Verified with the browser test harness (`205 passed, 0 failed`),
`node netlify-build.mjs`, and module import checks.

### Shareable Visit Links

**Completed:** 2026-05-20

**Goal:** make property visits discoverable from wallet identity.

Added a visit-link formatter and property HUD share action. Links include the
current property owner id and selected snapshot source (`local` or `chain`),
strip session/editor params, and preserve useful context such as fixed prices.
Local/disconnected property mode shares a local preview link, while visited or
future wallet-owned properties share their loaded owner id. Clipboard copy uses
the browser clipboard API when available and falls back to showing the URL in
the toast. The link contract is documented in
[`2026-05-20-shareable-visit-links.md`](specs/2026-05-20-shareable-visit-links.md).

Verified with the browser test harness (`209 passed, 0 failed`),
`node netlify-build.mjs`, and module import checks.

### Wallet Owner Property Binding

**Completed:** 2026-05-20

**Goal:** bind home ownership to connected wallet identity.

Added a separate owner-binding preference so a connected wallet can explicitly
switch the home property owner from `local` to the wallet address. The Wallet
HUD now exposes `Use wallet home` / `Use local home`, and disconnecting returns
the live owner to local mode without deleting either local or owner-keyed
property saves. Startup applies the wallet owner when wallet features are
enabled, a persisted wallet is connected, and the binding mode is wallet.
`Game.setHomePropertyOwner()` autosaves the current editable property before
switching owners, so share links and the property portal target the selected
owner id. The binding contract is documented in
[`2026-05-20-wallet-owner-property-binding.md`](specs/2026-05-20-wallet-owner-property-binding.md).

Verified with the browser test harness (`214 passed, 0 failed`),
`node netlify-build.mjs`, module import checks, and a headless wallet-mode boot
smoke.

### Property Snapshot Cell Writer

**Completed:** 2026-05-21

**Goal:** write wallet-owned property snapshots into chain-shaped cells.

Added a snapshot writer boundary for wallet-owned homes. The new payload builder
exports `cellshire.property.snapshot` v1 data with owner, tier, tile map,
camera, schema, and version fields. The local fixture writer stores owner-keyed
snapshot cells under `cellshire:property-snapshot-cells:v1:<owner>`, matching
the existing chain read adapter. Writes are gated behind a connected wallet
whose address matches the editable property owner. `Game.save()` and property
autosave now use a shared local-save-plus-snapshot helper, so local property
storage still succeeds when the wallet writer is unavailable, disconnected, or
owner-mismatched. The contract is documented in
[`2026-05-21-property-snapshot-cell-writer.md`](specs/2026-05-21-property-snapshot-cell-writer.md).

Verified with the browser test harness (`218 passed, 0 failed`),
`node netlify-build.mjs`, and module import checks.

### Property Snapshot Submit Adapter

**Completed:** 2026-05-21

**Goal:** turn wallet-owned property snapshots into wallet-submitted CKB transactions.

Added a logical property snapshot transaction request builder and a submit
adapter for wallet-owned property snapshots. The default writer remains the
local fixture writer; `?propertySnapshotSubmit=ccc` or
`?propertySnapshotReal=1` switches saves to the CCC/JoyID submit adapter. The
adapter preserves the existing wallet-owner gate, maps snapshots into
`cellshire_property_snapshot_tx` requests, and reports normalized submit
failures while keeping the local property save successful. CCC/JoyID now has a
property snapshot receipt payload and transaction builder that mirrors the
mining submit path. The flow is documented in
[`2026-05-21-property-snapshot-submit-adapter.md`](specs/2026-05-21-property-snapshot-submit-adapter.md).

Verified with the browser test harness (`227 passed, 0 failed`),
`node netlify-build.mjs`, module import checks, and a headless
`?propertySnapshotSubmit=ccc` boot smoke.

### Property Snapshot Save Status

**Completed:** 2026-05-21

**Goal:** surface local/snapshot publish status after property saves.

Added a shared formatter for combined local-save and snapshot-write results.
Explicit property saves now await the snapshot writer and show precise toast
messages such as `Saved local + visit snapshot`, `Saved local + published
snapshot`, or `Saved local; not enough CKB to publish`. Autosave still runs the
same helper without toast noise, records the latest result on the game, and
emits map state for HUD/debug consumers. The Property HUD appends the compact
save label to editable home details after a save status exists. The behavior is
documented in
[`2026-05-21-property-snapshot-save-status.md`](specs/2026-05-21-property-snapshot-save-status.md).

Verified with the browser test harness (`228 passed, 0 failed`),
`node netlify-build.mjs`, module import checks, and a headless
`?propertySnapshotSubmit=ccc` boot smoke.

### Chain Visit Smoke Fixtures

**Completed:** 2026-05-21

**Goal:** prove wallet-owned snapshot saves can be visited through the chain snapshot read path.

Added integration coverage that saves a wallet-owned property through the local
fixture snapshot writer, then reads it back through
`?visit=<owner>&visitSource=chain` via the same adapter factory the app uses.
Missing owner and `visitMinBlock` stale fallback behavior are covered. The
manual smoke flow is documented in
[`2026-05-21-chain-visit-smoke-fixtures.md`](specs/2026-05-21-chain-visit-smoke-fixtures.md).

**Acceptance:**
- Saving a wallet-owned fixture snapshot produces a visit-readable chain source fixture.
- A `?visit=<owner>&visitSource=chain` smoke loads the saved snapshot owner.
- Tests cover writer-to-reader compatibility and missing/stale fallback behavior.
- Docs capture the local fixture flow for manual testing.

Verified with the browser test harness (`230 passed, 0 failed`) and
`node netlify-build.mjs`.

### Communal Township Plane

**Completed:** 2026-05-21

**Goal:** create a shared township map that acts as the social/economic hub
outside the mine and private property planes.

Added `township:communal` as a third map kind alongside mine and property.
Mine boot now places a township signpost near the spawn, starter properties
include a township signpost, and the township has exits back to the mine and
active property. The deterministic `32x32` township map includes landmark
hotspots for Store, Market, Bank, Gallery, and Community Hall. Landmark
interactions currently show a lightweight coming-soon toast so the next card
can replace them with RPG-style interior windows. The flow is documented in
[`2026-05-21-communal-township-plane.md`](specs/2026-05-21-communal-township-plane.md).

**Acceptance:**
- Map registry includes a deterministic township entry and spawn.
- Mine/property HUD or signpost travel can enter and leave the township.
- Township buildings expose interaction hotspots without opening the current
  HUD panels automatically.
- Smoke test confirms township travel preserves mine/property runtime state.

Verified with the browser test harness (`233 passed, 0 failed`) and
`node netlify-build.mjs`.

### RPG Building Interior Windows

**Completed:** 2026-05-21

**Goal:** make township buildings feel like old-school RPG storefronts instead
of plain overlay panels.

Added a shared building interior window for township landmarks. The window
renders scene-specific Store, Market, Bank, Gallery, and Community Hall rooms,
supports click-away/close-button/`Escape` dismissal, and returns focus to the
game canvas. Store, Market, and Bank exchange actions open the existing Store,
Marketplace, and Trader panels through small public HUD handles; future-only
loan, gallery, and hall actions stay in the room and show scoped toasts. The
flow is documented in
[`2026-05-21-rpg-building-interior-windows.md`](specs/2026-05-21-rpg-building-interior-windows.md).

**Acceptance:**
- Building interaction opens a building-specific scene window.
- Store and Market scene options can launch the existing Shop/Market flows.
- Keyboard/mouse close behavior returns focus to township movement.
- Scene window assets and actions are data-driven enough to add Bank, Gallery,
  and Community Hall without bespoke UI code for each building.

Verified with the browser test harness (`236 passed, 0 failed`) and
`node netlify-build.mjs`.

### Game House Treasury

**Completed:** 2026-05-21

**Goal:** route economy fees into an explicit game/house treasury that can fund
later economic loops.

Added a local house treasury ledger at `cellshire:house-treasury:v1`. Successful
Trader swaps now record USD-denominated fee entries with source currency,
amount, target currency, fee bps, timestamp, and swap mode context. The Bank
interior window shows a compact treasury summary and a `House treasury` action
with recent fee records. The local design keeps source currency context so a
future chain treasury can settle as CKB, UDT balances, typed cells, or a hybrid.
The flow is documented in
[`2026-05-21-game-house-treasury.md`](specs/2026-05-21-game-house-treasury.md).

**Acceptance:**
- Trader fee accounting records fee source, currency, amount, and timestamp.
- Treasury balance is inspectable in dev mode or a Bank/Community Hall view.
- Existing trade quote math still clearly shows the player-facing fee.
- Tests cover fee accumulation and no-fee/local fallback behavior.

Verified with the browser test harness (`241 passed, 0 failed`) and
`node netlify-build.mjs`.

### Bank + Loan Economy

**Completed:** 2026-05-21

**Goal:** explore a SimCity-like bank that turns house treasury liquidity into
player-facing loans and longer-term economic pressure.

Added a local loan book at `cellshire:bank-loans:v1:local` with one active CKB
loan at a time. The Bank `Loan office` now shows tunable offers, borrow actions,
the current remaining debt, and a repay-balance action. Loan availability uses a
prototype base reserve plus house treasury fees minus active principal; pricing
constants live in `src/bank/bankLoans.js` so item/store/expansion pricing can
move later without changing the UI flow. The flow is documented in
[`2026-05-21-bank-loan-economy.md`](specs/2026-05-21-bank-loan-economy.md).

**Acceptance:**
- Spec defines loan terms, repayment cadence, interest/fee model, default
  handling, and whether collateral is required.
- Spec defines how house treasury funds loan reserves and receives repayments.
- Spec identifies what must remain local-only for prototype safety.
- Prototype lending UI stays local-only with no wallet-backed debt cells yet.

Verified with the browser test harness (`247 passed, 0 failed`) and
`node netlify-build.mjs`.

### Resource Inventory + Wood/Stone Harvesting

**Goal:** add local gameplay resources and epoch-refreshing harvest nodes before
full farming/crafting.

**Spec:** [`2026-05-21-resource-inventory-wood-stone-harvesting.md`](specs/2026-05-21-resource-inventory-wood-stone-harvesting.md)

**Status:** shipped local material inventory plus epoch-refreshing wood/stone
harvest nodes.

**Notes:**
- Added persistent local resource inventory and compact Resources HUD.
- Tagged procgen trees as wood resources and added stone resource outcrops.
- Harvesting walks adjacent, grants `wood`/`stone`, and locally depletes the
  node using the existing epoch mined-state path.
- Covered resource catalog, inventory persistence, walkability, HUD rendering,
  and procgen placement with tests.

Verified with the browser test harness (`256 passed, 0 failed`) and
`node netlify-build.mjs`.

### Expandable Farm Zone MVP

**Goal:** add a farmable home-base area that expands independently from the
decorative property claim.

**Spec:** [`2026-05-21-expandable-farm-zone-mvp.md`](specs/2026-05-21-expandable-farm-zone-mvp.md)

**Status:** shipped the local farm-zone MVP.

**Notes:**
- Added owner-keyed farm state with persistent tier and planted crop timers.
- Home maps now reserve visible farm soil and draw an expandable farm overlay.
- Farm tier expansion spends local `wood` and `stone`.
- Pan-mode farm clicks plant starter crops; planted crops are interactable and
  harvest into the local resource inventory as `crop`.
- Decorative placement and erase operations do not overwrite active farm land.

Verified with the browser test harness (`262 passed, 0 failed`) and
`node netlify-build.mjs`.

### Starter Home Visual Integration

**Completed:** 2026-05-22

**Goal:** make every new player home feel warmer and more personal while
keeping the baseline `house` gameplay slot stable.

**Spec:** [`2026-05-22-starter-homes-and-building-progression.md`](specs/2026-05-22-starter-homes-and-building-progression.md)

**Status:** shipped the cleaned HiDream house as the active `house` sprite.

**Notes:**
- Replaced `assets/raw/house.png` and processed `assets/house.png`.
- Starter homes still use the existing `house` asset id, so store/catalog,
  placement, starter ownership, and future upgrade-slot logic stay stable.
- Kept the original gameplay footprint at 2x2 for now; functional home levels
  and market skins remain part of the next building progression pass.

Verified with the browser test harness (`262 passed, 0 failed`),
`node netlify-build.mjs`, and `git diff --check`.

### Crafting Building Unlocks

**Completed:** 2026-05-22

**Status:** shipped the building state, mixed material/CKB costs, Buildings HUD,
and first resource-yield effects.

**Goal:** let home-base buildings unlock useful capabilities.

**Spec:** [`2026-05-22-starter-homes-and-building-progression.md`](specs/2026-05-22-starter-homes-and-building-progression.md)

**Acceptance:**
- Every user starts with a baseline `home` building on their home plot.
- Add a standard local building set: `home`, `workbench`, `tool_rack`,
  `sawmill`, `stone_yard`, and `farm_storage`.
- Building unlocks and upgrades consume Wood, Stone, Crop, and a designated
  CKB amount so trading, loans, and treasury fee generation remain tied into
  home-base progression.
- Each building has an independent functional level for efficiency, capacity,
  recipe access, cooldowns, or automation.
- Future asset-market purchases attach as skins, variants, or specialist
  modules to standard building slots instead of replacing the baseline
  progression path.
- Capability state derives from owned/unlocked/placed standard buildings, not
  only from decorative props.
- First capability effects keep crypto ore rewards untouched: `sawmill`
  improves Wood harvests, `stone_yard` improves Stone harvests, and
  `farm_storage` improves Crop harvests.

Verified with the browser test harness (`269 passed, 0 failed`),
`node netlify-build.mjs`, and `git diff --check`.

### Workbench Recipes + Tool Rack Upgrades

**Completed:** 2026-05-22

**Status:** shipped recipe catalog, crafted prop outputs, owner-keyed
resource-specific tool tier state, local harvest modifiers, and Home Buildings
panel actions.

**Goal:** turn the newly unlocked `workbench` and `tool_rack` capability tiers
into player-facing crafting and tool progression.

**Spec:** [`2026-05-22-workbench-recipes-tool-rack-upgrades.md`](specs/2026-05-22-workbench-recipes-tool-rack-upgrades.md)

**Tool family spec:** [`2026-05-22-tool-family-progression.md`](specs/2026-05-22-tool-family-progression.md)

**Acceptance:**
- Add a small recipe catalog gated by `workbench` level.
- Add local pickaxe/tool tier state gated by `tool_rack` level.
- Recipes consume Wood, Stone, Crop, and CKB where they affect the economy.
- Tool upgrades apply conservative local-resource harvest modifiers first;
  crypto ore changes stay behind an explicit pricing decision.
- Home Buildings panel links clearly to the recipe/tool actions.

**Notes:**
- Workbench recipes currently craft local resources plus placeable `crate`,
  `stone_lantern`, and `stone_basin` props.
- Tool tiers currently add local Wood/Stone/Crop harvest bonuses only.
- Tool progression is now split into `pickaxe` for Stone, `woodaxe` for Wood,
  and `hoe_scythe` for Crop. Each line upgrades independently through the Tool
  Rack and old single-tier saves migrate across all three lines.

Verified with the browser test harness (`283 passed, 0 failed`),
`node netlify-build.mjs`, and `git diff --check`.

### Resource Asset Generation Pass

**Completed:** 2026-05-23

**Status:** shipped generated farm/resource/building/tool assets and gameplay
visual wiring.

**Goal:** generate and integrate farming/resource/crafting assets using
ComfyUI/Wyltek Studio models.

**Spec:** [`2026-05-22-standard-building-placement-assets.md`](specs/2026-05-22-standard-building-placement-assets.md)

**Prompt sheet:** [`2026-05-22-flux-asset-comparison-prompts.md`](specs/2026-05-22-flux-asset-comparison-prompts.md)

**Acceptance:**
- Generate harvestable tree, stone resource, optional gold material node, farm
  plot states, workbench, tool rack, sawmill, stone yard, farm storage, and
  pickaxe upgrade visuals.
- Use reference-image editing to preserve the current isometric voxel style.
- Process generated PNGs through the existing transparent asset pipeline.
- Keep standard building ids stable so generated art can replace temporary
  manifest sprites without changing progression or saves.

**Notes:**
- Added manifest entries for `workbench`, `tool_rack`, `sawmill`,
  `stone_yard`, and `farm_storage`; these now use selected generated PNGs.
- Unlocked standard buildings now appear in the property palette and can be
  placed without consuming or minting prop inventory.
- Added a Flux/Flux.2 comparison prompt sheet covering resource nodes, farm
  plot states, standard buildings, and pickaxe upgrade visuals.
- Generated the first local Flux.1 Schnell vs Flux.2 Klein comparison batch
  for 13 assets. Review sheet:
  `tmp/resource-asset-generation/contact-sheet.png`; individual outputs live
  under `tmp/resource-asset-generation/<asset-id>/`.
- Flux.2 comparison outputs looked misconfigured, so the current usable lane is
  Flux.1 Schnell. Added a refinement pass for `farm_plot_empty`,
  `farm_plot_starter_crop`, and pickaxe upgrade variants. Review sheet:
  `tmp/resource-asset-generation/refinement/contact-sheet.png`.
- `farm_plot_empty_v2` and `farm_plot_starter_crop_v2` were accepted as
  better candidates. Pickaxe variants need a standalone UI/marketplace base
  rather than a placeable tile asset. Generated six Flux.1 base candidates at
  `tmp/resource-asset-generation/pickaxe-base-candidates/contact-sheet.png`;
  do not generate reinforced/steel variants until one base is selected.
- Pickaxe base `pickaxe_base_c_threequarter` selected. Generated upgrade
  variants from that exact base at
  `tmp/resource-asset-generation/pickaxe-selected-variants/contact-sheet.png`.
- Plain img2img was rejected because variants stayed identical; adaptor was not
  configured correctly. Added a corrected Flux.2 `ReferenceLatent` edit pass at
  `tmp/resource-asset-generation/pickaxe-flux2-edit-variants/contact-sheet.png`.
  It differentiates material tiers, but still inherits the selected base's small
  support slab, so a cleaner no-slab base may be needed before final export.
- Generated fresh Flux.1 Schnell base candidates for all three tool families:
  pickaxe, woodaxe, and hoe/scythe. Review sheet:
  `tmp/resource-asset-generation/tool-base-candidates/contact-sheet.png`.
- Selected the B-side bases for all three tool families:
  `pickaxe_b_side`, `woodaxe_b_side`, and `hoe_b_side`.
- Expanded the tool asset ladder to six tiers: baseline, reinforced, steel,
  silver, gold, and diamond. Generated a Flux.2 `ReferenceLatent` approval
  sheet at
  `tmp/resource-asset-generation/selected-tool-variants/contact-sheet.png`.
  Once visuals are locked, table cost/yield tuning across CKB, Wood, Stone, and
  Crop.
- Diamond v1 variants were rejected for being too bumpy and bright blue.
  Generated smoother clear-glass diamond v2 comparisons at
  `tmp/resource-asset-generation/tool-diamond-v2/contact-sheet.png`.
- Promoted diamond v2 into the main selected tool ladder sheet and updated the
  generation manifest. Main review sheet:
  `tmp/resource-asset-generation/selected-tool-variants/contact-sheet.png`.
- Expanded live tool progression to six tiers per family and Tool Rack gating to
  level 5. Initial placeholder cost/yield table is documented in
  `docs/superpowers/specs/2026-05-22-tool-family-progression.md`.
- Generated three Flux.1 Schnell candidates each for `workbench`, `tool_rack`,
  `sawmill`, `stone_yard`, and `farm_storage`. Review sheet:
  `tmp/resource-asset-generation/building-candidates/contact-sheet.png`.
- Selected `workbench_c_sturdy`, `tool_rack_b_wall`, `sawmill_c_logs`,
  `stone_yard_c_crane`, and `farm_storage_c_harvest`. Installed transparent
  PNGs into `assets/raw/` and `assets/`, then wired the manifest to the stable
  building asset ids. Transparent preview sheet:
  `tmp/resource-asset-generation/building-candidates/installed/contact-sheet.png`.
- Generated three Flux.1 Schnell candidates each for `harvest_tree`,
  `stone_outcrop`, `gold_nugget_node`, and `farm_plot_ready_crop`. Review sheet:
  `tmp/resource-asset-generation/resource-candidates/contact-sheet.png`.
- Selected `harvest_tree_c_stump`, `stone_outcrop_b_stack`,
  `gold_nugget_node_a_matrix`, and `farm_plot_ready_crop_c_full`. Installed
  transparent PNGs into `assets/raw/` and `assets/`. Worldgen now uses
  `harvest_tree` and `stone_outcrop` for epoch-refreshing local Wood/Stone
  resources. Transparent preview sheet:
  `tmp/resource-asset-generation/resource-candidates/installed/contact-sheet.png`.
- Installed `farm_plot_empty_v2` and `farm_plot_starter_crop_v2` as transparent
  PNGs. Home farm cells now use generated empty plot terrain, planted starter
  crops use generated starter crop art, and ready crops automatically swap to
  `farm_plot_ready_crop`.
- Installed six transparent UI icon tiers for `pickaxe`, `woodaxe`, and
  `hoe_scythe` from the selected B-side bases and Flux.2 variant ladder.
  Current tool icons now render in the Home Buildings panel. Transparent
  preview sheet:
  `tmp/resource-asset-generation/farm-tool-installed/contact-sheet.png`.

Verified with the browser test harness (`288 passed, 0 failed`),
`node netlify-build.mjs`, and `git diff --check`.

## Next

### Wire Township + Interior + NPC + Audio Assets

**Status:** completed 2026-05-24.

**Goal:** plug the freshly generated assets into the running game.

**Asset inventory (already on disk):**
- `assets/boot/boot_screen.png` (wired in styles.css)
- `assets/township_{store,market,bank,gallery,community_hall}.png`
- `assets/interiors/interior_{store,market,bank,gallery,hall}.png`
- `assets/npc_{storekeeper,trader,bank_teller,gallery_curator,hall_keeper}.png`
- `assets/harvest_tree.png` (replaced with gnarled oak; previous version
  preserved at `assets/raw/harvest_tree.previous.png`)
- `assets/sfx/*.ogg` (31 clips covering harvest, mining, crafting,
  economy, travel, property, UI, player, epoch layers)
- `assets/music/*.ogg` (title_boot, mine_zone, property_zone,
  township_zone, interior_bed, high_value_sting)

**Acceptance:**
- Township buildings: register the 5 new asset ids in
  `src/assets/assetManifest.js`, swap `addObject(...)` calls in
  `src/township/townshipZone.js:52-55` from generic house ids to the new
  `township_*` ids, tune footprints per building.
- Interior backdrops: new `INTERIOR_BACKDROPS` map consumed by the
  building interior window component; drop the image as a CSS
  background-image on each scene.
- NPCs: pick a placement model (suggested: render NPC sprite inside the
  interior window over the backdrop, near the relevant counter); add a
  small NPC catalog and registry.
- SFX: add `loadCellshireSfx()` Promise.all to `src/ui/Audio.js` using
  the snippet emitted by `scripts/install_cellshire_sfx.py` and call it
  from boot. Add `play*` wrappers for the new clip ids and fire them
  from the harvest/crafting/economy/travel/UI hook sites.
- Music: new `src/ui/MusicManager.js` module that listens for map
  changes, loops the zone-appropriate track with 800ms crossfade, and
  plays `high_value_sting` as a one-shot over the active bed when a
  high-value epoch shift fires.
- Browser smoke verifies all clips load and play without 404.

### Economy Pricing Pass

**Status:** completed 2026-06-18.

**Spec:** [`2026-05-23-economy-pricing-pass.md`](specs/2026-05-23-economy-pricing-pass.md)

**Goal:** tune mined income, store prices, expansion costs, treasury fee flow,
bank loan offers, farming outputs, crafting costs, and tool upgrade costs into
a coherent early-game economy.

**Acceptance:** completed.

**Notes:**
- Trader fee increased to `2%`.
- First utility building unlocks and first reinforced tool upgrades were
  lowered so a normal first epoch can support roughly 2-3 visible upgrades when
  paired with starter resource/farm harvesting.
- Building upgrades now follow a builder-game tier gate: level `N` requires all
  relevant standard buildings at level `N-1`.
- First-session guardrail added: `10,000 CKB + 16 Wood + 6 Stone + 6 Crop`
  funds first property expansion, one cheap store prop, Tool Rack level 1, and
  one reinforced tool.
- Wood/stone/crop intake and first expansion/store/loan prices were softened to
  support that target without changing the `$20-$100` epoch mine clear budget.
- Bank loan and Trader fees now flow into visible house treasury entries. The
  Bank reserve keeps its `$100` prototype base reserve until playtest notes show
  treasury-only liquidity is viable.
- Starter crop pacing, Trader fee visibility, near-spawn Stone, and the
  first-session CKB/material spend are covered by deterministic browser tests.

Verified with the browser test harness (`416 passed, 0 failed`),
`node netlify-build.mjs`, and `git diff --check`.

### Progression Playtest Sweep

**Status:** deterministic sparse-seed smoke shipped.

**Goal:** use the newly guarded first-session path in the playable build before
changing more prices.

**Acceptance:**
- Start from a fresh local save and representative mine seed.
- Confirm the player can find at least two Stone nodes near the first mine
  spawn, harvest starter crops, buy the first property expansion, buy one cheap
  prop, unlock Tool Rack level 1, and upgrade Reinforced Woodaxe.
- Capture whether the remaining friction is Stone, Wood, Crop timer, CKB,
  travel/UI discoverability, or building placement activation.
- Do not change higher-tier costs without a concrete playtest note.

**Automated baseline:** added a sparse-seed first-session sweep over seed
`20260523`. It checks the runtime first-spawn resource summary, starter farm
harvest, first property expansion, one cheap store prop, Tool Rack level 1, and
Reinforced Woodaxe using the guarded `10,000 CKB + 16 Wood + 6 Stone + starter
crop` path.

**Remaining manual sweep:** run the same path in the playable UI to capture
travel, discoverability, placement activation, and interaction friction that a
module-level smoke cannot see.

**Progression playtest sweep verification saved on board:**
- Full browser harness: `417 passed, 0 failed`.

### First-Session Playability Proof

**Status:** completed 2026-06-23.

**Runbook:**
[`2026-06-19-first-session-playability-proof.md`](runbooks/2026-06-19-first-session-playability-proof.md)

**Goal:** prove the same guarded sparse-seed path in the playable UI, including
travel, discoverability, placement activation, and in-room/store/HUD flows that
module tests do not cover.

**Launch target:**

```txt
http://127.0.0.1:8767/?seed=20260523&character=miner&firstSessionGrant=1
```

**Acceptance:**
- Fresh local save or fresh browser profile.
- Guarded `10,000 CKB` smoke budget granted by explicit URL flag.
- Harvest enough nearby Wood and at least two Stone nodes.
- Harvest starter crops after one short grow cycle.
- Buy first property expansion and one cheap store prop.
- Unlock Tool Rack level 1.
- Place or confirm Tool Rack activation if required.
- Upgrade Reinforced Woodaxe.
- Classify any friction as `resource`, `timer`, `CKB`, `travel`,
  `discoverability`, or `placement activation`.

**Proof result:** passed with no friction notes. Headless Chrome drove the
playable UI on the guarded seed from a fresh profile. It booted into the public
mine, confirmed the `10,000 CKB` grant, harvested `16 Wood` and `6 Stone`,
traveled home, planted starter crops, harvested `6 Crop`, bought the first
property expansion and `Blue Railing`, unlocked and placed `Tool Rack` level 1,
and upgraded `Rusted Woodaxe` to `Reinforced Woodaxe`. Final state was
`50 CKB`, `2 Wood`, `0 Stone`, `1 Crop`, property tier `2`, one `Blue Railing`,
active `Tool Rack` level `1`, and Woodaxe tier `2`.

**Proof evidence:** `tmp/first-session-playability-proof.json` from
`tmp/first-session-playtest-runner.mjs` recorded the run locally. The only
browser warning was the existing Canvas2D `getImageData` readback performance
warning during asset loading; no uncaught exceptions were recorded.

## Backlog

### Asset Generation — Township + Interiors + NPCs + Audio Pass

**Completed:** 2026-05-23 (late).

**Goal:** populate the township map, interior windows, and full audio
layer with custom-generated assets while the gameplay tracks were on
hold.

**Pipeline:** local-first, all generation on the RX 7900 XTX via ROCm.
- SFX: Meta AudioGen medium (audiocraft 1.3.0) via
  `scripts/run_cellshire_sfx_audiogen_batch.py`. SA3 small-sfx produced
  buzzsaw artifacts; AudioGen medium was the working backend.
- Music: Stable Audio 3 medium via
  `scripts/run_cellshire_music_batch.py`. SA3 medium handled music well
  (real-time-ish generation; 150-second zone bed in ~21s).
- Visuals: Flux.1 Schnell GGUF on ComfyUI via
  `scripts/run_cellshire_township_visual_batch.py`. Same pipeline as the
  existing resource generation pass.

**Outputs:** 122 audition candidates total (92 SFX, 13 music, 51 visuals
across the three tiers + boot + harvest-tree redo). 39 winners
installed.

**Notes:**
- Torchcodec ROCm collision required a stub-package shadow at
  `scripts/_sa3_stubs/torchcodec/` plus a soundfile-backed
  `AudioEncoder` shim. The stub is required for any future SA3 run on
  this box and should not be removed.
- The previous harvest_tree variant was preserved at
  `assets/raw/harvest_tree.previous.png` in case the gnarled-oak swap
  needs reverting.
- Audition pages and install scripts live alongside the generation
  scripts under `scripts/`. Re-running any tier reuses the same catalog,
  so future regeneration passes are one command away.

### Bank Chain Design — v2 CKB Collateral Slice

**Status:** fixture collateral settlement implemented 2026-05-26. Script-
configured CCC bank collateral tx shape implemented 2026-05-27. Bank reserve
input/signing remains a follow-up.

**Spec:** [`2026-05-23-bank-chain-design.md`](specs/2026-05-23-bank-chain-design.md)

**Goal:** ship BORROW + REPAY for CKB-collateralised loans behind
`?chainBank=1&chainBankSubmit=ccc&chainBankCollateral=ckb`. SEIZE specified
but deferred to a backend worker. Preserves local prototype fallback.

**Acceptance:**
- `encodeDebt` round-trips deterministically.
- Collateral lock derives from player owner lock hash.
- BORROW/REPAY tx pure tests pass (principal, fee, due epoch, collateral
  pointer).
- CKB-collateralised loan borrows and repays through a prototype fixture path,
  recording pending CKB deltas over the chain wallet view.
- Fixture BORROW creates debt and locked-collateral records in the chain
  indexer boundary; fixture REPAY consumes those records and releases CKB
  collateral only on full repayment.
- `?chainBankSubmit=ccc` signs/submits a bank-loan receipt through JoyID using
  the existing CCC receipt pattern.
- `?chainBankSubmit=ccc-real` signs/submits the script-configured bank
  collateral tx shape through JoyID when the debt type, bank book lock,
  collateral lock, reserve lock, treasury lock, and optional cell deps are
  provided in URL params.
- Local Bank unchanged when flags are off.

**Notes:**
- Added `src/chain/debtCell.js`, `src/chain/bankTx.js`, and
  `src/bank/bankAdapter.js`.
- `?chainBank=1&chainBankCollateral=ckb` routes the Bank interior through the
  chain bank adapter. `?chainCurrencyCkb=<amount>` sets the fixture CKB wallet
  balance.
- Prototype submit now returns `chain-fixture-settled` when the fixture indexer
  accepts BORROW/REPAY, and the active loan stores the fixture debt-cell
  outpoint for REPAY.
- Bank pending deltas are netted per tx (`principal - collateral` on borrow,
  `collateral - owed` on repay), so chain wallet pending state clears cleanly
  when the indexed balance reaches the final settlement amount.
- `?chainBankSubmit=ccc` is receipt-only for now; it does not yet move real
  collateral under the final collateral lock script.
- Verification: browser test harness (`336 passed, 0 failed`),
  `node netlify-build.mjs`, `git diff --check`, and a flagged boot smoke with
  `?chainBank=1&chainBankCollateral=ckb&chainCurrencyCkb=30000`.
- Fixture collateral settlement addendum verified with the full browser
  harness (`368 passed, 0 failed`), `node netlify-build.mjs`, and
  `git diff --check`.
- Script-configured CCC bank collateral tx addendum verified with the full
  browser harness (`374 passed, 0 failed`), `node netlify-build.mjs`, and
  `git diff --check`.
- Bank reserve input/signer addendum verified with the full browser harness
  (`385 passed, 0 failed`), `node netlify-build.mjs`, `git diff --check`, and
  `python3 scripts/bank_reserve_signer_fixture.py --self-test`.
- End-to-end flagged smoke addendum verified with the full browser harness
  (`386 passed, 0 failed`), `node netlify-build.mjs`, `git diff --check`, and
  `python3 scripts/bank_reserve_signer_fixture.py --self-test`.

### Resource Model Boundary — Catalog Disjointness + Collateral Validator

**Status:** implemented 2026-05-24.

**Spec:** [`2026-05-23-resource-model-boundary.md`](specs/2026-05-23-resource-model-boundary.md)

**Goal:** lock in raw materials (Wood/Stone/Crop/Herb/Gold material) as
local-only, with crafted props/skins/tools crossing the chain boundary
through Open Asset Standard cells. Documentation-heavy card; small
validator/test surface only.

**Acceptance:**
- Test asserts `RESOURCE_CATALOG` ids and `CURRENCY_CATALOG` ids do not
  overlap.
- Marketplace listing path rejects raw-material ids with a clear error.
- Bank collateral validator rejects raw-material ids.

Verified with the browser test harness (`294 passed, 0 failed`),
`node netlify-build.mjs`, and `git diff --check`.

### Lazy-Mint Mining Cells — First Slice

**Status:** first fixture + HTTP indexer boundary implemented 2026-05-24.

**Spec:** [`2026-05-23-lazy-mint-mining-cells.md`](specs/2026-05-23-lazy-mint-mining-cells.md)

**Goal:** layer BIRTH/DECREMENT/DEPLETE ore cell lifecycle onto the existing
mining adapter, with a local fixture indexer and deterministic ore type-script
args, behind `?chainMining=1&chainMiningBirth=lazy`.

**Acceptance:**
- `encodeOreArgs` round-trips every entry in `oreCatalog.js` deterministically.
- Local fixture indexer reports `untouched` → `live` → `depleted` → `orphaned`.
- BIRTH/DEPLETE tx shapes pass pure tests.
- Mining an untouched `coal_seam` submits a BIRTH-shaped tx through the
  existing chain adapter path; local capacity reconciles on success.
- Local mining path unchanged when flags are off.

**Notes:**
- Added deterministic 22-byte ore args and local ore indexer lifecycle state.
- Added BIRTH, DECREMENT, and DEPLETE mining tx builders with receipt witnesses.
- `?chainMining=1&chainMiningBirth=lazy` now routes supported ores through
  lazy BIRTH for untouched fixture cells, then DECREMENT/DEPLETE for live cells.
- `?chainMiningIndexer=http` or `?chainMiningIndexerUrl=<base url>` swaps the
  fixture indexer for an HTTP ore indexer using `GET <base>/ore/<ore_id>`.
- Stale HTTP indexer reads stop before submit so the local optimistic hit is
  restored instead of sending an uncertain tx.
- CCC mining receipt payloads now accept lazy BIRTH txs with no input ore cell.
- Real ore script deps, treasury subsidy cells, and deployed on-chain
  validation remain deferred.

Verified with the browser test harness (`317 passed, 0 failed`),
`node netlify-build.mjs`, `git diff --check`, and a flagged boot smoke with
`?chainMining=1&chainMiningBirth=lazy&chainMiningIndexerUrl=...`.

### Currency On-Chain — sUDT Read Slice

**Status:** read-only fixture slice plus local/chain wallet source switch,
pending overlay, chain Trader/Store/Marketplace prototypes, and CCC receipt
submits implemented 2026-05-25.

**Spec:** [`2026-05-23-currency-on-chain-sudt.md`](specs/2026-05-23-currency-on-chain-sudt.md)

**Goal:** introduce a chain currency adapter that resolves Cellshire balances
through deterministic sUDT type-args, starting with a read-only `bch` balance
surface behind `?chainCurrency=1`.

**Acceptance:**
- `currencyTypeId(currencyId)` is deterministic and unique per currency.
- Local mode behavior is unchanged; existing tests stay green.
- With `?chainCurrency=1`, the Inventory HUD reads `bch` balance from an
  indexer fixture; other currencies fall back to local.
- Pending/stale state is visible when the indexer fixture is mocked offline.
- No mint path is enabled yet — the slice is read-only.

**Notes:**
- Economy HUD now exposes a compact source switch when chain currency mode is
  active, cycling between `Local wallet` and `Chain wallet`.
- `?walletSource=local|chain` or `?inventorySource=local|chain` selects the
  initial source; user selection persists locally.
- Store, Marketplace, expansion, and crafting spends still use local balances
  unless their explicit chain flags are enabled.
- Chain mining rewards now record owner-keyed pending deltas. The Chain wallet
  view applies pending deltas over indexed balances and clears them once the
  indexer catches up.
- Economy HUD labels pending chain state as `Chain wallet · pending`.
- `?chainTrader=1` switches Trader to a chain-shaped prototype swap path.
  The Trader panel reads chain wallet balances, builds a
  `cellshire_trader_swap_tx`, and records pending `-source` / `+target`
  deltas without mutating local inventory.
- Default prototype chain Trader now applies fixture settlement against indexed
  wallet balances: source balance decreases or is spent to zero, target balance
  is created/updated, and pending deltas clear after the fixture indexer catches
  up.
- `?chainTraderSubmit=ccc` now signs/submits a compact
  `cellshire.trader.swap` receipt through CCC/JoyID. Full real sUDT settlement
  remains deferred to the Cellswap/settlement slice.
- `?chainStore=1` switches General Store purchases to the chain wallet view,
  builds `cellshire_store_purchase_tx`, spends fixture-indexed CKB, grants the
  bought prop, and lets pending CKB clear once the fixture indexer catches up.
  Store prop receipts are fixture/local for now; Open Asset minting remains a
  later chain asset slice.
- `?chainStoreSubmit=ccc` now signs/submits a compact
  `cellshire.store.purchase` receipt through CCC/JoyID. Full real vendor
  settlement and Open Asset prop minting remain deferred.
- `?chainMarketplace=1` switches Marketplace buys to the chain wallet view,
  builds `cellshire_marketplace_purchase_tx`, spends fixture-indexed CKB,
  grants the bought prop/skin locally, closes the listing, and lets pending CKB
  clear once the fixture indexer catches up. Listing and cancel remain local
  wallet-gated actions for this slice.
- `?chainMarketplaceSubmit=ccc` now signs/submits a compact
  `cellshire.marketplace.purchase` receipt through CCC/JoyID. Full real
  marketplace settlement and Open Asset transfer remain deferred.

Verified with the browser test harness (`325 passed, 0 failed`),
`node netlify-build.mjs`, `git diff --check`, and a boot smoke with
`?chainCurrency=1&walletSource=chain&chainTrader=1`.
CCC Trader receipt addendum verified with focused CCC/Trader module tests
(`24 passed, 0 failed`), `node netlify-build.mjs`, and `git diff --check`.
Trader fixture settlement addendum verified with focused
CCC/Trader/currency-adapter module tests (`33 passed, 0 failed`),
`node netlify-build.mjs`, and `git diff --check`.
Chain Store fixture purchase addendum verified with focused
store/currency module tests (`22 passed, 0 failed`), `node netlify-build.mjs`,
and `git diff --check`.
CCC Store receipt addendum verified with focused CCC/store module tests
(`35 passed, 0 failed`), `node netlify-build.mjs`, and `git diff --check`.
Chain Marketplace fixture buy addendum verified with focused
marketplace/store/trader/currency module tests (`30 passed, 0 failed`),
`node netlify-build.mjs`, and `git diff --check`.
CCC Marketplace receipt addendum verified with the full browser harness
(`364 passed, 0 failed`), `node netlify-build.mjs`, and `git diff --check`.

### Pickaxe Upgrade Progression

**Completed:** 2026-05-31

**Status:** resource tool progression shipped in `Workbench Recipes + Tool
Rack Upgrades`; ore-specific mining balance pass now implemented.

**Goal:** give players long-term mining/harvesting progression without
over-inflating crypto rewards.

**Acceptance:**
- Add local tool tier state and upgrade recipes. Shipped through Tool Rack.
- Apply conservative modifiers to resource harvesting and ore extraction.
- Keep multiplier constants isolated for future economy tuning.

**Notes:**
- Pickaxe tiers 1-2 extract one ore capacity chunk per mining action, tiers
  3-4 extract two, and tiers 5-6 extract three.
- Ore extraction spends the matching number of capacity chunks from the ore's
  existing remaining USD value. It accelerates mining but does not increase
  the base value stored in an ore cell.
- Legacy and lazy chain mining tx builders preserve correct before/after
  capacity when a tool extracts multiple chunks in one action.

Verified with the browser test harness (`396 passed, 0 failed`),
`node netlify-build.mjs`, and `git diff --check`.

### Cloudflare Custom-Domain Cache Mitigation

**Completed:** 2026-05-31

**Status:** release blocker mitigated; Cloudflare zone-header cleanup remains a
non-blocking follow-up.

**Goal:** prevent stale custom-domain JavaScript/CSS from blocking production
deploys while Cloudflare keeps overriding the repo `_headers` policy.

**Acceptance:**
- Keep `/` revalidating on every load so each deploy can publish fresh asset
  URLs.
- Publish a content-hashed ES-module tree and make production HTML load that
  tree.
- Add a cache policy for hashed module paths.
- Verify `cellshire.com` loads the deployed hashed module graph without module
  failures.

**Notes:**
- `netlify-build.mjs` now writes `dist/src-<hash>/` and rewrites
  `index.html` to load `src-<hash>/main.js?v=<hash>`.
- `styles.css` receives a content-hash query in production HTML.
- `_headers` marks `/src-*/*` as immutable while preserving the original
  `/src/*` revalidation rule for compatibility.
- The deployed production build at `https://4dfc4c29.cellshire.pages.dev`
  serves `https://cellshire.com/` with the hashed module script tag.
- The underlying custom-domain browser TTL override is still visible:
  `https://cellshire.com/src-246c43faaf15/main.js` returns `200` with
  `Cache-Control: public, max-age=14400, must-revalidate`.

Verified with `node netlify-build.mjs`, local `dist/` browser smoke, live
custom-domain browser smoke, Cloudflare Pages deployment verification, and
`git diff --check`.

## Needs Decision

- Property topology: dedicated own-map vs subregion of a shared map.
- ~~First on-chain mining path: real testnet cells vs mock/indexed dev cells.~~
  Resolved 2026-05-23: lazy birth on first mine, deterministic ore_id args,
  first-mempool-wins race resolution with indexer canonicalisation, optional
  treasury subsidy. See
  [`2026-05-23-lazy-mint-mining-cells.md`](specs/2026-05-23-lazy-mint-mining-cells.md).
- ~~Currency model: sUDT per ore, custom typed cells, or hybrid.~~ Resolved
  2026-05-23: sUDT with one Cellshire issuance script and twelve
  deterministic per-currency type-args. CKB stays native capacity. See
  [`2026-05-23-currency-on-chain-sudt.md`](specs/2026-05-23-currency-on-chain-sudt.md).
- Epoch modifier algorithm and high-value epoch frequency.
- ~~Store integration order: Trader first, General Store first, or wallet inventory first.~~
  Resolved 2026-06-23: General Store first, then wallet inventory readback,
  then Trader, then Marketplace. See
  [`2026-05-23-currency-on-chain-sudt.md`](specs/2026-05-23-currency-on-chain-sudt.md).
- Save-state storage: CKBFS V3 vs custom minimum-capacity state cell.
- Township topology: one communal plane for all players vs owner/epoch-sharded
  township instances.
- House treasury policy: which fees accrue, who controls treasury spending, and
  what can be automated safely.
- ~~Bank chain design: whether the local loan prototype becomes wallet-backed debt
  cells, collateralized positions, or a hybrid.~~ Resolved 2026-05-23:
  three-phase plan — local prototype (shipped) → collateralised debt cells
  (v2, CKB collateral first) → peer-to-peer lending (v3). See
  [`2026-05-23-bank-chain-design.md`](specs/2026-05-23-bank-chain-design.md).
- ~~Resource model: keep wood/stone/gold as local gameplay materials vs cell-backed
  resources.~~ Resolved 2026-05-23: raw materials stay local-only; crafted
  outputs cross the boundary via Open Asset Standard. See
  [`2026-05-23-resource-model-boundary.md`](specs/2026-05-23-resource-model-boundary.md).
- ~~Gold material: separate local crafting material vs reuse the existing
  `gold_ore`/BTC crypto mapping.~~ Resolved 2026-05-23: separate. `gold`
  (resource) and `gold_ore` (mined → BTC sUDT) live in disjoint catalogs.
  See [`2026-05-23-resource-model-boundary.md`](specs/2026-05-23-resource-model-boundary.md).
- Farm timers: real elapsed time vs epoch-bucketed vs action-count based.
- Crafting unlocks: capability from owned buildings, placed buildings, or both.
- Tool upgrades: which pickaxe effects are safe before economy pricing is tuned.
