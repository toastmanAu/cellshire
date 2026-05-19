/**
 * Renderer.js
 *
 * Renders the world (tile map + placed objects + cursor preview) to the
 * main game canvas using painter's algorithm depth sorting.
 *
 * Layered architecture:
 *
 *   [SCREEN-SPACE STATIC CACHE]
 *     1. Soft warm sky + bloom + parchment dots backdrop.
 *     2. Multi-layer blurred drop shadow under the floating platform.
 *     3. Cream platform slab + back-edge highlight.
 *     4. Soft outer vignette.
 *     Rebuilt only on resize / grid resize.
 *
 *   [WORLD-SPACE TERRAIN CACHE]
 *     Every terrain tile composed once into an offscreen world-space
 *     canvas. Per-frame we just stamp it via the camera transform.
 *     Rebuilt only when `tileMap.terrainVersion` changes.
 *
 *   [WORLD-SPACE STATIC-OBJECTS CACHE]
 *     Every non-animating object's cast shadow + sprite, depth-sorted,
 *     composed into one world-space canvas. Rebuilt only when
 *     `tileMap.objectsVersion` changes (or when an animation completes
 *     and the object joins the static set).
 *
 *   [LIVE OVERLAY]
 *     Hover tile highlight, ghost preview & its shadow, plus any objects
 *     and tiles whose placement animation is still playing.
 *
 * Plus a dirty-flag pattern: `draw()` is skipped entirely when nothing
 * changed and no animations are running, so an idle scene with 200
 * placements costs ~0% CPU.
 */

import { CONFIG } from '../config.js';
import { cellToScreen } from '../grid/IsoGrid.js';
import { allAssets, getAsset } from '../assets/assetLoader.js';
import { ASSET_INDEX } from '../assets/assetManifest.js';

const TW = CONFIG.tile.w;
const TH = CONFIG.tile.h;

// World-space padding around the platform when allocating cache canvases:
// objects can extend well above the platform top (windmill vanes, chapel
// tower) and slightly below it (side walls, drop shadows).
const WORLD_PAD_TOP    = 800;
const WORLD_PAD_BOTTOM = 240;
const WORLD_PAD_X      = 320;

/**
 * High-DPI scale for the world-space terrain & objects caches.
 *
 * The asset displayCanvases are pre-rendered at ~6× their reference
 * display size (DISPLAY_SUPERSAMPLE in the asset loader), so the only
 * quality bottleneck left is whatever resolution we store inside the
 * cached layers. At cache_scale = 1 the cache holds tiles at their
 * reference width (e.g. 64 px), and at default zoom on a retina screen
 * the camera then upscales that ~2.8× before painting — visibly soft.
 *
 * We raise the cache scale roughly to `defaultZoom × devicePixelRatio`
 * (≈ 3 on retina, 2 elsewhere) so the cached pixels themselves are at
 * or near final on-screen resolution at default zoom. Memory cost is
 * modest: ~80 MB per cache on retina, gone the moment the page closes.
 */
const _DPR = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
// Spike: cache scale becomes world-size adaptive. We choose the largest
// scale ≤ ideal that keeps each cache-canvas dimension ≤ MAX_CACHE_DIM.
// Chrome caps Canvas2D at 16384px on either axis; Firefox is higher but
// we target the floor. Lowered minimum to 1 so very large worlds can
// still render (softer when zoomed in, but functional) rather than fail.
const MAX_CACHE_DIM = 16384;
function chooseCacheScale(worldW, worldH) {
    const ideal = Math.min(3, Math.max(1, Math.ceil(_DPR * 1.5)));
    const maxByW = Math.floor(MAX_CACHE_DIM / Math.max(1, worldW));
    const maxByH = Math.floor(MAX_CACHE_DIM / Math.max(1, worldH));
    const cap = Math.max(1, Math.min(maxByW, maxByH));
    return Math.min(ideal, cap);
}

// Shadow tuning. Pre-blurring happens once at asset-load time; the
// renderer just transforms + alphas the silhouettes per frame.
const SHADOW_ALPHA       = 0.32;
const BACK_DRIFT_X       = 0.16;
const BACK_DRIFT_Y       = 0.48;

function hash01(n) {
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
}

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

