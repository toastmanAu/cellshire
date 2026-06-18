export const FIRST_SESSION_GRANT_CKB = 10000;

export function firstSessionGrantEnabled(params) {
    return params?.get?.('firstSessionGrant') === '1';
}

export function applyFirstSessionGrant({ params, inventory } = {}) {
    if (!firstSessionGrantEnabled(params) || !inventory) {
        return { ok: false, reason: 'disabled' };
    }
    inventory.add('ckb', FIRST_SESSION_GRANT_CKB);
    return {
        ok: true,
        currency: 'ckb',
        amount: FIRST_SESSION_GRANT_CKB,
    };
}
