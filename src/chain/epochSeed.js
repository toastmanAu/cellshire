/**
 * epochSeed.js
 *
 * Derives the procgen seed from the CKB chain's current epoch hash.
 * Source ladder: live RPC → cached last-known → Math.random().
 *
 * All functions take their dependencies (fetch, storage) as parameters
 * so the module is testable in Node without DOM mocking.
 */

const NODE_KEY = 'cellshire:node';
const LAST_EPOCH_KEY = 'cellshire:lastEpoch';

/**
 * Resolve which RPC endpoint to call.
 *   URL flag (?node=...) > localStorage > defaultUrl
 * URL flag with a value writes to storage. Empty string clears it.
 */
export function resolveNodeEndpoint({ url, storage, defaultUrl }) {
    if (url === '') {
        storage.remove(NODE_KEY);
        return defaultUrl;
    }
    if (url) {
        storage.set(NODE_KEY, url);
        return url;
    }
    const stored = storage.get(NODE_KEY);
    return stored || defaultUrl;
}

/**
 * Derive a uint32 procgen seed from a 0x-prefixed hex hash. Takes the
 * first 8 hex chars (32 bits) after the optional prefix.
 */
export function seedFromHash(hash) {
    const hex = hash.startsWith('0x') ? hash.slice(2) : hash;
    return parseInt(hex.slice(0, 8), 16) >>> 0;
}

/**
 * Fetch the current epoch's anchor block hash via two JSON-RPC calls:
 *   1. get_current_epoch → { number, start_number, ... }
 *   2. get_block_hash(start_number) → '0x...'
 *
 * Returns { hash, number } where number is the decimal-string form of
 * the hex epoch number (e.g. "0x3877" → "14455"). Throws on network
 * error, HTTP non-2xx, or RPC error body.
 */
export async function getCurrentEpochHash(endpoint, { fetch }) {
    const epoch = await rpc(endpoint, fetch, 'get_current_epoch', []);
    const startNumberHex = epoch.start_number;
    const hash = await rpc(endpoint, fetch, 'get_block_hash', [startNumberHex]);
    return {
        hash,
        number: String(parseInt(epoch.number, 16)),
    };
}

async function rpc(endpoint, fetch, method, params) {
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${method}`);
    const body = await res.json();
    if (body.error) {
        throw new Error(`RPC error from ${method}: ${body.error.message || body.error.code}`);
    }
    return body.result;
}

/**
 * Top-level coordinator. Tries live → cached → random. Always succeeds.
 * Returns { seed, source: 'live'|'cached'|'random', epoch: string|null }.
 */
export async function getProcgenSeed({ url, storage, fetch, defaultUrl }) {
    const endpoint = resolveNodeEndpoint({ url, storage, defaultUrl });

    try {
        const { hash, number } = await getCurrentEpochHash(endpoint, { fetch });
        storage.set(LAST_EPOCH_KEY, JSON.stringify({ hash, number }));
        return { seed: seedFromHash(hash), source: 'live', epoch: number };
    } catch (err) {
        console.warn('[cellshire] live epoch fetch failed:', err.message);
    }

    const cachedRaw = storage.get(LAST_EPOCH_KEY);
    if (cachedRaw) {
        try {
            const cached = JSON.parse(cachedRaw);
            if (cached && typeof cached.hash === 'string') {
                console.warn('[cellshire] using cached epoch', cached.number);
                return { seed: seedFromHash(cached.hash), source: 'cached', epoch: cached.number };
            }
        } catch {
            console.warn('[cellshire] cached epoch malformed; discarding');
        }
    }

    console.warn('[cellshire] no chain available; falling back to Math.random()');
    return {
        seed: Math.floor(Math.random() * 1e9),
        source: 'random',
        epoch: null,
    };
}
