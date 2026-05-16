# Player Facing — Design Spec

**Status:** approved 2026-05-16

## Goal

Make the player sprite face the direction of travel, so walking
left-on-screen shows a mirrored sprite instead of a sprite that's
always facing the same way regardless of motion. v0 ships two
distinct facings (right / left) via a runtime horizontal flip on a
single PNG per character.

## Non-goals

- Four-direction facings (NE / NW / SE / SW). Two facings is the
  kanban's stated minimum and avoids 2-4× asset-gen multiplication.
- Walk-cycle animation. Static facing only.
- Idle-pose animation.
- Diagonal-movement heading. Paths are cardinal-only today (A* on
  4-neighbours), so the four grid cardinals are the only inputs.

## Approved decisions

| Decision | Choice |
|---|---|
| Number of facings | 2 — right, left |
| Mirror mechanism | Runtime `ctx.scale(-1, 1)` on the PNG draw |
| Default facing | `'right'` (canonical PNG orientation) |
| Idle behaviour | Keep last facing |
| Update cadence | Once per step (in `_advanceTarget`) |
| Cube fallback | Unchanged — already symmetric |

## Heading projection

The grid is isometric. `cellToScreen(gx, gy)` projects with
`screenX = (gx - gy) * (TW / 2)`. So the screen-x sign of a grid
step `(dgx, dgy)` is `sign(dgx - dgy)`. For the four cardinal grid
steps the paths produce:

| Grid step | dgx − dgy | Screen direction | Facing |
|---|---|---|---|
| `(+1,  0)` east  | `+1` | right | `'right'` |
| `( 0, -1)` north | `+1` | right | `'right'` |
| `(-1,  0)` west  | `-1` | left  | `'left'`  |
| `( 0, +1)` south | `-1` | left  | `'left'`  |

NE and SE both land on `'right'`; NW and SW both land on `'left'`.
That's the "treats NE and SE the same" caveat accepted at brainstorm
time — fine for v0.

## File changes

### `src/core/Player.js`

Add a `facing` field on `Player` initialised to `'right'`. Update
it inside `_advanceTarget()` at the moment a new target is set:

```js
_advanceTarget() {
    if (this.path.length === 0) {
        this._target = null;
        return;
    }
    const next = this.path.shift();
    const c = cellCenter(next.gx, next.gy);
    const dgx = next.gx - this.gx;
    const dgy = next.gy - this.gy;
    if (dgx !== dgy) {
        this.facing = (dgx - dgy) >= 0 ? 'right' : 'left';
    }
    this._target = { gx: next.gx, gy: next.gy, x: c.x, y: c.y };
}
```

The `dgx !== dgy` guard skips the no-op case (the player is told to
"walk" to the cell they're already on — shouldn't happen in normal
flow but keeps `facing` from being clobbered with a meaningless
update if it does).

### `src/core/Player.test.js` (new)

Four focused tests:

1. **Default facing is `'right'`** on a freshly-spawned player.
2. **Walking left flips facing.** Set a path that goes west, advance,
   assert `facing === 'left'`.
3. **Walking right back flips it again.** Set a path that goes east
   from there, advance, assert `facing === 'right'`.
4. **Idle preserves last facing.** After (2), call `setPath([])`,
   assert `facing` is still `'left'`.

Tests run in the same browser harness as the picker tests. `Player.js`
imports `config.js` and `IsoGrid.js`; both are pure modules (no DOM)
so the test file also runs in Node when needed.

### `src/core/Renderer.js`

Wrap the PNG draw inside `_drawPlayer` with a left-facing flip:

```js
if (player.facing === 'left') {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(
        src,
        -(player.x + asset.anchorX),
        drawY,
        asset.width,
        asset.height,
    );
    ctx.restore();
} else {
    ctx.drawImage(src, drawX, drawY, asset.width, asset.height);
}
```

**Anchor math derivation.** After `ctx.scale(-1, 1)`, calling
`drawImage(src, x_arg, ...)` places pixels such that the image's
anchor (originally at `anchorX` from the source's left edge) lands
at screen-x `= -x_arg - anchorX`. Setting that equal to `player.x`
gives `x_arg = -(player.x + anchorX)`. This is symmetric with the
unflipped `drawX = player.x - anchorX` and works for *any* anchor
position, not just centred sprites.

Cube branch unchanged — the placeholder is left-right symmetric, so
flipping it would be a no-op visually.

### `tests.html`

One new line in the alphabetised import block:

```diff
        import './src/characters/catalog.test.js';
+       import './src/core/Player.test.js';
        import './src/lib/safeStorage.test.js';
        ...
```

## Edge cases

- **Player spawned facing right, never moves.** `facing` stays
  `'right'` (initial value). Correct.
- **Player walks west, then sits idle.** `facing` becomes `'left'`
  and stays `'left'`. Correct (matches "alive" idle convention).
- **PNG hasn't loaded yet (asset 404).** Renderer falls through to
  the cube branch, which doesn't read `facing`. No visual effect
  from facing while in fallback — symmetric cube renders identically.
- **Diagonal pathing (if introduced later).** `sign(dgx - dgy)` still
  produces a sensible right/left answer for diagonal cardinals — but
  this is out of scope for v0 and isn't tested.

## Testing constraint

PNGs don't exist yet. The unit tests verify the *logic* (`Player.facing`
transitions). Visual verification requires:

1. Generate one or more character PNGs (separate kanban item).
2. Run the app with `?character=miner`.
3. Walk the player left and right and confirm the sprite mirrors.

Phill performs (1) in Wyltek Studio per `docs/CHARACTER-PROMPTS.md`.

## Migration / cleanup

None. New field on `Player`, new module of tests, additive change
to `Renderer._drawPlayer`. No existing behaviour modified.
