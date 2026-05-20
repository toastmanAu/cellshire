# Player Marketplace Cellswap + Spore Path

Status: implementation note for the local-first Player Marketplace slice.

## Local Prototype

- Listings are unique cell-shaped records with `listing id`, `cell id`,
  `item type`, `asset id`, seller, rarity, and price.
- Seed listings make browse mode useful offline.
- Player listings consume one locally owned prop instance.
- Buying a prop listing spends local CKB and adds one owned prop instance.
- Canceling a player listing returns the prop instance.
- Without a connected wallet identity, the Marketplace is browse-only.

## Chain Flow

The live marketplace should use Spore-compatible item cells and Cellswap-style
atomic settlement:

- A listed prop/skin is a unique Spore cell locked by a listing script.
- Listing data includes asking currency, amount, seller lock hash, asset
  schema version, and render-rule hash.
- Buying consumes buyer payment cells and the listing cell in one transaction.
- Outputs pay the seller and recreate the item cell under the buyer JoyID lock.
- Canceling consumes the listing cell and recreates the item cell under the
  seller JoyID lock.
- Placed props use the same item cell identity but move between unplaced and
  placed states by recreating the cell with property map id and grid position.

This keeps marketplace inventory in Tier 1 inherent state: listings, buys,
cancels, place, and erase operations are all chain facts rather than resume
state.
