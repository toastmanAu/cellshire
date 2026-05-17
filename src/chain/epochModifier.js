const ROLL_OFFSET_NIBBLES = 8;
const ROLL_NIBBLES = 4;
const ROLL_BUCKETS = 0x10000;

export const EPOCH_MODIFIER_TUNING = Object.freeze({
    rollOffsetNibbles: ROLL_OFFSET_NIBBLES,
    rollBits: 16,
    richThreshold: 0.05,
    boostedThreshold: 0.20,
    richMultiplier: 3,
    boostedMultiplier: 2,
    defaultMultiplier: 1,
});

function hexBody(hash) {
    if (typeof hash !== 'string') return null;
    const hex = hash.startsWith('0x') ? hash.slice(2) : hash;
    return /^[0-9a-f]+$/i.test(hex) ? hex : null;
}

export function epochModifierBucket(hash) {
    const hex = hexBody(hash);
    if (!hex || hex.length < ROLL_NIBBLES) return null;
    const start = hex.length >= ROLL_OFFSET_NIBBLES + ROLL_NIBBLES
        ? ROLL_OFFSET_NIBBLES
        : hex.length - ROLL_NIBBLES;
    return parseInt(hex.slice(start, start + ROLL_NIBBLES), 16);
}

export function epochModifier(hash) {
    const bucket = epochModifierBucket(hash);
    if (bucket === null) return EPOCH_MODIFIER_TUNING.defaultMultiplier;

    const roll = bucket / ROLL_BUCKETS;
    if (roll < EPOCH_MODIFIER_TUNING.richThreshold) {
        return EPOCH_MODIFIER_TUNING.richMultiplier;
    }
    if (roll < EPOCH_MODIFIER_TUNING.boostedThreshold) {
        return EPOCH_MODIFIER_TUNING.boostedMultiplier;
    }
    return EPOCH_MODIFIER_TUNING.defaultMultiplier;
}

export function isHighValueEpoch(hash) {
    return epochModifier(hash) > EPOCH_MODIFIER_TUNING.defaultMultiplier;
}

export function describeEpochModifier(hash) {
    const multiplier = epochModifier(hash);
    const isHighValue = multiplier > EPOCH_MODIFIER_TUNING.defaultMultiplier;
    return {
        multiplier,
        isHighValue,
        label: multiplier >= EPOCH_MODIFIER_TUNING.richMultiplier
            ? 'Rich shift'
            : isHighValue
                ? 'High-yield shift'
                : 'Standard shift',
        detail: `${multiplier}x ore yield`,
    };
}
