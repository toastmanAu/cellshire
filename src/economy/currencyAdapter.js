import { Inventory } from '../core/Inventory.js';
import { registerOpenAssetCell, openAssetIdForCell } from '../assets/openAssetStandard.js';
import { CURRENCY_CATALOG } from '../mining/cryptoEconomy.js';
import { PropInventory } from '../property/propInventory.js';
import {
    settleBankBorrowFixture,
    settleBankRepayFixture,
} from '../chain/bankTx.js';
import { settleMarketplacePurchaseFixture } from '../chain/marketplacePurchaseTx.js';
import { settleStorePurchaseFixture } from '../chain/storePurchaseTx.js';
import { settleTraderSwapFixture } from '../chain/traderSwapTx.js';
import { pendingDeltaTotals } from './pendingCurrencyDeltas.js';

export class LocalCurrencyAdapter {
    constructor({ inventory } = {}) {
        this.inventory = inventory ?? new Inventory();
    }

    async read() {
        return {
            source: 'local',
            stale: false,
            pending: false,
            currencies: this.inventory,
        };
    }
}

export class ReadOnlyChainCurrencyAdapter {
    constructor({
        localInventory,
        props = null,
        skins = [],
        indexer,
        owner,
        chainCurrencyIds = ['bch'],
        pendingDeltas = null,
    } = {}) {
        this.localInventory = localInventory ?? new Inventory();
        this.props = props;
        this.skins = skins;
        this.indexer = indexer;
        this.owner = owner;
        this.chainCurrencyIds = chainCurrencyIds;
        this.pendingDeltas = pendingDeltas;
        this.lastIndexedAmounts = new Map();
    }

    async read() {
        const currencies = new Inventory();
        for (const [currencyId, amount] of this.localInventory.entries()) {
            currencies.add(currencyId, amount);
        }
        const staleCurrencies = [];
        const pendingBeforeRead = this.pendingDeltas?.list?.() ?? [];
        const currencyIds = Array.from(new Set([
            ...this.chainCurrencyIds,
            ...pendingBeforeRead.map(delta => delta.currency),
        ]));
        const chainBalances = await this.indexer?.getCurrencyBalances?.({
            owner: this.owner,
            currencyIds,
        });
        const indexedAmounts = {};
        for (const currencyId of currencyIds) {
            if (!CURRENCY_CATALOG[currencyId]) continue;
            const entry = chainBalances?.[currencyId];
            if (!entry) {
                staleCurrencies.push(currencyId);
                continue;
            }
            const indexedAmount = Number(entry.amount) || 0;
            indexedAmounts[currencyId] = indexedAmount;
            this.lastIndexedAmounts.set(currencyId, indexedAmount);
            currencies.add(currencyId, -currencies.get(currencyId));
            currencies.add(currencyId, indexedAmount);
            if (entry.stale) staleCurrencies.push(currencyId);
        }
        const pendingAfterReconcile = this.pendingDeltas?.clearReconciled?.(indexedAmounts).pending
            ?? pendingBeforeRead;
        const pendingTotals = pendingDeltaTotals(pendingAfterReconcile);
        for (const [currencyId, amount] of Object.entries(pendingTotals)) {
            if (!CURRENCY_CATALOG[currencyId]) continue;
            currencies.add(currencyId, amount);
        }
        const props = await this._readOpenAssetProps();
        return {
            source: 'chain',
            stale: staleCurrencies.length > 0,
            pending: staleCurrencies.length > 0 || pendingAfterReconcile.length > 0,
            staleCurrencies,
            pendingDeltas: pendingAfterReconcile,
            currencies,
            props,
            skins: this.skins,
        };
    }

    async _readOpenAssetProps() {
        const cells = await this.indexer?.getOpenAssetCells?.({ owner: this.owner });
        if (!Array.isArray(cells)) return this.props;
        const props = new PropInventory(this.props?.entries?.() ?? []);
        const indexedCounts = new Map();
        for (const cell of cells) {
            const registered = registerOpenAssetCell(cell);
            if (!registered.ok) continue;
            const assetId = registered.definition.id;
            indexedCounts.set(assetId, (indexedCounts.get(assetId) ?? 0) + 1);
        }
        for (const [assetId, count] of indexedCounts) {
            const current = props.get(assetId);
            if (current < count) props.add(assetId, count - current);
            const runtimeCurrent = this.props?.get?.(assetId) ?? 0;
            if (runtimeCurrent < count) this.props?.add?.(assetId, count - runtimeCurrent);
        }
        return props;
    }

