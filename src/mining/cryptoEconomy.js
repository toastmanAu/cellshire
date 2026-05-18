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

export const TESTNET_USD_PER_YIELD_UNIT = 1;

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

export function amountForBaseYield(currencyId, baseAmount, {
    usdPerUnit = TESTNET_USD_PER_YIELD_UNIT,
    decimals = 8,
} = {}) {
    const cfg = currencyConfig(currencyId);
    const priceUsd = cfg?.priceUsd;
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return baseAmount;
    const amount = (baseAmount * usdPerUnit) / priceUsd;
    return Number(amount.toFixed(decimals));
}

export function formatCurrencyAmount(currencyId, amount) {
    const abs = Math.abs(amount);
    const symbol = currencySymbol(currencyId);
    if (abs === 0) return `0 ${symbol}`;
    if (abs >= 100) return `${amount.toFixed(2)} ${symbol}`;
    if (abs >= 1) return `${amount.toFixed(4)} ${symbol}`;
    return `${amount.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')} ${symbol}`;
}
