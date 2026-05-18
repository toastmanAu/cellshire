/**
 * Inventory.js
 *
 * Player's currency balances. Keys are internal crypto currency IDs
 * from `cryptoEconomy.js` (btc, ckb, rvn, etc.). The on-chain version
 * will mirror this 1:1 by replacing each Map entry with a UDT cell of
 * the same type.
 *
 * Subscribers (HUD, toast) can listen via `onChange(cb)` and get a
 * compact `{currency, delta, total}` payload on every mutation.
 */

export class Inventory {
    constructor() {
        this.balances = new Map();
        this._listeners = new Set();
    }

    /** Increment a balance by `delta` (default 1). Negative deltas spend. */
    add(currency, delta = 1) {
        if (delta === 0) return;
        const prev = this.balances.get(currency) ?? 0;
        const next = prev + delta;
        if (next === 0) this.balances.delete(currency);
        else this.balances.set(currency, next);
        for (const cb of this._listeners) cb({ currency, delta, total: next });
    }

    get(currency) {
        return this.balances.get(currency) ?? 0;
    }

    /** Sorted entries — useful for HUD rendering. */
    entries() {
        return Array.from(this.balances.entries())
            .sort((a, b) => b[1] - a[1]);
    }

    isEmpty() {
        return this.balances.size === 0;
    }

    /** Subscribe to mutations. Returns an unsubscribe function. */
    onChange(cb) {
        this._listeners.add(cb);
        return () => this._listeners.delete(cb);
    }
}
