export function hudMount(slot = 'body') {
    return document.querySelector(`[data-hud-slot="${slot}"]`)
        ?? document.getElementById('side-menu-body')
        ?? document.body;
}
