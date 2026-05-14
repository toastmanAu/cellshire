/**
 * PerfHUD.js
 *
 * Tiny floating overlay that shows:
 *   - FPS (rolling, 60-frame window)
 *   - frame ms (last frame's render time, via requestAnimationFrame ticks)
 *   - JS heap usage (Chrome/Edge only — performance.memory)
 *   - One-time world-gen stats from procgen
 *
 * Independent of the main render loop so we can read perf even when the
 * scene is idle (Mykonos's renderer is dirty-flag driven and idles at 0
 * draws). We tick our own rAF and only display, never trigger redraws.
 */

export function installPerfHUD(game, genStats) {
    const el = document.createElement('div');
    el.id = 'perf-hud';
    Object.assign(el.style, {
        position: 'fixed',
        top: '8px',
        left: '8px',
        zIndex: '9999',
        font: '12px/1.35 monospace',
        color: '#e8f5ff',
        background: 'rgba(0, 0, 0, 0.65)',
        padding: '8px 10px',
        borderRadius: '6px',
        pointerEvents: 'none',
        userSelect: 'none',
        whiteSpace: 'pre',
        textShadow: '0 1px 2px rgba(0,0,0,0.8)',
    });
    document.body.appendChild(el);

    const frames = [];   // rolling window of frame timestamps
    let lastT = performance.now();
    let lastFrameMs = 0;

    function tick(now) {
        const dt = now - lastT;
        lastT = now;
        lastFrameMs = dt;
        frames.push(now);
        // Keep ~1 second of frames
        const cutoff = now - 1000;
        while (frames.length && frames[0] < cutoff) frames.shift();

        const fps = frames.length;

        const heap = performance.memory
            ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' MB / '
              + (performance.memory.jsHeapSizeLimit / 1048576).toFixed(0) + ' MB'
            : 'n/a (Firefox)';

        // Cache canvas size — read renderer internals for diagnostic only.
        const wb = game.renderer._worldBounds;
        const cs = game.renderer._cacheScale;
        const dims = wb && cs
            ? `world ${wb.w}×${wb.h}px   cache ${wb.w * cs}×${wb.h * cs} ×${cs}`
            : 'world n/a';

        const objs = game.tileMap.objects.length;
        const W = game.tileMap.width;
        const H = game.tileMap.height;

        el.textContent =
              `grid ${W}×${H}   seed ${genStats.seed}   gen ${genStats.genMs.toFixed(0)} ms\n`
            + `terrain ${genStats.total} (${genStats.water}w ${genStats.sand}s `
            + `${genStats.grass}g ${genStats.stone}r)\n`
            + `ores ${genStats.oresPlaced}   trees ${genStats.treesPlaced}   `
            + `objects-live ${objs}\n`
            + `${dims}\n`
            + `fps ${fps}   frame ${lastFrameMs.toFixed(1)} ms\n`
            + `heap ${heap}`;

        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}
