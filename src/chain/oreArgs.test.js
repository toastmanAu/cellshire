import { describe, expect, it } from '../test/harness.js';
import { ORE_CATALOG } from '../mining/oreCatalog.js';
import { decodeOreArgs, encodeOreArgs } from './oreArgs.js';

describe('ore args', () => {
    it('round-trips every ore catalog type through fixed-width args', () => {
        for (const oreType of Object.keys(ORE_CATALOG)) {
            const args = encodeOreArgs({ epoch: '14455', mapId: 'mine:14455', gx: 5, gy: 7, oreType });
            expect(/^0x[0-9a-f]{44}$/.test(args)).toBe(true);
            const decoded = decodeOreArgs(args);
            expect(decoded.epoch).toBe('14455');
            expect(decoded.gx).toBe(5);
            expect(decoded.gy).toBe(7);
            expect(decoded.oreType).toBe(oreType);
            expect(encodeOreArgs(decoded)).toBe(args);
        }
    });

    it('keeps ore type args unique by position and ore type', () => {
        const a = encodeOreArgs({ epoch: '14455', mapId: 'mine:14455', gx: 5, gy: 7, oreType: 'coal_seam' });
        const b = encodeOreArgs({ epoch: '14455', mapId: 'mine:14455', gx: 6, gy: 7, oreType: 'coal_seam' });
        const c = encodeOreArgs({ epoch: '14455', mapId: 'mine:14455', gx: 5, gy: 7, oreType: 'iron_ore' });
        expect(new Set([a, b, c]).size).toBe(3);
    });
});
