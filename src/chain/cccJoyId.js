export const DEFAULT_CCC_ESM_URL = 'https://esm.sh/@ckb-ccc/ccc@1.1.17';
export const DEFAULT_TESTNET_RPC_URL = 'https://testnet.ckb.dev';
export const DEFAULT_TESTNET_JOYID_APP_URL = 'https://testnet.joyid.dev';

const CANCEL_RE = /cancel|reject|denied|closed|timeout/i;
const CAPACITY_RE = /capacity|balance|insufficient|cell/i;

export function cccJoyIdEnabled(params) {
    return params?.get?.('wallet') === 'joyid'
        || params?.get?.('walletReal') === '1'
        || params?.get?.('joyid') === '1';
}

export function cccJoyIdMiningEnabled(params) {
    const mode = params?.get?.('chainMiningSubmit') || params?.get?.('chainMiningMode');
    return params?.get?.('chainMiningReal') === '1'
        || mode === 'ccc'
        || mode === 'joyid'
        || mode === 'ccc-joyid';
}

export function resolveCccJoyIdConfig({ params, location, now = Date.now } = {}) {
    const network = params?.get?.('ckbNetwork') === 'mainnet' ? 'mainnet' : 'testnet';
    const href = location?.href || 'http://127.0.0.1/';
    const logo = params?.get?.('joyidLogo') || new URL('/assets/player_miner.png', href).href;
    return {
        cccUrl: params?.get?.('cccUrl') || DEFAULT_CCC_ESM_URL,
        name: params?.get?.('joyidAppName') || 'Cellshire',
        logo,
        network,
        rpcURL: params?.get?.('node') || DEFAULT_TESTNET_RPC_URL,
        joyidAppURL: params?.get?.('joyidApp') || (network === 'testnet' ? DEFAULT_TESTNET_JOYID_APP_URL : undefined),
        connectedAt: now(),
    };
}

export async function loadCcc({ ccc, cccUrl = DEFAULT_CCC_ESM_URL, importModule = spec => import(spec) } = {}) {
    if (ccc) return ccc;
    const mod = await importModule(cccUrl);
    const resolved = mod?.ccc || mod?.default?.ccc || mod?.default || mod;
    if (!resolved?.Transaction || !resolved?.JoyId?.CkbSigner) {
        throw new Error('CCC JoyID module is unavailable');
    }
    return resolved;
}

export function createCccClient(ccc, config = {}) {
    const Client = config.network === 'mainnet'
        ? ccc.ClientPublicMainnet
        : ccc.ClientPublicTestnet;
    if (typeof Client !== 'function') throw new Error('CCC client constructor is unavailable');
    return new Client(config.rpcURL ? { url: config.rpcURL } : undefined);
}

export async function connectCccJoyId({
    params,
    location,
    now = Date.now,
    ccc,
    importModule,
} = {}) {
    const config = resolveCccJoyIdConfig({ params, location, now });
    const cccModule = await loadCcc({ ccc, cccUrl: config.cccUrl, importModule });
    const client = createCccClient(cccModule, config);
    const signer = new cccModule.JoyId.CkbSigner(client, config.name, config.logo);
    await signer.connect();
    const address = await signer.getRecommendedAddress();
    if (!address) throw new Error('JoyID did not return a CKB address');

    return {
        provider: 'joyid',
        signer: 'ccc-joyid',
        address,
        label: config.network === 'mainnet' ? 'JoyID' : 'JoyID Testnet',
        network: config.network,
        connectedAt: config.connectedAt,
    };
}

export function miningReceiptPayload(miningTx) {
    const input = miningTx?.inputs?.ore_cell;
    const next = miningTx?.outputs?.ore_cell;
    const output = miningTx?.outputs?.yield_cell;
    if (!input?.ore_id || !output) throw new Error('mining transaction receipt payload required');
    return {
        protocol: 'cellshire.mining',
        version: 1,
        action: miningTx.action || 'mine',
        tx_nonce: miningTx.tx_nonce,
        ore_id: input.ore_id,
        map_id: input.map_id,
        epoch: input.epoch,
        gx: input.gx,
        gy: input.gy,
        ore_type: input.ore_type,
        capacity_before: input.capacity_remaining,
        capacity_after: next?.capacity_remaining || 0,
        yield_currency: output.currency,
        yield_amount: output.amount,
        yield_usd_value: output.usd_value,
    };
}

export function utf8ToHex(value) {
    const bytes = new TextEncoder().encode(String(value));
    let out = '0x';
    for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
    return out;
}

export async function buildCccMiningTransaction({
    ccc,
    client,
    signer,
    miningTx,
    receiptCapacityCkb = 61,
}) {
    const address = await signer.getRecommendedAddress();
    const expected = miningTx?.witness?.address;
    if (expected && expected !== address) {
        throw new Error('connected JoyID address does not match mining wallet');
    }

    const { script: lock } = await ccc.Address.fromString(address, client);
    const payload = miningReceiptPayload(miningTx);
    const payloadHex = utf8ToHex(JSON.stringify(payload));
    const tx = ccc.Transaction.from({
        outputs: [{
            capacity: ccc.fixedPointFrom(receiptCapacityCkb),
            lock,
        }],
    });

    await tx.completeInputsByCapacity(signer);
    if (!Array.isArray(tx.witnesses)) tx.witnesses = [];
    if (tx.witnesses.length === 0) tx.witnesses.push('0x');
    tx.witnesses.push(payloadHex);
    await tx.completeFeeBy(signer);
    return { tx, payload, payloadHex };
}

export async function submitCccJoyIdMiningTx(miningTx, {
    params,
    location,
    ccc,
    importModule,
    shouldFail = false,
    receiptCapacityCkb,
} = {}) {
    try {
        if (shouldFail) throw new Error('JoyID signature cancelled');
        const config = resolveCccJoyIdConfig({ params, location });
        const cccModule = await loadCcc({ ccc, cccUrl: config.cccUrl, importModule });
        const client = createCccClient(cccModule, config);
        const signer = new cccModule.JoyId.CkbSigner(client, config.name, config.logo);
        await signer.connect();
        const prepared = await buildCccMiningTransaction({
            ccc: cccModule,
            client,
            signer,
            miningTx,
            receiptCapacityCkb,
        });
        const txHash = await signer.sendTransaction(prepared.tx);
        return {
            ok: true,
            mode: 'ccc-joyid',
            txHash,
            payload: prepared.payload,
        };
    } catch (err) {
        return {
            ok: false,
            reason: classifyCccJoyIdError(err),
            message: err?.message || 'CCC/JoyID mining submit failed',
        };
    }
}

export function createCccJoyIdMiningSubmitter(options = {}) {
    return (tx, runtime = {}) => submitCccJoyIdMiningTx(tx, { ...options, ...runtime });
}

export function classifyCccJoyIdError(err) {
    const msg = err?.message || String(err || '');
    if (CANCEL_RE.test(msg)) return 'signature-cancelled';
    if (CAPACITY_RE.test(msg)) return 'insufficient-capacity';
    if (/module|import|constructor|unavailable/i.test(msg)) return 'ccc-unavailable';
    return 'tx-failed';
}
