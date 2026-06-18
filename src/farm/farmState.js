import {
    FARM_CROPS,
    FARM_STARTER_CROP_ID,
    isFarmPlotReady,
    normalizeFarmClock,
    normalizeFarmEpoch,
    normalizeFarmTier,
} from './farmZone.js';

export const FARM_STATE_STORAGE_PREFIX = 'cellshire:farm:v1:';

export function farmStateStorageKey(ownerId = 'local') {
    return `${FARM_STATE_STORAGE_PREFIX}${encodeURIComponent(ownerId || 'local')}`;
}

export function farmPlotKey(gx, gy) {
    return `${gx},${gy}`;
}

export class FarmState {
    constructor({ tier = 1, plots = [] } = {}) {
        this.tier = normalizeFarmTier(tier);
        this.plots = new Map();
        for (const plot of plots) {
            const gx = Number(plot?.gx);
            const gy = Number(plot?.gy);
            const plantedAt = Number(plot?.plantedAt);
            const cropId = FARM_CROPS[plot?.cropId] ? plot.cropId : FARM_STARTER_CROP_ID;
            const crop = FARM_CROPS[cropId];
            if (!Number.isInteger(gx) || !Number.isInteger(gy) || !Number.isFinite(plantedAt)) continue;
            const plantedEpoch = normalizeFarmEpoch(plot?.plantedEpoch);
            const readyEpoch = normalizeFarmEpoch(plot?.readyEpoch)
                ?? (plantedEpoch === null ? null : plantedEpoch + (crop.growEpochs ?? 1));
            const readyAt = Number.isFinite(Number(plot?.readyAt))
                ? Number(plot.readyAt)
                : plantedAt + crop.growMs;
            this.plots.set(farmPlotKey(gx, gy), {
                gx,
                gy,
                cropId,
                plantedAt,
                readyAt,
                plantedEpoch,
                readyEpoch,
            });
        }
    }

    setTier(tier) {
        const next = normalizeFarmTier(tier);
        if (next === this.tier) return false;
        this.tier = next;
        return true;
    }

    plotAt(gx, gy) {
        return this.plots.get(farmPlotKey(gx, gy)) ?? null;
    }

    plant(gx, gy, { cropId = FARM_STARTER_CROP_ID, now = Date.now(), epoch = null } = {}) {
        if (this.plotAt(gx, gy)) return { ok: false, reason: 'occupied' };
        const crop = FARM_CROPS[cropId];
        if (!crop) return { ok: false, reason: 'unknown-crop' };
        const plantedAt = Number(now);
        const plantedEpoch = normalizeFarmEpoch(epoch);
        const plot = {
            gx,
            gy,
            cropId,
            plantedAt,
            readyAt: plantedAt + crop.growMs,
            plantedEpoch,
            readyEpoch: plantedEpoch === null ? null : plantedEpoch + (crop.growEpochs ?? 1),
        };
        this.plots.set(farmPlotKey(gx, gy), plot);
        return { ok: true, plot, crop };
    }

    harvest(gx, gy, clockOptions = {}) {
        const plot = this.plotAt(gx, gy);
        if (!plot) return { ok: false, reason: 'missing' };
        const crop = FARM_CROPS[plot.cropId];
        if (!crop) return { ok: false, reason: 'unknown-crop' };
        const clock = normalizeFarmClock(clockOptions);
        if (!isFarmPlotReady(plot, clock)) {
            return {
                ok: false,
                reason: 'not-ready',
                plot,
                crop,
                remainingMs: Math.max(0, plot.readyAt - clock.now),
                remainingEpochs: clock.epoch === null || !Number.isInteger(plot.readyEpoch)
                    ? null
                    : Math.max(0, plot.readyEpoch - clock.epoch),
            };
        }
        this.plots.delete(farmPlotKey(gx, gy));
        return { ok: true, plot, crop, output: crop.output };
    }

    entries() {
        return Array.from(this.plots.values())
            .sort((a, b) => (a.gy - b.gy) || (a.gx - b.gx));
    }

    readyCount(nowOrClock = Date.now()) {
        const clock = normalizeFarmClock(nowOrClock);
        return this.entries().filter(plot => isFarmPlotReady(plot, clock)).length;
    }

    serialize() {
        return {
            v: 1,
            tier: this.tier,
            plots: this.entries().map(plot => ({ ...plot })),
        };
    }
}

export function loadFarmState(storage, ownerId = 'local') {
    const raw = storage?.get?.(farmStateStorageKey(ownerId));
    if (!raw) return new FarmState();
    try {
        const data = JSON.parse(raw);
        if (data?.v !== 1) return new FarmState();
        return new FarmState({ tier: data.tier, plots: data.plots ?? [] });
    } catch {
        return new FarmState();
    }
}

export function saveFarmState(storage, ownerId = 'local', farmState) {
    try {
        storage?.set?.(farmStateStorageKey(ownerId), JSON.stringify(farmState.serialize()));
        return true;
    } catch {
        return false;
    }
}

export function clearFarmState(storage, ownerId = 'local') {
    try {
        storage?.remove?.(farmStateStorageKey(ownerId));
        return true;
    } catch {
        return false;
    }
}
