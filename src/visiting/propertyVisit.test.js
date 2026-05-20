import { describe, it, expect } from '../test/harness.js';
import {
    buildPropertyVisitState,
    propertyVisitLabel,
    propertyVisitOwnerFromParams,
} from './propertyVisit.js';

describe('property visiting', () => {
    it('reads the visit owner from URL params', () => {
        expect(propertyVisitOwnerFromParams(new URLSearchParams('?visit=joyid%3Aalice'))).toBe('joyid:alice');
        expect(propertyVisitOwnerFromParams(new URLSearchParams('?visit='))).toBeNull();
        expect(propertyVisitOwnerFromParams(new URLSearchParams('?wallet=1'))).toBeNull();
    });

    it('builds a read-only visit state', () => {
        const state = buildPropertyVisitState('joyid:alice', { savedAt: 1 });
        expect(state.ownerId).toBe('joyid:alice');
        expect(state.readOnly).toBe(true);
        expect(state.hasSnapshot).toBe(true);
        expect(state.detail).toBe('Saved property snapshot');
    });

    it('shortens long owner labels for HUD use', () => {
        expect(propertyVisitLabel('joyid:alice')).toBe('joyid:alice');
        expect(propertyVisitLabel('ckt1qqqqqqqqqqqqqqqqqqqqq')).toBe('ckt1qqqq...qqqqqq');
    });
});
