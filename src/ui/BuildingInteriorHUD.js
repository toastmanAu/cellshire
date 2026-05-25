import {
    TOWNSHIP_BUILDING_ROLES,
    townshipBuildingLabel,
} from '../township/townshipZone.js';
import { formatCurrencyAmount } from '../mining/cryptoEconomy.js';

export const INTERIOR_BACKDROPS = Object.freeze({
    store: 'assets/interiors/interior_store.png',
    market: 'assets/interiors/interior_market.png',
    bank: 'assets/interiors/interior_bank.png',
    gallery: 'assets/interiors/interior_gallery.png',
    hall: 'assets/interiors/interior_hall.png',
});

export const INTERIOR_NPCS = Object.freeze({
    store: Object.freeze({
        name: 'Storekeeper',
        src: 'assets/npc_storekeeper.png',
    }),
    market: Object.freeze({
        name: 'Trader',
        src: 'assets/npc_trader.png',
    }),
    bank: Object.freeze({
        name: 'Bank Teller',
        src: 'assets/npc_bank_teller.png',
    }),
    gallery: Object.freeze({
        name: 'Gallery Curator',
        src: 'assets/npc_gallery_curator.png',
    }),
    hall: Object.freeze({
        name: 'Hall Keeper',
        src: 'assets/npc_hall_keeper.png',
    }),
});

function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
}

function div(className, text = '') {
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    return el;
}

export function buildingInteriorDefinition(role) {
    const label = townshipBuildingLabel(role);
    if (role === TOWNSHIP_BUILDING_ROLES.store) {
        return {
            role,
            title: label,
            scene: 'store',
            backdrop: INTERIOR_BACKDROPS.store,
            npc: INTERIOR_NPCS.store,
            actions: [
                { id: 'store', label: 'Shop counter', panel: 'store' },
            ],
        };
    }
    if (role === TOWNSHIP_BUILDING_ROLES.market) {
        return {
            role,
            title: label,
            scene: 'market',
            backdrop: INTERIOR_BACKDROPS.market,
            npc: INTERIOR_NPCS.market,
            actions: [
                { id: 'market', label: 'Listings board', panel: 'market' },
            ],
        };
    }
    if (role === TOWNSHIP_BUILDING_ROLES.bank) {
        return {
            role,
            title: label,
            scene: 'bank',
            backdrop: INTERIOR_BACKDROPS.bank,
            npc: INTERIOR_NPCS.bank,
            actions: [
                { id: 'exchange', label: 'Exchange desk', panel: 'trader' },
                { id: 'treasury', label: 'House treasury', treasury: true },
                { id: 'loans', label: 'Loan office', loans: true },
            ],
        };
    }
    if (role === TOWNSHIP_BUILDING_ROLES.gallery) {
        return {
            role,
            title: label,
            scene: 'gallery',
            backdrop: INTERIOR_BACKDROPS.gallery,
            npc: INTERIOR_NPCS.gallery,
            actions: [
                { id: 'gallery', label: 'View wall', toast: 'Gallery opens soon' },
            ],
        };
    }
    if (role === TOWNSHIP_BUILDING_ROLES.communityHall) {
        return {
            role,
            title: label,
            scene: 'hall',
            backdrop: INTERIOR_BACKDROPS.hall,
            npc: INTERIOR_NPCS.hall,
            actions: [
                { id: 'hall', label: 'Notice board', toast: 'Community hall opens soon' },
            ],
        };
    }
    return null;
}

