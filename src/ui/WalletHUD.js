import {
    clearWalletIdentity,
    connectJoyIdStub,
    loadWalletIdentity,
    saveWalletIdentity,
    walletDisplayLabel,
} from '../wallet/walletIdentity.js';

export function installWalletHUD({ storage, shouldFail = false, connector = connectJoyIdStub }) {
    let state = loadWalletIdentity(storage);

    const root = document.createElement('section');
    root.id = 'wallet-hud';
    root.dataset.state = state.status;

    const label = document.createElement('div');
    label.className = 'wallet-hud__label';
    root.appendChild(label);

    const detail = document.createElement('div');
    detail.className = 'wallet-hud__detail';
    root.appendChild(detail);

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'wallet-hud__action';
    root.appendChild(action);

    document.body.appendChild(root);

    function render() {
        root.dataset.state = state.status;
        if (state.status === 'connected') {
            label.textContent = walletDisplayLabel(state.account);
            detail.textContent = state.account.provider;
            action.textContent = 'Disconnect';
            action.disabled = false;
            return;
        }
        if (state.status === 'connecting') {
            label.textContent = 'JoyID';
            detail.textContent = 'connecting';
            action.textContent = 'Connecting';
            action.disabled = true;
            return;
        }
        if (state.status === 'failed') {
            label.textContent = 'JoyID failed';
            detail.textContent = state.error || 'connection cancelled';
            action.textContent = 'Retry';
            action.disabled = false;
            return;
        }
        label.textContent = 'Wallet';
        detail.textContent = 'optional identity';
        action.textContent = 'Connect JoyID';
        action.disabled = false;
    }

    function emitWalletChange() {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent('cellshire:walletchange', { detail: state }));
    }

    async function connect() {
        state = { status: 'connecting', account: null, error: null };
        render();
        try {
            const account = await connector({ shouldFail });
            state = saveWalletIdentity(storage, account);
        } catch (err) {
            state = {
                status: 'failed',
                account: null,
                error: err?.message || 'connection failed',
            };
        }
        render();
        emitWalletChange();
    }

    function disconnect() {
        state = clearWalletIdentity(storage);
        render();
        emitWalletChange();
    }

    action.addEventListener('click', () => {
        if (state.status === 'connected') disconnect();
        else connect();
    });

    render();
    return {
        root,
        getState: () => state,
        dismiss() { root.remove(); },
    };
}
