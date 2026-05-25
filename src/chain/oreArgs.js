import { ORE_CATALOG } from '../mining/oreCatalog.js';

export const ORE_ARGS_VERSION = 1;
export const ORE_TYPE_IDS = Object.freeze(
    Object.fromEntries(Object.keys(ORE_CATALOG).map((oreType, i) => [oreType, i + 1]))
);
export const ORE_TYPES_BY_ID = Object.freeze(
    Object.fromEntries(Object.entries(ORE_TYPE_IDS).map(([oreType, id]) => [id, oreType]))
);

export function encodeOreArgs({ epoch, mapId, mapIdHash, gx, gy, oreType }) {
    const oreTypeId = ORE_TYPE_IDS[oreType];
    if (!oreTypeId) return null;
    const bytes = new Uint8Array(22);
    bytes[0] = ORE_ARGS_VERSION;
    writeU64Be(bytes, 1, BigInt(Math.max(0, Math.floor(Number(epoch) || 0))));
    const hashBytes = mapIdHash
        ? hexToBytes(mapIdHash, 8)
        : hash64Bytes(String(mapId ?? 'mine:local'));
    bytes.set(hashBytes, 9);
    writeU16Be(bytes, 17, gx);
    writeU16Be(bytes, 19, gy);
    bytes[21] = oreTypeId;
    return bytesToHex(bytes);
}

export function decodeOreArgs(args) {
    const bytes = hexToBytes(args, 22);
    if (!bytes || bytes[0] !== ORE_ARGS_VERSION) return null;
    const oreType = ORE_TYPES_BY_ID[bytes[21]];
    if (!oreType) return null;
    return {
        version: bytes[0],
        epoch: String(readU64Be(bytes, 1)),
        mapIdHash: bytesToHex(bytes.slice(9, 17)),
        gx: readU16Be(bytes, 17),
        gy: readU16Be(bytes, 19),
        oreType,
    };
}

function writeU16Be(bytes, offset, value) {
    const n = Math.max(0, Math.min(0xffff, Math.floor(Number(value) || 0)));
    bytes[offset] = (n >>> 8) & 0xff;
    bytes[offset + 1] = n & 0xff;
}

function readU16Be(bytes, offset) {
    return (bytes[offset] << 8) | bytes[offset + 1];
}

function writeU64Be(bytes, offset, value) {
    let n = value;
    for (let i = 7; i >= 0; i--) {
        bytes[offset + i] = Number(n & 0xffn);
        n >>= 8n;
    }
}

function readU64Be(bytes, offset) {
    let n = 0n;
    for (let i = 0; i < 8; i++) {
        n = (n << 8n) + BigInt(bytes[offset + i]);
    }
    return n;
}

function hash64Bytes(input) {
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    for (let i = 0; i < input.length; i++) {
        const ch = input.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 16777619);
        h2 = Math.imul(h2 ^ ch, 2246822507);
    }
    const out = new Uint8Array(8);
    writeU32Be(out, 0, h1 >>> 0);
    writeU32Be(out, 4, h2 >>> 0);
    return out;
}

function writeU32Be(bytes, offset, value) {
    bytes[offset] = (value >>> 24) & 0xff;
    bytes[offset + 1] = (value >>> 16) & 0xff;
    bytes[offset + 2] = (value >>> 8) & 0xff;
    bytes[offset + 3] = value & 0xff;
}

function hexToBytes(hex, expectedLength) {
    if (typeof hex !== 'string') return null;
    const body = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (!/^[0-9a-f]+$/i.test(body) || body.length !== expectedLength * 2) return null;
    const out = new Uint8Array(expectedLength);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(body.slice(i * 2, i * 2 + 2), 16);
    return out;
}

function bytesToHex(bytes) {
    return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}
