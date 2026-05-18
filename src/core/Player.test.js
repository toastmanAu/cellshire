import { describe, it, expect } from '../test/harness.js';
import { Player } from './Player.js';

describe('Player.facing', () => {
    it('defaults to right on a freshly-spawned player', () => {
        const p = new Player({ gx: 5, gy: 5 });
        expect(p.facing).toBe('right');
    });

    it('flips to left when the next step heads west or south', () => {
        const p = new Player({ gx: 5, gy: 5 });
        p.setPath([{ gx: 4, gy: 5 }]);   // west step
        expect(p.facing).toBe('left');
    });

    it('flips back to right when the next step heads east or north', () => {
        const p = new Player({ gx: 5, gy: 5 });
        p.setPath([{ gx: 4, gy: 5 }]);   // west — facing becomes left
        while (p.isMoving()) p.tick(0.1); // tick to real arrival at (4, 5)
        expect(p.gx).toBe(4);             // confirm arrival before next step
        expect(p.gy).toBe(5);
        p.setPath([{ gx: 5, gy: 4 }]);   // north step — should flip right
        expect(p.facing).toBe('right');
    });

    it('preserves last facing while idle', () => {
        const p = new Player({ gx: 5, gy: 5 });
        p.setPath([{ gx: 4, gy: 5 }]);   // west — facing becomes left
        expect(p.facing).toBe('left');
        p.setPath([]);                    // stop
        expect(p.facing).toBe('left');
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
