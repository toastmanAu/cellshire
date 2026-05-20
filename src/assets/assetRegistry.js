import { ASSET_INDEX, ASSET_MANIFEST } from './assetManifest.js';

const openDefinitions = new Map();

export function registerOpenAssetDefinition(definition) {
    if (!definition?.id || !definition.renderSourceAssetId) {
        return { ok: false, reason: 'invalid-definition' };
    }
    if (!assetDefinitionFor(definition.renderSourceAssetId)) {
        return { ok: false, reason: 'missing-render-source' };
    }
    const def = Object.freeze({
        ...definition,
        footprint: Object.freeze({
            w: Number(definition.footprint?.w) || 1,
            d: Number(definition.footprint?.d) || 1,
        }),
        openAsset: definition.openAsset ? Object.freeze({ ...definition.openAsset }) : null,
    });
    openDefinitions.set(def.id, def);
    return { ok: true, definition: def };
}

export function assetDefinitionFor(assetId) {
    return ASSET_INDEX[assetId] ?? openDefinitions.get(assetId) ?? null;
}

export function allAssetDefinitions() {
    return [...ASSET_MANIFEST, ...openDefinitions.values()];
}

export function openAssetDefinitions() {
    return Array.from(openDefinitions.values());
}

export function clearOpenAssetDefinitions() {
    openDefinitions.clear();
}
