const WALLET_KEY = 'cellshire:walletIdentity';

export const WALLET_STATES = ['disconnected', 'connecting', 'connected', 'failed'];

export function walletFeatureEnabled(params) {
    return params?.get?.('wallet') === '1';
}

export function makeWalletState(status = 'disconnected', account = null, error = null) {
    return {
        status: WALLET_STATES.includes(status) ? status : 'disconnected',
        account,
        error,
    };
}

export function sanitizeAccount(account) {
    if (!account || typeof account !== 'object') return null;
    if (typeof account.provider !== 'string' || typeof account.address !== 'string') return null;
    if (account.provider === '' || account.address === '') return null;
    return {
        provider: account.provider,
        address: account.address,
        label: typeof account.label === 'string' ? account.label : '',
        connectedAt: typeof account.connectedAt === 'number' ? account.connectedAt : Date.now(),
    };
}

export function loadWalletIdentity(storage) {
    const raw = storage.get(WALLET_KEY);
    if (!raw) return makeWalletState();
    try {
        const parsed = JSON.parse(raw);
        const account = sanitizeAccount(parsed);
        return account ? makeWalletState('connected', account) : makeWalletState();
    } catch {
        return makeWalletState();
    }
}

export function saveWalletIdentity(storage, account) {
    const safe = sanitizeAccount(account);
    if (!safe) return makeWalletState();
    storage.set(WALLET_KEY, JSON.stringify(safe));
    return makeWalletState('connected', safe);
}

export function clearWalletIdentity(storage) {
    storage.remove(WALLET_KEY);
    return makeWalletState();
}

export function shortAddress(address) {
    if (typeof address !== 'string' || address.length <= 14) return address || '';
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export function walletDisplayLabel(account) {
    if (!account) return 'Connect JoyID';
    return account.label || shortAddress(account.address);
}

export async function connectJoyIdStub({
    now = Date.now,
    shouldFail = false,
} = {}) {
    await new Promise(r => setTimeout(r, 250));
    if (shouldFail) throw new Error('JoyID connection cancelled');
    return {
        provider: 'joyid',
        address: 'ckt1qyq9xcellshirejoyidstub0000000000000000000',
        label: 'JoyID Dev',
        connectedAt: now(),
    };
}
