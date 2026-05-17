import { describe, it, expect } from '../test/harness.js';
import { buildEpochStatus, estimateEpochRemainingMs, formatRemaining } from './epochStatus.js';

describe('estimateEpochRemainingMs', () => {
    it('estimates remaining time from current epoch progress', () => {
        const out = estimateEpochRemainingMs({
            startNumber: 100,
            length: 100,
            tipNumber: 150,
            fetchedAtMs: 1000,
        }, { nowMs: 1000, blockMs: 10000 });
        expect(out).toBe(500000);
    });

    it('subtracts elapsed wall-clock time since the RPC result was fetched', () => {
        const out = estimateEpochRemainingMs({
            startNumber: 100,
            length: 100,
            tipNumber: 150,
            fetchedAtMs: 1000,
        }, { nowMs: 61000, blockMs: 10000 });
        expect(out).toBe(440000);
    });

    it('returns null when progress metadata is incomplete', () => {
        expect(estimateEpochRemainingMs({ startNumber: 100, length: 100 })).toBeNull();
    });
});

describe('formatRemaining', () => {
    it('formats unknown, due, minute, and hour states', () => {
        expect(formatRemaining(null)).toBe('rollover unknown');
        expect(formatRemaining(0)).toBe('new shift due');
        expect(formatRemaining(30000)).toBe('<1m to new shift');
        expect(formatRemaining(600000)).toBe('10m to new shift');
        expect(formatRemaining(5700000)).toBe('1h 35m to new shift');
    });
});

describe('buildEpochStatus', () => {
    it('builds a live status with countdown text', () => {
        const out = buildEpochStatus({
            source: 'live',
            epoch: '14455',
            epochInfo: {
                startNumber: 100,
                length: 100,
                tipNumber: 194,
                fetchedAtMs: 1000,
            },
            nowMs: 1000,
            blockMs: 10000,
        });
        expect(out.tone).toBe('live');
        expect(out.title).toBe('Epoch 14455');
        expect(out.detail).toBe('live - 1m to new shift');
        expect(out.canReloadForNewShift).toBe(false);
    });

    it('marks reload available when the estimated epoch has rolled', () => {
        const out = buildEpochStatus({
            source: 'live',
            epoch: '14455',
            epochInfo: {
                startNumber: 100,
                length: 100,
                tipNumber: 200,
                fetchedAtMs: 1000,
            },
            nowMs: 1000,
            blockMs: 10000,
        });
        expect(out.detail).toBe('live - new shift due');
        expect(out.canReloadForNewShift).toBe(true);
    });

    it('surfaces cached and random fallback states', () => {
        const cached = buildEpochStatus({ source: 'cached', epoch: '14400', epochInfo: null });
        const random = buildEpochStatus({ source: 'random', epoch: null, epochInfo: null });
        expect(cached.detail).toBe('cached - rollover unknown');
        expect(random.title).toBe('Chain offline');
        expect(random.detail).toBe('random local map');
    });
});
