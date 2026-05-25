import { describe, expect, it } from '../test/harness.js';
import {
    amountToBaseUnits,
    amountToU128LeBytes,
    baseUnitsToAmount,
    u128LeBytesToAmount,
} from './udtBalance.js';

describe('sUDT balance helpers', () => {
    it('round-trips display amounts through u128 little-endian bytes', () => {
        const bytes = amountToU128LeBytes(12.34567891);
        expect(bytes.length).toBe(16);
        expect(u128LeBytesToAmount(bytes)).toBe(12.34567891);
    });

    it('converts display amounts to 1e-8 base units', () => {
        expect(String(amountToBaseUnits(1.25))).toBe('125000000');
        expect(baseUnitsToAmount(125000000n)).toBe(1.25);
    });
});
