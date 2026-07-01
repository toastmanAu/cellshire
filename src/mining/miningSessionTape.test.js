import { describe, expect, it } from '../test/harness.js';
import { OreState } from './OreState.js';
import {
    appendMiningSessionAction,
    canonicalMiningSessionHex,
    commitMiningSession,
    loadMiningSessionTape,
    miningSessionActionFromResult,
    miningSessionTapeKey,
    replayMiningSession,
} from './miningSessionTape.js';
import { fixedPriceSnapshot } from './cryptoEconomy.js';
import { ckbBlake2b256Hex } from '../lib/ckbBlake2b.js';

const GOLDEN_TWO_HIT_COMMITMENT = '0xd69085953112657ffadbd8fe96d9d72dcc37f58732a283030e9168b3cf47a155';
const GOLDEN_TWO_HIT_BYTES = '0x43534d53010001000500000031343435350a0000006d696e653a3134343535240000006f72653a6d696e6525334131343435353a31343435353a353a373a636f616c5f7365616d09000000636f616c5f7365616d05000000070000000300000003000000804a5d0500000000804a5d050000000002000000000000000500000031343435350a0000006d696e653a3134343535240000006f72653a6d696e6525334131343435353a31343435353a353a373a636f616c5f7365616d09000000636f616c5f7365616d0500000007000000030000000200000003000000804a5d0500000000804a5d0500000000008793030000000001000000020000000116000000636f696e6765636b6f3a73696d706c652d707269636514000000323032362d30352d31385431343a30363a33325a0300000075736401000000030000007a65630098a7b856dc010009000000636f616c5f7365616d030000007a656342ceae000000000080c3c901000000000087930300000000020000000100000000010000000500000031343435350a0000006d696e653a3134343535240000006f72653a6d696e6525334131343435353a31343435353a353a373a636f616c5f7365616d09000000636f616c5f7365616d0500000007000000020000000100000003000000804a5d0500000000008793030000000080c3c9010000000001000000020000000116000000636f696e6765636b6f3a73696d706c652d707269636514000000323032362d30352d31385431343a30363a33325a0300000075736401000000030000007a65630098a7b856dc010009000000636f616c5f7365616d030000007a656342ceae000000000080c3c9010000000000879303000000000200000001000000000100000080c3c9010000000001000000030000007a6563849c5d01000000000087930300000000000e27070000000002000000';

function fakeStorage() {
    const m = new Map();
    return {
        get: k => (m.has(k) ? m.get(k) : null),
        set: (k, v) => m.set(k, String(v)),
    };
}

