import { allAssets } from '../assets/assetLoader.js';
import { formatCurrencyAmount } from '../mining/cryptoEconomy.js';
import {
    formatStorePrice,
    generalStoreCatalog,
} from '../store/generalStoreCatalog.js';

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
    const frame = div('general-store__thumb');
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

export function installGeneralStoreHUD(game) {
    const root = document.createElement('section');
    root.id = 'general-store-hud';
    root.dataset.open = '0';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'general-store__toggle';
    toggle.textContent = 'Store';
    root.appendChild(toggle);

    const panel = document.createElement('div');
    panel.className = 'general-store__panel';
    root.appendChild(panel);
    document.body.appendChild(root);

    function render() {
        clear(panel);
        panel.appendChild(div('general-store__title', 'General Store'));

        const balance = game.player?.inventory?.get?.('ckb') ?? 0;
        panel.appendChild(div('general-store__balance', `Balance ${formatCurrencyAmount('ckb', balance)}`));

        const list = div('general-store__list');
        for (const item of generalStoreCatalog()) {
            const row = document.createElement('article');
            row.className = 'general-store__item';
            row.dataset.rarity = item.rarity;
            appendThumb(row, item.assetId);

            const body = div('general-store__body');
            body.appendChild(div('general-store__name', item.name));
            body.appendChild(div(
                'general-store__meta',
                `${item.rarity} · Tier ${item.unlockTier} · owned ${game.propInventory.get(item.assetId)}`,
            ));
            body.appendChild(div('general-store__price', formatStorePrice(item)));
            row.appendChild(body);

            const buy = document.createElement('button');
            buy.type = 'button';
            buy.className = 'general-store__buy';
            buy.textContent = game.propertyTier < item.unlockTier ? 'Locked' : 'Buy';
            buy.disabled = game.propertyTier < item.unlockTier || balance < item.price.amount;
            buy.addEventListener('click', () => {
                game.buyGeneralStoreItem(item.assetId);
                render();
            });
            row.appendChild(buy);
            list.appendChild(row);
        }
        panel.appendChild(list);
    }

    function open() {
        root.dataset.open = '1';
        render();
    }

    function close() {
        root.dataset.open = '0';
    }

    toggle.addEventListener('click', () => {
        if (root.dataset.open === '1') close();
        else open();
    });

    const offCurrency = game.player?.inventory?.onChange?.(() => {
        if (root.dataset.open === '1') render();
    });
    const offProps = game.propInventory?.onChange?.(() => {
        if (root.dataset.open === '1') render();
    });
    const offMap = game.onMapChange?.(() => {
        if (root.dataset.open === '1') render();
    });

    render();
    return {
        root,
        render,
        open,
        close,
        dismiss() {
            offCurrency?.();
            offProps?.();
            offMap?.();
            root.remove();
        },
    };
}