export function installBuildingInteriorHUD(game) {
    const root = document.createElement('section');
    root.className = 'building-window';
    root.dataset.open = '0';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'false');

    const scrim = div('building-window__scrim');
    root.appendChild(scrim);

    const panel = div('building-window__panel');
    root.appendChild(panel);
    document.body.appendChild(root);

    let current = null;

    function open(role) {
        const definition = buildingInteriorDefinition(role);
        if (!definition) return false;
        current = definition;
        render();
        root.dataset.open = '1';
        root.dataset.scene = definition.scene;
        const first = root.querySelector('.building-window__action');
        first?.focus?.();
        return true;
    }

    function close() {
        root.dataset.open = '0';
        current = null;
        game.canvas?.focus?.();
    }

    function render() {
        clear(panel);
        if (!current) return;
        const header = div('building-window__header');
        header.appendChild(div('building-window__title', current.title));
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'building-window__close';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', close);
        header.appendChild(closeButton);
        panel.appendChild(header);

        const scene = div('building-window__scene');
        scene.setAttribute('aria-label', `${current.title} interior`);
        scene.style.backgroundImage = current.backdrop ? `url("${current.backdrop}")` : '';
        scene.appendChild(div('building-window__shade'));
        if (current.npc) {
            const npc = document.createElement('img');
            npc.className = 'building-window__npc';
            npc.src = current.npc.src;
            npc.alt = current.npc.name;
            npc.loading = 'lazy';
            scene.appendChild(npc);
        }
        panel.appendChild(scene);

        const actions = div('building-window__actions');
        for (const action of current.actions) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'building-window__action';
            button.dataset.action = action.id;
            button.textContent = action.label;
            button.addEventListener('click', () => runAction(action));
            actions.appendChild(button);
        }
        panel.appendChild(actions);

        const status = div('building-window__status');
        panel.appendChild(status);
        renderStatus(status);
    }

    function runAction(action) {
        if (action.panel) {
            const panelHandle = game.hudPanels?.[action.panel];
            if (panelHandle?.open) {
                panelHandle.open();
                close();
                return;
            }
        }
        if (action.treasury) {
            renderTreasury();
            return;
        }
        if (action.loans) {
            renderLoans();
            return;
        }
        game.ui?.showToast?.(action.toast || 'Coming soon', 1800);
    }

    function renderStatus(status) {
        if (!current || current.role !== TOWNSHIP_BUILDING_ROLES.bank) return;
        const summary = game.houseTreasurySummary?.();
        status.textContent = summary
            ? `House treasury ${summary.totalLabel} · ${summary.feeCount} fee records`
            : 'House treasury unavailable';
    }

    function renderTreasury() {
        let treasury = panel.querySelector('.building-window__treasury');
        if (!treasury) {
            treasury = div('building-window__treasury');
            panel.appendChild(treasury);
        }
        clear(treasury);
        const summary = game.houseTreasurySummary?.();
        if (!summary) {
            treasury.appendChild(div('building-window__treasury-total', 'House treasury unavailable'));
            return;
        }
        treasury.appendChild(div('building-window__treasury-total', `House treasury ${summary.totalLabel}`));
        if (summary.recent.length === 0) {
            treasury.appendChild(div('building-window__treasury-row', 'No fee records yet'));
            return;
        }
        for (const row of summary.recent) {
            treasury.appendChild(div('building-window__treasury-row', row));
        }
    }

    function renderLoans() {
        let loans = panel.querySelector('.building-window__loans');
        if (!loans) {
            loans = div('building-window__loans');
            panel.appendChild(loans);
        }
        clear(loans);
        const summary = game.bankLoanSummary?.();
        if (!summary) {
            loans.appendChild(div('building-window__loan-title', 'Loan office unavailable'));
            return;
        }
        loans.appendChild(div('building-window__loan-title', `Loan reserve ${summary.reserveLabel}`));
        if (summary.active) {
            const loan = summary.active;
            loans.appendChild(div('building-window__loan-row', `${loan.name} · ${formatCurrencyAmount(loan.currency, loan.remainingOwed)} due`));
            const repay = document.createElement('button');
            repay.type = 'button';
            repay.className = 'building-window__loan-action';
            repay.textContent = 'Repay balance';
            repay.addEventListener('click', async () => {
                await game.repayBankLoan?.('max');
                renderLoans();
            });
            loans.appendChild(repay);
            return;
        }

        for (const offer of summary.offers) {
            const row = div('building-window__loan-offer');
            row.appendChild(div(
                'building-window__loan-row',
                `${offer.name} · ${formatCurrencyAmount(offer.currency, offer.amount)} now · ${formatCurrencyAmount(offer.currency, offer.totalOwed)} due`,
            ));
            const borrow = document.createElement('button');
            borrow.type = 'button';
            borrow.className = 'building-window__loan-action';
            borrow.textContent = offer.enabled ? 'Borrow' : 'Locked';
            borrow.disabled = !offer.enabled;
            borrow.addEventListener('click', async () => {
                await game.borrowBankLoan?.(offer.id);
                renderLoans();
            });
            row.appendChild(borrow);
            loans.appendChild(row);
        }
    }

    function onKeydown(ev) {
        if (root.dataset.open !== '1') return;
        if (ev.key === 'Escape') {
            ev.preventDefault();
            close();
        }
    }

    scrim.addEventListener('click', close);
    window.addEventListener('keydown', onKeydown);

    const api = {
        root,
        open,
        close,
        render,
        dismiss() {
            window.removeEventListener('keydown', onKeydown);
            root.remove();
        },
    };
    game.townshipInterior = api;
    return api;
}