export class Renderer {
    constructor(canvas, camera, tileMap) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: true });
        this.camera = camera;
        this.tileMap = tileMap;

        // Visibility toggles
        this.showGrid = false;
        this.ambientOcclusion = true;
        this.showBorders = true;

        // Hover state set by the input manager
        this.hoverCell = null;       // { gx, gy }
        this.previewAssetId = null;  // null when not in place mode
        this.previewValid = true;
        this.eraseMode = false;
        // Player entity drawn in the live overlay (set by Game.spawnPlayer).
        this.player = null;
        // Flip flags applied to the ghost preview (set by Game).
        this.previewFlipH = false;
        this.previewFlipV = false;

        // Per-frame snapshot of currently-running placement animations.
        // Keyed by 'obj-<id>' for placed-object pop-in, 'deplete-<id>'
        // for ore crumble-out, and 't-<gx>,<gy>' for terrain pop-in.
        // Values are normalised progress in [0, 1).
        this._anims = new Map();
        this._frameAnims = new Map();
        this._animObjectIds = new Set();   // numeric obj ids currently animating
        this._animTerrainKeys = new Set(); // 'gx,gy' strings currently animating

        // Mining juice — one-shot FX that live entirely in the live
        // overlay and self-purge when their normalised progress hits 1.
        // The render loop's idle-gate (see draw()) extends to cover
        // these so the canvas redraws while FX are alive.
        this._floatingTexts = []; // {x,y,text,color,start,duration}
        this._particles    = []; // {x,y,vx,vy,color,start,duration,size}

        // Cached layers + the version stamps that produced them.
        // Chrome = backdrop + vignette in screen space (depends only on
        // resize). Platform / terrain / objects all live in a single
        // world-space coordinate frame and are stamped via the camera
        // transform, so pan & zoom never invalidate them.
        this._chromeCanvas   = null;
        this._chromeDirty    = true;
        this._platformCanvas = null;
        this._platformGridW  = -1;
        this._platformGridH  = -1;
        this._terrainCanvas  = null;
        this._terrainVersion = -1;
        this._objectsCanvas  = null;
        this._objectsVersion = -1;
        this._objectsAnimCount = 0;

        // World-space bounds (stored at first build, derived from grid).
        this._worldBounds = null;
        // Cache supersample factor (1–3). Chosen on first cache build so we
        // can adapt to the world size without exceeding the browser's
        // Canvas2D dimension cap (16384 px on Chrome).
        this._cacheScale = null;

        // Dirty flag for the render loop. We always draw at least once
        // after construction; otherwise the loop early-exits unless an
        // animation is running or `markDirty()` was called.
        this._dirty = true;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    /** Mark the next frame as needing a redraw. */
    markDirty() { this._dirty = true; }

    /**
     * Trigger a one-shot elastic placement animation for the given key.
     * The cell rect is stored alongside the timer so the preview ghost can
     * step out of the way of any cell currently running an animation.
     *
     * `startAt` (default = now) lets callers schedule the animation to
     * begin in the future — used by the starter-scene reveal to ripple
     * the placements in back-to-front instead of all at once. Animations
     * with `startAt` in the future stay invisible until their start time
     * arrives, but they're already excluded from the static caches so
     * they don't pop in twice.
     */
    spawnAnim(key, cell = null, duration = 460, startAt = performance.now()) {
        this._anims.set(key, { start: startAt, duration, cell });
        if (key.startsWith('obj-')) {
            const id = +key.slice(4);
            if (!Number.isNaN(id)) this._animObjectIds.add(id);
            // The animating object is no longer part of the static cache.
            this._objectsVersion = -1;
        } else if (key.startsWith('mine-')) {
            const id = +key.slice('mine-'.length);
            if (!Number.isNaN(id)) this._animObjectIds.add(id);
            this._objectsVersion = -1;
        } else if (key.startsWith('deplete-')) {
            // Mining deplete anim — same set-membership as a pop anim so
            // the static cache skips this obj while it crumbles; the live
            // overlay branches on the key to draw the fractured chunks.
            const id = +key.slice('deplete-'.length);
            if (!Number.isNaN(id)) this._animObjectIds.add(id);
            this._objectsVersion = -1;
        } else if (key.startsWith('t-')) {
            // 't-<gx>,<gy>' — stash the cell key for the terrain cache to
            // skip while the elastic effect plays, otherwise the baked
            // tile shows underneath the scaled overlay and the animation
            // looks like a faint ghost rather than a real pop.
            this._animTerrainKeys.add(key.slice(2));
            this._terrainVersion = -1;
        }
        this._dirty = true;
    }

    _snapshotAnims() {
        const now = performance.now();
        this._frameAnims.clear();
        let removedObj = false;
        let removedTerrain = false;
        for (const [key, a] of this._anims) {
            const t = (now - a.start) / a.duration;
            if (t >= 1) {
                this._anims.delete(key);
                if (key.startsWith('obj-')) {
                    const id = +key.slice(4);
                    if (!Number.isNaN(id)) this._animObjectIds.delete(id);
                    removedObj = true;
                } else if (key.startsWith('mine-')) {
                    const id = +key.slice('mine-'.length);
                    if (!Number.isNaN(id)) this._animObjectIds.delete(id);
                    removedObj = true;
                } else if (key.startsWith('deplete-')) {
                    const id = +key.slice('deplete-'.length);
                    if (!Number.isNaN(id)) this._animObjectIds.delete(id);
                    removedObj = true;
                } else if (key.startsWith('t-')) {
                    this._animTerrainKeys.delete(key.slice(2));
                    removedTerrain = true;
                }
                continue;
            }
            // Skip animations whose scheduled start time hasn't arrived
            // yet (used by the staggered starter-scene reveal). They're
            // still tracked in `_anims` so subsequent frames will pick
            // them up once their start window opens.
            if (t < 0) continue;
            this._frameAnims.set(key, { t, cell: a.cell });
        }
        // When an animation finishes we need to rebuild the corresponding
        // static cache so the freshly-settled tile / object joins the
        // baked layer. The dirty flag also has to flip on, otherwise the
        // next frame would early-exit and the just-settled cell would
        // briefly disappear.
        if (removedObj)     { this._objectsVersion = -1; this._dirty = true; }
        if (removedTerrain) { this._terrainVersion = -1; this._dirty = true; }
    }

    _animT(key) {
        const entry = this._frameAnims.get(key);
        return entry == null ? undefined : entry.t;
    }

    _isAnimAtCell(gx, gy) {
        for (const { cell } of this._frameAnims.values()) {
            if (!cell) continue;
            if (gx >= cell.gx && gx < cell.gx + (cell.w ?? 1)
                && gy >= cell.gy && gy < cell.gy + (cell.d ?? 1)) {
                return true;
            }
        }
        return false;
    }

    _easeOutElastic(t) {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        const c4 = (2 * Math.PI) / 3;
        return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    }

    /* ── Mining juice FX (floating text + dust chips) ─────────── */

    /**
     * One-shot "+N" floating text that drifts upward and fades over
     * `durationMs`. Positioned in world coordinates so it sticks to the
     * ore it came from as the camera pans.
     */
    spawnFloatingText(worldX, worldY, text, {
        color = '#1b5ba8',
        durationMs = 850,
        rise = 28,
        font = 'bold 14px system-ui, sans-serif',
    } = {}) {
        this._floatingTexts.push({
            x: worldX, y: worldY, text, color,
            start: performance.now(), duration: durationMs,
            rise, font,
        });
        this._dirty = true;
    }

    /**
     * Burst of small chips at (worldX, worldY). Each chip has random
     * radial velocity + gravity, shrinks + fades over its lifetime.
     */
    spawnDustPuff(worldX, worldY, {
        color = '#9d8e74',
        count = 5,
        speed = 60,        // px/sec average
        gravity = 140,     // px/sec^2 downward
        durationMs = 650,
        sizeRange = [2, 4],
    } = {}) {
        const now = performance.now();
        for (let i = 0; i < count; i++) {
            // Spray slightly upward + sideways: angle biased to the
            // upper hemisphere so chips arc up before gravity pulls
            // them down. Reads as "knocked off the rock" not "leaked
            // from below".
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
            const v = speed * (0.6 + Math.random() * 0.8);
            const size = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
            this._particles.push({
                x: worldX, y: worldY,
                vx: Math.cos(angle) * v,
                vy: Math.sin(angle) * v,
                color, gravity,
                start: now, duration: durationMs,
                size,
            });
        }
        this._dirty = true;
    }

    _tickFX(now) {
        if (this._floatingTexts.length > 0) {
            this._floatingTexts = this._floatingTexts.filter(
                t => now - t.start < t.duration,
            );
        }
        if (this._particles.length > 0) {
            this._particles = this._particles.filter(
                p => now - p.start < p.duration,
            );
        }
    }

    _drawFX() {
        const ctx = this.ctx;
        const now = performance.now();

        // Particles first — chips sit below the floating number layer.
        for (const p of this._particles) {
            const elapsed = (now - p.start) / 1000;
            const t = (now - p.start) / p.duration;
            if (t >= 1) continue;
            const x = p.x + p.vx * elapsed;
            const y = p.y + p.vy * elapsed + 0.5 * p.gravity * elapsed * elapsed;
            const size = p.size * (1 - t * 0.6); // shrink to 40%
            const alpha = 1 - t;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Floating numbers on top.
        for (const f of this._floatingTexts) {
            const t = (now - f.start) / f.duration;
            if (t >= 1) continue;
            const easedRise = 1 - Math.pow(1 - t, 2);   // ease-out
            const y = f.y - f.rise * easedRise;
            const alpha = 1 - Math.max(0, t - 0.5) * 2; // hold full alpha first half
            ctx.save();
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.font = f.font;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(251, 246, 236, 0.95)';
            ctx.strokeText(f.text, f.x, y);
            ctx.fillStyle = f.color;
            ctx.fillText(f.text, f.x, y);
            ctx.restore();
        }
    }

    /**
     * Draw a depleting ore as fractured sprite chunks. This is intentionally
     * asset-agnostic: any ore PNG can crumble without a bespoke animation
     * sheet, and the whole effect remains deterministic for stable frames.
     */
    _drawCrumblingObject(obj, t) {
        const ctx = this.ctx;
        const asset = getAsset(obj.assetId);
        if (!asset) return;
        const { x, y } = cellToScreen(obj.gx, obj.gy);
        const dx = x - asset.anchorX;
        const dy = y - asset.anchorY;
        const pivot = cellToScreen(obj.gx + obj.footprint.w / 2, obj.gy + obj.footprint.d / 2);
        if (asset.flatBase) {
            pivot.y += (obj.footprint.w + obj.footprint.d) * TH / 4;
        }

        const src = asset.displayCanvas || asset.canvas;
        const breakT = Math.max(0, (t - 0.08) / 0.92);
        const travel = easeOutCubic(breakT);
        const fall = breakT * breakT;
        const tremor = Math.sin(t * Math.PI * 18) * (1 - t) * 1.8;

        // A brief ghost of the whole ore keeps the first impact readable
        // before the pieces fully separate.
        ctx.save();
        ctx.globalAlpha *= Math.max(0, 0.42 - t * 0.7);
        ctx.translate(tremor, -Math.abs(tremor) * 0.6);
        ctx.globalCompositeOperation = 'screen';
        this._drawAssetImage(ctx, asset, dx, dy, obj.gx, obj.gy, obj.footprint, {
            flipH: obj.flipH,
            flipV: obj.flipV,
        });
        ctx.restore();

        const cols = 5;
        const rows = 5;
        const chunkW = asset.width / cols;
        const chunkH = asset.height / rows;
        const alpha = Math.max(0, 1 - Math.pow(Math.max(0, t - 0.18) / 0.82, 1.4));

        for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++) {
            const idx = row * cols + col;
            const seed = obj.id * 97 + idx * 31;
            const delay = hash01(seed + 5) * 0.18;
            const localT = Math.max(0, Math.min(1, (breakT - delay) / (1 - delay)));
            const localTravel = easeOutCubic(localT);
            const cx = dx + col * chunkW + chunkW / 2;
            const cy = dy + row * chunkH + chunkH / 2;
            const outwardX = (cx - pivot.x) * (0.26 + hash01(seed + 1) * 0.34);
            const upwardKick = -10 - hash01(seed + 2) * 20;
            const sideways = (hash01(seed + 3) - 0.5) * 26;
            const drop = fall * (14 + row * 9 + hash01(seed + 4) * 18);
            const rot = (hash01(seed + 6) - 0.5) * 1.2 * localT;
            const shrink = 1 - localT * 0.22;

            ctx.save();
            ctx.globalAlpha *= alpha * (0.9 + hash01(seed + 7) * 0.1);
            ctx.translate(
                outwardX * localTravel + sideways * localT,
                upwardKick * Math.sin(localT * Math.PI) + drop,
            );
            ctx.translate(cx, cy);
            ctx.rotate(rot);
            ctx.scale(shrink, shrink);
            ctx.translate(-cx, -cy);
            ctx.beginPath();
            ctx.rect(
                dx + col * chunkW - 0.75,
                dy + row * chunkH - 0.75,
                chunkW + 1.5,
                chunkH + 1.5,
            );
            ctx.clip();
            ctx.drawImage(src, dx, dy, asset.width, asset.height);
            ctx.restore();
        }

        // Small settling dust at the footprint after the chunks separate.
        ctx.save();
        ctx.globalAlpha *= Math.max(0, (1 - t) * 0.35);
        ctx.fillStyle = 'rgba(220, 200, 160, 0.7)';
        ctx.beginPath();
        ctx.ellipse(pivot.x, pivot.y + 2, asset.width * (0.22 + travel * 0.22), TH * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.canvas.width  = w * dpr;
        this.canvas.height = h * dpr;
        this.canvas.style.width  = w + 'px';
        this.canvas.style.height = h + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // The per-frame composite is just a handful of large drawImage
        // calls (chrome + platform + terrain + objects + a few overlays),
        // so 'high' is affordable and keeps assets crisp at zoom.
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this._chromeDirty = true;
        this._dirty = true;
    }

    /** Canvas size in CSS pixels. */
    cssSize() {
        return { w: window.innerWidth, h: window.innerHeight };
    }

    /** Draw the entire frame, but only when something has actually changed. */
    draw() {
        this._snapshotAnims();
        const now = performance.now();
        this._tickFX(now);
        // Any pending anim — even one whose start time is still in the
        // future — must keep the loop alive so we eventually reach its
        // start window. Mining FX (floating text + particles) extend
        // this gate so they keep animating after the anim/dirty signal
        // has settled.
        const animsPending = this._anims.size > 0
            || this._floatingTexts.length > 0
            || this._particles.length > 0;
        if (!this._dirty && !animsPending) return;
        this._dirty = false;

        const ctx = this.ctx;
        const { w, h } = this.cssSize();
        ctx.clearRect(0, 0, w, h);

        this._ensureChromeCache(w, h);
        this._ensurePlatformCache();
        this._ensureTerrainCache();
        this._ensureObjectsCache();

        // 1. Static screen-space chrome (backdrop dots + bloom + sky).
        ctx.drawImage(this._chromeCanvas.bottom, 0, 0, w, h);

        // 2. World layers via the camera transform — none of these depend
        //    on the camera state, so pan/zoom is just a transform change
        //    and four stamped images.
        ctx.save();
        this._applyCamera();
        const wb = this._worldBounds;

        if (this._platformCanvas) ctx.drawImage(this._platformCanvas, wb.x, wb.y);
        // Terrain + objects caches are stored at this._cacheScale world DPR for
        // crisp pixels at zoom; we explicitly size the stamp to world
        // units so the browser does the high-quality downsample as part
        // of the same hardware-resampled draw.
        if (this._terrainCanvas)  ctx.drawImage(this._terrainCanvas,  wb.x, wb.y, wb.w, wb.h);
        if (this.showGrid)        this._drawGrid();
        if (this._objectsCanvas)  ctx.drawImage(this._objectsCanvas,  wb.x, wb.y, wb.w, wb.h);

        // 3. Live overlays: actively-animating objects/tiles + hover +
        //    preview ghost. Sorted together so depth is sane.
        this._drawLiveOverlay();

        ctx.restore();

        // 4. Top-of-frame vignette (applied in screen space).
        ctx.drawImage(this._chromeCanvas.top, 0, 0, w, h);
    }

    _applyCamera() {
        const ctx = this.ctx;
        ctx.translate(this.camera.offsetX, this.camera.offsetY);
        ctx.scale(this.camera.zoom, this.camera.zoom);
    }

    /* ── World bounds ─────────────────────────────────────────── */

    _computeWorldBounds() {
        const W = this.tileMap.width, H = this.tileMap.height;
        const corners = [
            cellToScreen(0, 0),
            cellToScreen(W, 0),
            cellToScreen(W, H),
            cellToScreen(0, H),
        ];
        let minX =  Infinity, maxX = -Infinity;
        let minY =  Infinity, maxY = -Infinity;
        for (const c of corners) {
            if (c.x < minX) minX = c.x;
            if (c.x > maxX) maxX = c.x;
            if (c.y < minY) minY = c.y;
            if (c.y > maxY) maxY = c.y;
        }
        const x = Math.floor(minX - WORLD_PAD_X);
        const y = Math.floor(minY - WORLD_PAD_TOP);
        const w = Math.ceil(maxX - minX + WORLD_PAD_X * 2);
        const h = Math.ceil(maxY - minY + WORLD_PAD_TOP + WORLD_PAD_BOTTOM);
        return { x, y, w, h };
    }

    /* ── Cache builders ───────────────────────────────────────── */

    _ensureChromeCache(w, h) {
        const dpr = window.devicePixelRatio || 1;
        const dw = Math.round(w * dpr);
        const dh = Math.round(h * dpr);
        if (!this._chromeDirty
            && this._chromeCanvas
            && this._chromeCanvas.bottom.width  === dw
            && this._chromeCanvas.bottom.height === dh) {
            return;
        }
        this._chromeDirty = false;
        const bottom = document.createElement('canvas');
        bottom.width  = dw;
        bottom.height = dh;
        const top = document.createElement('canvas');
        top.width  = dw;
        top.height = dh;
        // Build at device-pixel resolution so the parchment 1px dots stay
        // crisp on retina, then draw at CSS size with the same dpr scale
        // applied via the live ctx transform.
        const bctx = bottom.getContext('2d');
        const tctx = top.getContext('2d');
        bctx.scale(dpr, dpr);
        tctx.scale(dpr, dpr);
        this._paintBackdrop(bctx, w, h);
        this._paintVignette(tctx, w, h);
        this._chromeCanvas = { bottom, top };
    }

    _ensurePlatformCache() {
        const W = this.tileMap.width, H = this.tileMap.height;
        if (this._platformCanvas
            && this._platformGridW === W
            && this._platformGridH === H) {
            return;
        }
        // Grid size changed (or first build): invalidate every world cache
        // since they all share the same world-coordinate frame.
        this._worldBounds = this._computeWorldBounds();
        this._terrainCanvas = null;
        this._objectsCanvas = null;
        const wb = this._worldBounds;
        const c = document.createElement('canvas');
        c.width  = wb.w;
        c.height = wb.h;
        const ctx = c.getContext('2d');
        ctx.translate(-wb.x, -wb.y);
        this._paintPlatform(ctx);
        this._platformCanvas = c;
        this._platformGridW = W;
        this._platformGridH = H;
    }

    _paintBackdrop(ctx, w, h) {
        // Soft warm sky, brighter to the upper-back-left (where the iso sun
        // sits), fading toward the lower-front for atmosphere.
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, 'rgba(255, 247, 224, 0.55)');
        sky.addColorStop(0.55, 'rgba(247, 235, 208, 0.0)');
        sky.addColorStop(1, 'rgba(214, 192, 158, 0.18)');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        // Sun bloom: warm radial highlight from the upper-back area.
        const bloom = ctx.createRadialGradient(
            w * 0.70, h * 0.18, 0,
            w * 0.70, h * 0.18, Math.max(w, h) * 0.85,
        );
        bloom.addColorStop(0, 'rgba(255, 232, 188, 0.55)');
        bloom.addColorStop(0.45, 'rgba(255, 232, 188, 0.10)');
        bloom.addColorStop(1, 'rgba(255, 232, 188, 0)');
        ctx.fillStyle = bloom;
        ctx.fillRect(0, 0, w, h);

        // Subtle dotted parchment texture, fades toward the edges.
        // This used to be ~3,600 fillRect calls per frame; now it's done
        // once per resize.
        const cellSize = 24;
        const cx = w / 2, cy = h / 2;
        const maxR = Math.hypot(cx, cy);
        for (let y = 0; y < h; y += cellSize)
        for (let x = 0; x < w; x += cellSize) {
            const r = Math.hypot(x - cx, y - cy) / maxR;
            const a = 0.05 * (1 - r * 0.85);
            if (a <= 0) continue;
            ctx.fillStyle = `rgba(60, 50, 30, ${a.toFixed(3)})`;
            ctx.fillRect(x, y, 1, 1);
        }
    }

    /**
     * Paint the platform (drop shadows + cream slab + back-edge highlight)
     * into a context already aligned to world coordinates. Cached once per
     * grid size; the camera transform applied at draw time scales / pans
     * the result naturally, so pan & zoom never re-trigger this work.
     */
    _paintPlatform(ctx) {
        const gw = this.tileMap.width, gh = this.tileMap.height;
        const corners = [
            cellToScreen(0, 0),
            cellToScreen(gw, 0),
            cellToScreen(gw, gh),
            cellToScreen(0, gh),
        ];

        const tracePlatform = () => {
            ctx.beginPath();
            ctx.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
            ctx.closePath();
        };

        // Soft outer glow – multiple progressively darker offsets fake a
        // proper blurred drop shadow even when ctx.filter is unsupported.
        // Blur values are in world pixels here; the camera scales them
        // visually at draw time, which gives a free zoom-correct shadow.
        const passes = [
            { dx:  0, dy: 36, blur: 28, alpha: 0.10 },
            { dx:  4, dy: 24, blur: 14, alpha: 0.12 },
            { dx:  2, dy: 12, blur:  6, alpha: 0.14 },
        ];
        const supportsFilter = typeof ctx.filter === 'string';
        for (const p of passes) {
            ctx.save();
            if (supportsFilter) ctx.filter = `blur(${p.blur}px)`;
            ctx.translate(p.dx, p.dy);
            tracePlatform();
            ctx.fillStyle = `rgba(40, 28, 10, ${p.alpha})`;
            ctx.fill();
            ctx.restore();
        }

        tracePlatform();
        const base = ctx.createLinearGradient(
            corners[0].x, corners[0].y,
            corners[2].x, corners[2].y,
        );
        base.addColorStop(0, 'rgba(252, 245, 226, 0.85)');
        base.addColorStop(1, 'rgba(231, 217, 188, 0.85)');
        ctx.fillStyle = base;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(corners[3].x, corners[3].y);
        ctx.lineTo(corners[0].x, corners[0].y);
        ctx.lineTo(corners[1].x, corners[1].y);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255, 248, 226, 0.55)';
        ctx.stroke();
    }

    _paintVignette(ctx, w, h) {
        const grad = ctx.createRadialGradient(
            w / 2, h * 0.55, Math.min(w, h) * 0.35,
            w / 2, h * 0.55, Math.max(w, h) * 0.85,
        );
        grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(0.7, 'rgba(40, 28, 10, 0.05)');
        grad.addColorStop(1, 'rgba(40, 28, 10, 0.20)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    }

    /**
     * Force the screen-space chrome (backdrop + vignette) to be repainted
     * on the next frame. Called by `resize()` automatically; exposed for
     * any future caller that needs to invalidate it explicitly.
     */
    markChromeDirty() {
        this._chromeDirty = true;
        this.markDirty();
    }

    /* ── Terrain cache ────────────────────────────────────────── */

    _ensureTerrainCache() {
        if (this._terrainCanvas && this._terrainVersion === this.tileMap.terrainVersion) {
            return;
        }
        if (!this._worldBounds) this._worldBounds = this._computeWorldBounds();
        const wb = this._worldBounds;
        if (!this._cacheScale) this._cacheScale = chooseCacheScale(wb.w, wb.h);
        const cw = wb.w * this._cacheScale;
        const ch = wb.h * this._cacheScale;
        if (!this._terrainCanvas
            || this._terrainCanvas.width  !== cw
            || this._terrainCanvas.height !== ch) {
            const c = document.createElement('canvas');
            c.width  = cw;
            c.height = ch;
            this._terrainCanvas = c;
        }
        const ctx = this._terrainCanvas.getContext('2d');
        // Cache builds run only on actual content changes (placement /
        // erase / load), so we pay the 'high' smoothing cost once and
        // bank crisp pixels for every subsequent frame.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        // Pre-scale to this._cacheScale so the rest of the build can use plain
        // world coordinates; the stored pixels end up at high-DPI density.
        ctx.scale(this._cacheScale, this._cacheScale);
        ctx.translate(-wb.x, -wb.y);

        for (let gy = 0; gy < this.tileMap.height; gy++)
        for (let gx = 0; gx < this.tileMap.width; gx++) {
            const id = this.tileMap.getTerrain(gx, gy);
            if (!id) continue;
            // Skip cells that are mid-animation — the live overlay draws
            // the elastic-scaled version in their place. Without this
            // skip the baked tile shows underneath the overlay and the
            // pop animation looks like a faint ghost.
            if (this._animTerrainKeys.has(`${gx},${gy}`)) continue;
            const asset = getAsset(id);
            if (!asset) continue;
            const { x, y } = cellToScreen(gx, gy);
            const dx = x - asset.anchorX;
            const dy = y - asset.anchorY;
            const src = asset.displayCanvas || asset.canvas;
            ctx.drawImage(src, dx, dy, asset.width, asset.height);
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this._terrainVersion = this.tileMap.terrainVersion;
    }

    /* ── Static-objects cache (objects + their cast shadows) ──── */

    _ensureObjectsCache() {
        const tm = this.tileMap;
        if (this._objectsCanvas
            && this._objectsVersion === tm.objectsVersion
            && this._objectsAnimCount === this._animObjectIds.size) {
            return;
        }
        if (!this._worldBounds) this._worldBounds = this._computeWorldBounds();
        const wb = this._worldBounds;
        if (!this._cacheScale) this._cacheScale = chooseCacheScale(wb.w, wb.h);
        const cw = wb.w * this._cacheScale;
        const ch = wb.h * this._cacheScale;
        if (!this._objectsCanvas
            || this._objectsCanvas.width  !== cw
            || this._objectsCanvas.height !== ch) {
            const c = document.createElement('canvas');
            c.width  = cw;
            c.height = ch;
            this._objectsCanvas = c;
        }
        const ctx = this._objectsCanvas.getContext('2d');
        // Same as the terrain cache — built only on object add/remove,
        // so we use 'high' for permanently crisp pixels in the cache.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        // Pre-scale to this._cacheScale — see _ensureTerrainCache for why.
        ctx.scale(this._cacheScale, this._cacheScale);
        ctx.translate(-wb.x, -wb.y);

        // Pass 1: shadows for every static (non-animating) object that
        // casts one.
        ctx.save();
        ctx.globalAlpha = SHADOW_ALPHA;
        for (const obj of tm.objects) {
            if (this._animObjectIds.has(obj.id)) continue;
            const asset = getAsset(obj.assetId);
            if (!this._castsShadow(asset)) continue;
            this._drawShadowFor(ctx, asset, obj.gx, obj.gy, obj.footprint, {
                flipH: obj.flipH,
                flipV: obj.flipV,
            });
        }
        ctx.restore();

        // Pass 2: objects depth-sorted via painter's algorithm.
        const drawables = [];
        for (const obj of tm.objects) {
            if (this._animObjectIds.has(obj.id)) continue;
            drawables.push(obj);
        }
        drawables.sort((a, b) => a.sortKey() - b.sortKey());
        for (const obj of drawables) {
            this._drawStaticObject(ctx, obj);
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this._objectsVersion = tm.objectsVersion;
        this._objectsAnimCount = this._animObjectIds.size;
    }

    _drawStaticObject(ctx, obj) {
        const asset = getAsset(obj.assetId);
        if (!asset) return;
        const { x, y } = cellToScreen(obj.gx, obj.gy);
        const dx = x - asset.anchorX;
        const dy = y - asset.anchorY;
        this._drawAssetImage(ctx, asset, dx, dy, obj.gx, obj.gy, obj.footprint, {
            flipH: obj.flipH,
            flipV: obj.flipV,
        });
    }

    /* ── Live overlay (animations + hover + preview) ──────────── */

    _drawLiveOverlay() {
        const ctx = this.ctx;
        const items = [];

        // Currently-animating objects + their shadows. An obj id may be
        // in the anim set because of a pop-in (`obj-<id>`) or a mining
        // crumble (`deplete-<id>`). We branch on which key is present.
        for (const obj of this.tileMap.objects) {
            if (!this._animObjectIds.has(obj.id)) continue;
            const popT     = this._animT(`obj-${obj.id}`);
            const hitT     = this._animT(`mine-${obj.id}`);
            const depleteT = this._animT(`deplete-${obj.id}`);
            const asset = getAsset(obj.assetId);
            if (!asset) continue;
            if (popT != null) {
                // Pop-in (placement): elastic curve + scaled shadow.
                if (this._castsShadow(asset)) {
                    items.push({
                        key: obj.sortKey() - 0.5,
                        draw: () => {
                            const prev = ctx.globalAlpha;
                            ctx.globalAlpha = prev * SHADOW_ALPHA * Math.min(1, Math.max(0, popT * 1.4 - 0.1));
                            this._drawShadowFor(ctx, asset, obj.gx, obj.gy, obj.footprint, {
                                flipH: obj.flipH,
                                flipV: obj.flipV,
                            });
                            ctx.globalAlpha = prev;
                        },
                    });
                }
                items.push({
                    key: obj.sortKey(),
                    draw: () => this._drawAnimatingObject(obj, popT),
                });
            } else if (hitT != null) {
                if (this._castsShadow(asset)) {
                    items.push({
                        key: obj.sortKey() - 0.5,
                        draw: () => {
                            const prev = ctx.globalAlpha;
                            ctx.globalAlpha = prev * SHADOW_ALPHA;
                            this._drawShadowFor(ctx, asset, obj.gx, obj.gy, obj.footprint, {
                                flipH: obj.flipH,
                                flipV: obj.flipV,
                            });
                            ctx.globalAlpha = prev;
                        },
                    });
                }
                items.push({
                    key: obj.sortKey(),
                    draw: () => this._drawMiningHitObject(obj, hitT),
                });
            } else if (depleteT != null) {
                // Mining crumble: fractured chunks drift/fall away. Shadow
                // fades alongside as the deposit leaves the ground.
                if (this._castsShadow(asset)) {
                    items.push({
                        key: obj.sortKey() - 0.5,
                        draw: () => {
                            const prev = ctx.globalAlpha;
                            ctx.globalAlpha = prev * SHADOW_ALPHA * (1 - depleteT);
                            this._drawShadowFor(ctx, asset, obj.gx, obj.gy, obj.footprint, {
                                flipH: obj.flipH,
                                flipV: obj.flipV,
                            });
                            ctx.globalAlpha = prev;
                        },
                    });
                }
                items.push({
                    key: obj.sortKey(),
                    draw: () => this._drawCrumblingObject(obj, depleteT),
                });
            }
        }

        // Currently-animating terrain tiles.
        for (const [key, entry] of this._frameAnims) {
            if (!key.startsWith('t-')) continue;
            const cell = entry.cell;
            if (!cell) continue;
            const id = this.tileMap.getTerrain(cell.gx, cell.gy);
            if (!id) continue;
            items.push({
                key: cell.gx + cell.gy - 0.0005,
                draw: () => this._drawAnimatingTile(id, cell.gx, cell.gy, entry.t),
            });
        }

        // Hover highlight + preview.
        if (this.hoverCell) {
            const { gx, gy } = this.hoverCell;
            const previewAsset = this.previewAssetId
                ? ASSET_INDEX[this.previewAssetId]
                : null;
            const fp = previewAsset?.footprint ?? { w: 1, d: 1 };
            items.push({
                key: gx + gy - 0.001,
                draw: () => this._drawHoverTiles(gx, gy, fp),
            });
            const ghostBlocked = this._isAnimAtCell(gx, gy);
            if (previewAsset && previewAsset.kind === 'object' && !this.eraseMode && !ghostBlocked) {
                if (this._castsShadow(getAsset(previewAsset.id))) {
                    items.push({
                        key: (gx + fp.w - 1) + (gy + fp.d - 1) - 0.5,
                        draw: () => this._drawPreviewShadow(previewAsset, gx, gy),
                    });
                }
                items.push({
                    key: (gx + fp.w - 1) + (gy + fp.d - 1) + 0.001,
                    draw: () => this._drawPreviewObject(previewAsset, gx, gy),
                });
            }
            if (previewAsset && previewAsset.kind === 'terrain' && !this.eraseMode && !ghostBlocked) {
                items.push({
                    key: gx + gy + 0.0005,
                    draw: () => this._drawPreviewTerrain(previewAsset, gx, gy),
                });
            }
        }

        // Player avatar — sorted into the same depth band as terrain +
        // objects so it slides cleanly behind props one row ahead of it.
        if (this.player) {
            items.push({
                key: this.player.sortKey() + 0.0001,
                draw: () => this._drawPlayer(this.player),
            });
        }

        if (items.length > 1) items.sort((a, b) => a.key - b.key);
        for (const item of items) item.draw();

        // FX (floating text + dust chips) draw last so they sit on
        // top of every other live-overlay element. They live in world
        // space so they pan / zoom with the camera.
        if (this._floatingTexts.length > 0 || this._particles.length > 0) {
            this._drawFX();
        }
    }

    /**
     * Placeholder player avatar — a chunky cobalt humanoid block sized to
     * match the real character PNG that will land later (sizeScale 0.5,
     * 1:2 aspect, flatBase). Feet sit at the diamond's front corner.
     */
    _drawPlayer(player) {
        const ctx = this.ctx;
        const walking = player.isMoving();
        const stepPhase = walking ? player.walkCycle : 0;
        const stride = walking ? Math.sin(stepPhase) : 0;
        const lift = walking ? Math.abs(stride) : 0;
        const bob = lift * 4;
        const sway = walking ? Math.sin(stepPhase * 0.5) * 1.4 : 0;
        const lean = walking ? stride * 0.035 : 0;
        const squashX = walking ? 1 - lift * 0.025 : 1;
        const squashY = walking ? 1 + lift * 0.025 : 1;
        const shadowSquash = walking ? 1 - lift * 0.12 : 1;

        // Asset path: if the player has a skin asset id AND it's loaded
        // (PNG present + processed), draw the sprite instead of the cube.
        // Anchor math mirrors flatBase prop convention: trimmed PNG's
        // bottom edge lands at the diamond's front-corner row, centred
        // horizontally on the interpolated player position.
        if (player.assetId) {
            const asset = this._playerAssetForFacing(player);
            if (asset) {
                const feetY = player.y + TH / 2;
                // Contact shadow first (under the feet, scales with sprite).
                // The shadow is symmetric so it doesn't flip with facing.
                ctx.save();
                ctx.globalAlpha *= 0.32;
                ctx.fillStyle = 'rgba(30, 22, 8, 1)';
                ctx.beginPath();
                ctx.ellipse(player.x, feetY, asset.width * 0.32 * shadowSquash, TH * 0.18, 0, 0, Math.PI * 2);
                ctx.fill();
                if (walking) {
                    const footGap = Math.max(5, asset.width * 0.12);
                    const lead = stride >= 0 ? 1 : -1;
                    ctx.globalAlpha *= 0.65;
                    ctx.beginPath();
                    ctx.ellipse(player.x + lead * footGap, feetY + 1, asset.width * 0.11, TH * 0.055, 0, 0, Math.PI * 2);
                    ctx.ellipse(player.x - lead * footGap * 0.75, feetY + 2, asset.width * 0.08, TH * 0.045, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();

                const src = asset.displayCanvas || asset.canvas;
                const facingUp = player.facing.startsWith('up');
                // Front sprites natively face screen-left. The generated
                // back sprites natively face screen-right, so up-screen
                // facings intentionally invert the mirror decision.
                const facing = player.facing.endsWith('left') !== facingUp ? 1 : -1;
                const backLean = facingUp ? -0.018 : 0;
                ctx.save();
                ctx.translate(player.x + sway * facing, feetY - bob);
                ctx.transform(facing * squashX, 0, (lean + backLean) * facing, squashY, 0, 0);
                ctx.drawImage(src, -asset.anchorX, -asset.height, asset.width, asset.height);
                ctx.restore();
                return;
            }
            // Asset id set but PNG not loaded → drop through to the cube
            // fallback. Keeps `?character=miner` working even before the
            // PNG has been generated.
        }

        const box = player.drawBox();
        const PAL = CONFIG.palette;

        // Contact shadow — small flat ellipse under the feet.
        ctx.save();
        ctx.globalAlpha *= 0.32;
        ctx.fillStyle = 'rgba(30, 22, 8, 1)';
        ctx.beginPath();
        ctx.ellipse(box.x + box.w / 2, box.y + box.h, box.w * 0.42 * shadowSquash, box.h * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(0, -bob);
        // Body block (3 voxels tall) with a subtle vertical gradient so
        // the cube faces read.
        const bodyH = Math.round(box.h * 0.7);
        const bodyY = box.y + (box.h - bodyH);
        const grad = ctx.createLinearGradient(0, bodyY, 0, bodyY + bodyH);
        grad.addColorStop(0, PAL.cobaltLight);
        grad.addColorStop(1, PAL.cobaltDeep);
        ctx.fillStyle = grad;
        ctx.fillRect(box.x, bodyY, box.w, bodyH);

        // Head block (~1 voxel) above the body.
        const headH = box.h - bodyH;
        const headPad = Math.max(2, Math.round(box.w * 0.12));
        ctx.fillStyle = PAL.whiteShadow;
        ctx.fillRect(box.x + headPad, box.y, box.w - headPad * 2, headH);

        // Cube-face highlight along the top of body + head so the chunky
        // voxel language reads even without a real sprite.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(box.x, bodyY, box.w, 2);
        ctx.fillRect(box.x + headPad, box.y, box.w - headPad * 2, 2);

        // Dark outline so the placeholder reads on every biome.
        ctx.strokeStyle = 'rgba(20, 14, 4, 0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(box.x + 0.5, bodyY + 0.5, box.w - 1, bodyH - 1);
        ctx.strokeRect(box.x + headPad + 0.5, box.y + 0.5, box.w - headPad * 2 - 1, headH - 1);
        ctx.restore();
    }

    _playerAssetForFacing(player) {
        const assets = allAssets();
        const backId = `${player.assetId}_back`;
        const assetId = player.facing.startsWith('up') && assets[backId]
            ? backId
            : player.assetId;
        return assets[assetId] || getAsset(player.assetId);
    }

    _drawMiningHitObject(obj, t) {
        const ctx = this.ctx;
        const asset = getAsset(obj.assetId);
        if (!asset) return;
        const { x, y } = cellToScreen(obj.gx, obj.gy);
        const dx = x - asset.anchorX;
        const dy = y - asset.anchorY;
        const impact = Math.sin(t * Math.PI);
        const recoil = -5 * impact;
        const squashX = 1 + 0.06 * impact;
        const squashY = 1 - 0.04 * impact;
        const pivot = cellToScreen(obj.gx + obj.footprint.w / 2, obj.gy + obj.footprint.d / 2);
        if (asset.flatBase) {
            pivot.y += (obj.footprint.w + obj.footprint.d) * TH / 4;
        }
        ctx.save();
        ctx.translate(pivot.x, pivot.y);
        ctx.scale(squashX, squashY);
        ctx.translate(-pivot.x, -pivot.y + recoil);
        this._drawAssetImage(ctx, asset, dx, dy, obj.gx, obj.gy, obj.footprint, {
            flipH: obj.flipH,
            flipV: obj.flipV,
        });
        ctx.globalAlpha *= 0.22 * (1 - t);
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = '#ffe08a';
        ctx.beginPath();
        ctx.ellipse(pivot.x, pivot.y - 12, asset.width * 0.35, TH * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _drawAnimatingObject(obj, t) {
        const ctx = this.ctx;
        const asset = getAsset(obj.assetId);
        if (!asset) return;
        const { x, y } = cellToScreen(obj.gx, obj.gy);
        const dx = x - asset.anchorX;
        const dy = y - asset.anchorY;
        const s = this._easeOutElastic(t);
        const pivot = cellToScreen(obj.gx + obj.footprint.w / 2, obj.gy + obj.footprint.d / 2);
        if (asset.flatBase) {
            pivot.y += (obj.footprint.w + obj.footprint.d) * TH / 4;
        }
        ctx.save();
        ctx.globalAlpha *= Math.min(1, t * 1.6);
        ctx.translate(pivot.x, pivot.y);
        ctx.scale(s, s);
        ctx.translate(-pivot.x, -pivot.y);
        this._drawAssetImage(ctx, asset, dx, dy, obj.gx, obj.gy, obj.footprint, {
            flipH: obj.flipH,
            flipV: obj.flipV,
        });
        ctx.restore();
    }

    _drawAnimatingTile(assetId, gx, gy, t) {
        const ctx = this.ctx;
        const asset = getAsset(assetId);
        if (!asset) return;
        const { x, y } = cellToScreen(gx, gy);
        const dx = x - asset.anchorX;
        const dy = y - asset.anchorY;
        const s = this._easeOutElastic(t);
        const pivot = cellToScreen(gx + 0.5, gy + 0.5);
        ctx.save();
        ctx.globalAlpha *= Math.min(1, t * 1.6);
        ctx.translate(pivot.x, pivot.y);
        ctx.scale(s, s);
        ctx.translate(-pivot.x, -pivot.y);
        const src = asset.displayCanvas || asset.canvas;
        ctx.drawImage(src, dx, dy, asset.width, asset.height);
        ctx.restore();
    }

    _drawPreviewShadow(previewAsset, gx, gy) {
        const ctx = this.ctx;
        const asset = getAsset(previewAsset.id);
        if (!asset) return;
        const prev = ctx.globalAlpha;
        ctx.globalAlpha = prev * SHADOW_ALPHA * (this.previewValid ? 1 : 0.5);
        this._drawShadowFor(ctx, asset, gx, gy, previewAsset.footprint, {
            flipH: this.previewFlipH,
            flipV: this.previewFlipV,
        });
        ctx.globalAlpha = prev;
    }

    /* ── Shadow drawing (uses pre-blurred silhouettes) ────────── */

    _castsShadow(asset) {
        return !!asset
            && !asset.tileLike
            && !asset.noShadow
            && asset.kind !== 'terrain'
            && (asset.shadowStyle === 'contact' || !!asset.shadowCanvas);
    }

    _drawShadowFor(ctx, asset, gx, gy, footprint, flip) {
        if (asset.shadowStyle === 'contact') {
            this._drawContactShadowFor(ctx, asset, gx, gy, footprint, flip);
            return;
        }
        this._drawCastShadowFor(ctx, asset, gx, gy, footprint, flip);
    }

    /**
     * Low props like railings look wrong with a long projected silhouette:
     * it reads as if they are floating. Give them a tight grounding shadow
     * directly below their feet instead.
     */
    _drawContactShadowFor(ctx, asset, gx, gy, footprint, flip = {}) {
        const back = cellToScreen(gx, gy);
        const dx = back.x - asset.anchorX;
        const dy = back.y - asset.anchorY;
        const padW = Math.max(7, asset.width * 0.18);
        const padH = Math.max(4, TH * 0.14);
        const points = asset.contactPoints?.length >= 2
            ? asset.contactPoints
            : [
                { x: asset.width * 0.28, y: asset.height },
                { x: asset.width * 0.72, y: asset.height },
            ];
        const posts = points.map(point => ({
            x: dx + (flip.flipH ? asset.width - point.x : point.x),
            y: dy + (flip.flipV ? asset.height - point.y : point.y),
        }));
        const center = {
            x: (posts[0].x + posts[1].x) / 2,
            y: (posts[0].y + posts[1].y) / 2,
        };
        const bridgeW = Math.hypot(posts[1].x - posts[0].x, posts[1].y - posts[0].y) + padW;
        const bridgeAngle = Math.atan2(posts[1].y - posts[0].y, posts[1].x - posts[0].x);

        ctx.save();
        ctx.fillStyle = 'rgba(35, 25, 10, 1)';
        ctx.save();
        ctx.globalAlpha *= 0.18;
        ctx.beginPath();
        ctx.ellipse(center.x, center.y, bridgeW / 2, padH * 0.45, bridgeAngle, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha *= 0.82;
        for (const post of posts) {
            ctx.beginPath();
            ctx.ellipse(post.x, post.y, padW / 2, padH / 2, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    /**
     * Project an asset's silhouette onto the ground plane using a 2D
     * affine transform. Taller pixels project toward the back of the map
     * (up on screen), with only a slight left drift.
     *
     * The silhouette is pre-blurred at asset-load time, so the per-frame
     * cost is one transformed `drawImage` — no `ctx.filter` blur in the
     * render loop at all.
     */
    _drawCastShadowFor(ctx, asset, gx, gy, footprint, flip) {
        const ground = cellToScreen(gx + footprint.w / 2, gy + footprint.d / 2);
        if (asset.flatBase) {
            const halfCellH = (footprint.w + footprint.d) * TH / 4;
            ground.y += halfCellH;
        }
        const ax = asset.width / 2;
        const ay = asset.height;
        const a = 1, b = 0, c = BACK_DRIFT_X, d = BACK_DRIFT_Y;
        const e = ground.x - ax - ay * BACK_DRIFT_X;
        const f = ground.y      - ay * BACK_DRIFT_Y;
        ctx.save();
        ctx.transform(a, b, c, d, e, f);
        if (flip?.flipH || flip?.flipV) {
            ctx.translate(ax, ay);
            ctx.scale(flip.flipH ? -1 : 1, flip.flipV ? -1 : 1);
            ctx.translate(-ax, -ay);
        }
        const pad = asset.shadowPadding || 0;
        ctx.drawImage(
            asset.shadowCanvas,
            -pad, -pad,
            asset.width + pad * 2,
            asset.height + pad * 2,
        );
        ctx.restore();
    }

    /* ── Preview drawing ──────────────────────────────────────── */

    _drawPreviewObject(previewAsset, gx, gy) {
        const ctx = this.ctx;
        const asset = getAsset(previewAsset.id);
        if (!asset) return;
        const { x, y } = cellToScreen(gx, gy);
        const dx = x - asset.anchorX;
        const dy = y - asset.anchorY;
        ctx.save();
        ctx.globalAlpha = this.previewValid ? 0.32 : 0.22;
        this._drawAssetImage(ctx, asset, dx, dy, gx, gy, previewAsset.footprint, {
            flipH: this.previewFlipH,
            flipV: this.previewFlipV,
        });
        ctx.restore();
    }

    _drawPreviewTerrain(previewAsset, gx, gy) {
        const ctx = this.ctx;
        const asset = getAsset(previewAsset.id);
        if (!asset) return;
        const { x, y } = cellToScreen(gx, gy);
        const dx = x - asset.anchorX;
        const dy = y - asset.anchorY;
        const src = asset.displayCanvas || asset.canvas;
        ctx.save();
        ctx.globalAlpha = 0.38;
        ctx.drawImage(src, dx, dy, asset.width, asset.height);
        ctx.restore();
    }

    /**
     * Draw an asset image into `ctx`, optionally mirrored horizontally /
     * vertically around the screen centre of its footprint diamond. Used
     * by both the static-objects cache builder and the live overlay so
     * the same flip logic applies in both passes.
     */
    _drawAssetImage(ctx, asset, dx, dy, gx, gy, footprint = { w: 1, d: 1 }, flip = {}) {
        const flipH = flip.flipH === true;
        const flipV = flip.flipV === true;
        const src = asset.displayCanvas || asset.canvas;
        if (!flipH && !flipV) {
            ctx.drawImage(src, dx, dy, asset.width, asset.height);
            return;
        }
        const pivot = cellToScreen(gx + footprint.w / 2, gy + footprint.d / 2);
        ctx.save();
        ctx.translate(pivot.x, pivot.y);
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        ctx.translate(-pivot.x, -pivot.y);
        ctx.drawImage(src, dx, dy, asset.width, asset.height);
        ctx.restore();
    }

    /* ── Grid + hover ─────────────────────────────────────────── */

    _drawGrid() {
        const ctx = this.ctx;
        ctx.save();
        ctx.lineWidth = 1 / this.camera.zoom;
        ctx.strokeStyle = 'rgba(60, 50, 30, 0.18)';
        ctx.beginPath();
        for (let g = 0; g <= this.tileMap.width; g++) {
            const a = cellToScreen(g, 0);
            const b = cellToScreen(g, this.tileMap.height);
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        }
        for (let g = 0; g <= this.tileMap.height; g++) {
            const a = cellToScreen(0, g);
            const b = cellToScreen(this.tileMap.width, g);
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
        ctx.restore();
    }

    /** Draw highlighted footprint cells under the cursor. */
    _drawHoverTiles(gx, gy, footprint) {
        const ctx = this.ctx;
        ctx.save();
        const valid = this.previewValid;
        const stroke = this.eraseMode
            ? 'rgba(216, 91, 142, 1)'
            : (valid ? 'rgba(27, 91, 168, 1)' : 'rgba(216, 91, 91, 1)');
        const fill = this.eraseMode
            ? 'rgba(216, 91, 142, 0.18)'
            : (valid ? 'rgba(27, 91, 168, 0.16)' : 'rgba(216, 91, 91, 0.16)');

        ctx.lineWidth = 2 / this.camera.zoom;
        ctx.strokeStyle = stroke;
        ctx.fillStyle = fill;

        for (let ix = 0; ix < footprint.w; ix++)
        for (let iy = 0; iy < footprint.d; iy++) {
            const cx = gx + ix;
            const cy = gy + iy;
            if (!this.tileMap.inBounds(cx, cy)) continue;
            const a = cellToScreen(cx, cy);
            const b = cellToScreen(cx + 1, cy);
            const c = cellToScreen(cx + 1, cy + 1);
            const d = cellToScreen(cx, cy + 1);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.lineTo(c.x, c.y);
            ctx.lineTo(d.x, d.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }
}
