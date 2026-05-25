import { CURRENCY_CATALOG } from '../mining/cryptoEconomy.js';

export const CELLSHIRE_UDT_PREFIX = 'cellshire:udt:v1';
export const CELLSHIRE_UDT_CODE_HASH = `0x${'c'.repeat(64)}`;

export function currencyTypeArgs(currencyId) {
    if (!CURRENCY_CATALOG[currencyId]) return null;
    if (currencyId === 'ckb') return null;
    return `0x${hash256Hex(`${CELLSHIRE_UDT_PREFIX}:${currencyId}`)}`;
}

export function currencyTypeScript(currencyId, {
    codeHash = CELLSHIRE_UDT_CODE_HASH,
    hashType = 'type',
} = {}) {
    const args = currencyTypeArgs(currencyId);
    if (currencyId === 'ckb') return null;
    if (!args) return null;
    return { codeHash, hashType, args };
}

export function currencyTypeId(currencyId) {
    if (!CURRENCY_CATALOG[currencyId]) return null;
    if (currencyId === 'ckb') return 'native:ckb';
    const script = currencyTypeScript(currencyId);
    return `${script.codeHash}:${script.hashType}:${script.args}`;
}

function hash256Hex(input) {
    const a = hash128(`${input}:0`);
    const b = hash128(`${input}:1`);
    return [...a, ...b].map(wordHex).join('');
}

function hash128(input) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    let h3 = 0xc0decafe;
    let h4 = 0x9e3779b9;
    for (let i = 0; i < input.length; i++) {
        const ch = input.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
        h3 = Math.imul(h3 ^ ch, 2246822507);
        h4 = Math.imul(h4 ^ ch, 3266489909);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);
    h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489909);
    h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function wordHex(word) {
    return word.toString(16).padStart(8, '0');
}
