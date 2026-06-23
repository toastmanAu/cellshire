#!/usr/bin/env node
/**
 * Repeatable live smoke for the deployed Cellshire static app.
 *
 * Checks:
 * - production root HTML returns 200 and revalidates
 * - optional Pages/demo root serves the same hashed module graph
 * - hashed module URLs return 200
 * - the guarded first-session URL boots to data-cellshire-boot="ready"
 * - module-load failures and uncaught app exceptions fail the run
 *
 * No external dependencies. Requires a local Chrome/Chromium binary.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_BASE = 'https://cellshire.com/';
const DEFAULT_PAGES_BASE = 'https://cellshire.pages.dev/';
const DEFAULT_BOOT_QUERY = '?seed=20260523&character=miner&firstSessionGrant=1';
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_VIRTUAL_TIME_BUDGET_MS = 15000;

const args = parseArgs(process.argv.slice(2));

try {
    if (args.selfTest) {
        runSelfTest();
    } else {
        const result = await runSmoke(args);
        printSuccess(result);
    }
} catch (err) {
    printFailure(err);
    process.exitCode = 1;
}

async function runSmoke(options) {
    const failures = [];
    const base = normalizeBase(options.base || DEFAULT_BASE);
    const pagesBase = options.pagesBase === ''
        ? ''
        : normalizeBase(options.pagesBase || DEFAULT_PAGES_BASE);
    const bootQuery = options.bootQuery || DEFAULT_BOOT_QUERY;
    const timeoutMs = numberOption(options.timeoutMs, DEFAULT_TIMEOUT_MS, '--timeout-ms');
    const virtualTimeBudgetMs = numberOption(
        options.virtualTimeBudgetMs,
        DEFAULT_VIRTUAL_TIME_BUDGET_MS,
        '--virtual-time-budget-ms',
    );
    const chrome = options.chrome || process.env.CHROME_BIN || 'google-chrome';

    const productionRoot = await checkRoot(base, 'production', timeoutMs, failures);
    let pagesRoot = null;
    if (pagesBase) {
        pagesRoot = await checkRoot(pagesBase, 'pages', timeoutMs, failures);
        if (productionRoot.moduleSrc && pagesRoot.moduleSrc && productionRoot.moduleSrc !== pagesRoot.moduleSrc) {
            failures.push(
                `pages root module graph ${pagesRoot.moduleSrc} does not match production ${productionRoot.moduleSrc}`,
            );
        }
    }

    if (productionRoot.moduleSrc) {
        await checkModule(new URL(productionRoot.moduleSrc, base).toString(), 'production', timeoutMs, failures);
    }
    if (pagesRoot?.moduleSrc) {
        await checkModule(new URL(pagesRoot.moduleSrc, pagesBase).toString(), 'pages', timeoutMs, failures);
    }

    const bootUrl = new URL(bootQuery.startsWith('?') ? bootQuery : `?${bootQuery}`, base).toString();
    const boot = await runChromeBoot({
        chrome,
        url: bootUrl,
        expectedModuleSrc: productionRoot.moduleSrc,
        timeoutMs,
        virtualTimeBudgetMs,
    });
    failures.push(...boot.failures);

    if (failures.length) {
        const err = new Error('production/demo smoke failed');
        err.failures = failures;
        err.summary = { base, pagesBase, moduleSrc: productionRoot.moduleSrc, bootUrl };
        throw err;
    }

    return {
        base,
        pagesBase,
        moduleSrc: productionRoot.moduleSrc,
        bootUrl,
        rootCacheControl: productionRoot.cacheControl,
        pagesRootCacheControl: pagesRoot?.cacheControl || '',
        chrome,
        warnings: boot.warnings,
    };
}

async function checkRoot(base, label, timeoutMs, failures) {
    const head = await requestText(base, { method: 'HEAD', timeoutMs });
    if (head.statusCode !== 200) {
        failures.push(`${label} root returned HTTP ${head.statusCode}`);
    }

    const cacheControl = header(head.headers, 'cache-control');
    if (!rootRevalidates(cacheControl)) {
        failures.push(`${label} root does not revalidate; cache-control=${cacheControl || '<missing>'}`);
    }

    const get = await requestText(base, { method: 'GET', timeoutMs });
    if (get.statusCode !== 200) {
        failures.push(`${label} root body returned HTTP ${get.statusCode}`);
    }

    const moduleSrc = extractModuleSrc(get.body);
    if (!moduleSrc) {
        failures.push(`${label} root did not contain a hashed src-<hash>/main.js?v=<hash> module script`);
    }

    return { cacheControl, moduleSrc };
}

async function checkModule(url, label, timeoutMs, failures) {
    const res = await requestText(url, { method: 'HEAD', timeoutMs });
    if (res.statusCode !== 200) {
        failures.push(`${label} module ${url} returned HTTP ${res.statusCode}`);
    }
    const type = header(res.headers, 'content-type');
    if (type && !/javascript|ecmascript|text\/plain/i.test(type)) {
        failures.push(`${label} module ${url} returned suspicious content-type=${type}`);
    }
}

async function runChromeBoot({ chrome, url, expectedModuleSrc, timeoutMs, virtualTimeBudgetMs }) {
    const userDataDir = mkdtempSync(join(tmpdir(), 'cellshire-production-smoke-'));
    try {
        const args = [
            '--headless',
            '--disable-gpu',
            '--enable-logging=stderr',
            '--v=0',
            '--dump-dom',
            `--virtual-time-budget=${virtualTimeBudgetMs}`,
            `--user-data-dir=${userDataDir}`,
            url,
        ];
        const run = await spawnCapture(chrome, args, timeoutMs + virtualTimeBudgetMs + 5000);
        const failures = [];
        const warnings = [];

        if (run.code !== 0) {
            failures.push(`Chrome exited with status ${run.code}`);
        }
        if (!run.stdout.includes('data-cellshire-boot="ready"')) {
            failures.push('guarded boot URL did not reach data-cellshire-boot="ready"');
        }
        if (!run.stdout.includes('id="app" class=""')) {
            failures.push('boot DOM did not show the app container after loading');
        }
        if (expectedModuleSrc && !run.stdout.includes(expectedModuleSrc)) {
            failures.push(`boot DOM did not retain expected module script ${expectedModuleSrc}`);
        }

        for (const line of run.stderr.split(/\r?\n/)) {
            if (!line.trim()) continue;
            if (isAppFailureLine(line)) failures.push(`Chrome app console failure: ${line.trim()}`);
            else if (isKnownWarningLine(line)) warnings.push(line.trim());
        }

        return { failures, warnings };
    } finally {
        rmSync(userDataDir, { recursive: true, force: true });
    }
}

function extractModuleSrc(html) {
    const moduleScript = /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']([^"']+)["'])[^>]*>/i.exec(html);
    if (!moduleScript) return '';
    const src = moduleScript[1];
    const match = /^src-([0-9a-f]{12})\/main\.js\?v=([0-9a-f]{12})$/i.exec(src);
    if (!match || match[1] !== match[2]) return '';
    return src;
}

function rootRevalidates(cacheControl) {
    const cc = cacheControl.toLowerCase();
    return cc.includes('max-age=0') || cc.includes('no-cache') || cc.includes('no-store');
}

function isAppFailureLine(line) {
    if (!/CONSOLE|Failed to load module script|Uncaught|SyntaxError|TypeError|ReferenceError|net::ERR/i.test(line)) {
        return false;
    }
    if (/Canvas2D: Multiple readback operations/i.test(line)) return false;
    if (/apple-mobile-web-app-capable.*deprecated/i.test(line)) return false;
    if (/static\.cloudflareinsights\.com\/beacon/i.test(line)) return false;
    return /Uncaught|Failed to load module script|SyntaxError|TypeError|ReferenceError|net::ERR|404|MIME/i.test(line);
}

function isKnownWarningLine(line) {
    return /Canvas2D: Multiple readback operations|apple-mobile-web-app-capable.*deprecated/i.test(line);
}

function requestText(url, { method, timeoutMs, redirects = 3 }) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const client = parsed.protocol === 'http:' ? http : https;
        const req = client.request(parsed, { method, timeout: timeoutMs }, (res) => {
            const location = res.headers.location;
            if (location && [301, 302, 303, 307, 308].includes(res.statusCode) && redirects > 0) {
                res.resume();
                resolve(requestText(new URL(location, url).toString(), { method, timeoutMs, redirects: redirects - 1 }));
                return;
            }

            const chunks = [];
            res.setEncoding('utf8');
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode || 0,
                    headers: res.headers,
                    body: chunks.join(''),
                });
            });
        });
        req.on('timeout', () => {
            req.destroy(new Error(`${method} ${url} timed out after ${timeoutMs}ms`));
        });
        req.on('error', reject);
        req.end();
    });
}

function spawnCapture(command, args, timeoutMs) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            child.kill('SIGTERM');
            reject(new Error(`${command} timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr });
        });
    });
}

function normalizeBase(value) {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/?$/, '/');
    url.search = '';
    url.hash = '';
    return url.toString();
}

function header(headers, name) {
    const value = headers[name.toLowerCase()];
    return Array.isArray(value) ? value.join(', ') : value || '';
}

function numberOption(value, fallback, name) {
    if (value === undefined) return fallback;
    const out = Number(value);
    if (!Number.isFinite(out) || out <= 0) throw new Error(`${name} must be a positive number`);
    return out;
}

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        }
        if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
        const eq = arg.indexOf('=');
        const key = arg.slice(2, eq === -1 ? undefined : eq).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (key === 'selfTest') {
            out.selfTest = true;
            continue;
        }
        const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
        if (value === undefined) throw new Error(`Missing value for ${arg}`);
        out[key] = value;
    }
    return out;
}

function printHelp() {
    console.log(`Usage: node scripts/production_demo_smoke.mjs [options]

Options:
  --base URL                    Production/custom-domain base URL.
                                Default: ${DEFAULT_BASE}
  --pages-base URL              Optional Pages/demo base URL to compare.
                                Default: ${DEFAULT_PAGES_BASE}
                                Use --pages-base "" to skip.
  --boot-query QUERY            Guarded boot query.
                                Default: ${DEFAULT_BOOT_QUERY}
  --chrome PATH                 Chrome/Chromium binary. Also honors CHROME_BIN.
                                Default: google-chrome
  --timeout-ms MS               HTTP and process timeout component.
                                Default: ${DEFAULT_TIMEOUT_MS}
  --virtual-time-budget-ms MS   Chrome virtual time budget.
                                Default: ${DEFAULT_VIRTUAL_TIME_BUDGET_MS}
  --self-test                   Run parser and failure-filter self tests.
`);
}

function runSelfTest() {
    const html = '<script type="module" src="src-abcdef123456/main.js?v=abcdef123456"></script>';
    assert(extractModuleSrc(html) === 'src-abcdef123456/main.js?v=abcdef123456', 'extracts hashed module src');
    const reversed = '<script src="src-abcdef123456/main.js?v=abcdef123456" type="module"></script>';
    assert(extractModuleSrc(reversed) === 'src-abcdef123456/main.js?v=abcdef123456', 'accepts module attrs in either order');
    assert(extractModuleSrc('<script type="module" src="src/main.js"></script>') === '', 'rejects unhashed module src');
    assert(rootRevalidates('public, max-age=0, must-revalidate'), 'accepts max-age=0 root policy');
    assert(rootRevalidates('no-cache'), 'accepts no-cache root policy');
    assert(!rootRevalidates('public, max-age=14400'), 'rejects cached root policy');
    assert(isAppFailureLine('INFO:CONSOLE:1 "Uncaught TypeError: boom", source: https://cellshire.com/src-x/main.js (1)'), 'flags uncaught app exception');
    assert(isAppFailureLine('Failed to load module script: Expected a JavaScript module script'), 'flags module-load failure');
    assert(!isAppFailureLine('INFO:CONSOLE:224 "Canvas2D: Multiple readback operations using getImageData are faster"'), 'ignores known Canvas2D warning');
    assert(!isAppFailureLine('INFO:CONSOLE:0 "<meta name=\\"apple-mobile-web-app-capable\\" content=\\"yes\\"> is deprecated"'), 'ignores known mobile meta warning');
    console.log('production_demo_smoke self-test passed');
}

function assert(condition, message) {
    if (!condition) throw new Error(`self-test failed: ${message}`);
}

function printSuccess(result) {
    console.log('Production/demo smoke passed');
    console.log(`  production root: ${result.base}`);
    if (result.pagesBase) console.log(`  pages/demo root: ${result.pagesBase}`);
    console.log(`  module graph: ${result.moduleSrc}`);
    console.log(`  boot URL: ${result.bootUrl}`);
    console.log(`  production root cache-control: ${result.rootCacheControl}`);
    if (result.pagesRootCacheControl) {
        console.log(`  pages/demo root cache-control: ${result.pagesRootCacheControl}`);
    }
    if (result.warnings.length) {
        console.log(`  tolerated browser warnings: ${result.warnings.length}`);
    }
}

function printFailure(err) {
    console.error(err.message);
    if (err.summary) {
        console.error(`  production root: ${err.summary.base}`);
        if (err.summary.pagesBase) console.error(`  pages/demo root: ${err.summary.pagesBase}`);
        if (err.summary.moduleSrc) console.error(`  module graph: ${err.summary.moduleSrc}`);
        console.error(`  boot URL: ${err.summary.bootUrl}`);
    }
    if (err.failures?.length) {
        err.failures.forEach((failure, i) => console.error(`  ${i + 1}. ${failure}`));
    } else {
        console.error(err.stack || String(err));
    }
}
