export const DEBT_CELL_VERSION = 1;
export const DEBT_CELL_KIND = 'cellshire_debt_cell';
export const CKB_COLLATERAL_RATIO_BPS = 15000;
export const COLLATERAL_LOCK_VERSION = 1;

export function ownerLockHash(owner) {
    return `0x${hash256Hex(`cellshire:owner-lock:${String(owner || 'local')}`)}`;
}

export function collateralLockArgs({ owner, ownerLockHash: lockHash } = {}) {
    const hash = normalizeHash(lockHash) ?? ownerLockHash(owner);
    return `0x${COLLATERAL_LOCK_VERSION.toString(16).padStart(2, '0')}${hash.slice(2)}`;
}

export function ckbCollateralAmount(principal, ratioBps = CKB_COLLATERAL_RATIO_BPS) {
    const amount = Number(principal);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return Number((amount * ratioBps / 10000).toFixed(8));
}

export function encodeDebt(debt) {
    const normalized = normalizeDebt(debt);
    if (!normalized) return null;
    return utf8ToHex(stableStringify(normalized));
}

export function decodeDebt(data) {
    if (typeof data !== 'string') return null;
    try {
        const parsed = JSON.parse(hexToUtf8(data));
        return normalizeDebt(parsed);
    } catch {
        return null;
    }
}

export function makeDebtCell(debt) {
    const normalized = normalizeDebt(debt);
    if (!normalized) return null;
    return {
        kind: DEBT_CELL_KIND,
        type: {
            codeHash: `0x${'d'.repeat(64)}`,
            hashType: 'type',
            args: normalized.beneficiaryLockHash,
        },
        lock: {
            codeHash: `0x${'b'.repeat(64)}`,
            hashType: 'type',
            args: '0xcellshirebank',
        },
        data: encodeDebt(normalized),
        debt: normalized,
    };
}

export function normalizeDebt(debt) {
    if (!debt || typeof debt !== 'object') return null;
    const principal = Number(debt.principal);
    const fee = Number(debt.fee);
    const dueEpoch = Math.floor(Number(debt.dueEpoch ?? debt.due_epoch));
    const issuedAtEpoch = Math.floor(Number(debt.issuedAtEpoch ?? debt.issued_at_epoch ?? 0));
    const collateralKind = debt.collateralKind ?? debt.collateral_kind;
    const collateralOutpoint = normalizeOutpoint(debt.collateralOutpoint ?? debt.collateral_outpoint);
    const beneficiaryLockHash = normalizeHash(debt.beneficiaryLockHash ?? debt.beneficiary_lock_hash);
    const offerId = String(debt.offerId ?? debt.offer_id ?? '').trim();
    if (!beneficiaryLockHash) return null;
    if (!Number.isFinite(principal) || principal <= 0) return null;
    if (!Number.isFinite(fee) || fee < 0) return null;
    if (!Number.isFinite(dueEpoch) || dueEpoch < 0) return null;
    if (!collateralOutpoint) return null;
    if (collateralKind !== 'ckb') return null;
    if (!offerId) return null;
    return {
        version: DEBT_CELL_VERSION,
        beneficiaryLockHash,
        principal: Number(principal.toFixed(8)),
        fee: Number(fee.toFixed(8)),
        dueEpoch,
        collateralKind,
        collateralOutpoint,
        issuedAtEpoch: Math.max(0, issuedAtEpoch),
        offerId,
    };
}

function normalizeOutpoint(outpoint) {
    if (!outpoint || typeof outpoint !== 'object') return null;
    const txHash = normalizeHash(outpoint.txHash ?? outpoint.tx_hash);
    const index = Math.floor(Number(outpoint.index));
    if (!txHash || !Number.isFinite(index) || index < 0) return null;
    return { txHash, index };
}

function normalizeHash(value) {
    if (typeof value !== 'string') return null;
    const body = value.startsWith('0x') ? value.slice(2) : value;
    if (!/^[0-9a-f]{64}$/i.test(body)) return null;
    return `0x${body.toLowerCase()}`;
}

function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function utf8ToHex(value) {
    const bytes = new TextEncoder().encode(String(value));
    return `0x${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function hexToUtf8(value) {
    const body = value.startsWith('0x') ? value.slice(2) : value;
    if (!/^[0-9a-f]*$/i.test(body) || body.length % 2 !== 0) throw new Error('invalid hex');
    const bytes = new Uint8Array(body.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(body.slice(i * 2, i * 2 + 2), 16);
    return new TextDecoder().decode(bytes);
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
