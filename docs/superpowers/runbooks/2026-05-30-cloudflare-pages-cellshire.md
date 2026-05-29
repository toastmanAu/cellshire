# Cellshire Cloudflare Pages Runbook

Domain: `cellshire.com`

## Build

Cellshire is a static ES-module app. The publish directory is `dist/`.

```bash
node netlify-build.mjs
```

The build copies runtime assets and Cloudflare Pages `_headers` into `dist/`.

## Cloudflare Pages

Current project:

- Pages project: `cellshire`
- Production URL: `https://cellshire.pages.dev/`
- Latest deployment checked: `https://b122b71e.cellshire.pages.dev/`

Create/update the Pages project from the Git repo:

- Framework preset: `None`
- Build command: `node netlify-build.mjs`
- Build output directory: `dist`
- Production branch: current main branch

Manual deploy from this workspace:

```bash
node netlify-build.mjs
wrangler pages deploy dist --project-name cellshire --branch main --commit-dirty=true
```

After the first deploy, attach custom domains:

- `cellshire.com`
- `www.cellshire.com`

Cloudflare should create the required Pages DNS records automatically when the
zone is managed in the same account. Use Full or Full Strict SSL mode once the
Pages certificate is active.

Wrangler `4.81.1` does not expose a custom-domain attach command for Pages.
Attach domains from the Cloudflare dashboard:

1. Workers & Pages -> `cellshire` -> Custom domains.
2. Add `cellshire.com`.
3. Add `www.cellshire.com`.
4. Wait for Pages certificate activation, then run the smoke checks below.

## Cache Headers

The repo-level `_headers` file is copied to `dist/_headers` for Cloudflare
Pages:

- HTML, CSS, and `/src/*`: revalidate on each load.
- `/assets/*`, `/logos/*`, and root `.ogg` files: one-year immutable cache.
- All paths: `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: strict-origin-when-cross-origin`.

## Smoke Check

After deployment:

```bash
curl -I https://cellshire.com/
curl -I https://www.cellshire.com/
curl -I https://cellshire.com/src/main.js
curl -I https://cellshire.com/assets/cellshire_logo.png
```

Expected:

- `/` returns `200`.
- `/src/main.js` has `Cache-Control: public, max-age=0, must-revalidate`.
- image/audio assets have `Cache-Control: public, max-age=31536000, immutable`.
- Browser console has no module load failures.
