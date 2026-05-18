import { describe, it, expect } from '../test/harness.js';
import { CELL_CURSORS } from './cursors.js';

describe('CELL_CURSORS', () => {
    it('defines contextual cursor values for play and property surfaces', () => {
        expect(CELL_CURSORS.walk.startsWith('url("data:image/svg+xml,')).toBe(true);
        expect(CELL_CURSORS.mine.startsWith('url("data:image/svg+xml,')).toBe(true);
        expect(CELL_CURSORS.interact.startsWith('url("data:image/svg+xml,')).toBe(true);
        expect(CELL_CURSORS.place.startsWith('url("data:image/svg+xml,')).toBe(true);
        expect(CELL_CURSORS.erase.startsWith('url("data:image/svg+xml,')).toBe(true);
        expect(CELL_CURSORS.blocked).toBe('not-allowed');
        expect(CELL_CURSORS.pan).toBe('grab');
    });
});
