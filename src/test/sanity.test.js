import { describe, it, expect } from './harness.js';

describe('test harness', () => {
    it('runs and reports a pass', () => {
        expect(1 + 1).toBe(2);
    });
});
