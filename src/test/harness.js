/**
 * Tiny self-running test harness. No deps. Used by tests.html.
 *
 *   describe('group', () => { it('does X', () => { expect(a).toBe(b); }); });
 *
 * tests.html imports the *.test.js files (which register cases via
 * describe/it) and then calls runAll() to execute them.
 */

const suite = [];
let currentDescribe = null;

export function describe(name, fn) {
    const prev = currentDescribe;
    currentDescribe = name;
    try { fn(); } finally { currentDescribe = prev; }
}

export function it(name, fn) {
    suite.push({ describe: currentDescribe, name, fn });
}

export function expect(actual) {
    return {
        toBe(expected) {
            if (actual !== expected) {
                throw new Error(`expected ${j(actual)} to be ${j(expected)}`);
            }
        },
        toEqual(expected) {
            const a = j(actual), b = j(expected);
            if (a !== b) throw new Error(`expected ${a} to equal ${b}`);
        },
        toBeNull() {
            if (actual !== null) throw new Error(`expected ${j(actual)} to be null`);
        },
        toBeTruthy() {
            if (!actual) throw new Error(`expected truthy, got ${j(actual)}`);
        },
    };
}

function j(v) {
    try { return JSON.stringify(v); } catch { return String(v); }
}

export async function runAll() {
    // Drain the suite so re-runs (e.g. a future "re-run" button) start
    // from a clean slate rather than accumulating registrations.
    const snapshot = suite.splice(0);
    const results = [];
    for (const t of snapshot) {
        try {
            await t.fn();
            results.push({ ...t, ok: true });
        } catch (err) {
            results.push({ ...t, ok: false, err });
        }
    }
    return results;
}
