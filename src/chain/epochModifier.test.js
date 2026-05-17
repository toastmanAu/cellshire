import { describe, it, expect } from '../test/harness.js';
import {
    describeEpochModifier,
    epochModifier,
    epochModifierBucket,
    isHighValueEpoch,
} from './epochModifier.js';

describe('epochModifier', () => {
    it('derives its bucket from the second hash word so procgen seed bits stay separate', () => {
        expect(epochModifierBucket('0x123456780200abcd')).toBe(0x0200);
    });

    it('maps epoch hashes to default, boosted, and rich yield multipliers', () => {
        expect(epochModifier('0x12345678ffff0000')).toBe(1);
        expect(epochModifier('0x1234567820000000')).toBe(2);
        expect(epochModifier('0x1234567801000000')).toBe(3);
    });

    it('treats only boosted and rich epochs as high value', () => {
        expect(isHighValueEpoch('0x12345678ffff0000')).toBe(false);
        expect(isHighValueEpoch('0x1234567820000000')).toBe(true);
        expect(isHighValueEpoch('0x1234567801000000')).toBe(true);
    });

    it('falls back to standard yield for missing or malformed hashes', () => {
        expect(epochModifier(null)).toBe(1);
        expect(epochModifier('not-a-hash')).toBe(1);
    });

    it('describes the player-facing modifier state', () => {
        const out = describeEpochModifier('0x1234567801000000');
        expect(out.multiplier).toBe(3);
        expect(out.isHighValue).toBe(true);
        expect(out.label).toBe('Rich shift');
        expect(out.detail).toBe('3x ore yield');
    });
});
