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
