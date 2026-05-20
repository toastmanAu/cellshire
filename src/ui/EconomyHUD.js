/**
 * EconomyHUD.js
 *
 * Bottom-right crypto economy panel. Shows internal token balances,
 * approximate USD value from the active epoch price snapshot, and a
 * compact detail line for the most recently mined token.
 */

import {
    currencyDisplayName,
    currencyLogoPath,
    currencySymbol,
    formatCurrencyAmount,
    formatUsd,
    priceUsdForCurrency,
    usdValueForAmount,
} from '../mining/cryptoEconomy.js';

const MAX_ROWS = 5;

export function priceSnapshotDetail(snapshot) {
    const mode = snapshot?.mode || snapshot?.source || 'fixed';
    const capturedAt = snapshot?.capturedAt || null;
    const source = snapshot?.source || mode;
    const rows = [
        ['Mode', mode],
        ['Source', source],
        ['Captured', capturedAt || 'not available'],
        ['Currency', (snapshot?.vsCurrency || 'usd').toUpperCase()],
    ];
    if (snapshot?.fallback) rows.push(['Fallback', 'yes']);
    return {
        label: capturedAt ? `prices ${mode} · ${capturedAt.slice(0, 10)}` : `prices ${mode}`,
        rows,
    };
}

function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
}

function div(className, text = '') {
    const el = document.createElement('div');
    if (className) el.className = className;
    el.textContent = text;
    return el;
}

function makeCurrencyMark(currencyId) {
    const symbol = currencySymbol(currencyId);
    const logoPath = currencyLogoPath(currencyId);
    const mark = div('economy-hud__mark', logoPath ? '' : symbol);
    mark.setAttribute('aria-hidden', 'true');

    if (logoPath) {
        const img = document.createElement('img');
        img.src = logoPath;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.addEventListener('error', () => {
            mark.textContent = symbol;
            mark.classList.add('economy-hud__mark--fallback');
        }, { once: true });
        mark.appendChild(img);
    } else {
        mark.classList.add('economy-hud__mark--fallback');
    }

    return mark;
}

export function buildEconomySummary(inventory, priceSnapshot) {
    const entries = inventory.entries();
    let totalUsd = 0;
    for (const [currencyId, amount] of entries) {
        totalUsd += usdValueForAmount(currencyId, amount, priceSnapshot) ?? 0;
    }
    return {
        entries,
        totalUsd,
        hasBalances: entries.length > 0,
    };
}

export function installEconomyHUD({ player, game, inventoryAdapter = null, priceSnapshot = null }) {
    const card = document.createElement('section');
    card.id = 'economy-hud';
    card.setAttribute('aria-live', 'polite');
    document.body.appendChild(card);

    let lastChange = null;
    let currentSnapshot = null;
    let currentInventory = player.inventory;
    let unsubscribeInventory = null;

    function makeRow(currencyId, amount) {
        const row = div('economy-hud__row');

        const left = div('economy-hud__asset');
        left.appendChild(makeCurrencyMark(currencyId));

        const label = div('economy-hud__label');
        label.appendChild(div('economy-hud__symbol', currencySymbol(currencyId)));
        label.appendChild(div('economy-hud__name', currencyDisplayName(currencyId)));
        left.appendChild(label);

        const right = div('economy-hud__balance');
        right.appendChild(div('economy-hud__amount', formatCurrencyAmount(currencyId, amount)));
        right.appendChild(div('economy-hud__usd', formatUsd(usdValueForAmount(currencyId, amount, priceSnapshot))));

        row.appendChild(left);
        row.appendChild(right);
        return row;
    }

    function render() {
        clear(card);

        const summary = buildEconomySummary(currentInventory, priceSnapshot);
        const snapshot = priceSnapshotDetail(priceSnapshot);
        const header = div('economy-hud__header');
        const title = div('economy-hud__title', 'Economy');
        const total = div('economy-hud__total', formatUsd(summary.totalUsd));
        header.appendChild(title);
        header.appendChild(total);
        card.appendChild(header);

        const priceDetails = document.createElement('details');
        priceDetails.className = 'economy-hud__snapshot';
        const priceSummary = document.createElement('summary');
        priceSummary.textContent = snapshot.label;
        priceDetails.appendChild(priceSummary);
        const detailGrid = div('economy-hud__snapshot-grid');
        for (const [label, value] of snapshot.rows) {
            detailGrid.appendChild(div('economy-hud__snapshot-key', label));
            detailGrid.appendChild(div('economy-hud__snapshot-value', value));
        }
        priceDetails.appendChild(detailGrid);
        card.appendChild(priceDetails);

        if (currentSnapshot?.stale) {
            card.appendChild(div('economy-hud__detail', 'Chain inventory is reconciling pending changes.'));
        }

        if (!summary.hasBalances) {
            card.appendChild(div('economy-hud__empty', 'Mine a deposit to start balances.'));
            return;
        }

        for (const [currencyId, amount] of summary.entries.slice(0, MAX_ROWS)) {
            card.appendChild(makeRow(currencyId, amount));
        }

        if (lastChange) {
            const price = priceUsdForCurrency(lastChange.currency, priceSnapshot);
            const detail = div('economy-hud__detail');
            detail.textContent = [
                `Last ${currencySymbol(lastChange.currency)}`,
                `${formatCurrencyAmount(lastChange.currency, lastChange.delta)}`,
                `${formatUsd(usdValueForAmount(lastChange.currency, lastChange.delta, priceSnapshot))}`,
                price ? `@ ${formatUsd(price)}` : null,
            ].filter(Boolean).join(' · ');
            card.appendChild(detail);
        }
    }

    function subscribeToInventory(inventory) {
        unsubscribeInventory?.();
        unsubscribeInventory = inventory?.onChange
            ? inventory.onChange(change => {
                lastChange = change;
                render();
            })
            : null;
    }

    async function refresh() {
        if (!inventoryAdapter?.read) return currentSnapshot;
        currentSnapshot = await inventoryAdapter.read();
        if (currentSnapshot?.currencies) currentInventory = currentSnapshot.currencies;
        subscribeToInventory(currentInventory);
        render();
        return currentSnapshot;
    }

    subscribeToInventory(currentInventory);
    render();
    refresh().catch(err => {
        console.warn('[cellshire] inventory adapter read failed', err);
    });

    return {
        el: card,
        render,
        refresh,
        dismiss() {
            unsubscribeInventory?.();
            card.remove();
        },
    };
}
