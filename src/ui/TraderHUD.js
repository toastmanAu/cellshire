import {
    currencyDisplayName,
    currencySymbol,
    formatCurrencyAmount,
} from '../mining/cryptoEconomy.js';
import { LocalTraderAdapter } from '../trader/traderAdapter.js';
import {
    buildTraderRateTable,
    formatPairRate,
    formatTradeQuote,
    quoteTrade,
    traderCurrencyIds,
} from '../trader/traderRates.js';

function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
}

function option(value, text) {
    const el = document.createElement('option');
    el.value = value;
    el.textContent = text;
    return el;
}

export function installTraderHUD({
    player,
    game = null,
    priceSnapshot = null,
    adapter = new LocalTraderAdapter(),
} = {}) {
    const rateTable = buildTraderRateTable(priceSnapshot);
    const root = document.createElement('section');
    root.id = 'trader-hud';
    root.dataset.open = '0';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'trader-hud__toggle';
    toggle.textContent = 'Trader';
    root.appendChild(toggle);

    const panel = document.createElement('form');
    panel.className = 'trader-hud__panel';
    root.appendChild(panel);

    document.body.appendChild(root);

    const fromSelect = document.createElement('select');
    const toSelect = document.createElement('select');
    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.min = '0';
    amountInput.step = 'any';
    amountInput.inputMode = 'decimal';

    const maxButton = document.createElement('button');
    maxButton.type = 'button';
    maxButton.className = 'trader-hud__secondary';
    maxButton.textContent = 'Max';

    const quoteLine = document.createElement('div');
    quoteLine.className = 'trader-hud__quote';

    const rateLine = document.createElement('div');
    rateLine.className = 'trader-hud__rate';

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'trader-hud__submit';
    submit.textContent = 'Swap';

    let lastQuote = null;

    function currencyLabel(id) {
        return `${currencySymbol(id)} · ${currencyDisplayName(id)}`;
    }

    function renderOptions() {
        const currentFrom = fromSelect.value;
        const currentTo = toSelect.value;
        clear(fromSelect);
        clear(toSelect);

        const balances = player.inventory.entries()
            .filter(([, amount]) => amount > 0)
            .map(([currency]) => currency);
        const fromIds = balances.length > 0 ? balances : traderCurrencyIds();
        const toIds = traderCurrencyIds();

        for (const id of fromIds) fromSelect.appendChild(option(id, currencyLabel(id)));
        for (const id of toIds) toSelect.appendChild(option(id, currencyLabel(id)));

        fromSelect.value = fromIds.includes(currentFrom) ? currentFrom : fromIds[0] ?? '';
        if (toIds.includes(currentTo) && currentTo !== fromSelect.value) {
            toSelect.value = currentTo;
        } else {
            toSelect.value = toIds.find(id => id !== fromSelect.value) ?? toIds[0] ?? '';
        }
    }

    function currentQuote() {
        return quoteTrade({
            fromCurrency: fromSelect.value,
            toCurrency: toSelect.value,
            fromAmount: amountInput.value,
            rateTable,
        });
    }

    function renderQuote() {
        lastQuote = currentQuote();
        const balance = player.inventory.get(fromSelect.value);
        if (!player.inventory.entries().length) {
            quoteLine.textContent = 'Mine a deposit before trading.';
            rateLine.textContent = '';
            submit.disabled = true;
            return;
        }
        if (!lastQuote.ok) {
            quoteLine.textContent = 'Enter an amount to quote.';
            rateLine.textContent = '';
            submit.disabled = true;
            return;
        }
        quoteLine.textContent = formatTradeQuote(lastQuote);
        rateLine.textContent = `${formatPairRate(lastQuote)} · balance ${formatCurrencyAmount(fromSelect.value, balance)}`;
        submit.disabled = balance < lastQuote.fromAmount;
    }

    function render() {
        clear(panel);

        const title = document.createElement('div');
        title.className = 'trader-hud__title';
        title.textContent = 'Trader';
        panel.appendChild(title);

        const rowFrom = document.createElement('label');
        rowFrom.className = 'trader-hud__field';
        rowFrom.append('From', fromSelect);
        panel.appendChild(rowFrom);

        const amountRow = document.createElement('label');
        amountRow.className = 'trader-hud__field trader-hud__field--amount';
        amountRow.append('Amount', amountInput, maxButton);
        panel.appendChild(amountRow);

        const rowTo = document.createElement('label');
        rowTo.className = 'trader-hud__field';
        rowTo.append('To', toSelect);
        panel.appendChild(rowTo);

        panel.appendChild(quoteLine);
        panel.appendChild(rateLine);
        panel.appendChild(submit);
        renderOptions();
        renderQuote();
    }

    function open() {
        root.dataset.open = '1';
        render();
    }

    function close() {
        root.dataset.open = '0';
    }

    toggle.addEventListener('click', () => {
        if (root.dataset.open === '1') close();
        else open();
    });

    fromSelect.addEventListener('change', () => {
        if (fromSelect.value === toSelect.value) {
            toSelect.value = traderCurrencyIds().find(id => id !== fromSelect.value) ?? toSelect.value;
        }
        renderQuote();
    });
    toSelect.addEventListener('change', renderQuote);
    amountInput.addEventListener('input', renderQuote);
    maxButton.addEventListener('click', () => {
        const balance = player.inventory.get(fromSelect.value);
        amountInput.value = balance > 0 ? String(balance) : '';
        renderQuote();
    });

    panel.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const quote = lastQuote ?? currentQuote();
        const out = await adapter.swap({ inventory: player.inventory, quote });
        if (!out.ok) {
            game?.ui?.showToast?.(out.reason === 'insufficient-funds'
                ? 'Trader balance is too low'
                : 'Trader swap failed');
            renderQuote();
            return;
        }
        game?.recordTraderFee?.({ quote, swap: out });
        game?.ui?.showToast?.(`Swapped to ${formatCurrencyAmount(out.toCurrency, out.toAmount)}`, 2200);
        amountInput.value = '';
        render();
    });

    const off = player.inventory.onChange(() => {
        if (root.dataset.open === '1') render();
    });
    render();

    return {
        root,
        render,
        open,
        close,
        dismiss() {
            off();
            root.remove();
        },
    };
}
