export const UDT_DECIMALS = 8;
export const UDT_BASE = 100_000_000n;

export function amountToU128LeBytes(amount, decimals = UDT_DECIMALS) {
    const units = amountToBaseUnits(amount, decimals);
    if (units < 0n) throw new Error('u128 amount cannot be negative');
    if (units > ((1n << 128n) - 1n)) throw new Error('u128 amount overflow');
    const out = new Uint8Array(16);
    let n = units;
    for (let i = 0; i < out.length; i++) {
        out[i] = Number(n & 0xffn);
        n >>= 8n;
    }
    return out;
}

export function u128LeBytesToAmount(bytes, decimals = UDT_DECIMALS) {
    if (!bytes || bytes.length !== 16) return null;
    let units = 0n;
    for (let i = 15; i >= 0; i--) {
        units = (units << 8n) + BigInt(bytes[i]);
    }
    return baseUnitsToAmount(units, decimals);
}

export function amountToBaseUnits(amount, decimals = UDT_DECIMALS) {
    const value = Number(amount);
    if (!Number.isFinite(value)) return 0n;
    const fixed = value.toFixed(decimals);
    const [whole, frac = ''] = fixed.split('.');
    return BigInt(whole) * (10n ** BigInt(decimals))
        + BigInt(frac.padEnd(decimals, '0').slice(0, decimals));
}

export function baseUnitsToAmount(units, decimals = UDT_DECIMALS) {
    const base = 10n ** BigInt(decimals);
    const whole = units / base;
    const frac = units % base;
    return Number(`${whole}.${frac.toString().padStart(decimals, '0')}`);
}
