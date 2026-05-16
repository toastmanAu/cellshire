/**
 * InventoryHUD.js
 *
 * Floating top-right card listing the player's current ore balances.
 * Subscribes to inventory.onChange and re-renders only when the data
 * changes, so it costs nothing at idle.
 *
 * Standalone DOM module — no React/templating — to match the rest of
 * the UI's bare-metal approach (Mykonos PerfHUD pattern). DOM is built
 * via createElement + textContent so untrusted values cannot inject
 * markup even if currency names ever come from user input later.
 */

import { oreDisplayName } from '../mining/oreCatalog.js';

const MAX_ROWS = 6;

export function installInventoryHUD(player) {
    const card = document.createElement('div');
    card.id = 'inventory-hud';
    Object.assign(card.style, {
        position: 'fixed',
        top: '8px',
        right: '8px',
        zIndex: '9998',
        font: '13px/1.4 system-ui, sans-serif',
        color: '#2b2a26',
        background: 'rgba(251, 246, 236, 0.92)',
        padding: '10px 12px',
        borderRadius: '10px',
        border: '1px solid rgba(217, 208, 189, 0.9)',
        boxShadow: '0 6px 18px rgba(60, 50, 30, 0.10)',
        pointerEvents: 'none',
        userSelect: 'none',
        minWidth: '160px',
    });
    document.body.appendChild(card);

    function makeRow(label, value) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;gap:12px';
        const left = document.createElement('span');
        left.textContent = label;
        const right = document.createElement('strong');
        right.textContent = String(value);
        row.appendChild(left);
        row.appendChild(right);
        return row;
    }

    function render() {
        // Clear in a safe way (no innerHTML).
        while (card.firstChild) card.removeChild(card.firstChild);

        const entries = player.inventory.entries().slice(0, MAX_ROWS);
        if (entries.length === 0) {
            const title = document.createElement('div');
            title.style.opacity = '.55';
            title.textContent = 'Inventory · empty';
            const hint = document.createElement('div');
            hint.style.cssText = 'opacity:.4;font-size:11px;margin-top:4px';
            hint.textContent = 'Walk to an ore and click it.';
            card.appendChild(title);
            card.appendChild(hint);
            return;
        }

        const title = document.createElement('div');
        title.style.cssText = 'font-weight:600;letter-spacing:.02em;margin-bottom:4px;color:#1b5ba8';
        title.textContent = 'Inventory';
        card.appendChild(title);

        for (const [currency, amount] of entries) {
            card.appendChild(makeRow(oreDisplayName(currency), amount));
        }
    }

    render();
    player.inventory.onChange(render);
    return { el: card, render };
}
