import {
    clearWalletIdentity,
    connectJoyIdStub,
    loadWalletIdentity,
    saveWalletIdentity,
    walletDisplayLabel,
} from '../wallet/walletIdentity.js';
import {
    bindPropertyOwnerToLocal,
    bindPropertyOwnerToWallet,
    loadPropertyOwnerBinding,
    propertyOwnerFromBinding,
} from '../property/propertyOwnerBinding.js';
import { ownerIdForVisit } from '../visiting/visitLinks.js';

export function installWalletHUD({ storage, shouldFail = false, connector = connectJoyIdStub, game = null }) {
    let state = loadWalletIdentity(storage);
    let propertyBinding = loadPropertyOwnerBinding(storage);

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

    const propertyAction = document.createElement('button');
    propertyAction.type = 'button';
    propertyAction.className = 'wallet-hud__property';
    root.appendChild(propertyAction);

    document.body.appendChild(root);

    function render() {
        root.dataset.state = state.status;
        renderPropertyAction();
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

    function renderPropertyAction() {
        const currentOwner = game?.propertyOwner ?? propertyOwnerFromBinding(state, propertyBinding);
        const walletOwner = ownerIdForVisit(state.account);
        propertyAction.hidden = !game || (state.status !== 'connected' && currentOwner === 'local');
        propertyAction.disabled = state.status === 'connecting';
        propertyAction.textContent = state.status === 'connected' && currentOwner !== walletOwner
            ? 'Use wallet home'
            : 'Use local home';
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
        await syncPropertyOwnerFromBinding();
    }

    async function disconnect() {
        state = clearWalletIdentity(storage);
        render();
        emitWalletChange();
        await syncPropertyOwnerFromBinding({ toast: true });
    }

    async function syncPropertyOwnerFromBinding({ toast = false } = {}) {
        if (!game?.setHomePropertyOwner) return;
        await game.setHomePropertyOwner(propertyOwnerFromBinding(state, propertyBinding), { toast });
        render();
    }

    async function togglePropertyOwner() {
        if (state.status === 'connected') {
            const walletOwner = ownerIdForVisit(state.account);
            if ((game?.propertyOwner ?? 'local') !== walletOwner) {
                propertyBinding = bindPropertyOwnerToWallet(storage, state.account);
                await syncPropertyOwnerFromBinding({ toast: true });
                return;
            }
        }
        propertyBinding = bindPropertyOwnerToLocal(storage);
        await syncPropertyOwnerFromBinding({ toast: true });
    }

    action.addEventListener('click', () => {
        if (state.status === 'connected') disconnect();
        else connect();
    });
    propertyAction.addEventListener('click', togglePropertyOwner);

    render();
    return {
        root,
        getState: () => state,
        dismiss() { root.remove(); },
    };
}
