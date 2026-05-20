import { describe, it, expect } from '../test/harness.js';
import { buildOreBudgetRows, buildOreBudgetSummary } from './OreDebugHUD.js';

describe('OreDebugHUD budget rows', () => {
    it('lists only ore objects with mining state', () => {
        const game = {
            tileMap: {
                objects: [
                    { id: 1, assetId: 'gold_ore', gx: 4, gy: 7 },
                    { id: 2, assetId: 'house', gx: 5, gy: 8 },
                    { id: 3, assetId: 'ckb_cluster', gx: 2, gy: 3 },
                    { id: 4, assetId: 'silver_ore', gx: 9, gy: 1 },
                ],
            },
            oreStates: new Map([
                [1, {
                    capacityRemaining: 2,
                    maxCapacity: 4,
                    remainingValueUsd: 50,
                    totalValueUsd: 100,
                }],
                [3, {
                    capacityRemaining: 1,
                    maxCapacity: 3,
                    remainingValueUsd: 12.3456,
                    totalValueUsd: 60,
                }],
            ]),
        };

        const rows = buildOreBudgetRows(game);
        expect(rows.length).toBe(2);
        expect(rows.map(row => row.name)).toEqual(['CKB Cluster', 'Gold']);
        expect(rows.map(row => row.currency)).toEqual(['CKB', 'BTC']);
        expect(rows[0].remainingLabel).toBe('$12.35');
        expect(rows[1].capacity).toBe('2/4');
    });

    it('summarizes remaining and total budget values', () => {
        const summary = buildOreBudgetSummary([
            { remainingValueUsd: 10, totalValueUsd: 30 },
            { remainingValueUsd: 5.5, totalValueUsd: 20 },
        ]);
        expect(summary.count).toBe(2);
        expect(summary.remaining).toBe(15.5);
        expect(summary.total).toBe(50);
        expect(summary.label).toBe('Ore budgets · $15.50 / $50.00');
    });
});
