import { Inventory } from '../core/Inventory.js';
import { PropInventory } from '../property/propInventory.js';

export const INVENTORY_CELL_SCHEMA = 'cellshire.inventory';
export const INVENTORY_CELL_VERSION = 1;

export function normalizeInventoryCell(cell) {
    if (!cell || typeof cell !== 'object') return null;
    if (cell.schema !== INVENTORY_CELL_SCHEMA || cell.version !== INVENTORY_CELL_VERSION) return null;
    if (cell.kind === 'currency') {
        const amount = Number(cell.amount);
        if (typeof cell.currency !== 'string' || cell.currency === '') return null;
        if (!Number.isFinite(amount) || amount <= 0) return null;
        return {
            kind: 'currency',
            currency: cell.currency,
            amount,
            cellId: stringOr(cell.cellId, `${cell.currency}:${amount}`),
            owner: stringOr(cell.owner, ''),
            blockNumber: numberOr(cell.blockNumber, 0),
        };
    }
    if (cell.kind === 'prop') {
        const count = Number(cell.count ?? 1);
        if (typeof cell.assetId !== 'string' || cell.assetId === '') return null;
        if (!Number.isFinite(count) || count <= 0) return null;
        return {
            kind: 'prop',
            assetId: cell.assetId,
            count,
            cellId: stringOr(cell.cellId, `${cell.assetId}:${count}`),
            owner: stringOr(cell.owner, ''),
            blockNumber: numberOr(cell.blockNumber, 0),
        };
    }
    if (cell.kind === 'skin') {
        if (typeof cell.assetId !== 'string' || cell.assetId === '') return null;
        return {
            kind: 'skin',
            assetId: cell.assetId,
            cellId: stringOr(cell.cellId, `skin:${cell.assetId}`),
            owner: stringOr(cell.owner, ''),
            blockNumber: numberOr(cell.blockNumber, 0),
        };
    }
    return null;
}

export function buildInventorySnapshot(cells = [], opts = {}) {
    const minBlockNumber = numberOr(opts.minBlockNumber, 0);
    const normalized = cells.map(normalizeInventoryCell).filter(Boolean);
    const staleCells = normalized.filter(cell => cell.blockNumber < minBlockNumber);
    const active = normalized.filter(cell => cell.blockNumber >= minBlockNumber);

    const currencies = new Inventory();
    const props = new PropInventory();
    const skins = new Set();
    for (const cell of active) {
        if (cell.kind === 'currency') currencies.add(cell.currency, cell.amount);
        else if (cell.kind === 'prop') props.add(cell.assetId, cell.count);
        else if (cell.kind === 'skin') skins.add(cell.assetId);
    }

    applyPendingDeltas({ currencies, props, skins }, opts.pending ?? []);
    return {
        source: 'chain',
        capturedAt: opts.capturedAt ?? Date.now(),
        minBlockNumber,
        stale: staleCells.length > 0,
        staleCells,
        currencies,
        props,
        skins: Array.from(skins).sort(),
    };
}

export class LocalInventoryAdapter {
    constructor({ currencies, props, skins = [] } = {}) {
        this.currencies = currencies ?? new Inventory();
        this.props = props ?? new PropInventory();
        this.skins = new Set(skins);
    }

    async read() {
        return {
            source: 'local',
            capturedAt: Date.now(),
            stale: false,
            staleCells: [],
            currencies: this.currencies,
            props: this.props,
            skins: Array.from(this.skins).sort(),
        };
    }
}

export class ChainInventoryAdapter {
    constructor({ indexer, owner, minBlockNumber = 0, pending = [] } = {}) {
        this.indexer = indexer;
        this.owner = owner;
        this.minBlockNumber = minBlockNumber;
        this.pending = pending;
    }

    async read() {
        const cells = await this.indexer.getInventoryCells({ owner: this.owner });
        return buildInventorySnapshot(cells, {
            minBlockNumber: this.minBlockNumber,
            pending: this.pending,
            capturedAt: Date.now(),
        });
    }
}

export function applyPendingDeltas({ currencies, props, skins }, pending = []) {
    for (const delta of pending) {
        if (delta?.kind === 'currency') {
            const amount = Number(delta.amount);
            if (typeof delta.currency === 'string' && delta.currency !== '' && Number.isFinite(amount)) {
                currencies.add(delta.currency, amount);
            }
        } else if (delta?.kind === 'prop') {
            const count = Number(delta.count);
            if (typeof delta.assetId === 'string' && delta.assetId !== '' && Number.isFinite(count)) {
                props.add(delta.assetId, count);
            }
        } else if (delta?.kind === 'skin') {
            if (typeof delta.assetId !== 'string' || delta.assetId === '') continue;
            if (delta.remove) skins.delete(delta.assetId);
            else skins.add(delta.assetId);
        }
    }
}

function stringOr(value, fallback) {
    return typeof value === 'string' && value !== '' ? value : fallback;
}

function numberOr(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}
