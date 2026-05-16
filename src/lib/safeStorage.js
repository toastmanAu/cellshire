/**
 * Tiny wrapper around localStorage that survives Safari private mode,
 * quota errors, and Node test environments. Falls back to an in-memory
 * Map on any backend failure for the session.
 */

function makeMemoryBackend() {
    const m = new Map();
    return {
        getItem: k => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: k => m.delete(k),
    };
}

const defaultBackend = () =>
    (typeof window !== 'undefined' && window.localStorage) || null;

/**
 * Build a safe-storage instance. Pass a custom backend for tests.
 */
export function makeSafeStorage(backend = defaultBackend()) {
    let active = backend || makeMemoryBackend();
    const fallback = makeMemoryBackend();

    function tryWith(fn) {
        try {
            return fn(active);
        } catch (_err) {
            active = fallback;
            return fn(active);
        }
    }

    return {
        get(key) { return tryWith(b => b.getItem(key)); },
        set(key, value) { tryWith(b => b.setItem(key, value)); },
        remove(key) { tryWith(b => b.removeItem(key)); },
    };
}

/** Default singleton wrapping the real localStorage (or memory). */
export const safeStorage = makeSafeStorage();
