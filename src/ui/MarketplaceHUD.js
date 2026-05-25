import { allAssets } from '../assets/assetLoader.js';
import { formatCurrencyAmount } from '../mining/cryptoEconomy.js';
import {
    formatMarketplacePrice,
    marketplaceCanMutate,
} from '../marketplace/playerMarketplace.js';
import { safeStorage } from '../lib/safeStorage.js';
import {
    loadWalletIdentity,
    walletDisplayLabel,
} from '../wallet/walletIdentity.js';
import { hudMount } from './hudMount.js';

function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
}

function div(className, text = '') {
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    return el;
}

function appendThumb(parent, assetId) {
    const generated = allAssets()[assetId];
    const frame = div('marketplace__thumb');
    if (generated) {
        const canvas = document.createElement('canvas');
        const max = 44;
        const scale = Math.min(max / generated.width, max / generated.height, 2);
        canvas.width = Math.ceil(generated.width * scale);
        canvas.height = Math.ceil(generated.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(generated.canvas, 0, 0, canvas.width, canvas.height);
        frame.appendChild(canvas);
    }
    parent.appendChild(frame);
}

export function installMarketplaceHUD(game, { storage = safeStorage } = {}) {
    const root = document.createElement('section');
    root.id = 'marketplace-hud';
    root.dataset.open = '0';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'marketplace__toggle';
    toggle.textContent = 'Market';
    root.appendChild(toggle);

    const panel = div('marketplace__panel');
    root.appendChild(panel);
    hudMount('actions').appendChild(root);
    let balanceInventory = game.player?.inventory ?? null;

    function currentWallet() {
        return loadWalletIdentity(storage);
    }

    async function refreshBalances() {
        if (!game.marketplaceBalanceAdapter?.read) {
            balanceInventory = game.player?.inventory ?? null;
            return balanceInventory;
        }
        const snapshot = await game.marketplaceBalanceAdapter.read();
        balanceInventory = snapshot.currencies;
        return balanceInventory;
    }

    function renderListingForm(walletState) {
        const canMutate = marketplaceCanMutate(walletState);
        const ownedProps = game.propInventory.entries();
        const form = document.createElement('form');
        form.className = 'marketplace__list-form';

        const select = document.createElement('select');
        for (const [assetId, count] of ownedProps) {
            const asset = game.assetName?.(assetId) ?? assetId;
            const option = document.createElement('option');
            option.value = assetId;
            option.textContent = `${asset} (${count})`;
            select.appendChild(option);
        }

        const price = document.createElement('input');
        price.type = 'number';
        price.min = '1';
        price.step = '1';
        price.inputMode = 'numeric';
        price.value = '1500';

        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.className = 'marketplace__list-button';
        submit.textContent = canMutate ? 'List' : 'Browse';
        submit.disabled = !canMutate || ownedProps.length === 0;

        form.appendChild(div('marketplace__form-label', 'List owned prop'));
        form.appendChild(select);
        form.appendChild(price);
        form.appendChild(submit);
        form.addEventListener('submit', (ev) => {
            ev.preventDefault();
            game.listMarketplaceItem({
                assetId: select.value,
                price: { currency: 'ckb', amount: Number(price.value) },
                account: currentWallet().account,
            });
            render();
        });
        return form;
    }

    function render() {
        clear(panel);
        const walletState = currentWallet();
        const canMutate = marketplaceCanMutate(walletState);
        panel.appendChild(div('marketplace__title', 'Player Marketplace'));
        panel.appendChild(div(
            'marketplace__status',
            canMutate
                ? `Trading as ${walletDisplayLabel(walletState.account)}`
                : 'Browse only · connect JoyID to trade',
        ));
        panel.appendChild(renderListingForm(walletState));

        const list = div('marketplace__list');
        const listings = game.marketplaceListings();
        for (const listing of listings) {
            const row = document.createElement('article');
            row.className = 'marketplace__item';
            row.dataset.rarity = listing.rarity;
            appendThumb(row, listing.assetId);

            const body = div('marketplace__body');
            body.appendChild(div('marketplace__name', listing.name));
            body.appendChild(div(
                'marketplace__meta',
                `${listing.itemType} · ${listing.rarity} · ${listing.sellerLabel}`,
            ));
            body.appendChild(div('marketplace__price', formatMarketplacePrice(listing)));
            row.appendChild(body);

            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'marketplace__action';
            const isOwn = canMutate && listing.seller === walletState.account.address;
            const balance = balanceInventory?.get?.(listing.price.currency) ?? 0;
            action.textContent = !canMutate ? 'View' : isOwn ? 'Cancel' : 'Buy';
            action.disabled = !canMutate || (!isOwn && balance < listing.price.amount);
            action.addEventListener('click', async () => {
                action.disabled = true;
                if (isOwn) {
                    game.cancelMarketplaceListing(listing.id, walletState.account);
                } else {
                    await game.buyMarketplaceListing(listing.id, walletState.account);
                }
                await refreshBalances();
                render();
            });
            row.appendChild(action);
            list.appendChild(row);
        }
        panel.appendChild(list);
    }

    async function open() {
        root.dataset.open = '1';
        await refreshBalances();
        render();
    }

    function close() {
        root.dataset.open = '0';
    }

    toggle.addEventListener('click', () => {
        if (root.dataset.open === '1') close();
        else open().catch(err => {
            console.warn('[cellshire] marketplace balance refresh failed', err);
            render();
        });
    });

    const rerenderOpen = () => {
        if (root.dataset.open === '1') render();
    };
    const offCurrency = game.player?.inventory?.onChange?.(rerenderOpen);
    const offProps = game.propInventory?.onChange?.(rerenderOpen);
    const offMarket = game.onMarketplaceChange?.(rerenderOpen);
    if (typeof window !== 'undefined') {
        window.addEventListener('cellshire:walletchange', rerenderOpen);
    }
    render();
    return {
        root,
        render,
        open,
        close,
        refreshBalances,
        dismiss() {
            offCurrency?.();
            offProps?.();
            offMarket?.();
            if (typeof window !== 'undefined') {
                window.removeEventListener('cellshire:walletchange', rerenderOpen);
            }
            root.remove();
        },
    };
}
