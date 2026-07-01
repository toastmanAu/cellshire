const MASK_64 = 0xffffffffffffffffn;
const BLOCK_BYTES = 128;
const OUT_BYTES = 32;
const CKB_PERSONAL = 'ckb-default-hash';

const IV = [
    0x6a09e667f3bcc908n,
    0xbb67ae8584caa73bn,
    0x3c6ef372fe94f82bn,
    0xa54ff53a5f1d36f1n,
    0x510e527fade682d1n,
    0x9b05688c2b3e6c1fn,
    0x1f83d9abfb41bd6bn,
    0x5be0cd19137e2179n,
];

const SIGMA = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
    [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
    [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
    [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
    [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
    [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
    [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
    [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
    [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
];

export function ckbBlake2b256(input) {
    const bytes = bytesFrom(input);
    const h = initialState();
    let offset = 0;
    let counter = 0n;

    while (bytes.length - offset > BLOCK_BYTES) {
        counter += BigInt(BLOCK_BYTES);
        compress(h, bytes.subarray(offset, offset + BLOCK_BYTES), counter, false);
        offset += BLOCK_BYTES;
    }

    const last = new Uint8Array(BLOCK_BYTES);
    const remaining = bytes.length - offset;
    last.set(bytes.subarray(offset));
    counter += BigInt(remaining);
    compress(h, last, counter, true);

    const out = new Uint8Array(OUT_BYTES);
    for (let i = 0; i < h.length; i += 1) {
        writeU64LE(out, i * 8, h[i]);
    }
    return out.subarray(0, OUT_BYTES);
}

export function ckbBlake2b256Hex(input) {
    return `0x${bytesToHex(ckbBlake2b256(input))}`;
}

export function bytesToHex(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function initialState() {
    const param = new Uint8Array(64);
    param[0] = OUT_BYTES;
    param[2] = 1;
    param[3] = 1;
    param.set(textBytes(CKB_PERSONAL), 48);
    return IV.map((word, i) => word ^ readU64LE(param, i * 8));
}

function compress(h, block, counter, last) {
    const m = Array.from({ length: 16 }, (_, i) => readU64LE(block, i * 8));
    const v = h.concat(IV);
    v[12] ^= counter & MASK_64;
    v[13] ^= counter >> 64n;
    if (last) v[14] ^= MASK_64;

    for (const s of SIGMA) {
        g(v, 0, 4, 8, 12, m[s[0]], m[s[1]]);
        g(v, 1, 5, 9, 13, m[s[2]], m[s[3]]);
        g(v, 2, 6, 10, 14, m[s[4]], m[s[5]]);
        g(v, 3, 7, 11, 15, m[s[6]], m[s[7]]);
        g(v, 0, 5, 10, 15, m[s[8]], m[s[9]]);
        g(v, 1, 6, 11, 12, m[s[10]], m[s[11]]);
        g(v, 2, 7, 8, 13, m[s[12]], m[s[13]]);
        g(v, 3, 4, 9, 14, m[s[14]], m[s[15]]);
    }

    for (let i = 0; i < 8; i += 1) {
        h[i] = (h[i] ^ v[i] ^ v[i + 8]) & MASK_64;
    }
}

function g(v, a, b, c, d, x, y) {
    v[a] = (v[a] + v[b] + x) & MASK_64;
    v[d] = rotr64(v[d] ^ v[a], 32n);
    v[c] = (v[c] + v[d]) & MASK_64;
    v[b] = rotr64(v[b] ^ v[c], 24n);
    v[a] = (v[a] + v[b] + y) & MASK_64;
    v[d] = rotr64(v[d] ^ v[a], 16n);
    v[c] = (v[c] + v[d]) & MASK_64;
    v[b] = rotr64(v[b] ^ v[c], 63n);
}

function rotr64(value, shift) {
    return ((value >> shift) | (value << (64n - shift))) & MASK_64;
}

function readU64LE(bytes, offset) {
    let out = 0n;
    for (let i = 0; i < 8; i += 1) {
        out |= BigInt(bytes[offset + i] || 0) << BigInt(i * 8);
    }
    return out;
}

function writeU64LE(bytes, offset, value) {
    let n = value & MASK_64;
    for (let i = 0; i < 8; i += 1) {
        bytes[offset + i] = Number(n & 0xffn);
        n >>= 8n;
    }
}

function bytesFrom(input) {
    if (input instanceof Uint8Array) return input;
    if (Array.isArray(input)) return new Uint8Array(input);
    if (typeof input === 'string') return textBytes(input);
    throw new TypeError('ckbBlake2b256: expected Uint8Array, byte array, or string');
}

function textBytes(value) {
    return new TextEncoder().encode(String(value));
}