    addPendingDelta({ currency, amount, txHash, source = 'unknown' } = {}) {
        const indexed = this.lastIndexedAmounts.get(currency) ?? 0;
        const pendingTotal = pendingDeltaTotals(this.pendingDeltas?.list?.() ?? [])[currency] ?? 0;
        return this.pendingDeltas?.add?.({
            currency,
            amount,
            txHash,
            source,
            expectedAmount: indexed + pendingTotal + Number(amount || 0),
        });
    }

    settleTraderSwapTx(tx, receipt = {}) {
        return this.indexer?.applyTraderSwapTx?.(tx, {
            txHash: receipt.txHash,
        }) ?? null;
    }

    settleStorePurchaseTx(tx, receipt = {}) {
        return this.indexer?.applyStorePurchaseTx?.(tx, {
            txHash: receipt.txHash,
        }) ?? null;
    }

    settleMarketplacePurchaseTx(tx, receipt = {}) {
        return this.indexer?.applyMarketplacePurchaseTx?.(tx, {
            txHash: receipt.txHash,
        }) ?? null;
    }

    settleBankBorrowTx(tx, receipt = {}) {
        return this.indexer?.applyBankBorrowTx?.(tx, {
            txHash: receipt.txHash,
        }) ?? null;
    }

    settleBankRepayTx(tx, receipt = {}) {
        return this.indexer?.applyBankRepayTx?.(tx, {
            txHash: receipt.txHash,
        }) ?? null;
    }
}

export class FixtureCurrencyIndexer {
    constructor({ balances = {}, offline = false, bankState = null, openAssetCells = [] } = {}) {
        this.balances = balances;
        this.openAssetCells = openAssetCells;
        this.offline = offline;
        this.bankState = bankState ?? {
            debtCells: {},
            lockedCollateral: {},
            releasedCollateral: {},
        };
        this.bankState.debtCells = this.bankState.debtCells ?? {};
        this.bankState.lockedCollateral = this.bankState.lockedCollateral ?? {};
        this.bankState.releasedCollateral = this.bankState.releasedCollateral ?? {};
    }

    async getCurrencyBalances({ currencyIds } = {}) {
        if (this.offline) {
            return Object.fromEntries((currencyIds ?? []).map(currencyId => [
                currencyId,
                { amount: 0, stale: true },
            ]));
        }
        return Object.fromEntries((currencyIds ?? []).map(currencyId => [
            currencyId,
            this.balances[currencyId] ?? { amount: 0, stale: false },
        ]));
    }

    async getOpenAssetCells({ owner } = {}) {
        if (this.offline) return [];
        return this.openAssetCells.filter(cell => !owner || cell.owner === owner);
    }

    applyTraderSwapTx(tx, { txHash = null } = {}) {
        if (this.offline) return { ok: false, reason: 'indexer-offline' };
        const settlement = settleTraderSwapFixture({
            tx,
            indexedBalances: this.balances,
            txHash,
        });
        if (!settlement.ok) return settlement;
        for (const [currency, entry] of Object.entries(settlement.updates)) {
            if (entry.spent || entry.amount === 0) {
                this.balances[currency] = {
                    amount: 0,
                    stale: false,
                    spent: true,
                    outPoint: null,
                    updatedByTxHash: txHash,
                };
            } else {
                this.balances[currency] = {
                    amount: entry.amount,
                    stale: false,
                    outPoint: entry.outPoint,
                    updatedByTxHash: txHash,
                };
            }
        }
        return settlement;
    }

