import { normalizePropertyTier } from './propertyExpansion.js';

export const PROPERTY_STORAGE_KEY = 'cellshire:property:v1:local';

export function savePropertyZone(storage, tileMap, camera = null, opts = {}) {
    try {
        storage.set(PROPERTY_STORAGE_KEY, JSON.stringify({
            v: 1,
            savedAt: Date.now(),
            propertyTier: normalizePropertyTier(opts.propertyTier),
            tileMap: tileMap.serialize(),
            camera: camera ? {
                offsetX: camera.offsetX,
                offsetY: camera.offsetY,
                zoom: camera.zoom,
            } : null,
        }));
        return true;
    } catch {
        return false;
    }
}

export function loadPropertyZone(storage) {
    const raw = storage.get(PROPERTY_STORAGE_KEY);
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        if (data?.v !== 1 || !data.tileMap) return null;
        return {
            tileMap: data.tileMap,
            camera: data.camera ?? null,
            savedAt: data.savedAt ?? null,
            propertyTier: normalizePropertyTier(data.propertyTier),
        };
    } catch {
        return null;
    }
}

export function clearPropertyZone(storage) {
    storage.remove(PROPERTY_STORAGE_KEY);
}
