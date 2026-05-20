import { normalizePropertyTier } from './propertyExpansion.js';

export const PROPERTY_STORAGE_KEY = 'cellshire:property:v1:local';

export function propertyStorageKeyForOwner(ownerId = 'local') {
    return ownerId && ownerId !== 'local'
        ? `cellshire:property:v1:${encodeURIComponent(ownerId)}`
        : PROPERTY_STORAGE_KEY;
}

export function savePropertyZone(storage, tileMap, camera = null, opts = {}) {
    try {
        storage.set(propertyStorageKeyForOwner(opts.ownerId), JSON.stringify({
            v: 1,
            savedAt: Date.now(),
            ownerId: opts.ownerId ?? 'local',
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

export function loadPropertyZone(storage, opts = {}) {
    const raw = storage.get(propertyStorageKeyForOwner(opts.ownerId));
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        if (data?.v !== 1 || !data.tileMap) return null;
        return {
            ownerId: data.ownerId ?? opts.ownerId ?? 'local',
            tileMap: data.tileMap,
            camera: data.camera ?? null,
            savedAt: data.savedAt ?? null,
            propertyTier: normalizePropertyTier(data.propertyTier),
        };
    } catch {
        return null;
    }
}

export function clearPropertyZone(storage, opts = {}) {
    storage.remove(propertyStorageKeyForOwner(opts.ownerId));
}
