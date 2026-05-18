import { describe, it, expect } from '../test/harness.js';
import {
    describeEpochValueRange,
    epochValueRange,
    epochValueRangeWords,
} from './epochValueRange.js';

describe('epoch value range', () => {
    it('derives two independent words after the procgen and multiplier chunks', () => {
        const out = epochValueRangeWords('0x12345678abcd1111111122222222');
        expect(out.lowerWord).toBe(0x11111111);
        expect(out.spreadWord).toBe(0x22222222);
        expect(out.bits).toBe(32);
    });

    it('maps the minimum epoch words to a lean $1-$21 value range', () => {
        expect(epochValueRange('0x12345678abcd00000000000000000000').range)
            .toEqual([1, 21]);
    });

    it('maps the maximum epoch words to a rich $100-$300 value range', () => {
        expect(epochValueRange('0x12345678abcdffffffffffffffff').range)
            .toEqual([100, 300]);
    });

    it('maps mixed epoch words into the wide middle of the range', () => {
        const out = epochValueRange('0x12345678abcd8000000040000000');
        expect(out.lowerUsd).toBe(50.5);
        expect(out.spreadUsd).toBe(65);
        expect(out.range).toEqual([50.5, 115.5]);
        expect(out.source).toBe('epoch-hash');
    });

    it('falls back to the fixed testnet range when no epoch hash is available', () => {
        const out = epochValueRange(null);
        expect(out.range).toEqual([50, 200]);
        expect(out.source).toBe('fixed');
    });

    it('describes the player/debug facing range', () => {
        expect(describeEpochValueRange('0x12345678abcd00000000000000000000').label)
            .toBe('$1.00-$21.00 ore values');
    });
});
