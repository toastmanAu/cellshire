import { buildEpochStatus } from '../chain/epochStatus.js';
import { hudMount } from './hudMount.js';

export function installEpochHUD(game, epochStats) {
    const root = document.createElement('section');
    root.id = 'epoch-hud';
    root.setAttribute('aria-live', 'polite');

    const title = document.createElement('div');
    title.className = 'epoch-hud__title';
    root.appendChild(title);

    const detail = document.createElement('div');
    detail.className = 'epoch-hud__detail';
    root.appendChild(detail);

    const reload = document.createElement('button');
    reload.type = 'button';
    reload.className = 'epoch-hud__reload';
    reload.textContent = 'New shift';
    reload.hidden = true;
    reload.addEventListener('click', () => window.location.reload());
    root.appendChild(reload);

    hudMount('status').appendChild(root);

    let warned = false;
    let highValueAnnounced = false;
    function render() {
        const status = buildEpochStatus({ ...epochStats });
        root.dataset.tone = status.tone;
        root.dataset.highValue = status.isHighValueEpoch ? '1' : '0';
        title.textContent = status.title;
        detail.textContent = status.detail;
        reload.hidden = !status.canReloadForNewShift;

        if (status.isHighValueEpoch && !highValueAnnounced) {
            highValueAnnounced = true;
            game.ui?.showToast(`${status.epochModifier.label}: ${status.epochModifier.detail}`, 5000);
        }

        if (status.canReloadForNewShift && !warned) {
            warned = true;
            game.ui?.showToast('New CKB epoch likely started - reload for a fresh shift', 6000);
        }
    }

    render();
    const intervalId = setInterval(render, 30000);
    return {
        root,
        dismiss() {
            clearInterval(intervalId);
            root.remove();
        },
    };
}
