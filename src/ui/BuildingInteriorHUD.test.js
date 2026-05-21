import { describe, it, expect } from '../test/harness.js';
import { TOWNSHIP_BUILDING_ROLES } from '../township/townshipZone.js';
import {
    buildingInteriorDefinition,
    installBuildingInteriorHUD,
} from './BuildingInteriorHUD.js';

function cleanup() {
    document.querySelectorAll('.building-window').forEach(n => n.remove());
}

function fakeGame() {
    const opened = [];
    const toasts = [];
    return {
        canvas: { focus() {} },
        hudPanels: {
            store: { open: () => opened.push('store') },
            market: { open: () => opened.push('market') },
            trader: { open: () => opened.push('trader') },
        },
        ui: {
            showToast: message => toasts.push(message),
        },
        opened,
        toasts,
    };
}

describe('BuildingInteriorHUD', () => {
    it('defines data-driven interiors for township landmarks', () => {
        expect(buildingInteriorDefinition(TOWNSHIP_BUILDING_ROLES.store).actions[0].panel).toBe('store');
        expect(buildingInteriorDefinition(TOWNSHIP_BUILDING_ROLES.market).actions[0].panel).toBe('market');
        expect(buildingInteriorDefinition(TOWNSHIP_BUILDING_ROLES.bank).actions[0].panel).toBe('trader');
        expect(buildingInteriorDefinition('unknown')).toBeNull();
    });

    it('opens a building window and routes action buttons into existing HUD panels', () => {
        cleanup();
        const game = fakeGame();
        const hud = installBuildingInteriorHUD(game);
        expect(game.townshipInterior === hud).toBe(true);
        expect(hud.open(TOWNSHIP_BUILDING_ROLES.store)).toBe(true);
        expect(hud.root.dataset.open).toBe('1');
        expect(document.querySelector('.building-window__title').textContent).toBe('General Store');

        document.querySelector('.building-window__action').click();
        expect(game.opened[0]).toBe('store');
        expect(hud.root.dataset.open).toBe('0');
        hud.dismiss();
        cleanup();
    });

    it('renders house treasury details inside the bank window', () => {
        cleanup();
        const game = fakeGame();
        game.houseTreasurySummary = () => ({
            totalLabel: '$3.75',
            feeCount: 2,
            recent: ['Trader fee · $2.50', 'Trader fee · $1.25'],
        });
        const hud = installBuildingInteriorHUD(game);
        hud.open(TOWNSHIP_BUILDING_ROLES.bank);
        expect(document.querySelector('.building-window__status').textContent)
            .toBe('House treasury $3.75 · 2 fee records');
        document.querySelector('[data-action="treasury"]').click();
        expect(document.querySelector('.building-window__treasury-total').textContent)
            .toBe('House treasury $3.75');
        expect(document.querySelector('.building-window__treasury-row').textContent)
            .toBe('Trader fee · $2.50');
        hud.dismiss();
        cleanup();
    });

    it('renders loan offers and can borrow from the bank office', () => {
        cleanup();
        const game = fakeGame();
        let borrowed = null;
        game.bankLoanSummary = () => ({
            reserveLabel: '$100.00',
            active: null,
            offers: [{
                id: 'starter-float',
                name: 'Starter float',
                currency: 'ckb',
                amount: 5000,
                totalOwed: 5150,
                enabled: true,
            }],
        });
        game.borrowBankLoan = offerId => { borrowed = offerId; };
        const hud = installBuildingInteriorHUD(game);
        hud.open(TOWNSHIP_BUILDING_ROLES.bank);
        document.querySelector('[data-action="loans"]').click();
        expect(document.querySelector('.building-window__loan-title').textContent).toBe('Loan reserve $100.00');
        document.querySelector('.building-window__loan-action').click();
        expect(borrowed).toBe('starter-float');
        expect(hud.root.dataset.open).toBe('1');
        hud.dismiss();
        cleanup();
    });

    it('keeps future-only non-bank actions in the interior window and surfaces a toast', () => {
        cleanup();
        const game = fakeGame();
        const hud = installBuildingInteriorHUD(game);
        hud.open(TOWNSHIP_BUILDING_ROLES.gallery);
        document.querySelector('[data-action="gallery"]').click();
        expect(game.toasts[0]).toBe('Gallery opens soon');
        expect(hud.root.dataset.open).toBe('1');
        hud.dismiss();
        cleanup();
    });
});
