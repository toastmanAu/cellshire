import { oreIdentityForObject } from './oreIdentity.js';
import { OreState } from './OreState.js';
import {
    currencyAmountToUnits,
    microsToUsd,
    usdPriceToScaled,
    usdToMicros,
} from './cryptoEconomy.js';
import { bytesToHex, ckbBlake2b256Hex } from '../lib/ckbBlake2b.js';

export const MINING_SESSION_TAPE_VERSION = 1;
export const MINING_SESSION_COMMITMENT_SCHEMA_VERSION = 1;
export const MINING_SESSION_COMMITMENT_ALGORITHM = 'ckb-blake2b-256';
const MINING_SESSION_TAPE_PREFIX = 'cellshire:mining-session-tape:v1:';
const COMMITMENT_MAGIC = 'CSMS';

export function miningSessionTapeKey({ epoch, oreId } = {}) {
    if (epoch === null || epoch === undefined || epoch === '' || !oreId) return null;
    return `${MINING_SESSION_TAPE_PREFIX}${encodeURIComponent(String(epoch))}:${encodeURIComponent(oreId)}`;
}

export function loadMiningSessionTape(storage, { epoch, oreId } = {}) {
    const key = miningSessionTapeKey({ epoch, oreId });
    if (!key) return null;
    try {
        const raw = storage?.get?.(key);
        if (!raw) return null;
        return normalizeMiningSession(JSON.parse(raw));
    } catch {
        return null;
    }
}

export function saveMiningSessionTape(storage, session) {
    const normalized = normalizeMiningSession(session);
    const key = miningSessionTapeKey(normalized);
    if (!key) return null;
    storage?.set?.(key, JSON.stringify(normalized));
    return normalized;
}

export function appendMiningSessionAction(storage, action) {
    const normalized = normalizeMiningAction(action);
    if (!normalized) return null;
    const existing = loadMiningSessionTape(storage, normalized);
    const session = existing ?? {
        version: MINING_SESSION_TAPE_VERSION,
        epoch: normalized.epoch,
        mapId: normalized.mapId,
        oreId: normalized.oreId,
        oreType: normalized.oreType,
        gx: normalized.gx,
        gy: normalized.gy,
        initial: {
            capacityRemaining: normalized.capacityBefore,
            maxCapacity: normalized.maxCapacity,
            totalValueUsd: normalized.totalValueUsd,
            remainingValueUsd: normalized.remainingValueUsdBefore,
        },
        actions: [],
    };
    session.actions.push(normalized);
    return saveMiningSessionTape(storage, session);
}

export function miningSessionActionFromResult({
    epoch,
    mapId,
    obj,
    state,
    result,
    capacityPerHit = 1,
    yieldMultiplier = 1,
    priceSnapshot = null,
} = {}) {
    if (!obj || !state || !result) return null;
    const identity = oreIdentityForObject({ epoch, mapId, obj });
    const capacitySpent = Math.max(1, Number(result.capacitySpent) || 1);
    const capacityBefore = state.capacityRemaining + capacitySpent;
    const remainingValueUsdBefore = microsToUsd(
        usdToMicros(state.remainingValueUsd) + usdToMicros(result.baseValueUsd),
    );
    return normalizeMiningAction({
        ...identity,
        capacityBefore,
        capacityAfter: state.capacityRemaining,
        maxCapacity: state.maxCapacity,
        totalValueUsd: state.totalValueUsd,
        remainingValueUsdBefore,
        remainingValueUsdAfter: state.remainingValueUsd,
        capacityPerHit,
        yieldMultiplier,
        priceSnapshot: compactPriceSnapshot(priceSnapshot, result.currency),
        result: {
            oreType: result.oreType,
            currency: result.currency,
            amount: result.amount,
            baseValueUsd: result.baseValueUsd,
            valueUsd: result.valueUsd,
            yieldMultiplier: result.yieldMultiplier,
            capacitySpent: result.capacitySpent,
            depleted: result.depleted,
        },
    });
}

export function replayMiningSession(session) {
    const normalized = normalizeMiningSession(session);
    if (!normalized) return { ok: false, reason: 'invalid-session' };
    const state = new OreState(
        normalized.oreType,
        normalized.initial.capacityRemaining,
        normalized.initial.maxCapacity,
        {
            totalValueUsd: normalized.initial.totalValueUsd,
            remainingValueUsd: normalized.initial.remainingValueUsd,
        },
    );
    const results = [];
    for (const action of normalized.actions) {
        const result = state.mine(() => 0, {
            yieldMultiplier: action.yieldMultiplier,
            capacityPerHit: action.capacityPerHit,
            priceSnapshot: action.priceSnapshot,
        });
        if (!result) return { ok: false, reason: 'replay-depleted', action, results };
        results.push(result);
        const mismatch = compareReplayResult(action, result, state);
        if (mismatch) {
            return {
                ok: false,
                reason: 'replay-mismatch',
                mismatch,
                action,
                result,
                results,
            };
        }
    }
    return {
        ok: true,
        session: normalized,
        results,
        final: {
            capacityRemaining: state.capacityRemaining,
            remainingValueUsd: state.remainingValueUsd,
        },
    };
}