describe('mining session tape', () => {
    it('uses CKB blake2b personalization for commitment hashes', () => {
        expect(ckbBlake2b256Hex('')).toBe('0x44f4c69744d5f8c55d642062949dcae49bc4e7ef43d388c5a12f42b5633d163e');
    });

    it('journals mine actions into an owner-replayable per-ore session', () => {
        const storage = fakeStorage();
        const priceSnapshot = fixedPriceSnapshot();
        const state = new OreState('coal_seam', 3, 3, {
            totalValueUsd: 90,
            remainingValueUsd: 90,
        });
        const obj = { gx: 5, gy: 7, assetId: 'coal_seam' };
        const result = state.mine(() => 0, {
            yieldMultiplier: 2,
            capacityPerHit: 1,
            priceSnapshot,
        });
        const action = miningSessionActionFromResult({
            epoch: 14455,
            mapId: 'mine:14455',
            obj,
            state,
            result,
            capacityPerHit: 1,
            yieldMultiplier: 2,
            priceSnapshot,
        });

        const saved = appendMiningSessionAction(storage, action);
        const key = miningSessionTapeKey({ epoch: 14455, oreId: action.oreId });
        expect(key.includes('cellshire:mining-session-tape:v1:14455')).toBe(true);
        expect(saved.actions.length).toBe(1);

        const loaded = loadMiningSessionTape(storage, { epoch: 14455, oreId: action.oreId });
        const replay = replayMiningSession(loaded);
        expect(replay.ok).toBe(true);
        expect(replay.results[0].amount).toBe(result.amount);
        expect(replay.results[0].valueUsd).toBe(60);
        expect(replay.final.capacityRemaining).toBe(2);
    });

    it('replays multi-hit sessions and rejects forged expected yields', () => {
        const storage = fakeStorage();
        const state = new OreState('iron_ore', 4, 4, {
            totalValueUsd: 100,
            remainingValueUsd: 100,
        });
        const obj = { gx: 8, gy: 9, assetId: 'iron_ore' };

        for (const capacityPerHit of [2, 2]) {
            const result = state.mine(() => 0, { capacityPerHit });
            appendMiningSessionAction(storage, miningSessionActionFromResult({
                epoch: 14456,
                mapId: 'mine:14456',
                obj,
                state,
                result,
                capacityPerHit,
            }));
        }

        const oreId = 'ore:mine%3A14456:14456:8:9:iron_ore';
        const replay = replayMiningSession(loadMiningSessionTape(storage, { epoch: 14456, oreId }));
        expect(replay.ok).toBe(true);
        expect(replay.results.length).toBe(2);
        expect(replay.final.capacityRemaining).toBe(0);

        const forged = {
            ...replay.session,
            actions: replay.session.actions.map((action, i) => i === 0
                ? { ...action, result: { ...action.result, amount: action.result.amount + 1 } }
                : action),
        };
        const rejected = replayMiningSession(forged);
        expect(rejected.ok).toBe(false);
        expect(rejected.reason).toBe('replay-mismatch');
        expect(rejected.mismatch[0]).toBe('amount');
    });

    it('serializes replayed sessions to a stable golden commitment', () => {
        const { session } = twoHitCoalSession();
        const commit = commitMiningSession(session);

        expect(commit.ok).toBe(true);
        expect(commit.commitment).toBe(GOLDEN_TWO_HIT_COMMITMENT);
        expect(commit.bytesHex).toBe(GOLDEN_TWO_HIT_BYTES);
        expect(canonicalMiningSessionHex(session)).toBe(GOLDEN_TWO_HIT_BYTES);
        expect(commit.summary).toEqual({
            final: {
                capacityRemaining: 1,
                remainingValueUsdMicros: '30000000',
            },
            rewards: [{
                currency: 'zec',
                amountUnits: '22912132',
                baseValueUsdMicros: '60000000',
                valueUsdMicros: '120000000',
                hits: 2,
            }],
        });
    });

    it('refuses to commit a forged replay session', () => {
        const { session } = twoHitCoalSession();
        const forged = {
            ...session,
            actions: session.actions.map((action, i) => i === 1
                ? { ...action, result: { ...action.result, valueUsd: action.result.valueUsd + 1 } }
                : action),
        };
        const commit = commitMiningSession(forged);
        expect(commit.ok).toBe(false);
        expect(commit.reason).toBe('replay-mismatch');
    });

    it('does not create a committed tape for random local epochs', () => {
        const storage = fakeStorage();
        const state = new OreState('coal_seam', 1, 1, {
            totalValueUsd: 50,
            remainingValueUsd: 50,
        });
        const result = state.mine(() => 0);
        const action = miningSessionActionFromResult({
            epoch: null,
            mapId: 'mine:local',
            obj: { gx: 1, gy: 2, assetId: 'coal_seam' },
            state,
            result,
        });
        expect(action).toBeNull();
        expect(appendMiningSessionAction(storage, action)).toBeNull();
    });
});

function twoHitCoalSession() {
    const storage = fakeStorage();
    const priceSnapshot = fixedPriceSnapshot();
    const state = new OreState('coal_seam', 3, 3, {
        totalValueUsd: 90,
        remainingValueUsd: 90,
    });
    const obj = { gx: 5, gy: 7, assetId: 'coal_seam' };
    for (const capacityPerHit of [1, 1]) {
        const result = state.mine(() => 0, {
            yieldMultiplier: 2,
            capacityPerHit,
            priceSnapshot,
        });
        appendMiningSessionAction(storage, miningSessionActionFromResult({
            epoch: 14455,
            mapId: 'mine:14455',
            obj,
            state,
            result,
            capacityPerHit,
            yieldMultiplier: 2,
            priceSnapshot,
        }));
    }
    const oreId = 'ore:mine%3A14455:14455:5:7:coal_seam';
    return {
        oreId,
        session: loadMiningSessionTape(storage, { epoch: 14455, oreId }),
    };
}
