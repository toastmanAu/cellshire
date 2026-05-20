export const PROPERTY_OWNER_BINDING_KEY = 'cellshire:propertyOwnerBinding:v1';

export function normalizePropertyOwnerBinding(binding = null) {
    return binding?.mode === 'wallet'
        ? {
            mode: 'wallet',
            ownerId: typeof binding.ownerId === 'string' ? binding.ownerId : '',
            boundAt: Number.isFinite(binding.boundAt) ? binding.boundAt : null,
        }
        : { mode: 'local' };
}

export function loadPropertyOwnerBinding(storage) {
    try {
        const raw = storage.get(PROPERTY_OWNER_BINDING_KEY);
        if (!raw) return { mode: 'local' };
        return normalizePropertyOwnerBinding(JSON.parse(raw));
    } catch {
        return { mode: 'local' };
    }
}

export function bindPropertyOwnerToWallet(storage, account, { now = Date.now } = {}) {
    if (!account?.address) return bindPropertyOwnerToLocal(storage);
    const binding = {
        mode: 'wallet',
        ownerId: account.address,
        boundAt: now(),
    };
    storage.set(PROPERTY_OWNER_BINDING_KEY, JSON.stringify(binding));
    return binding;
}

export function bindPropertyOwnerToLocal(storage) {
    storage.remove(PROPERTY_OWNER_BINDING_KEY);
    return { mode: 'local' };
}

export function propertyOwnerFromBinding(walletState, binding = { mode: 'local' }) {
    const normalized = normalizePropertyOwnerBinding(binding);
    if (normalized.mode !== 'wallet') return 'local';
    if (walletState?.status !== 'connected' || !walletState.account?.address) return 'local';
    return walletState.account.address;
}