export function commitMiningSession(session) {
    const replay = replayFromInput(session);
    if (!replay.ok) return { ok: false, reason: replay.reason, replay };
    const bytes = canonicalMiningSessionBytes(replay);
    const summary = summarizeMiningReplay(replay);
    return {
        ok: true,
        algorithm: MINING_SESSION_COMMITMENT_ALGORITHM,
        schemaVersion: MINING_SESSION_COMMITMENT_SCHEMA_VERSION,
        commitment: ckbBlake2b256Hex(bytes),
        bytesHex: `0x${bytesToHex(bytes)}`,
        summary,
        replay,
    };
}

export function canonicalMiningSessionBytes(session) {
    const replay = replayFromInput(session);
    if (!replay.ok) return null;
    const { session: normalized, final } = replay;
    const summary = summarizeMiningReplay(replay);
    const w = new ByteWriter();

    w.writeAscii(COMMITMENT_MAGIC);
    w.writeU16(MINING_SESSION_COMMITMENT_SCHEMA_VERSION);
    w.writeU16(normalized.version);
    w.writeString(normalized.epoch);
    w.writeString(normalized.mapId);
    w.writeString(normalized.oreId);
    w.writeString(normalized.oreType);
    w.writeI32(normalized.gx);
    w.writeI32(normalized.gy);
    w.writeU32(normalized.initial.capacityRemaining);
    w.writeU32(normalized.initial.maxCapacity);
    w.writeU64(usdToMicros(normalized.initial.totalValueUsd));
    w.writeU64(usdToMicros(normalized.initial.remainingValueUsd));

    w.writeU32(normalized.actions.length);
    normalized.actions.forEach((action, index) => writeAction(w, action, index));

    w.writeU32(final.capacityRemaining);
    w.writeU64(usdToMicros(final.remainingValueUsd));
    w.writeU32(summary.rewards.length);
    for (const reward of summary.rewards) {
        w.writeString(reward.currency);
        w.writeU64(BigInt(reward.amountUnits));
        w.writeU64(BigInt(reward.baseValueUsdMicros));
        w.writeU64(BigInt(reward.valueUsdMicros));
        w.writeU32(reward.hits);
    }
    return w.finish();
}

export function canonicalMiningSessionHex(session) {
    const bytes = canonicalMiningSessionBytes(session);
    return bytes ? `0x${bytesToHex(bytes)}` : null;
}

export function summarizeMiningReplay(replay) {
    if (!replay?.ok) return null;
    const byCurrency = new Map();
    for (const result of replay.results) {
        const currency = String(result.currency || '');
        if (!currency) continue;
        const current = byCurrency.get(currency) ?? {
            currency,
            amountUnits: 0n,
            baseValueUsdMicros: 0n,
            valueUsdMicros: 0n,
            hits: 0,
        };
        current.amountUnits += currencyAmountToUnits(result.amount);
        current.baseValueUsdMicros += usdToMicros(result.baseValueUsd);
        current.valueUsdMicros += usdToMicros(result.valueUsd);
        current.hits += 1;
        byCurrency.set(currency, current);
    }
    return {
        final: {
            capacityRemaining: replay.final.capacityRemaining,
            remainingValueUsdMicros: String(usdToMicros(replay.final.remainingValueUsd)),
        },
        rewards: Array.from(byCurrency.values())
            .sort((a, b) => a.currency.localeCompare(b.currency))
            .map(reward => ({
                currency: reward.currency,
                amountUnits: String(reward.amountUnits),
                baseValueUsdMicros: String(reward.baseValueUsdMicros),
                valueUsdMicros: String(reward.valueUsdMicros),
                hits: reward.hits,
            })),
    };
}

