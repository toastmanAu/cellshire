const TRACKS = Object.freeze({
    mine: 'assets/music/mine_zone.ogg',
    property: 'assets/music/property_zone.ogg',
    township: 'assets/music/township_zone.ogg',
});

const DEFAULT_VOLUME = 0.28;
const FADE_MS = 800;

export class MusicManager {
    constructor(game, { volume = DEFAULT_VOLUME } = {}) {
        this.game = game;
        this.volume = volume;
        this.currentKind = null;
        this.current = null;
        this.pendingKind = null;
        this.enabled = true;
        this.unsub = null;
        this.gestureBound = false;
    }

    start() {
        this.unsub = this.game.onMapChange(() => this.sync());
        this._bindGestureStart();
        this.sync();
    }

    stop() {
        this.unsub?.();
        this.unsub = null;
        this.enabled = false;
        if (this.current) this._fadeOutAndStop(this.current);
        this.current = null;
        this.currentKind = null;
    }

    sync() {
        const kind = this.game.mapKind === 'property'
            ? 'property'
            : this.game.mapKind === 'township'
                ? 'township'
                : 'mine';
        this.playKind(kind);
    }

    playKind(kind) {
        if (!this.enabled || !TRACKS[kind] || this.currentKind === kind) return;
        this.pendingKind = kind;
        const previousKind = this.currentKind;
        const next = this._makeAudio(TRACKS[kind]);
        const previous = this.current;
        this.current = next;
        this.currentKind = kind;

        next.play()
            .then(() => {
                this.pendingKind = null;
                this._fadeIn(next, this.volume);
                if (previous) this._fadeOutAndStop(previous);
            })
            .catch(() => {
                this.pendingKind = kind;
                this.current = previous;
                this.currentKind = previous ? previousKind : null;
            });
    }

    _makeAudio(src) {
        const audio = new Audio(src);
        audio.loop = true;
        audio.preload = 'auto';
        audio.volume = 0;
        return audio;
    }

    _bindGestureStart() {
        if (this.gestureBound || typeof window === 'undefined') return;
        this.gestureBound = true;
        const resume = () => {
            if (this.pendingKind || !this.current) this.sync();
            else this.current.play().catch(() => {});
        };
        window.addEventListener('pointerdown', resume, { passive: true });
        window.addEventListener('keydown', resume);
    }

    _fadeIn(audio, target) {
        this._fade(audio, target, FADE_MS);
    }

    _fadeOutAndStop(audio) {
        this._fade(audio, 0, FADE_MS, () => {
            audio.pause();
            audio.currentTime = 0;
        });
    }

    _fade(audio, target, duration, done) {
        const start = audio.volume;
        const started = performance.now();
        const tick = () => {
            const t = Math.min(1, (performance.now() - started) / duration);
            audio.volume = start + (target - start) * t;
            if (t < 1) requestAnimationFrame(tick);
            else done?.();
        };
        requestAnimationFrame(tick);
    }
}

export function installMusicManager(game, opts) {
    const manager = new MusicManager(game, opts);
    manager.start();
    game.music = manager;
    return manager;
}
