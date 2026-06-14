/**
 * netlify-build.mjs
 *
 * Tiny "build" step for the static site: copies just the runtime files
 * (HTML / CSS / JS / referenced PNG + OGG assets) into `dist/` so that
 * static hosts ship a clean publish directory and not the 4 MB of design
 * reference PNGs, the prompt notes, the local .DS_Store entries, the
 * tooling scripts, and the editor's .webp duplicates that nothing on
 * the page actually loads.
 *
 * No external dependencies — runs on Node ≥ 16's built-in `fs.cpSync`.
 */

import { createHash } from 'node:crypto';
import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');

// Audio clips actually fetched at runtime by src/ui/Audio.js. Anything
// else at root (including the orphaned `placement.ogg`) is skipped.
const AUDIO_FILES = [
    'menu_select_lightbulb.ogg',
    'new-placement.ogg',
    'waterPlacement.ogg',
    'brick-stone.ogg',
    'fence-woodenDecorations.ogg',
    'small-vegetations.ogg',
    'large-vegetations.ogg',
];

const ENTRIES = [
    'index.html',
    'styles.css',
    '_headers',
    'src',
    'assets',
    'logos',
    ...AUDIO_FILES,
];

const srcHash = contentHashForPaths([join(ROOT, 'src')]);
const stylesHash = contentHashForPaths([join(ROOT, 'styles.css')]);
const hashedSrcDir = `src-${srcHash}`;

console.log('Building dist/ …');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

let skipped = 0;
for (const entry of ENTRIES) {
    const src = join(ROOT, entry);
    if (!existsSync(src)) {
        console.warn(`  ! skipped (missing): ${entry}`);
        skipped++;
        continue;
    }
    const dst = join(DIST, entry);
    cpSync(src, dst, {
        recursive: true,
        // Filter out OS junk, source/reference assets, local selection
        // archives, and unused .webp duplicates living next to the .png
        // assets in `assets/newAsset/`.
        filter: (s) => {
            const name = s.split('/').pop();
            if (name === '.DS_Store') return false;
            if (name === 'raw' || name === 'raw_pending' || name === 'raw_mining_originals') return false;
            if (name === 'assets_cellshire.zip') return false;
            if (name.endsWith('.webp')) return false;
            return true;
        },
    });
    const sz = sizeOf(src);
    console.log(`  ✓ ${entry.padEnd(34)} ${formatBytes(sz)}`);
}

cpSync(join(ROOT, 'src'), join(DIST, hashedSrcDir), {
    recursive: true,
    filter: (s) => s.split('/').pop() !== '.DS_Store',
});
rewriteIndexForVersionedAssets();
console.log(`  ✓ ${hashedSrcDir.padEnd(34)} ${formatBytes(sizeOf(join(DIST, hashedSrcDir)))}`);

const total = sizeOf(DIST);
console.log(`Built dist/ — ${formatBytes(total)} ready to publish.`);
if (skipped) process.exitCode = 1;

function rewriteIndexForVersionedAssets() {
    const indexPath = join(DIST, 'index.html');
    let html = readFileSync(indexPath, 'utf8');
    html = html
        .replace(/href="styles\.css(?:\?[^"]*)?"/, `href="styles.css?v=${stylesHash}"`)
        .replace(/src="src\/main\.js(?:\?[^"]*)?"/, `src="${hashedSrcDir}/main.js?v=${srcHash}"`);
    writeFileSync(indexPath, html);
}

function contentHashForPaths(paths) {
    const hash = createHash('sha256');
    for (const p of paths) hashPath(hash, p, p);
    return hash.digest('hex').slice(0, 12);
}

function hashPath(hash, root, p) {
    const st = statSync(p);
    if (st.isFile()) {
        hash.update(relative(root, p));
        hash.update('\0');
        hash.update(readFileSync(p));
        hash.update('\0');
        return;
    }
    for (const child of readdirSync(p).sort()) {
        if (child === '.DS_Store') continue;
        hashPath(hash, root, join(p, child));
    }
}

function sizeOf(p) {
    const st = statSync(p);
    if (st.isFile()) return st.size;
    let total = 0;
    for (const child of readdirSync(p)) {
        total += sizeOf(join(p, child));
    }
    return total;
}

function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
