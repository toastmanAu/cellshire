import { describe, it, expect } from '../test/harness.js';
import { FarmState, farmStateStorageKey, loadFarmState, saveFarmState } from './farmState.js';

describe('FarmState', () => {
    it('plants and harvests crops after their ready time', () => {
        const farm = new FarmState();
        const planted = farm.plant(15, 13, { now: 1000 });
        expect(planted.ok).toBe(true);
        expect(farm.harvest(15, 13, { now: 2000 }).reason).toBe('not-ready');
        const harvested = farm.harvest(15, 13, { now: planted.plot.readyAt });
        expect(harvested.ok).toBe(true);
        expect(harvested.output).toEqual({ resourceId: 'crop', amount: 3 });
        expect(farm.entries().length).toBe(0);
    });

    it('persists owner-keyed farm tier and plots', () => {
        const store = new Map();
        const storage = {
            get: key => store.get(key) ?? null,
            set: (key, value) => store.set(key, value),
        };
        const farm = new FarmState({ tier: 2 });
        farm.plant(14, 12, { now: 5000 });
        expect(saveFarmState(storage, 'joyid:alice', farm)).toBe(true);
        expect(store.has(farmStateStorageKey('joyid:alice'))).toBe(true);
        const loaded = loadFarmState(storage, 'joyid:alice');
        expect(loaded.tier).toBe(2);
        expect(loaded.plotAt(14, 12).readyAt > 5000).toBe(true);
    });
});
