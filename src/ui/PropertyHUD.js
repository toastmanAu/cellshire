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

    document.body.appendChild(root);

    function render() {
        const home = game.mapKind === 'property';
        root.dataset.map = home ? 'property' : 'mine';
        label.textContent = home ? 'Home plot' : 'Public mine';
        detail.textContent = home ? 'Starter claim' : 'Quarry shift';
        action.textContent = home ? 'Return to mine' : 'Go home';
    }

    const off = game.onMapChange?.(render);
    render();
    return {
        root,
        dismiss() {
            off?.();
            root.remove();
        },
    };
}
