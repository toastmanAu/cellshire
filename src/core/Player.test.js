import { describe, it, expect } from '../test/harness.js';
import { Player } from './Player.js';

describe('Player.facing', () => {
    it('defaults to down-right on a freshly-spawned player', () => {
        const p = new Player({ gx: 5, gy: 5 });
        expect(p.facing).toBe('down-right');
    });

    it('faces up-left when the next step heads west', () => {
        const p = new Player({ gx: 5, gy: 5 });
        p.setPath([{ gx: 4, gy: 5 }]);   // west step
        expect(p.facing).toBe('up-left');
    });

    it('faces the current screen direction for each cardinal grid step', () => {
        expect(stepFacing({ gx: 5, gy: 5 }, { gx: 6, gy: 5 })).toBe('down-right');
        expect(stepFacing({ gx: 5, gy: 5 }, { gx: 5, gy: 6 })).toBe('down-left');
        expect(stepFacing({ gx: 5, gy: 5 }, { gx: 4, gy: 5 })).toBe('up-left');
        expect(stepFacing({ gx: 5, gy: 5 }, { gx: 5, gy: 4 })).toBe('up-right');
    });

    it('flips back to up-right when the next step heads north', () => {
        const p = new Player({ gx: 5, gy: 5 });
        p.setPath([{ gx: 4, gy: 5 }]);   // west — facing becomes up-left
        while (p.isMoving()) p.tick(0.1); // tick to real arrival at (4, 5)
        expect(p.gx).toBe(4);             // confirm arrival before next step
        expect(p.gy).toBe(5);
        p.setPath([{ gx: 4, gy: 4 }]);   // north step — should face up-right
        expect(p.facing).toBe('up-right');
    });

    it('preserves last facing while idle', () => {
        const p = new Player({ gx: 5, gy: 5 });
        p.setPath([{ gx: 4, gy: 5 }]);   // west — facing becomes up-left
        expect(p.facing).toBe('up-left');
        p.setPath([]);                    // stop
        expect(p.facing).toBe('up-left');
    });

    it('advances the walk cycle only while moving', () => {
        const p = new Player({ gx: 5, gy: 5 });
        expect(p.walkCycle).toBe(0);
        p.tick(0.1);
        expect(p.walkCycle).toBe(0);
        p.setPath([{ gx: 6, gy: 5 }]);
        p.tick(0.1);
        expect(p.walkCycle > 0).toBe(true);
    });
});

function stepFacing(from, to) {
    const p = new Player(from);
    p.setPath([to]);
    return p.facing;
}
