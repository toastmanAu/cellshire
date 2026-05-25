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
import { hudMount } from './hudMount.js';

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

export function installEconomyHUD({
    player,
    game,
    inventoryAdapter = null,
    inventoryAdapters = null,
    initialInventorySource = null,
    onInventorySourceChange = null,
    priceSnapshot = null,
}) {
    const card = document.createElement('section');
    card.id = 'economy-hud';
    card.setAttribute('aria-live', 'polite');
    hudMount('economy').appendChild(card);

    let lastChange = null;
    let currentSnapshot = null;
    let currentInventory = player.inventory;
    let unsubscribeInventory = null;
    const adapters = normalizeInventoryAdapters({ player, inventoryAdapter, inventoryAdapters });
    let activeSource = initialInventorySource && adapters.has(initialInventorySource)
        ? initialInventorySource
        : adapters.keys().next().value;

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
        const titleWrap = div('economy-hud__title-wrap');
        const title = div('economy-hud__title', 'Economy');
        titleWrap.appendChild(title);
        if (adapters.size > 1) titleWrap.appendChild(makeSourceToggle());
        const total = div('economy-hud__total', formatUsd(summary.totalUsd));
        header.appendChild(titleWrap);
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

    function makeSourceToggle() {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'economy-hud__source';
        const isChain = currentSnapshot?.source === 'chain' || activeSource === 'chain';
        toggle.textContent = isChain && currentSnapshot?.pending
            ? 'Chain wallet · pending'
            : isChain ? 'Chain wallet' : 'Local wallet';
        toggle.title = activeSource === 'chain'
            ? 'Showing chain wallet balances'
            : 'Showing local prototype balances';
        toggle.addEventListener('click', () => {
            const sources = Array.from(adapters.keys());
            const index = Math.max(0, sources.indexOf(activeSource));
            setInventorySource(sources[(index + 1) % sources.length]);
        });
        return toggle;
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
        const adapter = adapters.get(activeSource);
        if (!adapter?.read) return currentSnapshot;
        currentSnapshot = await adapter.read();
        if (currentSnapshot?.currencies) currentInventory = currentSnapshot.currencies;
        subscribeToInventory(currentInventory);
        render();
        return currentSnapshot;
    }

    async function setInventorySource(source) {
        if (!adapters.has(source) || source === activeSource) return currentSnapshot;
        activeSource = source;
        onInventorySourceChange?.(source);
        return refresh();
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
        getInventorySource: () => activeSource,
        setInventorySource,
        dismiss() {
            unsubscribeInventory?.();
            card.remove();
        },
    };
}

function normalizeInventoryAdapters({ player, inventoryAdapter, inventoryAdapters }) {
    const adapters = new Map();
    const localAdapter = {
        async read() {
            return {
                source: 'local',
                stale: false,
                pending: false,
                currencies: player.inventory,
            };
        },
    };
    if (inventoryAdapters) {
        for (const [source, adapter] of Object.entries(inventoryAdapters)) {
            if (adapter?.read) adapters.set(source, adapter);
        }
    } else if (inventoryAdapter?.read) {
        adapters.set('chain', inventoryAdapter);
    }
    if (!adapters.has('local')) adapters.set('local', localAdapter);
    if (!adapters.size) adapters.set('local', localAdapter);
    return adapters;
}
