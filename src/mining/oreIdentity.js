export function mapIdForEpoch(epochNumber) {
    return epochNumber === null || epochNumber === undefined || epochNumber === ''
        ? 'mine:local'
        : `mine:${epochNumber}`;
}

export function oreIdForObject({ mapId, epoch, obj }) {
    if (!obj) return null;
    const encodedMap = encodeURIComponent(mapId);
    return [
        'ore',
        encodedMap,
        epoch ?? 'local',
        obj.gx,
        obj.gy,
        obj.assetId,
    ].join(':');
}

export function oreIdentityForObject({ epoch, obj, mapId = mapIdForEpoch(epoch) }) {
    return {
        mapId,
        epoch: epoch ?? null,
        gx: obj.gx,
        gy: obj.gy,
        oreType: obj.assetId,
        oreId: oreIdForObject({ mapId, epoch, obj }),
    };
}

export function parseOreId(oreId) {
    if (typeof oreId !== 'string') return null;
    const parts = oreId.split(':');
    if (parts.length !== 6 || parts[0] !== 'ore') return null;
    const gx = Number(parts[3]);
    const gy = Number(parts[4]);
    if (!Number.isInteger(gx) || !Number.isInteger(gy)) return null;
    return {
        mapId: decodeURIComponent(parts[1]),
        epoch: parts[2] === 'local' ? null : parts[2],
        gx,
        gy,
        oreType: parts[5],
    };
}
