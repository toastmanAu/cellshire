import { describe, it, expect } from '../test/harness.js';
import {
    ckbCollateralAmount,
    collateralLockArgs,
    decodeDebt,
    encodeDebt,
    ownerLockHash,
} from './debtCell.js';

const OUTPOINT = {
    txHash: `0x${'1'.repeat(64)}`,
    index: 2,
};

describe('debt cell encoding', () => {
    it('round-trips debt cell data deterministically', () => {
        const debt = {
            beneficiaryLockHash: ownerLockHash('ckt1-player'),
            principal: 7500,
            fee: 187.5,
            dueEpoch: 14442,
            collateralKind: 'ckb',
            collateralOutpoint: OUTPOINT,
            issuedAtEpoch: 14400,
            offerId: 'starter-float',
        };
        const encoded = encodeDebt(debt);
        expect(encoded).toBe(encodeDebt({ ...debt }));
        const decoded = decodeDebt(encoded);
        expect(decoded.principal).toBe(7500);
        expect(decoded.fee).toBe(187.5);
        expect(decoded.collateralOutpoint.txHash).toBe(OUTPOINT.txHash);
        expect(decoded.offerId).toBe('starter-float');
    });

    it('derives collateral lock args from the owner lock hash', () => {
        const hash = ownerLockHash('ckt1-player');
        expect(hash.length).toBe(66);
        const args = collateralLockArgs({ ownerLockHash: hash });
        expect(args.length).toBe(68);
        expect(args.endsWith(hash.slice(2))).toBe(true);
    });

    it('computes the first CKB collateral ratio', () => {
        expect(ckbCollateralAmount(7500)).toBe(11250);
    });
});
