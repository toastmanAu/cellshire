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
export const DEFAULT_EPOCH_CLEAR_VALUE_USD_RANGE = [20, 100];
export const USD_VALUE_SCALE = 1_000_000;
export const USD_PRICE_SCALE = 1_000_000_000_000;
export const CURRENCY_AMOUNT_SCALE = 100_000_000;

export const CURRENCY_CATALOG = {
    btc:  { symbol: 'BTC',  displayName: 'Bitcoin',      coingeckoId: 'bitcoin',        pow: true, priceUsd: 76847,      logoPath: 'logos/bitcoin-btc-logo.svg' },
    ltc:  { symbol: 'LTC',  displayName: 'Litecoin',     coingeckoId: 'litecoin',       pow: true, priceUsd: 53.79,      logoPath: 'logos/litecoin-ltc-logo.svg' },
    doge: { symbol: 'DOGE', displayName: 'Dogecoin',     coingeckoId: 'dogecoin',       pow: true, priceUsd: 0.104813,   logoPath: 'logos/dogecoin-doge-logo.svg' },
    dash: { symbol: 'DASH', displayName: 'Dash',         coingeckoId: 'dash',           pow: true, priceUsd: 41.14,      logoPath: 'logos/dash-dash-logo.svg' },
    xmr:  { symbol: 'XMR',  displayName: 'Monero',       coingeckoId: 'monero',         pow: true, priceUsd: 383.99,     logoPath: 'logos/monero-xmr-logo.svg' },
    zec:  { symbol: 'ZEC',  displayName: 'Zcash',        coingeckoId: 'zcash',          pow: true, priceUsd: 523.74,     logoPath: 'logos/zcash-zec-logo.svg' },
    ckb:  { symbol: 'CKB',  displayName: 'CKB',          coingeckoId: 'nervos-network', pow: true, priceUsd: 0.00143557, logoPath: 'logos/nervos-network-ckb-logo.svg' },
    kas:  { symbol: 'KAS',  displayName: 'Kaspa',        coingeckoId: 'kaspa',          pow: true, priceUsd: 0.03399815, logoPath: 'logos/kaspa-kas-logo.svg' },
    erg:  { symbol: 'ERG',  displayName: 'Ergo',         coingeckoId: 'ergo',           pow: true, priceUsd: 0.281976,   logoPath: 'logos/ergo-erg-logo.svg' },
    bch:  { symbol: 'BCH',  displayName: 'Bitcoin Cash', coingeckoId: 'bitcoin-cash',   pow: true, priceUsd: 377.25,     logoPath: 'logos/bitcoin-cash-bch-logo.svg' },
    dgb:  { symbol: 'DGB',  displayName: 'DigiByte',     coingeckoId: 'digibyte',       pow: true, priceUsd: 0.00365661, logoPath: 'logos/digibyte-dgb-logo.svg' },
    rvn:  { symbol: 'RVN',  displayName: 'Ravencoin',    coingeckoId: 'ravencoin',      pow: true, priceUsd: 0.00548789, logoPath: 'logos/ravencoin-rvn-logo.svg' },
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

export function currencyLogoPath(currencyId) {
    return CURRENCY_CATALOG[currencyId]?.logoPath ?? null;
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
    const usdMicros = decimalToScaledInteger(usdValue, USD_VALUE_SCALE);
    const priceScaled = decimalToScaledInteger(priceUsd, USD_PRICE_SCALE);
    const numerator = usdMicros * BigInt(USD_PRICE_SCALE) * BigInt(CURRENCY_AMOUNT_SCALE);
    const denominator = BigInt(USD_VALUE_SCALE) * priceScaled;
    const amountUnits = divRoundHalfUp(numerator, denominator);
    return scaledIntegerToNumber(amountUnits, CURRENCY_AMOUNT_SCALE, decimals);
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

export function usdToMicros(value) {
    return decimalToScaledInteger(value, USD_VALUE_SCALE);
}

export function usdPriceToScaled(value) {
    return decimalToScaledInteger(value, USD_PRICE_SCALE);
}

export function currencyAmountToUnits(value) {
    return decimalToScaledInteger(value, CURRENCY_AMOUNT_SCALE);
}

export function microsToUsd(micros, decimals = 8) {
    return scaledIntegerToNumber(BigInt(micros), USD_VALUE_SCALE, decimals);
}

export function splitValueMicros(remainingValueMicros, capacityRemaining, capacitySpent) {
    const remaining = BigInt(remainingValueMicros);
    const remainingCapacity = BigInt(Math.max(1, Math.floor(Number(capacityRemaining) || 1)));
    const requested = Math.floor(Number(capacitySpent) || 0);
    if (requested <= 0) return 0n;
    const spent = BigInt(requested);
    if (spent >= remainingCapacity) return remaining;
    return divRoundHalfUp(remaining * spent, remainingCapacity);
}

export function splitUsdBudget(totalUsd, count, rand = Math.random) {
    if (!Number.isFinite(totalUsd) || totalUsd <= 0 || count <= 0) return [];
    const weights = Array.from({ length: count }, () => 0.75 + rand() * 0.5);
    const scaledWeights = weights.map(weight => BigInt(Math.round(weight * 1_000_000)));
    const weightSum = scaledWeights.reduce((sum, n) => sum + n, 0n);
    const totalMicros = usdToMicros(totalUsd);
    let assignedMicros = 0n;
    return weights.map((weight, i) => {
        if (i === weights.length - 1) {
            return microsToUsd(totalMicros - assignedMicros);
        }
        const valueMicros = divRoundHalfUp(totalMicros * scaledWeights[i], weightSum);
        assignedMicros += valueMicros;
        return microsToUsd(valueMicros);
    });
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

function decimalToScaledInteger(value, scale) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0n;
    return BigInt(Math.round(n * scale));
}

function scaledIntegerToNumber(units, scale, decimals) {
    const negative = units < 0n;
    const abs = negative ? -units : units;
    const whole = abs / BigInt(scale);
    const fraction = abs % BigInt(scale);
    const width = String(scale).length - 1;
    const raw = `${negative ? '-' : ''}${whole}.${fraction.toString().padStart(width, '0')}`;
    return Number(Number(raw).toFixed(decimals));
}

function divRoundHalfUp(numerator, denominator) {
    if (denominator <= 0n) return 0n;
    return (numerator + (denominator / 2n)) / denominator;
}