function normalizeMiningSession(session) {
    if (!session || typeof session !== 'object') return null;
    const initial = normalizeInitial(session.initial);
    const base = {
        version: MINING_SESSION_TAPE_VERSION,
        epoch: session.epoch === null || session.epoch === undefined ? null : String(session.epoch),
        mapId: String(session.mapId || ''),
        oreId: String(session.oreId || ''),
        oreType: String(session.oreType || ''),
        gx: Number(session.gx),
        gy: Number(session.gy),
        initial,
        actions: Array.isArray(session.actions)
            ? session.actions.map(normalizeMiningAction).filter(Boolean)
            : [],
    };
    if (!base.epoch || !base.mapId || !base.oreId || !base.oreType || !initial) return null;
    if (!Number.isInteger(base.gx) || !Number.isInteger(base.gy)) return null;
    return base;
}

function normalizeInitial(initial) {
    const capacityRemaining = Number(initial?.capacityRemaining);
    const maxCapacity = Number(initial?.maxCapacity);
    const totalValueUsd = Number(initial?.totalValueUsd);
    const remainingValueUsd = Number(initial?.remainingValueUsd);
    if (!Number.isInteger(capacityRemaining) || capacityRemaining < 0) return null;
    if (!Number.isInteger(maxCapacity) || maxCapacity < 1) return null;
    if (!Number.isFinite(totalValueUsd) || totalValueUsd < 0) return null;
    if (!Number.isFinite(remainingValueUsd) || remainingValueUsd < 0) return null;
    return { capacityRemaining, maxCapacity, totalValueUsd, remainingValueUsd };
}

function normalizeMiningAction(action) {
    if (!action || typeof action !== 'object') return null;
    const out = {
        version: MINING_SESSION_TAPE_VERSION,
        epoch: action.epoch === null || action.epoch === undefined ? null : String(action.epoch),
        mapId: String(action.mapId || ''),
        oreId: String(action.oreId || ''),
        oreType: String(action.oreType || action.result?.oreType || ''),
        gx: Number(action.gx),
        gy: Number(action.gy),
        capacityBefore: Number(action.capacityBefore),
        capacityAfter: Number(action.capacityAfter),
        maxCapacity: Number(action.maxCapacity),
        totalValueUsd: numberOr(action.totalValueUsd, 0),
        remainingValueUsdBefore: numberOr(action.remainingValueUsdBefore, 0),
        remainingValueUsdAfter: numberOr(action.remainingValueUsdAfter, 0),
        capacityPerHit: Math.max(1, Math.floor(Number(action.capacityPerHit) || 1)),
        yieldMultiplier: Math.max(1, Math.floor(Number(action.yieldMultiplier) || 1)),
        priceSnapshot: normalizePriceSnapshot(action.priceSnapshot),
        result: normalizeResult(action.result),
    };
    if (!out.epoch || !out.mapId || !out.oreId || !out.oreType || !out.result) return null;
    if (!Number.isInteger(out.gx) || !Number.isInteger(out.gy)) return null;
    if (!Number.isInteger(out.capacityBefore) || !Number.isInteger(out.capacityAfter)) return null;
    if (!Number.isInteger(out.maxCapacity) || out.maxCapacity < 1) return null;
    return out;
}

function normalizeResult(result) {
    if (!result || typeof result !== 'object') return null;
    const out = {
        oreType: String(result.oreType || ''),
        currency: String(result.currency || ''),
        amount: numberOr(result.amount, null),
        baseValueUsd: numberOr(result.baseValueUsd, null),
        valueUsd: numberOr(result.valueUsd, null),
        yieldMultiplier: Math.max(1, Math.floor(Number(result.yieldMultiplier) || 1)),
        capacitySpent: Math.max(1, Math.floor(Number(result.capacitySpent) || 1)),
        depleted: result.depleted === true,
    };
    if (!out.oreType || !out.currency) return null;
    if ([out.amount, out.baseValueUsd, out.valueUsd].some(n => !Number.isFinite(n))) return null;
    return out;
}

function normalizePriceSnapshot(snapshot) {
    if (!snapshot?.prices || typeof snapshot.prices !== 'object') return null;
    const prices = {};
    for (const [currency, price] of Object.entries(snapshot.prices)) {
        const n = Number(price);
        if (Number.isFinite(n) && n > 0) prices[currency] = n;
    }
    if (Object.keys(prices).length === 0) return null;
    return {
        source: typeof snapshot.source === 'string' ? snapshot.source : null,
        capturedAt: typeof snapshot.capturedAt === 'string' ? snapshot.capturedAt : null,
        vsCurrency: typeof snapshot.vsCurrency === 'string' ? snapshot.vsCurrency : 'usd',
        prices,
    };
}

function compactPriceSnapshot(snapshot, currency) {
    const price = snapshot?.prices?.[currency];
    if (!Number.isFinite(price) || price <= 0) return null;
    return normalizePriceSnapshot({
        source: snapshot.source,
        capturedAt: snapshot.capturedAt,
        vsCurrency: snapshot.vsCurrency,
        prices: { [currency]: price },
    });
}

