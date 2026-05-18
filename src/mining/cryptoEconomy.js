/**
 * cryptoEconomy.js
 *
 * Separates deposit visuals from rewarded internal currencies. Prices are
 * fixed testnet placeholders captured from CoinGecko during development;
 * future epoch rollover can refresh this table before procgen.
 */

export const TESTNET_PRICE_SNAPSHOT = {
    source: 'coingecko:simple-price',
    capturedAt: '2026-05-18T14:06:32Z',
    vsCurrency: 'usd',
};

export const DEFAULT_ORE_VALUE_USD_RANGE = [50, 200];

export const CURRENCY_CATALOG = {
    btc:  { symbol: 'BTC',  displayName: 'Bitcoin',      coingeckoId: 'bitcoin',        pow: true, priceUsd: 76847 },
    ltc:  { symbol: 'LTC',  displayName: 'Litecoin',     coingeckoId: 'litecoin',       pow: true, priceUsd: 53.79 },
    doge: { symbol: 'DOGE', displayName: 'Dogecoin',     coingeckoId: 'dogecoin',       pow: true, priceUsd: 0.104813 },
    dash: { symbol: 'DASH', displayName: 'Dash',         coingeckoId: 'dash',           pow: true, priceUsd: 41.14 },
    xmr:  { symbol: 'XMR',  displayName: 'Monero',       coingeckoId: 'monero',         pow: true, priceUsd: 383.99 },
    zec:  { symbol: 'ZEC',  displayName: 'Zcash',        coingeckoId: 'zcash',          pow: true, priceUsd: 523.74 },
    ckb:  { symbol: 'CKB',  displayName: 'CKB',          coingeckoId: 'nervos-network', pow: true, priceUsd: 0.00143557 },
    kas:  { symbol: 'KAS',  displayName: 'Kaspa',        coingeckoId: 'kaspa',          pow: true, priceUsd: 0.03399815 },
    erg:  { symbol: 'ERG',  displayName: 'Ergo',         coingeckoId: 'ergo',           pow: true, priceUsd: 0.281976 },
    bch:  { symbol: 'BCH',  displayName: 'Bitcoin Cash', coingeckoId: 'bitcoin-cash',   pow: true, priceUsd: 377.25 },
    dgb:  { symbol: 'DGB',  displayName: 'DigiByte',     coingeckoId: 'digibyte',       pow: true, priceUsd: 0.00365661 },
    rvn:  { symbol: 'RVN',  displayName: 'Ravencoin',    coingeckoId: 'ravencoin',      pow: true, priceUsd: 0.00548789 },
};

export const ORE_CURRENCY_MAP = {
    gold_ore:       'btc',
    silver_ore:     'ltc',
    diamond_ore:    'doge',
    cobalt_ore:     'dash',
    copper_ore:     'xmr',
    coal_seam:      'zec',
    ckb_cluster:    'ckb',
    amethyst_geode: 'kas',
    iron_ore:       'erg',
    silicon_quartz: 'bch',
    lithium_ore:    'dgb',
    bismuth_ore:    'rvn',
};

export function rewardCurrencyForOre(oreType) {
    return ORE_CURRENCY_MAP[oreType] ?? oreType;
}

export function currencyConfig(currencyId) {
    return CURRENCY_CATALOG[currencyId] ?? null;
}

export function currencyDisplayName(currencyId) {
    return CURRENCY_CATALOG[currencyId]?.displayName ?? currencyId;
}

export function currencySymbol(currencyId) {
    return CURRENCY_CATALOG[currencyId]?.symbol ?? currencyId;
}

export function fixedPriceSnapshot() {
    const prices = {};
    for (const [currencyId, cfg] of Object.entries(CURRENCY_CATALOG)) {
        prices[currencyId] = cfg.priceUsd;
    }
    return {
        ...TESTNET_PRICE_SNAPSHOT,
        prices,
        fallback: true,
    };
}

export function priceUsdForCurrency(currencyId, priceSnapshot = null) {
    const snapshotPrice = priceSnapshot?.prices?.[currencyId];
    if (Number.isFinite(snapshotPrice) && snapshotPrice > 0) return snapshotPrice;
    const catalogPrice = CURRENCY_CATALOG[currencyId]?.priceUsd;
    return Number.isFinite(catalogPrice) && catalogPrice > 0 ? catalogPrice : null;
}

export function amountForUsdValue(currencyId, usdValue, {
    priceSnapshot = null,
    decimals = 8,
} = {}) {
    const priceUsd = priceUsdForCurrency(currencyId, priceSnapshot);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return usdValue;
    const amount = usdValue / priceUsd;
    return Number(amount.toFixed(decimals));
}

export function amountForBaseYield(currencyId, baseAmount, {
    usdPerUnit = 1,
    priceSnapshot = null,
    decimals = 8,
} = {}) {
    return amountForUsdValue(currencyId, baseAmount * usdPerUnit, {
        priceSnapshot,
        decimals,
    });
}

export function rollOreValueUsd(rand = Math.random, range = DEFAULT_ORE_VALUE_USD_RANGE) {
    const [lo, hi] = range;
    return Number((lo + rand() * (hi - lo)).toFixed(2));
}

export function formatCurrencyAmount(currencyId, amount) {
    const abs = Math.abs(amount);
    const symbol = currencySymbol(currencyId);
    if (abs === 0) return `0 ${symbol}`;
    if (abs >= 100) return `${amount.toFixed(2)} ${symbol}`;
    if (abs >= 1) return `${amount.toFixed(4)} ${symbol}`;
    return `${amount.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')} ${symbol}`;
}

export function usdValueForAmount(currencyId, amount, priceSnapshot = null) {
    const priceUsd = priceUsdForCurrency(currencyId, priceSnapshot);
    if (!Number.isFinite(priceUsd)) return null;
    return amount * priceUsd;
}

export function formatUsd(value) {
    if (!Number.isFinite(value)) return 'n/a';
    const abs = Math.abs(value);
    if (abs >= 1000) {
        return `$${value.toLocaleString(undefined, {
            maximumFractionDigits: 0,
        })}`;
    }
    if (abs >= 1) return `$${value.toFixed(2)}`;
    return `$${value.toFixed(4)}`;
}
