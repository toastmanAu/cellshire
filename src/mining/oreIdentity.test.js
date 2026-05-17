import { describe, it, expect } from '../test/harness.js';
import { mapIdForEpoch, oreIdentityForObject, parseOreId } from './oreIdentity.js';

describe('mapIdForEpoch', () => {
    it('builds the public mine map id for a live epoch', () => {
        expect(mapIdForEpoch('14455')).toBe('mine:14455');
    });

    it('uses a local map id when epoch is unknown', () => {
        expect(mapIdForEpoch(null)).toBe('mine:local');
    });
});

describe('oreIdentityForObject', () => {
    it('builds a deterministic ore id from map, epoch, position, and ore type', () => {
        const obj = { gx: 42, gy: 17, assetId: 'coal_seam' };
        const out = oreIdentityForObject({ epoch: '14455', obj });
        expect(out.mapId).toBe('mine:14455');
        expect(out.oreId).toBe('ore:mine%3A14455:14455:42:17:coal_seam');
    });

    it('parses the id back to its logical fields', () => {
        const parsed = parseOreId('ore:mine%3A14455:14455:42:17:coal_seam');
        expect(parsed).toEqual({
            mapId: 'mine:14455',
            epoch: '14455',
            gx: 42,
            gy: 17,
            oreType: 'coal_seam',
        });
    });
});
