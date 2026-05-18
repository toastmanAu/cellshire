import { DEFAULT_ORE_VALUE_USD_RANGE } from './cryptoEconomy.js';

const HEX_WORD_BITS = 32;
const HEX_WORD_NIBBLES = 8;
const MAX_UINT32 = 0xffffffff;

export const EPOCH_VALUE_RANGE_TUNING = Object.freeze({
    lowerMinUsd: 1,
    lowerMaxUsd: 100,
    spreadMinUsd: 20,
    spreadMaxUsd: 200,
    lowerOffsetNibbles: 12,
    spreadOffsetNibbles: 20,
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
    const lowerWord = wordAt(hash, EPOCH_VALUE_RANGE_TUNING.lowerOffsetNibbles);
    const spreadWord = wordAt(hash, EPOCH_VALUE_RANGE_TUNING.spreadOffsetNibbles);
    if (lowerWord === null || spreadWord === null) return null;
    return { lowerWord, spreadWord, bits: HEX_WORD_BITS };
}

export function epochValueRange(hash) {
    const words = epochValueRangeWords(hash);
    if (!words) {
        return {
            range: DEFAULT_ORE_VALUE_USD_RANGE,
            lowerUsd: DEFAULT_ORE_VALUE_USD_RANGE[0],
            spreadUsd: DEFAULT_ORE_VALUE_USD_RANGE[1] - DEFAULT_ORE_VALUE_USD_RANGE[0],
            source: 'fixed',
        };
    }

    const lowerUsd = money(lerp(
        EPOCH_VALUE_RANGE_TUNING.lowerMinUsd,
        EPOCH_VALUE_RANGE_TUNING.lowerMaxUsd,
        roll01(words.lowerWord),
    ));
    const spreadUsd = money(lerp(
        EPOCH_VALUE_RANGE_TUNING.spreadMinUsd,
        EPOCH_VALUE_RANGE_TUNING.spreadMaxUsd,
        roll01(words.spreadWord),
    ));

    return {
        range: [lowerUsd, money(lowerUsd + spreadUsd)],
        lowerUsd,
        spreadUsd,
        source: 'epoch-hash',
        ...words,
    };
}

export function describeEpochValueRange(hash) {
    const out = epochValueRange(hash);
    return {
        ...out,
        label: `$${out.range[0].toFixed(2)}-$${out.range[1].toFixed(2)} ore values`,
    };
}
