# General Store Vendor Script Path

Status: implementation note for the local-first General Store MVP.

## v1 Local Behavior

- The local store uses a fixed game-authored catalog.
- Buying spends local CKB and adds one local prop-inventory instance.
- Placing a bought prop in the property zone consumes one instance.
- Erasing a bought prop returns one instance to local prop inventory.
- Starter property assets remain unlimited local fixtures.

## Chain Path

The live General Store should be a script vendor, not an off-chain admin
grant:

- Vendor cells lock game-owned stock or mint permission under a Cellshire
  vendor lock.
- The buyer transaction consumes payment CKB/UDT cells and one vendor offer
  cell.
- The transaction creates a prop cell locked to the buyer's JoyID lock.
- The prop cell data stores the asset id, schema version, rarity, and any
  render-rule hash needed by the open asset standard.
- Placing the prop consumes the wallet prop cell and recreates it as a
  placed-prop cell bound to the property map id and grid position.
- Erasing the prop reverses that state back into an unplaced prop cell.

This keeps General Store purchases in Tier 1 inherent state: the buy,
place, and erase transactions are the save records.
