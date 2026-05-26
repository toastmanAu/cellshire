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
    const logo = params?.get?.('joyidLogo') || new URL('/assets/cellshire_logo.png', href).href;
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

export function resolveCccBankScriptConfig({ params } = {}) {
    const debtType = scriptFromParams(params, 'chainBankDebtType');
    const bankBookLock = scriptFromParams(params, 'chainBankBookLock');
    const collateralLock = scriptFromParams(params, 'chainBankCollateralLock');
    const bankReserveLock = scriptFromParams(params, 'chainBankReserveLock');
    const treasuryLock = scriptFromParams(params, 'chainBankTreasuryLock');
    const cellDeps = [
        cellDepFromParams(params, 'chainBankDebtTypeDep'),
        cellDepFromParams(params, 'chainBankBookLockDep'),
        cellDepFromParams(params, 'chainBankCollateralLockDep'),
        cellDepFromParams(params, 'chainBankReserveLockDep'),
        cellDepFromParams(params, 'chainBankTreasuryLockDep'),
    ].filter(Boolean);
    return {
        complete: !!(debtType && bankBookLock && collateralLock && bankReserveLock && treasuryLock),
        debtType,
        bankBookLock,
        collateralLock,
        bankReserveLock,
        treasuryLock,
        cellDeps,
        debtCellCapacityCkb: numberParam(params, 'chainBankDebtCellCapacityCkb', 61),
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
    const receipt = miningTx?.witness?.mining_receipt;
    const source = input || next || receipt;
    if (!source?.ore_id || !output) throw new Error('mining transaction receipt payload required');
    return {
        protocol: 'cellshire.mining',
        version: 1,
        action: miningTx.action || 'mine',
        tx_nonce: miningTx.tx_nonce,
        ore_id: source.ore_id,
        map_id: source.map_id,
        epoch: source.epoch,
        gx: source.gx,
        gy: source.gy,
        ore_type: source.ore_type,
        capacity_before: input?.capacity_remaining ?? receipt?.mined_capacity_before ?? next?.capacity_max ?? null,
        capacity_after: next?.capacity_remaining ?? receipt?.mined_capacity_after ?? 0,
        yield_currency: output.currency,
        yield_amount: output.amount,
        yield_usd_value: output.usd_value,
    };
}

export function propertySnapshotReceiptPayload(propertySnapshotTx) {
    const cell = propertySnapshotTx?.outputs?.property_snapshot_cell;
    if (!cell?.ownerId || !cell?.tileMap) throw new Error('property snapshot transaction payload required');
    return {
        protocol: 'cellshire.property.snapshot',
        version: 1,
        action: propertySnapshotTx.action || 'publish_property_snapshot',
        tx_nonce: propertySnapshotTx.tx_nonce,
        owner_id: cell.ownerId,
        cell_id: cell.cellId,
        block_number: cell.blockNumber,
        saved_at: cell.savedAt,
        property_tier: cell.propertyTier,
        camera: cell.camera ?? null,
        tile_map: cell.tileMap,
    };
}

export function bankLoanReceiptPayload(bankTx) {
    const receipt = bankTx?.witness?.bank_receipt;
    if (!receipt?.action || bankTx?.kind !== 'cellshire_bank_loan_tx') {
        throw new Error('bank loan transaction payload required');
    }
    const debt = bankTx.outputs?.debt_cell?.debt
        ?? bankTx.inputs?.debt_cell?.debt
        ?? null;
    return {
        protocol: 'cellshire.bank.loan',
        version: 1,
        action: bankTx.action,
        tx_nonce: bankTx.tx_nonce,
        offer_id: receipt.offer_id,
        loan_id: receipt.loan_id ?? null,
        principal: receipt.principal,
        fee: receipt.fee,
        payment: receipt.payment ?? null,
        total_owed: receipt.total_owed ?? null,
        collateral_kind: receipt.collateral_kind ?? debt?.collateralKind ?? null,
        collateral_amount: receipt.collateral_amount,
        collateral_outpoint: debt?.collateralOutpoint ?? null,
        due_epoch: receipt.due_epoch ?? debt?.dueEpoch ?? null,
    };
}

export function traderSwapReceiptPayload(traderTx) {
    const quote = traderTx?.witness?.trader_quote;
    if (!quote || traderTx?.kind !== 'cellshire_trader_swap_tx') {
        throw new Error('trader swap transaction payload required');
    }
    const source = traderTx.inputs?.source_balance_cell;
    const target = traderTx.outputs?.target_balance_cell;
    const fee = traderTx.outputs?.treasury_fee_receipt;
    return {
        protocol: 'cellshire.trader.swap',
        version: 1,
        action: traderTx.action || 'swap',
        tx_nonce: traderTx.tx_nonce,
        owner: traderTx.witness?.address ?? source?.owner ?? target?.owner ?? null,
        from_currency: quote.from_currency,
        from_amount: quote.from_amount,
        to_currency: quote.to_currency,
        to_amount: quote.to_amount,
        rate: quote.rate,
        fee_bps: quote.fee_bps ?? fee?.fee_bps ?? null,
        fee_usd: fee?.fee_usd ?? null,
        gross_usd: fee?.gross_usd ?? null,
        net_usd: fee?.net_usd ?? null,
    };
}

export function storePurchaseReceiptPayload(storeTx) {
    const purchase = storeTx?.witness?.store_purchase;
    if (!purchase || storeTx?.kind !== 'cellshire_store_purchase_tx') {
        throw new Error('store purchase transaction payload required');
    }
    const payment = storeTx.inputs?.payment_balance_cell;
    const prop = storeTx.outputs?.prop_receipt;
    const treasury = storeTx.outputs?.treasury_receipt;
    return {
        protocol: 'cellshire.store.purchase',
        version: 1,
        action: storeTx.action || 'purchase',
        tx_nonce: storeTx.tx_nonce,
        owner: storeTx.witness?.address ?? payment?.owner ?? prop?.owner ?? null,
        asset_id: purchase.asset_id,
        quantity: prop?.quantity ?? 1,
        price_currency: purchase.price_currency,
        price_amount: purchase.price_amount,
        treasury_currency: treasury?.currency ?? purchase.price_currency,
        treasury_amount: treasury?.amount ?? purchase.price_amount,
    };
}

export function marketplacePurchaseReceiptPayload(marketplaceTx) {
    const purchase = marketplaceTx?.witness?.marketplace_purchase;
    if (!purchase || marketplaceTx?.kind !== 'cellshire_marketplace_purchase_tx') {
        throw new Error('marketplace purchase transaction payload required');
    }
    const payment = marketplaceTx.inputs?.payment_balance_cell;
    const buyer = marketplaceTx.outputs?.buyer_receipt;
    const seller = marketplaceTx.outputs?.seller_receipt;
    return {
        protocol: 'cellshire.marketplace.purchase',
        version: 1,
        action: marketplaceTx.action || 'purchase',
        tx_nonce: marketplaceTx.tx_nonce,
        buyer: marketplaceTx.witness?.address ?? payment?.owner ?? buyer?.owner ?? null,
        seller: purchase.seller ?? seller?.owner ?? null,
        listing_id: purchase.listing_id,
        listing_cell_id: purchase.cell_id ?? null,
        item_type: purchase.item_type,
        asset_id: purchase.asset_id,
        quantity: buyer?.quantity ?? 1,
        price_currency: purchase.price_currency,
        price_amount: purchase.price_amount,
        seller_currency: seller?.currency ?? purchase.price_currency,
        seller_amount: seller?.amount ?? purchase.price_amount,
    };
}

export function utf8ToHex(value) {
    const bytes = new TextEncoder().encode(String(value));
    let out = '0x';
    for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
    return out;
}

export async function buildCccPropertySnapshotTransaction({
    ccc,
    client,
    signer,
    propertySnapshotTx,
    receiptCapacityCkb = 61,
}) {
    const address = await signer.getRecommendedAddress();
    const expected = propertySnapshotTx?.witness?.address;
    if (expected && expected !== address) {
        throw new Error('connected JoyID address does not match property wallet');
    }

    const { script: lock } = await ccc.Address.fromString(address, client);
    const payload = propertySnapshotReceiptPayload(propertySnapshotTx);
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

export async function buildCccBankLoanTransaction({
    ccc,
    client,
    signer,
    bankTx,
    receiptCapacityCkb = 61,
}) {
    const address = await signer.getRecommendedAddress();
    const expected = bankTx?.witness?.address;
    if (expected && expected !== address) {
        throw new Error('connected JoyID address does not match bank wallet');
    }

    const { script: lock } = await ccc.Address.fromString(address, client);
    const payload = bankLoanReceiptPayload(bankTx);
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

export async function buildCccBankCollateralTransaction({
    ccc,
    client,
    signer,
    bankTx,
    scriptConfig,
}) {
    const address = await signer.getRecommendedAddress();
    const expected = bankTx?.witness?.address;
    if (expected && expected !== address) {
        throw new Error('connected JoyID address does not match bank wallet');
    }
    const config = scriptConfig ?? {};
    if (!config.complete) {
        throw new Error('bank script config required for real collateral transaction');
    }

    const { script: playerLock } = await ccc.Address.fromString(address, client);
    const def = bankTx.action === 'borrow'
        ? bankBorrowCccDef({ ccc, bankTx, playerLock, config })
        : bankTx.action === 'repay'
            ? bankRepayCccDef({ ccc, bankTx, playerLock, config })
            : null;
    if (!def) throw new Error('unsupported bank collateral action');

    const tx = ccc.Transaction.from(def);
    await tx.completeInputsByCapacity(signer);
    if (!Array.isArray(tx.witnesses)) tx.witnesses = [];
    if (tx.witnesses.length === 0) tx.witnesses.push('0x');
    tx.witnesses.push(utf8ToHex(JSON.stringify(bankLoanReceiptPayload(bankTx))));
    await tx.completeFeeBy(signer);
    return { tx, payload: bankLoanReceiptPayload(bankTx), scriptConfig: config };
}

export async function buildCccTraderSwapTransaction({
    ccc,
    client,
    signer,
    traderTx,
    receiptCapacityCkb = 61,
}) {
    const address = await signer.getRecommendedAddress();
    const expected = traderTx?.witness?.address;
    if (expected && expected !== address) {
        throw new Error('connected JoyID address does not match trader wallet');
    }

    const { script: lock } = await ccc.Address.fromString(address, client);
    const payload = traderSwapReceiptPayload(traderTx);
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

export async function buildCccStorePurchaseTransaction({
    ccc,
    client,
    signer,
    storeTx,
    receiptCapacityCkb = 61,
}) {
    const address = await signer.getRecommendedAddress();
    const expected = storeTx?.witness?.address;
    if (expected && expected !== address) {
        throw new Error('connected JoyID address does not match store wallet');
    }

    const { script: lock } = await ccc.Address.fromString(address, client);
    const payload = storePurchaseReceiptPayload(storeTx);
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

export async function buildCccMarketplacePurchaseTransaction({
    ccc,
    client,
    signer,
    marketplaceTx,
    receiptCapacityCkb = 61,
}) {
    const address = await signer.getRecommendedAddress();
    const expected = marketplaceTx?.witness?.address;
    if (expected && expected !== address) {
        throw new Error('connected JoyID address does not match marketplace wallet');
    }

    const { script: lock } = await ccc.Address.fromString(address, client);
    const payload = marketplacePurchaseReceiptPayload(marketplaceTx);
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

export async function submitCccJoyIdPropertySnapshotTx(propertySnapshotTx, {
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
        const prepared = await buildCccPropertySnapshotTransaction({
            ccc: cccModule,
            client,
            signer,
            propertySnapshotTx,
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
            message: err?.message || 'CCC/JoyID property snapshot submit failed',
        };
    }
}

export async function submitCccJoyIdBankLoanTx(bankTx, {
    params,
    location,
    ccc,
    importModule,
    shouldFail = false,
    receiptCapacityCkb,
    realBankTx = false,
    scriptConfig,
} = {}) {
    try {
        if (shouldFail) throw new Error('JoyID signature cancelled');
        const config = resolveCccJoyIdConfig({ params, location });
        const cccModule = await loadCcc({ ccc, cccUrl: config.cccUrl, importModule });
        const client = createCccClient(cccModule, config);
        const signer = new cccModule.JoyId.CkbSigner(client, config.name, config.logo);
        await signer.connect();
        const prepared = realBankTx
            ? await buildCccBankCollateralTransaction({
                ccc: cccModule,
                client,
                signer,
                bankTx,
                scriptConfig: scriptConfig ?? resolveCccBankScriptConfig({ params }),
            })
            : await buildCccBankLoanTransaction({
                ccc: cccModule,
                client,
                signer,
                bankTx,
                receiptCapacityCkb,
            });
        const txHash = await signer.sendTransaction(prepared.tx);
        return {
            ok: true,
            mode: realBankTx ? 'ccc-joyid-real' : 'ccc-joyid',
            txHash,
            payload: prepared.payload,
        };
    } catch (err) {
        return {
            ok: false,
            reason: classifyCccJoyIdError(err),
            message: err?.message || 'CCC/JoyID bank loan submit failed',
        };
    }
}

export async function submitCccJoyIdTraderSwapTx(traderTx, {
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
        const prepared = await buildCccTraderSwapTransaction({
            ccc: cccModule,
            client,
            signer,
            traderTx,
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
            message: err?.message || 'CCC/JoyID trader swap submit failed',
        };
    }
}

export async function submitCccJoyIdStorePurchaseTx(storeTx, {
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
        const prepared = await buildCccStorePurchaseTransaction({
            ccc: cccModule,
            client,
            signer,
            storeTx,
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
            message: err?.message || 'CCC/JoyID store purchase submit failed',
        };
    }
}

export async function submitCccJoyIdMarketplacePurchaseTx(marketplaceTx, {
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
        const prepared = await buildCccMarketplacePurchaseTransaction({
            ccc: cccModule,
            client,
            signer,
            marketplaceTx,
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
            message: err?.message || 'CCC/JoyID marketplace purchase submit failed',
        };
    }
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

export function createCccJoyIdPropertySnapshotSubmitter(options = {}) {
    return (tx, runtime = {}) => submitCccJoyIdPropertySnapshotTx(tx, { ...options, ...runtime });
}

export function createCccJoyIdMiningSubmitter(options = {}) {
    return (tx, runtime = {}) => submitCccJoyIdMiningTx(tx, { ...options, ...runtime });
}

export function createCccJoyIdBankLoanSubmitter(options = {}) {
    return (tx, runtime = {}) => submitCccJoyIdBankLoanTx(tx, { ...options, ...runtime });
}

export function createCccJoyIdTraderSwapSubmitter(options = {}) {
    return (tx, runtime = {}) => submitCccJoyIdTraderSwapTx(tx, { ...options, ...runtime });
}

export function createCccJoyIdStorePurchaseSubmitter(options = {}) {
    return (tx, runtime = {}) => submitCccJoyIdStorePurchaseTx(tx, { ...options, ...runtime });
}

export function createCccJoyIdMarketplacePurchaseSubmitter(options = {}) {
    return (tx, runtime = {}) => submitCccJoyIdMarketplacePurchaseTx(tx, { ...options, ...runtime });
}

export function classifyCccJoyIdError(err) {
    const msg = err?.message || String(err || '');
    if (CANCEL_RE.test(msg)) return 'signature-cancelled';
    if (CAPACITY_RE.test(msg)) return 'insufficient-capacity';
    if (/module|import|constructor|unavailable/i.test(msg)) return 'ccc-unavailable';
    return 'tx-failed';
}

function bankBorrowCccDef({ ccc, bankTx, playerLock, config }) {
    const debtCell = bankTx.outputs?.debt_cell;
    const collateral = bankTx.outputs?.collateral_locked_cell;
    const principal = bankTx.outputs?.player_ckb_cell?.amount;
    if (!debtCell?.data || !collateral || !Number.isFinite(Number(principal))) {
        throw new Error('bank borrow collateral tx payload required');
    }
    const outputs = [
        {
            capacity: ccc.fixedPointFrom(principal),
            lock: playerLock,
        },
        {
            capacity: ccc.fixedPointFrom(config.debtCellCapacityCkb),
            lock: config.bankBookLock,
            type: {
                ...config.debtType,
                args: debtCell.type?.args ?? config.debtType.args ?? '0x',
            },
        },
        {
            capacity: ccc.fixedPointFrom(collateral.amount),
            lock: {
                ...config.collateralLock,
                args: collateral.lock?.args ?? config.collateralLock.args ?? '0x',
            },
        },
    ];
    return {
        cellDeps: config.cellDeps,
        outputs,
        outputsData: ['0x', debtCell.data, '0x'],
    };
}

function bankRepayCccDef({ ccc, bankTx, playerLock, config }) {
    const release = bankTx.outputs?.collateral_unlocked_cell;
    const reserve = bankTx.outputs?.bank_reserve_cell;
    const fee = bankTx.outputs?.treasury_fee_receipt;
    if (!release || !reserve || !fee) throw new Error('bank repay collateral tx payload required');
    return {
        cellDeps: config.cellDeps,
        outputs: [
            {
                capacity: ccc.fixedPointFrom(release.amount),
                lock: playerLock,
            },
            {
                capacity: ccc.fixedPointFrom(reserve.amount),
                lock: config.bankReserveLock,
            },
            {
                capacity: ccc.fixedPointFrom(fee.amount),
                lock: config.treasuryLock,
            },
        ],
        outputsData: ['0x', '0x', '0x'],
    };
}

function scriptFromParams(params, prefix) {
    const codeHash = normalizeHashParam(params?.get?.(`${prefix}CodeHash`));
    if (!codeHash) return null;
    const hashType = params?.get?.(`${prefix}HashType`) || 'type';
    if (!['data', 'type', 'data1', 'data2'].includes(hashType)) return null;
    return {
        codeHash,
        hashType,
        args: normalizeHexParam(params?.get?.(`${prefix}Args`)) ?? '0x',
    };
}

function cellDepFromParams(params, prefix) {
    const txHash = normalizeHashParam(params?.get?.(`${prefix}TxHash`));
    if (!txHash) return null;
    const index = Number(params?.get?.(`${prefix}Index`) ?? 0);
    if (!Number.isInteger(index) || index < 0) return null;
    const depType = params?.get?.(`${prefix}Type`) === 'depGroup' ? 'depGroup' : 'code';
    return {
        outPoint: { txHash, index },
        depType,
    };
}

function normalizeHashParam(value) {
    const hex = normalizeHexParam(value);
    if (!hex) return null;
    const body = hex.slice(2);
    return /^[0-9a-f]{64}$/i.test(body) ? `0x${body.toLowerCase()}` : null;
}

function normalizeHexParam(value) {
    if (typeof value !== 'string') return null;
    const body = value.startsWith('0x') ? value.slice(2) : value;
    if (!/^[0-9a-f]*$/i.test(body) || body.length % 2 !== 0) return null;
    return `0x${body.toLowerCase()}`;
}

function numberParam(params, key, fallback) {
    const value = Number(params?.get?.(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
}
