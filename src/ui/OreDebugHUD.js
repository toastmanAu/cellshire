import { formatUsd, rewardCurrencyForOre } from '../mining/cryptoEconomy.js';
import { isOre, oreConfig } from '../mining/oreCatalog.js';

function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
}

function div(className, text = '') {
    const el = document.createElement('div');
    if (className) el.className = className;
    el.textContent = text;
    return el;
}

export function buildOreBudgetRows(game) {
    const objects = game?.tileMap?.objects ?? [];
    const states = game?.oreStates;
    const rows = [];

    for (const obj of objects) {
        if (!isOre(obj.assetId)) continue;
        const state = states?.get?.(obj.id);
        if (!state) continue;
        const remainingValueUsd = Number.isFinite(state.remainingValueUsd)
            ? state.remainingValueUsd
            : null;
        const totalValueUsd = Number.isFinite(state.totalValueUsd)
            ? state.totalValueUsd
            : null;
        rows.push({
            id: obj.id,
            assetId: obj.assetId,
            name: oreConfig(obj.assetId)?.displayName ?? obj.assetId,
            cell: `${obj.gx},${obj.gy}`,
            currency: rewardCurrencyForOre(obj.assetId).toUpperCase(),
            capacity: `${state.capacityRemaining}/${state.maxCapacity}`,
            remainingValueUsd,
            totalValueUsd,
            remainingLabel: formatUsd(remainingValueUsd),
            totalLabel: formatUsd(totalValueUsd),
        });
    }

    return rows.sort((a, b) => {
        const name = a.name.localeCompare(b.name);
        if (name !== 0) return name;
        return a.cell.localeCompare(b.cell);
    });
}

export function buildOreBudgetSummary(rows) {
    const remaining = rows.reduce((sum, row) => sum + (row.remainingValueUsd ?? 0), 0);
    const total = rows.reduce((sum, row) => sum + (row.totalValueUsd ?? 0), 0);
    return {
        count: rows.length,
        remaining,
        total,
        label: `Ore budgets · ${formatUsd(remaining)} / ${formatUsd(total)}`,
    };
}

export function installOreDebugHUD(game) {
    const root = document.createElement('details');
    root.id = 'ore-debug-hud';

    const summary = document.createElement('summary');
    root.appendChild(summary);

    const rowsEl = div('ore-debug-hud__rows');
    root.appendChild(rowsEl);
    document.body.appendChild(root);

    function render() {
        const rows = buildOreBudgetRows(game);
        const totals = buildOreBudgetSummary(rows);
        summary.textContent = `${totals.label} · ${totals.count} ores`;
        clear(rowsEl);

        if (rows.length === 0) {
            rowsEl.appendChild(div('ore-debug-hud__empty', 'No ore budgets on this map.'));
            return;
        }

        for (const row of rows) {
            const item = div('ore-debug-hud__row');
            item.appendChild(div('ore-debug-hud__name', `${row.name} (${row.currency})`));
            item.appendChild(div('ore-debug-hud__cell', row.cell));
            item.appendChild(div('ore-debug-hud__value', `${row.remainingLabel} / ${row.totalLabel}`));
            item.appendChild(div('ore-debug-hud__capacity', row.capacity));
            rowsEl.appendChild(item);
        }
    }

    render();
    const timer = setInterval(render, 500);
    const off = game.onMapChange?.(render);

    return {
        root,
        render,
        dismiss() {
            clearInterval(timer);
            off?.();
            root.remove();
        },
    };
}
