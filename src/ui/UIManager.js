/**
 * UIManager.js
 *
 * Aggregates all DOM-driven UI subsystems and toast feedback.
 */

import { Toolbar } from './Toolbar.js';
import { AssetPalette } from './AssetPalette.js';
import { HUD } from './HUD.js';
import { playToast, playUiClick } from './Audio.js?v=audio-wiring-3';

export class UIManager {
    constructor(game) {
        this.game = game;
        this.toolbar = new Toolbar(document.getElementById('toolbar'), game);
        this.palette = new AssetPalette(
            document.getElementById('palette-tabs'),
            document.getElementById('palette-grid'),
            game,
        );
        this.hud = new HUD(game);
        this.toast = document.getElementById('toast');

        // The Controls cheatsheet is a native <details> disclosure: clicking
        // the summary toggles it. Wire the same UI click sound to that
        // toggle so it feels consistent with the toolbar / palette / HUD.
        const ins = document.getElementById('instructions');
        if (ins) {
            ins.addEventListener('toggle', () => playUiClick());
        }
        const sideMenu = document.getElementById('side-menu');
        const sideMenuToggle = document.getElementById('side-menu-toggle');
        if (sideMenu && sideMenuToggle) {
            const setSideMenuOpen = (open) => {
                sideMenu.dataset.open = open ? '1' : '0';
                sideMenuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            };
            if (window.matchMedia?.('(max-width: 900px)').matches) {
                setSideMenuOpen(false);
            } else {
                setSideMenuOpen(sideMenu.dataset.open === '1');
            }
            sideMenuToggle.addEventListener('click', () => {
                const open = sideMenu.dataset.open !== '1';
                setSideMenuOpen(open);
                playUiClick();
            });
        }

        // Expose for sibling modules
        game.toolbar = this.toolbar;
        game.palette = this.palette;
        game.hud = this.hud;
    }

    update() {
        this.toolbar.update();
        this.palette.update();
    }

    showToast(text, ms = 1600) {
        this.toast.textContent = text;
        this.toast.classList.add('show');
        playToast(toastKind(text));
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            this.toast.classList.remove('show');
        }, ms);
    }
}

function toastKind(text) {
    const lower = String(text ?? '').toLowerCase();
    if (lower.includes('failed') || lower.includes('unavailable') || lower.includes('need ')) return 'error';
    if (lower.includes('bought') || lower.includes('crafted') || lower.includes('harvested')
        || lower.includes('upgraded') || lower.includes('expanded') || lower.includes('borrowed')
        || lower.includes('repaid') || lower.includes('listed')
    ) return 'success';
    return 'info';
}
