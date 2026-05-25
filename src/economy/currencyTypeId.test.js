import { describe, expect, it } from '../test/harness.js';
import { CURRENCY_CATALOG } from '../mining/cryptoEconomy.js';
import {
    currencyTypeArgs,
    currencyTypeId,
    currencyTypeScript,
} from './currencyTypeId.js';

describe('currency type ids', () => {
    it('derives deterministic ids for every Cellshire currency', () => {
        expect(currencyTypeId('bch')).toBe(currencyTypeId('bch'));
        expect(currencyTypeId('ckb')).toBe('native:ckb');
        expect(currencyTypeId('unknown')).toBeNull();
    });

    it('keeps non-CKB sUDT args unique and 32 bytes', () => {
        const ids = Object.keys(CURRENCY_CATALOG).filter(currencyId => currencyId !== 'ckb');
        const args = ids.map(currencyTypeArgs);
        expect(new Set(args).size).toBe(args.length);
        expect(args.every(value => /^0x[0-9a-f]{64}$/.test(value))).toBe(true);
    });

    it('builds a CKB type script for sUDT currencies only', () => {
        expect(currencyTypeScript('bch').hashType).toBe('type');
        expect(currencyTypeScript('ckb')).toBeNull();
    });
});
