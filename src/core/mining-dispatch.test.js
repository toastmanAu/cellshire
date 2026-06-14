/**
 * Regression test for the kanban "first walk-arrival mine appeared to
 * fire twice in smoke test" bug. We can't instantiate the full Game
 * class in Node (it needs a real canvas), so we replicate just the
 * dispatch state machine: a Player with a path, plus the frame loop's
 * two-step `if isMoving → tick; if !isMoving && pendingInteract →
 * interact` pattern. If the bug is here, the test fires interact
 * twice. If it isn't here, the test guards against future regression.
 */

import { describe, it, expect } from '../test/harness.js';
import { Player } from './Player.js';
import { OreState } from '../mining/OreState.js';

/** Simulate Game._loop until the player is idle, counting interact calls. */
function runDispatch(player, pendingInteract, onInteract, maxFrames = 1000) {
    let pi = pendingInteract;
    for (let i = 0; i < maxFrames; i++) {
        if (player.isMoving()) {
            player.tick(0.1);
        }
        if (!player.isMoving() && pi) {
            const { gx, gy } = pi;
            pi = null;
            onInteract(gx, gy);
        }
        // Loop exit: player is idle AND we've consumed any pending
        // interact. Otherwise an unbounded sit-still doesn't terminate.
        if (!player.isMoving() && pi === null) {
            // Continue one more iteration just to confirm no second
            // fire — but if we already fired and pi is null, the next
            // iteration is a no-op and we can exit.
            return i;
        }
    }
    throw new Error('dispatch loop did not terminate within ' + maxFrames + ' frames');
}

describe('mining dispatch (frame-loop simulation)', () => {
    it('fires onInteract exactly once when the player walks to an ore', () => {
        const player = new Player({ gx: 3, gy: 3 });
        // Path: walk from (3,3) to (4,5) — three steps east/south.
        player.setPath([{ gx: 3, gy: 4 }, { gx: 4, gy: 4 }, { gx: 4, gy: 5 }]);
        const pendingInteract = { gx: 5, gy: 5 };

        let calls = 0;
        runDispatch(player, pendingInteract, () => { calls++; });

        expect(calls).toBe(1);
    });

    it('fires onInteract exactly once when player is already adjacent (zero-length path)', () => {
        const player = new Player({ gx: 4, gy: 5 });
        // Click ore at (5,5) while standing at (4,5) — adjacent walkable
        // is the player's own cell → findPath returns [] → setPath([])
        // → player is idle immediately, pendingInteract still queued.
        player.setPath([]);
        const pendingInteract = { gx: 5, gy: 5 };

        let calls = 0;
        runDispatch(player, pendingInteract, () => { calls++; });

        expect(calls).toBe(1);
    });

    it('decrements OreState.capacityRemaining by exactly one per mine call', () => {
        const state = OreState.fromAsset('iron_ore', () => 0.5);
        const before = state.capacityRemaining;
        const result = state.mine(() => 0.5);
        expect(result).toBeTruthy();
        expect(state.capacityRemaining).toBe(before - 1);
    });

    it('multiplies ore yield by the current epoch modifier', () => {
        const state = OreState.fromAsset('iron_ore', () => 0.5);
        const result = state.mine(() => 0, { yieldMultiplier: 3 });
        expect(result.currency).toBe('erg');
        expect(result.baseValueUsd).toBe(25);
        expect(result.valueUsd).toBe(75);
        expect(result.amount).toBe(265.98008341);
        expect(result.yieldMultiplier).toBe(3);
    });

    it('can extract multiple ore capacity chunks without increasing total base value', () => {
        const state = new OreState('iron_ore', 5, 5, { totalValueUsd: 50, remainingValueUsd: 50 });

        const first = state.mine(() => 0, { capacityPerHit: 3 });
        const second = state.mine(() => 0, { capacityPerHit: 3 });

        expect(first.capacitySpent).toBe(3);
        expect(first.baseValueUsd).toBe(30);
        expect(first.depleted).toBe(false);
        expect(second.capacitySpent).toBe(2);
        expect(second.baseValueUsd).toBe(20);
        expect(second.depleted).toBe(true);
        expect(state.capacityRemaining).toBe(0);
    });

    it('full pipeline: one click → one mine → capacity drops by exactly one', () => {
        const player = new Player({ gx: 3, gy: 3 });
        const state = OreState.fromAsset('iron_ore', () => 0.5);
        const startCapacity = state.capacityRemaining;

        player.setPath([{ gx: 3, gy: 4 }, { gx: 4, gy: 4 }, { gx: 4, gy: 5 }]);
        const pendingInteract = { gx: 5, gy: 5 };

        runDispatch(player, pendingInteract, () => { state.mine(() => 0.5); });

        expect(state.capacityRemaining).toBe(startCapacity - 1);
    });
});
