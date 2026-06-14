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
- Latest deployment checked: `https://4dfc4c29.cellshire.pages.dev/`

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
Domains can be attached either from the Cloudflare dashboard:

1. Workers & Pages -> `cellshire` -> Custom domains.
2. Add `cellshire.com`.
3. Add `www.cellshire.com`.
4. Wait for Pages certificate activation, then run the smoke checks below.

Or through the Cloudflare Pages Domains API:

```text
POST /accounts/<account_id>/pages/projects/cellshire/domains
{ "name": "cellshire.com" }

POST /accounts/<account_id>/pages/projects/cellshire/domains
{ "name": "www.cellshire.com" }
```

Status on 2026-05-30: both custom domains were attached to the `cellshire`
Pages project, but both remained `pending` because Cloudflare reported
`CNAME record not set`.

Status on 2026-05-31: DNS cutover is live. `cellshire.com` uses Cloudflare
nameservers, and both `cellshire.com` and `www.cellshire.com` serve the Pages
deployment over HTTPS.

Public DNS before cutover:

```text
cellshire.com NS      dns1.registrar-servers.com.
cellshire.com NS      dns2.registrar-servers.com.
cellshire.com A       162.255.119.133
www.cellshire.com CNAME parkingpage.namecheap.com.
```

Current public DNS:

```text
cellshire.com NS      alexia.ns.cloudflare.com.
cellshire.com NS      arnold.ns.cloudflare.com.
cellshire.com A       172.67.151.126
cellshire.com A       104.21.0.246
www.cellshire.com A   172.67.151.126
www.cellshire.com A   104.21.0.246
```

If the domain ever needs to be re-cut over from registrar DNS, finish the
cutover in one of two ways:

- Move `cellshire.com` nameservers to Cloudflare, then add proxied CNAME
  records for `@` and `www` pointing at `cellshire.pages.dev`.
- Keep Namecheap DNS and replace the parking records with `www` CNAME
  `cellshire.pages.dev`; use Namecheap's apex ALIAS/ANAME-style record for
  `cellshire.com` if available.

## Cache Headers

The repo-level `_headers` file is copied to `dist/_headers` for Cloudflare
Pages:

- HTML, CSS, and `/src/*`: revalidate on each load.
- `/src-*/*`: one-year immutable cache for content-hashed module trees.
- `/assets/*`, `/logos/*`, and root `.ogg` files: one-year immutable cache.
- All paths: `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: strict-origin-when-cross-origin`.

The build also writes a duplicate content-hashed ES-module tree at
`dist/src-<hash>/` and rewrites production `index.html` to load
`src-<hash>/main.js?v=<hash>`. This keeps releases deterministic even when a
custom-domain Cloudflare cache setting overrides the repo `_headers` policy for
JavaScript. Root HTML still revalidates, so each deploy can point browsers at a
fresh module graph.

## Smoke Check

After deployment:

```bash
curl -I https://cellshire.com/
curl -I https://www.cellshire.com/
curl -I https://cellshire.com/src-<hash>/main.js
curl -I https://cellshire.com/assets/cellshire_logo.png
```

Expected:

- `/` returns `200`.
- The root HTML contains a `src-<hash>/main.js?v=<hash>` module script.
- The hashed module path returns `200`.
- On the Pages hostname, `/src/main.js` and CSS use the repo `_headers`
  revalidation policy.
- On custom domains, the currently observed Cloudflare zone override may still
  return `max-age=14400` for CSS and JS until the zone cache setting is fixed.
- image/audio assets return `Cache-Control: public, max-age=31536000,
  immutable`.
- Browser console has no module load failures.

Observed on 2026-05-31:

- `https://cellshire.com/` and `https://www.cellshire.com/` returned
  `HTTP/2 200`.
- `https://cellshire.com/assets/cellshire_logo.png` and the `www` variant
  returned `HTTP/2 200` with the immutable asset cache policy.
- `https://cellshire.pages.dev/src/main.js` returned the expected `_headers`
  cache policy, `max-age=0`.
- `https://cellshire.com/src/main.js` and the `www` variant returned
  `max-age=14400`, which indicates a Cloudflare zone/browser-cache override on
  the custom domains. Set the zone browser cache behavior to respect existing
  origin headers, or add a cache rule for `/src/*`, then rerun the smoke check.

Cloudflare API target:

```text
PATCH /zones/<zone_id>/settings/browser_cache_ttl
{ "value": 0 }
```

Cloudflare documents `0` for this setting as `Respect Existing Headers`.

Access note from the 2026-05-31 attempt: the existing Wrangler OAuth token can
list the `cellshire.com` zone, but it cannot read or edit
`/zones/<zone_id>/settings/browser_cache_ttl`; Cloudflare returned
`403 Authentication error`. Use the dashboard or a Cloudflare API token with
Zone Settings edit permission for the `cellshire.com` zone.

Mitigation deployed on 2026-05-31: `node netlify-build.mjs` produced
`dist/src-246c43faaf15/` and rewrote `dist/index.html` to load
`src-246c43faaf15/main.js?v=246c43faaf15` plus
`styles.css?v=92b945e08153`. This was deployed to production as
`https://4dfc4c29.cellshire.pages.dev`, and `https://cellshire.com/` now serves
the hashed module script tag. Headless Chrome loaded the custom domain without
module load failures or uncaught JavaScript errors. The underlying custom-domain
header override was still present after deployment:
`https://cellshire.com/src-246c43faaf15/main.js` returned `200` with
`Cache-Control: public, max-age=14400, must-revalidate`.
