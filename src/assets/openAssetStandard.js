import { assetDefinitionFor, registerOpenAssetDefinition } from './assetRegistry.js';

export const OPEN_ASSET_SCHEMA = 'cellshire.open_asset';
export const OPEN_ASSET_SCHEMA_VERSION = 1;
export const OPEN_ASSET_RENDERER = 'cellshire.manifest-alias';

export const OPEN_ASSET_ITEM_TYPES = Object.freeze([
    'ground_tile',
    'prop',
    'character_skin',
    'accessory',
]);

const ITEM_TYPE_DEFAULTS = Object.freeze({
    ground_tile: Object.freeze({ category: 'terrain', kind: 'terrain' }),
    prop: Object.freeze({ category: 'props', kind: 'object' }),
    character_skin: Object.freeze({ category: 'character', kind: 'object' }),
    accessory: Object.freeze({ category: 'props', kind: 'object' }),
});

export function openAssetIdForCell(cellId) {
    return `open:${String(cellId || '').replace(/[^a-zA-Z0-9:_-]/g, '_')}`;
}

export function normalizeOpenAssetCell(cell) {
    if (!cell || typeof cell !== 'object') return { ok: false, reason: 'missing-cell' };
    if (cell.schema !== OPEN_ASSET_SCHEMA) return { ok: false, reason: 'wrong-schema' };
    if (cell.version !== OPEN_ASSET_SCHEMA_VERSION) return { ok: false, reason: 'unsupported-version' };
    if (typeof cell.cellId !== 'string' || cell.cellId === '') return { ok: false, reason: 'missing-cell-id' };
    if (!OPEN_ASSET_ITEM_TYPES.includes(cell.itemType)) return { ok: false, reason: 'invalid-item-type' };
    if (cell.render?.renderer !== OPEN_ASSET_RENDERER) return { ok: false, reason: 'unsupported-renderer' };
    const sourceId = cell.render?.source?.assetId;
    const source = assetDefinitionFor(sourceId);
    if (!source) return { ok: false, reason: 'missing-render-source' };

    const defaults = ITEM_TYPE_DEFAULTS[cell.itemType];
    const overrides = cell.render.overrides ?? {};
    const footprint = normalizeFootprint(overrides.footprint ?? source.footprint);
    if (!footprint) return { ok: false, reason: 'invalid-footprint' };

    return {
        ok: true,
        cell: {
            schema: cell.schema,
            version: cell.version,
            cellId: cell.cellId,
            itemType: cell.itemType,
            owner: typeof cell.owner === 'string' ? cell.owner : '',
            metadata: {
                name: stringOr(cell.metadata?.name, source.name),
                description: stringOr(cell.metadata?.description, ''),
                traits: typeof cell.metadata?.traits === 'object' && cell.metadata.traits
                    ? { ...cell.metadata.traits }
                    : {},
            },
            render: {
                renderer: OPEN_ASSET_RENDERER,
                version: Number(cell.render.version) || 1,
                source: { assetId: source.id },
                overrides: {
                    category: stringOr(overrides.category, defaults.category),
                    kind: stringOr(overrides.kind, defaults.kind),
                    footprint,
                    sizeScale: numberOr(overrides.sizeScale, source.sizeScale ?? 1),
                    tileLike: overrides.tileLike === true || source.tileLike === true,
                    fitCell: overrides.fitCell === true || source.fitCell === true,
                    flatBase: overrides.flatBase === true || source.flatBase === true,
                    noShadow: overrides.noShadow === true || source.noShadow === true,
                    shadowStyle: stringOr(overrides.shadowStyle, source.shadowStyle ?? 'cast'),
                },
            },
        },
    };
}

export function definitionFromOpenAssetCell(cell) {
    const normalized = normalizeOpenAssetCell(cell);
    if (!normalized.ok) return normalized;
    const c = normalized.cell;
    const o = c.render.overrides;
    return {
        ok: true,
        definition: {
            id: openAssetIdForCell(c.cellId),
            name: c.metadata.name,
            category: o.category,
            kind: o.kind,
            footprint: o.footprint,
            sizeScale: o.sizeScale,
            tileLike: o.tileLike,
            fitCell: o.fitCell,
            flatBase: o.flatBase,
            noShadow: o.noShadow,
            shadowStyle: o.shadowStyle,
            renderSourceAssetId: c.render.source.assetId,
            openAsset: {
                schema: c.schema,
                version: c.version,
                cellId: c.cellId,
                itemType: c.itemType,
                owner: c.owner,
                renderRule: c.render.renderer,
            },
        },
    };
}

export function registerOpenAssetCell(cell) {
    const out = definitionFromOpenAssetCell(cell);
    if (!out.ok) return out;
    return registerOpenAssetDefinition(out.definition);
}

function normalizeFootprint(value) {
    const w = Number(value?.w);
    const d = Number(value?.d);
    if (!Number.isInteger(w) || !Number.isInteger(d)) return null;
    if (w < 1 || d < 1 || w > 6 || d > 6) return null;
    return Object.freeze({ w, d });
}

function stringOr(value, fallback) {
    return typeof value === 'string' && value !== '' ? value : fallback;
}

function numberOr(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}