    applyStorePurchaseTx(tx, { txHash = null } = {}) {
        if (this.offline) return { ok: false, reason: 'indexer-offline' };
        const settlement = settleStorePurchaseFixture({
            tx,
            indexedBalances: this.balances,
            txHash,
        });
        if (!settlement.ok) return settlement;
        for (const [currency, entry] of Object.entries(settlement.updates)) {
            if (entry.spent || entry.amount === 0) {
                this.balances[currency] = {
                    amount: 0,
                    stale: false,
                    spent: true,
                    outPoint: null,
                    updatedByTxHash: txHash,
                };
            } else {
                this.balances[currency] = {
                    amount: entry.amount,
                    stale: false,
                    outPoint: entry.outPoint,
                    updatedByTxHash: txHash,
                };
            }
        }
        this._upsertOpenAssetCell(settlement.outputs?.open_asset_cell);
        return settlement;
    }

    applyMarketplacePurchaseTx(tx, { txHash = null } = {}) {
        if (this.offline) return { ok: false, reason: 'indexer-offline' };
        const settlement = settleMarketplacePurchaseFixture({
            tx,
            indexedBalances: this.balances,
            txHash,
        });
        if (!settlement.ok) return settlement;
        const openAssetTransfer = settlement.outputs?.open_asset_transfer;
        if (openAssetTransfer) {
            const transferred = this._transferOpenAssetCell(openAssetTransfer);
            if (!transferred.ok) return transferred;
            settlement.outputs.open_asset_cell = transferred.cell;
        }
        this._applyCurrencyUpdates(settlement.updates, txHash);
        return settlement;
    }

    applyBankBorrowTx(tx, { txHash = null } = {}) {
        if (this.offline) return { ok: false, reason: 'indexer-offline' };
        const settlement = settleBankBorrowFixture({
            tx,
            indexedBalances: this.balances,
            txHash,
        });
        if (!settlement.ok) return settlement;
        this._applyCurrencyUpdates(settlement.updates, txHash);
        Object.assign(this.bankState.debtCells, settlement.bankUpdates?.debtCells ?? {});
        Object.assign(this.bankState.lockedCollateral, settlement.bankUpdates?.lockedCollateral ?? {});
        return settlement;
    }

    applyBankRepayTx(tx, { txHash = null } = {}) {
        if (this.offline) return { ok: false, reason: 'indexer-offline' };
        const settlement = settleBankRepayFixture({
            tx,
            indexedBalances: this.balances,
            bankState: this.bankState,
            txHash,
        });
        if (!settlement.ok) return settlement;
        this._applyCurrencyUpdates(settlement.updates, txHash);
        for (const key of settlement.bankUpdates?.consumedDebtKeys ?? []) {
            delete this.bankState.debtCells[key];
            delete this.bankState.lockedCollateral[key];
        }
        Object.assign(this.bankState.releasedCollateral, settlement.bankUpdates?.releasedCollateral ?? {});
        return settlement;
    }

    _applyCurrencyUpdates(updates = {}, txHash = null) {
        for (const [currency, entry] of Object.entries(updates)) {
            if (entry.spent || entry.amount === 0) {
                this.balances[currency] = {
                    amount: 0,
                    stale: false,
                    spent: true,
                    outPoint: null,
                    updatedByTxHash: txHash,
                };
            } else {
                this.balances[currency] = {
                    amount: entry.amount,
                    stale: false,
                    outPoint: entry.outPoint,
                    updatedByTxHash: txHash,
                };
            }
        }
    }

    _upsertOpenAssetCell(cell) {
        if (!cell?.cellId) return;
        const id = openAssetIdForCell(cell.cellId);
        const next = this.openAssetCells.filter(existing => openAssetIdForCell(existing.cellId) !== id);
        next.push(cell);
        this.openAssetCells = next;
    }

    _transferOpenAssetCell({ cell_id: cellId, from, to } = {}) {
        if (!cellId || !to) return { ok: false, reason: 'invalid-open-asset-transfer' };
        const assetId = openAssetIdForCell(cellId);
        const index = this.openAssetCells.findIndex(cell => openAssetIdForCell(cell.cellId) === assetId);
        if (index < 0) return { ok: false, reason: 'missing-open-asset-cell' };
        const current = this.openAssetCells[index];
        if (from && current.owner !== from) return { ok: false, reason: 'open-asset-owner-mismatch' };
        const cell = { ...current, owner: to };
        this.openAssetCells = [
            ...this.openAssetCells.slice(0, index),
            cell,
            ...this.openAssetCells.slice(index + 1),
        ];
        return { ok: true, cell };
    }
}