function compareReplayResult(action, result, state) {
    const checks = [
        ['capacityAfter', state.capacityRemaining, action.capacityAfter],
        ['remainingValueUsdAfter', state.remainingValueUsd, action.remainingValueUsdAfter],
        ['currency', result.currency, action.result.currency],
        ['amount', result.amount, action.result.amount],
        ['baseValueUsd', result.baseValueUsd, action.result.baseValueUsd],
        ['valueUsd', result.valueUsd, action.result.valueUsd],
        ['capacitySpent', result.capacitySpent, action.result.capacitySpent],
        ['depleted', result.depleted, action.result.depleted],
    ];
    return checks.find(([, actual, expected]) => actual !== expected) ?? null;
}

function replayFromInput(input) {
    if (input?.ok === true && input.session && Array.isArray(input.results) && input.final) {
        return input;
    }
    return replayMiningSession(input);
}

function writeAction(w, action, index) {
    w.writeU32(index);
    w.writeString(action.epoch);
    w.writeString(action.mapId);
    w.writeString(action.oreId);
    w.writeString(action.oreType);
    w.writeI32(action.gx);
    w.writeI32(action.gy);
    w.writeU32(action.capacityBefore);
    w.writeU32(action.capacityAfter);
    w.writeU32(action.maxCapacity);
    w.writeU64(usdToMicros(action.totalValueUsd));
    w.writeU64(usdToMicros(action.remainingValueUsdBefore));
    w.writeU64(usdToMicros(action.remainingValueUsdAfter));
    w.writeU32(action.capacityPerHit);
    w.writeU32(action.yieldMultiplier);
    writePriceSnapshot(w, action.priceSnapshot);

    w.writeString(action.result.oreType);
    w.writeString(action.result.currency);
    w.writeU64(currencyAmountToUnits(action.result.amount));
    w.writeU64(usdToMicros(action.result.baseValueUsd));
    w.writeU64(usdToMicros(action.result.valueUsd));
    w.writeU32(action.result.yieldMultiplier);
    w.writeU32(action.result.capacitySpent);
    w.writeU8(action.result.depleted ? 1 : 0);
}

function writePriceSnapshot(w, snapshot) {
    if (!snapshot) {
        w.writeU8(0);
        return;
    }
    w.writeU8(1);
    w.writeString(snapshot.source || '');
    w.writeString(snapshot.capturedAt || '');
    w.writeString(snapshot.vsCurrency || 'usd');
    const entries = Object.entries(snapshot.prices || {})
        .filter(([, price]) => Number.isFinite(Number(price)) && Number(price) > 0)
        .sort(([a], [b]) => a.localeCompare(b));
    w.writeU32(entries.length);
    for (const [currency, price] of entries) {
        w.writeString(currency);
        w.writeU64(usdPriceToScaled(price));
    }
}

class ByteWriter {
    constructor() {
        this.parts = [];
        this.length = 0;
    }

    writeAscii(value) {
        const bytes = Array.from(String(value), ch => ch.charCodeAt(0));
        this.writeBytes(new Uint8Array(bytes));
    }

    writeString(value) {
        const bytes = new TextEncoder().encode(String(value ?? ''));
        this.writeU32(bytes.length);
        this.writeBytes(bytes);
    }

    writeU8(value) {
        this.writeBytes(new Uint8Array([Number(value) & 0xff]));
    }

    writeU16(value) {
        const bytes = new Uint8Array(2);
        let n = Number(value) >>> 0;
        bytes[0] = n & 0xff;
        bytes[1] = (n >>> 8) & 0xff;
        this.writeBytes(bytes);
    }

    writeU32(value) {
        const bytes = new Uint8Array(4);
        let n = Number(value) >>> 0;
        for (let i = 0; i < 4; i += 1) {
            bytes[i] = n & 0xff;
            n >>>= 8;
        }
        this.writeBytes(bytes);
    }

    writeI32(value) {
        this.writeU32(Number(value) | 0);
    }

    writeU64(value) {
        const bytes = new Uint8Array(8);
        let n = BigInt(value);
        if (n < 0n) n = 0n;
        for (let i = 0; i < 8; i += 1) {
            bytes[i] = Number(n & 0xffn);
            n >>= 8n;
        }
        this.writeBytes(bytes);
    }

    writeBytes(bytes) {
        this.parts.push(bytes);
        this.length += bytes.length;
    }

    finish() {
        const out = new Uint8Array(this.length);
        let offset = 0;
        for (const part of this.parts) {
            out.set(part, offset);
            offset += part.length;
        }
        return out;
    }
}

function numberOr(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}
