import { describe, expect, it } from '../test/harness.js';
import {
    chainMiningIndexerMode,
    createOreIndexerFromParams,
    HttpOreIndexer,
    LocalOreIndexer,
    normalizeOreIndexerRecord,
} from './oreIndexer.js';

describe('local ore indexer fixture', () => {
    it('reports untouched, live, depleted, and orphaned states', async () => {
        const indexer = new LocalOreIndexer();
        expect((await indexer.getOreCell('ore:1')).status).toBe('untouched');
        indexer.recordMiningTx({
            action: 'birth',
            witness: { mining_receipt: { ore_id: 'ore:1' } },
            outputs: { ore_cell: { ore_id: 'ore:1', capacity_remaining: 2 } },
        });
        expect((await indexer.getOreCell('ore:1')).status).toBe('live');
        indexer.recordMiningTx({
            action: 'deplete',
            witness: { mining_receipt: { ore_id: 'ore:1' } },
            inputs: { ore_cell: { ore_id: 'ore:1', capacity_remaining: 1 } },
            outputs: { ore_cell: null },
        });
        expect((await indexer.getOreCell('ore:1')).status).toBe('depleted');
        indexer.markOrphaned('ore:2');
        expect((await indexer.getOreCell('ore:2')).status).toBe('orphaned');
    });
});

describe('HTTP ore indexer adapter', () => {
    it('normalizes live, depleted, and malformed indexer records', () => {
        const liveCell = { ore_id: 'ore:1', capacity_remaining: 2 };
        expect(normalizeOreIndexerRecord({ status: 'live', cell: liveCell }, 'ore:1')).toEqual({
            status: 'live',
            liveCell,
        });
        expect(normalizeOreIndexerRecord({ status: 'live', cell: { ore_id: 'ore:1', capacity_remaining: 0 } }, 'ore:1').status)
            .toBe('depleted');
        expect(normalizeOreIndexerRecord({ status: 'live' }, 'ore:1').status).toBe('stale');
        expect(normalizeOreIndexerRecord({ status: 'surprise' }, 'ore:1').status).toBe('stale');
    });

    it('reads live cells from the configured endpoint', async () => {
        const calls = [];
        const liveCell = { ore_id: 'ore:mine:14455:5:7:coal_seam', capacity_remaining: 2 };
        const indexer = new HttpOreIndexer({
            baseUrl: 'https://indexer.example/cellshire/',
            fetchImpl: async (url) => {
                calls.push(url);
                return {
                    ok: true,
                    status: 200,
                    async json() {
                        return { status: 'live', liveCell };
                    },
                };
            },
        });
        const out = await indexer.getOreCell(liveCell.ore_id);
        expect(out.status).toBe('live');
        expect(out.liveCell).toEqual(liveCell);
        expect(calls[0]).toBe('https://indexer.example/cellshire/ore/ore%3Amine%3A14455%3A5%3A7%3Acoal_seam');
    });

    it('maps 404s to untouched and failures to stale', async () => {
        const missing = new HttpOreIndexer({
            fetchImpl: async () => ({ ok: false, status: 404 }),
        });
        expect((await missing.getOreCell('ore:1')).status).toBe('untouched');
        const failing = new HttpOreIndexer({
            fetchImpl: async () => ({ ok: false, status: 503 }),
        });
        const out = await failing.getOreCell('ore:1');
        expect(out.status).toBe('stale');
        expect(out.reason).toBe('http-503');
    });

    it('selects fixture by default and HTTP when URL params request it', () => {
        expect(chainMiningIndexerMode(new URLSearchParams('chainMiningBirth=lazy'))).toBe('fixture');
        expect(chainMiningIndexerMode(new URLSearchParams('chainMiningIndexer=http'))).toBe('http');
        expect(createOreIndexerFromParams({ params: new URLSearchParams('') }).constructor.name)
            .toBe('LocalOreIndexer');
        expect(createOreIndexerFromParams({ params: new URLSearchParams('chainMiningIndexerUrl=https%3A%2F%2Findexer.example') }).constructor.name)
            .toBe('HttpOreIndexer');
    });
});
