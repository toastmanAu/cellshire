/**
 * EconomyHUD.js
 *
 * Bottom-right crypto economy panel. Shows internal token balances,
 * approximate USD value from the active epoch price snapshot, and a
 * compact detail line for the most recently mined token.
 */

import {
    currencyDisplayName,
    currencySymbol,
    formatCurrencyAmount,
    formatUsd,
    priceUsdForCurrency,
    usdValueForAmount,
} from '../mining/cryptoEconomy.js';

const MAX_ROWS = 5;

function snapshotLabel(snapshot) {
    if (!snapshot) return 'prices fixed';
    const mode = snapshot.mode || snapshot.source || 'fixed';
    if (!snapshot.capturedAt) return `prices ${mode}`;
    return `prices ${mode} · ${snapshot.capturedAt.slice(0, 10)}`;
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

export function installEconomyHUD({ player, game, priceSnapshot = null }) {
    const card = document.createElement('section');
    card.id = 'economy-hud';
    card.setAttribute('aria-live', 'polite');
    document.body.appendChild(card);

    let lastChange = null;

    function makeRow(currencyId, amount) {
        const row = div('economy-hud__row');

        const left = div('economy-hud__asset');
        const symbol = div('economy-hud__symbol', currencySymbol(currencyId));
        const name = div('economy-hud__name', currencyDisplayName(currencyId));
        left.appendChild(symbol);
        left.appendChild(name);

        const right = div('economy-hud__balance');
        right.appendChild(div('economy-hud__amount', formatCurrencyAmount(currencyId, amount)));
        right.appendChild(div('economy-hud__usd', formatUsd(usdValueForAmount(currencyId, amount, priceSnapshot))));

        row.appendChild(left);
        row.appendChild(right);
        return row;
    }

    function render() {
        clear(card);

        const summary = buildEconomySummary(player.inventory, priceSnapshot);
        const header = div('economy-hud__header');
        const title = div('economy-hud__title', 'Economy');
        const total = div('economy-hud__total', formatUsd(summary.totalUsd));
        header.appendChild(title);
        header.appendChild(total);
        card.appendChild(header);

        card.appendChild(div('economy-hud__meta', snapshotLabel(priceSnapshot)));

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

    render();
    const off = player.inventory.onChange(change => {
        lastChange = change;
        render();
    });

    return {
        el: card,
        render,
        dismiss() {
            off();
            card.remove();
        },
    };
}
