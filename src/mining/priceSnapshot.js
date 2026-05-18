import {
    CURRENCY_CATALOG,
    fixedPriceSnapshot,
} from './cryptoEconomy.js';

const PRICE_SNAPSHOT_KEY_PREFIX = 'cellshire:priceSnapshot:';
const DEFAULT_TIMEOUT_MS = 2500;

export function priceSnapshotStoreKey(epoch) {
    return epoch === null || epoch === undefined || epoch === ''
        ? null
        : `${PRICE_SNAPSHOT_KEY_PREFIX}${epoch}`;
}

function coingeckoIds() {
    return Array.from(new Set(
        Object.values(CURRENCY_CATALOG).map(cfg => cfg.coingeckoId),
    ));
}

function currencyByCoingeckoId() {
    const out = {};
    for (const [currencyId, cfg] of Object.entries(CURRENCY_CATALOG)) {
        out[cfg.coingeckoId] = currencyId;
    }
    return out;
}

export function coinGeckoSimplePriceUrl({
    ids = coingeckoIds(),
    vsCurrency = 'usd',
} = {}) {
    const params = new URLSearchParams({
        ids: ids.join(','),
        vs_currencies: vsCurrency,
        include_last_updated_at: 'true',
    });
    return `https://api.coingecko.com/api/v3/simple/price?${params.toString()}`;
}

export function parseCoinGeckoSimplePrice(body, {
    fetchedAtMs = Date.now(),
    vsCurrency = 'usd',
} = {}) {
    const idToCurrency = currencyByCoingeckoId();
    const prices = {};
    let latestUpdatedAt = 0;
    for (const [coinId, row] of Object.entries(body ?? {})) {
        const currencyId = idToCurrency[coinId];
        const price = row?.[vsCurrency];
        if (!currencyId || !Number.isFinite(price) || price <= 0) continue;
        prices[currencyId] = price;
        if (Number.isFinite(row.last_updated_at)) {
            latestUpdatedAt = Math.max(latestUpdatedAt, row.last_updated_at);
        }
    }

    const expected = Object.keys(CURRENCY_CATALOG).length;
    if (Object.keys(prices).length !== expected) {
        throw new Error(`CoinGecko snapshot incomplete: ${Object.keys(prices).length}/${expected}`);
    }

    return {
        source: 'coingecko:simple-price',
        capturedAt: latestUpdatedAt
            ? new Date(latestUpdatedAt * 1000).toISOString()
            : new Date(fetchedAtMs).toISOString(),
        fetchedAtMs,
        vsCurrency,
        prices,
    };
}

export async function fetchCoinGeckoPriceSnapshot({
    fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    url = coinGeckoSimplePriceUrl(),
} = {}) {
    if (typeof fetch !== 'function') throw new Error('fetch unavailable');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
        res = await fetch(url, { signal: controller.signal });
    } catch (err) {
        if (controller.signal.aborted) {
            throw new Error(`CoinGecko timeout after ${timeoutMs}ms`);
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    return parseCoinGeckoSimplePrice(await res.json());
}

export function loadCachedPriceSnapshot(storage, epoch) {
    const key = priceSnapshotStoreKey(epoch);
    if (!key) return null;
    const raw = storage?.get?.(key);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed?.prices && parsed?.vsCurrency) {
            return { ...parsed, source: parsed.source || 'cached' };
        }
    } catch {
        // Ignore malformed cache; caller falls through to fixed table.
    }
    return null;
}

export function saveCachedPriceSnapshot(storage, epoch, snapshot) {
    const key = priceSnapshotStoreKey(epoch);
    if (!key || !snapshot) return false;
    storage?.set?.(key, JSON.stringify(snapshot));
    return true;
}

export async function getEpochPriceSnapshot({
    epoch,
    storage,
    fetch,
    allowLive = true,
} = {}) {
    if (allowLive) {
        try {
            const snapshot = await fetchCoinGeckoPriceSnapshot({ fetch });
            saveCachedPriceSnapshot(storage, epoch, snapshot);
            return { ...snapshot, mode: 'live' };
        } catch (err) {
            console.warn('[cellshire] live price snapshot failed:', err.message);
        }
    }

    const cached = loadCachedPriceSnapshot(storage, epoch);
    if (cached) return { ...cached, mode: 'cached' };

    return { ...fixedPriceSnapshot(), mode: 'fixed' };
}
