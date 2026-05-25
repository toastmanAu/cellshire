import { RESOURCE_CATALOG, formatResourceAmount } from '../resources/resourceInventory.js';
import { hudMount } from './hudMount.js';

const MAX_ROWS = 5;

function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
}

function div(className, text = '') {
    const el = document.createElement('div');
    if (className) el.className = className;
    el.textContent = text;
    return el;
}

export function buildResourceSummary(inventory) {
    const entries = inventory?.entries?.() ?? [];
    return {
        entries,
        hasResources: entries.length > 0,
        totalKinds: entries.length,
    };
}

export function installResourceHUD(game) {
    const root = document.createElement('section');
    root.id = 'resource-hud';
    root.setAttribute('aria-live', 'polite');
    hudMount('resources').appendChild(root);

    const inventory = game?.resourceInventory ?? null;
    let lastChange = null;
    let unsubscribe = null;

    function makeRow(resourceId, amount) {
        const resource = RESOURCE_CATALOG[resourceId];
        const row = div('resource-hud__row');
        const mark = div(`resource-hud__mark resource-hud__mark--${resourceId}`);
        mark.setAttribute('aria-hidden', 'true');
        const label = div('resource-hud__label', resource?.name ?? resourceId);
        const value = div('resource-hud__amount', String(Math.floor(amount)));
        row.appendChild(mark);
        row.appendChild(label);
        row.appendChild(value);
        return row;
    }

    function render() {
        clear(root);
        const summary = buildResourceSummary(inventory);
        const header = div('resource-hud__header');
        header.appendChild(div('resource-hud__title', 'Resources'));
        header.appendChild(div('resource-hud__count', String(summary.totalKinds)));
        root.appendChild(header);

        if (!summary.hasResources) {
            root.appendChild(div('resource-hud__empty', 'Harvest trees or stone.'));
            return;
        }

        for (const [resourceId, amount] of summary.entries.slice(0, MAX_ROWS)) {
            root.appendChild(makeRow(resourceId, amount));
        }

        if (lastChange) {
            root.appendChild(div(
                'resource-hud__detail',
                `Last +${formatResourceAmount(lastChange.resourceId, lastChange.delta)}`,
            ));
        }
    }

    if (inventory?.onChange) {
        unsubscribe = inventory.onChange(change => {
            lastChange = change;
            render();
        });
    }

    render();

    return {
        root,
        el: root,
        render,
        dismiss() {
            unsubscribe?.();
            root.remove();
        },
    };
}
