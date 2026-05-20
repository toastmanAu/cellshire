export function installPropertyHUD(game) {
    const root = document.createElement('section');
    root.id = 'property-hud';

    const label = document.createElement('div');
    label.className = 'property-hud__label';
    root.appendChild(label);

    const detail = document.createElement('div');
    detail.className = 'property-hud__detail';
    root.appendChild(detail);

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'property-hud__action';
    action.addEventListener('click', () => {
        if (game.mapKind === 'property') game.travelToMine();
        else game.travelToProperty();
        render();
    });
    root.appendChild(action);

    const unlock = document.createElement('button');
    unlock.type = 'button';
    unlock.className = 'property-hud__unlock';
    unlock.addEventListener('click', () => {
        game.unlockNextPropertyTier?.();
        render();
    });
    root.appendChild(unlock);

    document.body.appendChild(root);

    function render() {
        const home = game.mapKind === 'property';
        const expansion = game.propertyExpansionState?.();
        const visiting = !!expansion?.readOnly;
        root.dataset.map = home ? 'property' : 'mine';
        label.textContent = home
            ? visiting ? 'Visiting plot' : 'Home plot'
            : 'Public mine';
        detail.textContent = home && expansion
            ? visiting ? visitDetail(expansion) : `${expansion.label} · ${expansion.name}`
            : 'Quarry shift';
        action.textContent = home ? 'Return to mine' : 'Go home';
        unlock.hidden = !home || visiting || !expansion?.next;
        if (!unlock.hidden) {
            unlock.disabled = !expansion.canAffordNext;
            unlock.textContent = `Expand · ${expansion.nextCostLabel}`;
        }
    }

    function visitDetail(expansion) {
        const source = expansion.snapshotSource === 'chain' ? 'chain' : 'local';
        const status = expansion.snapshotStatus === 'found'
            ? `${source} snapshot`
            : expansion.snapshotStatus === 'stale'
                ? `${source} snapshot pending`
                : 'starter view';
        return `Owner ${expansion.ownerId} · ${status}`;
    }

    const off = game.onMapChange?.(render);
    const offInventory = game.player?.inventory?.onChange?.(render);
    render();
    return {
        root,
        dismiss() {
            off?.();
            offInventory?.();
            root.remove();
        },
    };
}
