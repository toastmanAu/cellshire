/**
 * Character-picker modal overlay.
 *
 *   installCharacterPicker({ catalog, onConfirm }):
 *     Mounts the picker to document.body. Returns { dismiss, root }.
 *     onConfirm(assetId) is called when the user confirms a selection;
 *     the picker fades out and unmounts itself afterwards.
 *
 * No canvas. No globals. The world keeps rendering behind via the
 * scrim (see styles.css :: .char-picker__scrim).
 */

export function installCharacterPicker({ catalog, onConfirm }) {
    const root = document.createElement('div');
    root.className = 'char-picker';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'char-picker-title');

    const scrim = document.createElement('div');
    scrim.className = 'char-picker__scrim';
    root.appendChild(scrim);

    const panel = document.createElement('div');
    panel.className = 'char-picker__panel';
    root.appendChild(panel);

    const title = document.createElement('h1');
    title.id = 'char-picker-title';
    title.textContent = 'CELLSHIRE';
    panel.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'char-picker__subtitle';
    subtitle.textContent = 'Choose your start';
    panel.appendChild(subtitle);

    const cards = document.createElement('ul');
    cards.className = 'char-picker__cards';
    cards.setAttribute('role', 'radiogroup');
    panel.appendChild(cards);

    const enabled = catalog.filter(c => c.tier !== 'locked');
    let selectedId = null;
    const cardButtons = [];

    enabled.forEach((c, idx) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'char-card';
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', 'false');
        btn.dataset.assetId = c.id;
        btn.dataset.tier = c.tier;
        btn.dataset.index = String(idx + 1);

        const preview = document.createElement('div');
        preview.className = 'char-card__preview';
        preview.style.setProperty('--accent', c.accent);

        const img = document.createElement('img');
        img.src = `assets/${c.id}.png`;
        img.alt = '';
        img.onerror = () => {
            img.remove();
            const cube = document.createElement('div');
            cube.className = 'char-card__cube';
            preview.appendChild(cube);
        };
        preview.appendChild(img);
        btn.appendChild(preview);

        const name = document.createElement('h2');
        name.className = 'char-card__name';
        name.textContent = c.name;
        btn.appendChild(name);

        const tagline = document.createElement('p');
        tagline.className = 'char-card__tagline';
        tagline.textContent = c.tagline;
        btn.appendChild(tagline);

        const keyHint = document.createElement('span');
        keyHint.className = 'char-card__key';
        keyHint.textContent = String(idx + 1);
        btn.appendChild(keyHint);

        btn.addEventListener('click', () => select(c.id));
        li.appendChild(btn);
        cards.appendChild(li);
        cardButtons.push(btn);
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'char-picker__confirm';
    confirmBtn.textContent = 'Enter the world';
    confirmBtn.disabled = true;
    confirmBtn.addEventListener('click', confirm);
    panel.appendChild(confirmBtn);

    function select(id) {
        selectedId = id;
        for (const b of cardButtons) {
            b.setAttribute('aria-checked', String(b.dataset.assetId === id));
        }
        confirmBtn.disabled = false;
    }

    let confirmed = false;
    function confirm() {
        if (confirmed || !selectedId) return;
        confirmed = true;
        confirmBtn.disabled = true;
        onConfirm(selectedId);
        root.classList.add('char-picker--leaving');
        setTimeout(dismiss, 320);
    }

    function dismiss() {
        root.remove();
    }

    document.body.appendChild(root);
    return { dismiss, root };
}
