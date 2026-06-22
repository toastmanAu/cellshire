# First-Session Playability Proof

Target set June 19, 2026.

## Goal

Prove the guarded first-session path in the playable UI before tuning more
prices.

## Launch

Use a fresh browser profile or clear Cellshire local storage, then launch the
local app with the sparse representative seed:

```txt
http://127.0.0.1:8767/?seed=20260523&character=miner&firstSessionGrant=1
```

`?seed=20260523` pins the same sparse-spawn world covered by the automated
progression smoke. `character=miner` skips the first-load character picker so
the playtest starts directly in the world. `firstSessionGrant=1` grants the
guarded `10,000 CKB` first-session budget used by the automated economy smoke;
normal play is unchanged without this explicit flag.

## Done Criteria

- Player reaches the public mine on seed `20260523`.
- Player starts with the guarded `10,000 CKB` smoke budget.
- Player can find and harvest enough nearby Wood and at least two Stone nodes.
- Starter farm harvest provides enough Crop after one short grow cycle.
- Player buys the first property expansion.
- Player buys one cheap General Store prop.
- Player unlocks Tool Rack level 1.
- Player places or confirms Tool Rack activation if the UI requires placement.
- Player upgrades Reinforced Woodaxe.

## Friction Notes

Classify any failure or rough edge as one of:

- `resource`
- `timer`
- `CKB`
- `travel`
- `discoverability`
- `placement activation`

Do not tune higher-tier costs until the note identifies a concrete friction
source.

## Proof Run

Completed June 23, 2026 against:

```txt
file:///home/phill/cellshire/index.html?seed=20260523&character=miner&firstSessionGrant=1
```

Evidence was captured with the local headless Chrome UI runner in
`tmp/first-session-playability-proof.json` and `tmp/first-session-playtest-runner.mjs`
(both ignored local artifacts).

Result: passed with no friction notes.

- Booted directly into the public mine with the Miner character and the guarded
  `10,000 CKB` first-session grant.
- Harvested `16 Wood` from four reachable nearby wood nodes.
- Harvested `6 Stone` from two reachable nearby stone nodes.
- Traveled home through the Property HUD.
- Planted four starter crop beds and harvested `6 Crop` from two ready plots
  after the short grow cycle.
- Bought the first property expansion from the Property HUD.
- Bought one cheap General Store prop: `Blue Railing`.
- Unlocked `Tool Rack` level 1 from the Buildings HUD.
- Confirmed placement activation friction is handled: the Woodaxe upgrade was
  disabled before placing the unlocked Tool Rack, then enabled after placing it
  at `(6, 6)`.
- Upgraded `Rusted Woodaxe` to `Reinforced Woodaxe`.

Final proof state:

```txt
CKB: 50
Wood: 2
Stone: 0
Crop: 1
Property tier: 2
Blue Railing owned: 1
Tool Rack level: 1, active on property
Woodaxe tier: 2
```

The browser console had no uncaught exceptions. Chrome only reported the
existing Canvas2D `getImageData` readback performance warning during asset
loading.
