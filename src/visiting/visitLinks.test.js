import { describe, it, expect } from '../test/harness.js';
import {
    buildVisitUrl,
    normalizeVisitSource,
    ownerIdForVisit,
    visitLinkSourceFromSnapshot,
} from './visitLinks.js';

describe('visit links', () => {
    it('formats shareable links with owner and snapshot source', () => {
        const url = buildVisitUrl({
            baseUrl: 'https://cellshire.test/game/?wallet=1&prices=fixed',
            ownerId: 'joyid:alice',
            source: 'chain',
        });
        expect(url).toBe('https://cellshire.test/game/?prices=fixed&visit=joyid%3Aalice&visitSource=chain');
    });

    it('falls back to a local preview owner and source', () => {
        const url = buildVisitUrl({
            baseUrl: 'https://cellshire.test/game/',
        });
        expect(url).toBe('https://cellshire.test/game/?visit=local&visitSource=local');
    });

    it('uses connected wallet address as the owner id when available', () => {
        expect(ownerIdForVisit({ address: 'ckt1alice' })).toBe('ckt1alice');
        expect(ownerIdForVisit(null)).toBe('local');
    });

    it('normalizes source flags', () => {
        expect(normalizeVisitSource('chain')).toBe('chain');
        expect(normalizeVisitSource('bad')).toBe('local');
        expect(visitLinkSourceFromSnapshot('chain')).toBe('chain');
    });
});
