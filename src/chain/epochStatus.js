const DEFAULT_BLOCK_MS = 10000;

function isFiniteNumber(n) {
    return typeof n === 'number' && Number.isFinite(n);
}

export function estimateEpochRemainingMs(epochInfo, {
    nowMs = Date.now(),
    blockMs = DEFAULT_BLOCK_MS,
} = {}) {
    if (!epochInfo) return null;
    const { startNumber, length, tipNumber, fetchedAtMs } = epochInfo;
    if (!isFiniteNumber(startNumber) || !isFiniteNumber(length) || !isFiniteNumber(tipNumber)) {
        return null;
    }

    const remainingBlocks = Math.max(0, (startNumber + length) - tipNumber);
    const chainEstimateMs = remainingBlocks * blockMs;
    const elapsedMs = isFiniteNumber(fetchedAtMs) ? Math.max(0, nowMs - fetchedAtMs) : 0;
    return Math.max(0, chainEstimateMs - elapsedMs);
}

export function formatRemaining(ms) {
    if (ms === null || ms === undefined) return 'rollover unknown';
    if (ms <= 0) return 'new shift due';
    if (ms < 60000) return '<1m to new shift';
    const totalMinutes = Math.ceil(ms / 60000);
    if (totalMinutes < 60) return `${totalMinutes}m to new shift`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes === 0
        ? `${hours}h to new shift`
        : `${hours}h ${minutes}m to new shift`;
}

export function buildEpochStatus({
    source,
    epoch,
    epochInfo,
    epochModifier,
    nowMs = Date.now(),
    blockMs = DEFAULT_BLOCK_MS,
}) {
    if (source === 'url') {
        return {
            tone: 'cached',
            title: 'Fixed seed',
            detail: 'manual smoke map',
            remainingMs: null,
            canReloadForNewShift: false,
            isHighValueEpoch: false,
            epochModifier: epochModifier ?? null,
        };
    }

    if (source === 'random' || epoch === null || epoch === undefined) {
        return {
            tone: 'warning',
            title: 'Chain offline',
            detail: 'random local map',
            remainingMs: null,
            canReloadForNewShift: false,
            isHighValueEpoch: false,
            epochModifier: null,
        };
    }

    const remainingMs = estimateEpochRemainingMs(epochInfo, { nowMs, blockMs });
    const live = source === 'live';
    const modifier = epochModifier?.multiplier > 1 ? epochModifier : null;
    return {
        tone: modifier ? 'high-value' : live ? 'live' : 'cached',
        title: modifier ? `Epoch ${epoch} x${modifier.multiplier}` : `Epoch ${epoch}`,
        detail: `${live ? 'live' : 'cached'} - ${formatRemaining(remainingMs)}${modifier ? ` - ${modifier.label.toLowerCase()}` : ''}`,
        remainingMs,
        canReloadForNewShift: remainingMs === 0,
        isHighValueEpoch: Boolean(modifier),
        epochModifier: epochModifier ?? null,
    };
}
