import { describe, it, expect } from '../test/harness.js';
import { TOWNSHIP_BUILDING_ROLES } from '../township/townshipZone.js';
import {
    buildingInteriorDefinition,
    INTERIOR_BACKDROPS,
    INTERIOR_NPCS,
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
        assetName: assetId => ({
            crate: 'Crate',
            hanging_lantern: 'Hanging Lantern',
        })[assetId] ?? assetId,
        opened,
        toasts,
    };
}

describe('BuildingInteriorHUD', () => {
    it('defines data-driven interiors for township landmarks', () => {
        const store = buildingInteriorDefinition(TOWNSHIP_BUILDING_ROLES.store);
        expect(store.actions[0].panel).toBe('store');
        expect(store.backdrop).toBe(INTERIOR_BACKDROPS.store);
        expect(store.npc).toBe(INTERIOR_NPCS.store);
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
        expect(document.querySelector('.building-window__scene').style.backgroundImage
            .includes('assets/interiors/interior_store.png')).toBe(true);
        expect(document.querySelector('.building-window__npc').src
            .includes('assets/npc_storekeeper.png')).toBe(true);
        expect(document.querySelector('.building-window__npc').alt).toBe('Storekeeper');

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

    it('renders the gallery collection wall from prop inventory', () => {
        cleanup();
        const game = fakeGame();
        game.propInventory = {
            entries: () => [['crate', 2], ['hanging_lantern', 1]],
        };
        const hud = installBuildingInteriorHUD(game);
        hud.open(TOWNSHIP_BUILDING_ROLES.gallery);
        expect(document.querySelector('.building-window__status').textContent)
            .toBe('Collection wall · 3 props held');
        document.querySelector('[data-action="gallery"]').click();
        expect(document.querySelector('.building-window__board-title').textContent)
            .toBe('Collection Wall');
        expect(document.querySelector('.building-window__board-row').textContent)
            .toBe('Crate x2');
        expect(hud.root.dataset.open).toBe('1');
        hud.dismiss();
        cleanup();
    });

    it('renders community hall notices from home progression summaries', () => {
        cleanup();
        const game = fakeGame();
        game.propertyExpansionState = () => ({
            label: 'Claim 2 · 8x8',
            next: true,
            nextCostLabel: '5,000.00 CKB',
        });
        game.farmExpansionState = () => ({
            label: 'Farm 2 · 4x4',
            planted: 4,
            ready: 1,
            next: true,
            nextCostLabel: '28 Wood + 18 Stone + 4 Herb + 2,200.00 CKB',
        });
        game.buildingProgressionState = () => ({
            buildings: [
                { unlocked: true, active: true },
                { unlocked: true, active: false },
                { unlocked: false, active: false },
            ],
        });
        game.houseTreasurySummary = () => ({
            totalLabel: '$4.25',
            feeCount: 3,
        });
        const hud = installBuildingInteriorHUD(game);
        hud.open(TOWNSHIP_BUILDING_ROLES.communityHall);
        expect(document.querySelector('.building-window__status').textContent)
            .toBe('Farm 2 · 4x4 · 1/4 crops ready');
        document.querySelector('[data-action="hall"]').click();
        expect(document.querySelector('.building-window__board-title').textContent)
            .toBe('Community Notices');
        expect(document.querySelector('.building-window__board-row').textContent)
            .toBe('Claim 2 · 8x8 · Next 5,000.00 CKB');
        expect(hud.root.dataset.open).toBe('1');
        hud.dismiss();
        cleanup();
    });
});
