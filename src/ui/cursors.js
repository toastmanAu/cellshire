function cursorSvg(svg, hotX = 12, hotY = 12, fallback = 'auto') {
    const encoded = encodeURIComponent(svg)
        .replace(/'/g, '%27')
        .replace(/"/g, '%22');
    return `url("data:image/svg+xml,${encoded}") ${hotX} ${hotY}, ${fallback}`;
}

const baseAttrs = 'xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"';

export const CELL_CURSORS = Object.freeze({
    walk: cursorSvg(
        `<svg ${baseAttrs}><path d="M7 24c5-2 8-2 18 0" fill="none" stroke="#fbf6ec" stroke-width="5" stroke-linecap="round"/><path d="M7 24c5-2 8-2 18 0" fill="none" stroke="#1b5ba8" stroke-width="3" stroke-linecap="round"/><path d="M11 20l4-11 6 3-3 5 5 4" fill="none" stroke="#fbf6ec" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 20l4-11 6 3-3 5 5 4" fill="none" stroke="#2f2b27" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="17" cy="6" r="2.5" fill="#d9a92f" stroke="#2f2b27" stroke-width="1.5"/></svg>`,
        11,
        23,
        'pointer',
    ),
    mine: cursorSvg(
        `<svg ${baseAttrs}><path d="M9 23l14-14" stroke="#fbf6ec" stroke-width="6" stroke-linecap="round"/><path d="M9 23l14-14" stroke="#6b4b2a" stroke-width="3.5" stroke-linecap="round"/><path d="M10 8c5-4 11-4 16 1l-4 4c-3-3-6-3-9-1z" fill="#d9a92f" stroke="#2f2b27" stroke-width="2" stroke-linejoin="round"/><path d="M7 25l4-4" stroke="#2f2b27" stroke-width="5" stroke-linecap="round"/></svg>`,
        9,
        23,
        'pointer',
    ),
    interact: cursorSvg(
        `<svg ${baseAttrs}><path d="M7 6l12 12-5 1 4 7-4 2-4-7-4 4z" fill="#fbf6ec" stroke="#2f2b27" stroke-width="2" stroke-linejoin="round"/><circle cx="22" cy="8" r="4" fill="#d9a92f" stroke="#2f2b27" stroke-width="2"/></svg>`,
        7,
        6,
        'pointer',
    ),
    place: cursorSvg(
        `<svg ${baseAttrs}><path d="M16 5v22M5 16h22" stroke="#fbf6ec" stroke-width="6" stroke-linecap="round"/><path d="M16 5v22M5 16h22" stroke="#1b5ba8" stroke-width="3" stroke-linecap="round"/><path d="M10 22l6 4 6-4" fill="none" stroke="#2f2b27" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        16,
        16,
        'crosshair',
    ),
    erase: cursorSvg(
        `<svg ${baseAttrs}><path d="M9 22l11-11 4 4-8 8h-7z" fill="#fbf6ec" stroke="#2f2b27" stroke-width="2" stroke-linejoin="round"/><path d="M18 9l3-3 5 5-3 3z" fill="#d85b8e" stroke="#2f2b27" stroke-width="2" stroke-linejoin="round"/></svg>`,
        11,
        22,
        'crosshair',
    ),
    blocked: 'not-allowed',
    pan: 'grab',
});
