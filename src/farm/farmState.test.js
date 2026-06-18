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

    it('stores epoch maturity metadata when planted during a known shift', () => {
        const farm = new FarmState();
        const planted = farm.plant(15, 13, { now: 1000, epoch: '42' });
        expect(planted.ok).toBe(true);
        expect(planted.plot.plantedEpoch).toBe(42);
        expect(planted.plot.readyEpoch).toBe(43);
        expect(farm.readyCount({ now: planted.plot.readyAt, epoch: 42, timing: 'epoch' })).toBe(0);
        expect(farm.readyCount({ now: 2000, epoch: 43, timing: 'epoch' })).toBe(1);
    });

    it('supports herb and timber crop outputs with crop-specific timing', () => {
        const farm = new FarmState();
        const herb = farm.plant(15, 12, { cropId: 'herb_crop', now: 1000, epoch: 7 });
        const timber = farm.plant(14, 11, { cropId: 'timber_plot', now: 1000, epoch: 7 });
        expect(herb.plot.readyAt).toBe(11000);
        expect(herb.plot.readyEpoch).toBe(8);
        expect(timber.plot.readyAt).toBe(31000);
        expect(timber.plot.readyEpoch).toBe(9);
        expect(farm.harvest(15, 12, { now: 11000 }).output).toEqual({ resourceId: 'herb', amount: 2 });
        expect(farm.harvest(14, 11, { now: 31000 }).output).toEqual({ resourceId: 'wood', amount: 5 });
    });

    it('can harvest by epoch bucket when explicitly requested', () => {
        const farm = new FarmState();
        farm.plant(15, 13, { now: 1000, epoch: 42 });
        const early = farm.harvest(15, 13, { now: 999999, epoch: 42, timing: 'epoch' });
        expect(early.reason).toBe('not-ready');
        expect(early.remainingEpochs).toBe(1);
        const harvested = farm.harvest(15, 13, { now: 2000, epoch: 43, timing: 'epoch' });
        expect(harvested.ok).toBe(true);
        expect(farm.entries().length).toBe(0);
    });

    it('persists owner-keyed farm tier and plots', () => {
        const store = new Map();
        const storage = {
            get: key => store.get(key) ?? null,
            set: (key, value) => store.set(key, value),
        };
        const farm = new FarmState({ tier: 2 });
        farm.plant(14, 12, { now: 5000, epoch: 7 });
        expect(saveFarmState(storage, 'joyid:alice', farm)).toBe(true);
        expect(store.has(farmStateStorageKey('joyid:alice'))).toBe(true);
        const loaded = loadFarmState(storage, 'joyid:alice');
        expect(loaded.tier).toBe(2);
        expect(loaded.plotAt(14, 12).readyAt > 5000).toBe(true);
        expect(loaded.plotAt(14, 12).readyEpoch).toBe(8);
    });
});
