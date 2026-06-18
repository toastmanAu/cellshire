import { Inventory } from '../core/Inventory.js';
import { describe, expect, it } from '../test/harness.js';
import {
    applyFirstSessionGrant,
    FIRST_SESSION_GRANT_CKB,
    firstSessionGrantEnabled,
} from './firstSessionGrant.js';

describe('first session grant', () => {
    it('is enabled only by the explicit smoke flag', () => {
        expect(firstSessionGrantEnabled(new URLSearchParams('firstSessionGrant=1'))).toBe(true);
        expect(firstSessionGrantEnabled(new URLSearchParams(''))).toBe(false);
        expect(firstSessionGrantEnabled(new URLSearchParams('firstSessionGrant=0'))).toBe(false);
    });

    it('grants the guarded first-session CKB budget when enabled', () => {
        const inventory = new Inventory();
        const out = applyFirstSessionGrant({
            params: new URLSearchParams('firstSessionGrant=1'),
            inventory,
        });
        expect(out.ok).toBe(true);
        expect(out.amount).toBe(FIRST_SESSION_GRANT_CKB);
        expect(inventory.get('ckb')).toBe(10000);
    });

    it('does nothing without the smoke flag', () => {
        const inventory = new Inventory();
        const out = applyFirstSessionGrant({
            params: new URLSearchParams(''),
            inventory,
        });
        expect(out.ok).toBe(false);
        expect(inventory.get('ckb')).toBe(0);
    });
});
