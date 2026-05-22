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

    const farm = document.createElement('button');
    farm.type = 'button';
    farm.className = 'property-hud__farm';
    farm.addEventListener('click', () => {
        game.unlockNextFarmTier?.();
        render();
    });
    root.appendChild(farm);

    const buildings = document.createElement('button');
    buildings.type = 'button';
    buildings.className = 'property-hud__buildings';
    buildings.textContent = 'Buildings';
    buildings.addEventListener('click', () => {
        root.dataset.buildingsOpen = root.dataset.buildingsOpen === '1' ? '0' : '1';
        render();
    });
    root.appendChild(buildings);

    const buildingPanel = document.createElement('div');
    buildingPanel.className = 'property-hud__building-panel';
    root.appendChild(buildingPanel);

    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'property-hud__share';
    share.textContent = 'Share';
    share.addEventListener('click', async () => {
        const link = game.shareableVisitLink?.();
        if (!link) return;
        const copied = await copyText(link);
        game.ui?.showToast?.(copied ? 'Visit link copied' : link, copied ? 1600 : 3600);
    });
    root.appendChild(share);

    document.body.appendChild(root);

    function render() {
        const home = game.mapKind === 'property';
        const township = game.mapKind === 'township';
        const expansion = game.propertyExpansionState?.();
        const farmState = game.farmExpansionState?.();
        const visiting = !!expansion?.readOnly;
        root.dataset.map = home ? 'property' : township ? 'township' : 'mine';
        label.textContent = home
            ? visiting ? 'Visiting plot' : 'Home plot'
            : township ? 'Township' : 'Public mine';
        detail.textContent = home && expansion
            ? visiting ? visitDetail(expansion) : homeDetail(expansion, farmState)
            : township ? 'Store · Market · Bank · Gallery · Hall' : 'Quarry shift';
        action.textContent = home ? 'Return to mine' : 'Go home';
        unlock.hidden = !home || visiting || !expansion?.next;
        if (!unlock.hidden) {
            unlock.disabled = !expansion.canAffordNext;
            unlock.textContent = `Expand · ${expansion.nextCostLabel}`;
        }
        farm.hidden = !home || visiting || !farmState?.next;
        if (!farm.hidden) {
            farm.disabled = !farmState.canAffordNext;
            farm.textContent = `Farm · ${farmState.nextCostLabel}`;
        }
        buildings.hidden = !home || visiting;
        renderBuildings(home && !visiting ? game.buildingProgressionState?.() : null);
        share.hidden = false;
        share.textContent = home ? 'Share' : 'Share home';
    }

    function renderBuildings(state) {
        const open = root.dataset.buildingsOpen === '1';
        buildingPanel.hidden = !open || !state;
        if (!state) {
            root.dataset.buildingsOpen = '0';
            clear(buildingPanel);
            return;
        }
        buildings.textContent = open ? 'Hide buildings' : 'Buildings';
        if (!open) return;
        clear(buildingPanel);
        const title = document.createElement('div');
        title.className = 'property-hud__building-title';
        title.textContent = 'Home buildings';
        buildingPanel.appendChild(title);
        for (const entry of state.buildings ?? []) {
            const row = document.createElement('div');
            row.className = 'property-hud__building-row';

            const meta = document.createElement('div');
            meta.className = 'property-hud__building-meta';
            const name = document.createElement('div');
            name.className = 'property-hud__building-name';
            name.textContent = `${entry.name} · ${entry.label}`;
            const detail = document.createElement('div');
            detail.className = 'property-hud__building-cost';
            const effect = entry.effectLabel ? `${entry.effectLabel} · ` : '';
            detail.textContent = entry.nextLevel
                ? `${effect}${entry.nextCostLabel}`
                : `${effect}Max level`;
            meta.appendChild(name);
            meta.appendChild(detail);

            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'property-hud__building-action';
            action.textContent = entry.actionLabel;
            action.disabled = !entry.nextLevel || !entry.canAffordNext;
            action.addEventListener('click', () => {
                game.unlockOrUpgradeBuilding?.(entry.id);
                render();
            });

            row.appendChild(meta);
            row.appendChild(action);
            buildingPanel.appendChild(row);
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

    function homeDetail(expansion, farmState) {
        const save = expansion.saveStatus?.label ? ` · ${expansion.saveStatus.label}` : '';
        const farm = farmState
            ? ` · ${farmState.label} · ${farmState.ready}/${farmState.planted} ready`
            : '';
        return `${expansion.label} · ${expansion.name}${farm}${save}`;
    }

    const off = game.onMapChange?.(render);
    const offInventory = game.player?.inventory?.onChange?.(render);
    const offResources = game.resourceInventory?.onChange?.(render);
    render();
    return {
        root,
        dismiss() {
            off?.();
            offInventory?.();
            offResources?.();
            root.remove();
        },
    };
}

function clear(node) {
    while (node.firstChild) node.firstChild.remove();
}

async function copyText(text) {
    try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        return false;
    }
    return false;
}
