import { describe, it, expect } from '../test/harness.js';
import {
    describeEpochValueRange,
    epochValueRange,
    epochValueRangeWords,
} from './epochValueRange.js';

describe('epoch value range', () => {
    it('derives clear-budget words after the procgen and multiplier chunks', () => {
        const out = epochValueRangeWords('0x12345678abcd1111111122222222');
        expect(out.clearWord).toBe(0x11111111);
        expect(out.saltWord).toBe(0x22222222);
        expect(out.bits).toBe(32);
    });

    it('maps the minimum epoch word to a $20 clear budget', () => {
        expect(epochValueRange('0x12345678abcd00000000000000000000').clearValueUsd)
            .toBe(20);
    });

    it('maps the maximum epoch word to a $100 clear budget', () => {
        expect(epochValueRange('0x12345678abcdffffffffffffffff').clearValueUsd)
            .toBe(100);
    });

    it('maps mixed epoch words into the middle of the clear-budget range', () => {
        const out = epochValueRange('0x12345678abcd8000000040000000');
        expect(out.clearValueUsd).toBe(60);
        expect(out.lowerUsd).toBe(20);
        expect(out.spreadUsd).toBe(80);
        expect(out.range).toEqual([20, 100]);
        expect(out.source).toBe('epoch-hash');
    });

    it('falls back to the midpoint clear budget when no epoch hash is available', () => {
        const out = epochValueRange(null);
        expect(out.range).toEqual([20, 100]);
        expect(out.clearValueUsd).toBe(60);
        expect(out.source).toBe('fixed');
    });

    it('describes the player/debug facing range', () => {
        expect(describeEpochValueRange('0x12345678abcd00000000000000000000').label)
            .toBe('$20.00 clear budget ($20.00-$100.00 cap)');
    });
});
