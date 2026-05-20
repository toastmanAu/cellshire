import { DEFAULT_EPOCH_CLEAR_VALUE_USD_RANGE } from './cryptoEconomy.js';

const HEX_WORD_BITS = 32;
const HEX_WORD_NIBBLES = 8;
const MAX_UINT32 = 0xffffffff;

export const EPOCH_VALUE_RANGE_TUNING = Object.freeze({
    clearMinUsd: DEFAULT_EPOCH_CLEAR_VALUE_USD_RANGE[0],
    clearMaxUsd: DEFAULT_EPOCH_CLEAR_VALUE_USD_RANGE[1],
    clearOffsetNibbles: 12,
    saltOffsetNibbles: 20,
});

function hexBody(hash) {
    if (typeof hash !== 'string') return null;
    const hex = hash.startsWith('0x') ? hash.slice(2) : hash;
    return /^[0-9a-f]+$/i.test(hex) ? hex : null;
}

function wordAt(hash, offsetNibbles) {
    const hex = hexBody(hash);
    if (!hex || hex.length < offsetNibbles + HEX_WORD_NIBBLES) return null;
    return parseInt(hex.slice(offsetNibbles, offsetNibbles + HEX_WORD_NIBBLES), 16) >>> 0;
}

function roll01(word) {
    return word / MAX_UINT32;
}

function lerp(min, max, t) {
    return min + (max - min) * t;
}

function money(n) {
    return Number(n.toFixed(2));
}

export function epochValueRangeWords(hash) {
    const clearWord = wordAt(hash, EPOCH_VALUE_RANGE_TUNING.clearOffsetNibbles);
    const saltWord = wordAt(hash, EPOCH_VALUE_RANGE_TUNING.saltOffsetNibbles);
    if (clearWord === null || saltWord === null) return null;
    return { clearWord, saltWord, bits: HEX_WORD_BITS };
}

export function epochValueRange(hash) {
    const words = epochValueRangeWords(hash);
    const range = DEFAULT_EPOCH_CLEAR_VALUE_USD_RANGE;
    if (!words) {
        return {
            range,
            clearValueUsd: money((range[0] + range[1]) / 2),
            lowerUsd: range[0],
            spreadUsd: range[1] - range[0],
            source: 'fixed',
        };
    }

    const clearValueUsd = money(lerp(
        EPOCH_VALUE_RANGE_TUNING.clearMinUsd,
        EPOCH_VALUE_RANGE_TUNING.clearMaxUsd,
        roll01(words.clearWord),
    ));

    return {
        range,
        clearValueUsd,
        lowerUsd: range[0],
        spreadUsd: range[1] - range[0],
        source: 'epoch-hash',
        ...words,
    };
}

export function describeEpochValueRange(hash) {
    const out = epochValueRange(hash);
    return {
        ...out,
        label: `$${out.clearValueUsd.toFixed(2)} clear budget `
            + `($${out.range[0].toFixed(2)}-$${out.range[1].toFixed(2)} cap)`,
    };
}
