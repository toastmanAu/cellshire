import { buildTraderSwapTransaction } from '../chain/traderSwapTx.js';
import { createCccJoyIdTraderSwapSubmitter } from '../chain/cccJoyId.js';
import { loadWalletIdentity } from '../wallet/walletIdentity.js';

export class LocalTraderAdapter {
    async swap({ inventory, quote }) {
        if (!quote?.ok) return { ok: false, reason: quote?.reason || 'invalid-quote' };
        if (!inventory) return { ok: false, reason: 'missing-inventory' };
        const balance = inventory.get(quote.fromCurrency);
        if (balance < quote.fromAmount) {
            return { ok: false, reason: 'insufficient-funds', balance };
        }
        inventory.add(quote.fromCurrency, -quote.fromAmount);
        inventory.add(quote.toCurrency, quote.toAmount);
        return {
            ok: true,
            mode: 'local',
            fromCurrency: quote.fromCurrency,
            fromAmount: quote.fromAmount,
            toCurrency: quote.toCurrency,
            toAmount: quote.toAmount,
            feeUsd: quote.feeUsd,
            feeBps: quote.feeBps,
        };
    }
}

export function chainTraderEnabled(params) {
    return params?.get?.('chainTrader') === '1';
}

export function chainTraderSubmitMode(params) {
    const mode = params?.get?.('chainTraderSubmit') || params?.get?.('chainTraderMode');
    return mode === 'ccc' || mode === 'joyid' || mode === 'ccc-joyid'
        ? 'ccc-joyid'
        : 'prototype';
}

export class ChainTraderAdapter {
    constructor({
        storage,
        owner = 'local',
        submit = defaultSubmitPrototypeTraderSwap,
        inventoryAdapter = null,
        loadWallet = loadWalletIdentity,
        requireWallet = false,
    } = {}) {
        this.storage = storage;
        this.owner = owner;
        this.submit = submit;
        this.inventoryAdapter = inventoryAdapter;
        this.loadWallet = loadWallet;
        this.requireWallet = requireWallet;
    }

    async swap({ inventory, quote }) {
        if (!quote?.ok) return { ok: false, reason: quote?.reason || 'invalid-quote' };
        if (!inventory) return { ok: false, reason: 'missing-inventory' };
        const balance = inventory.get(quote.fromCurrency);
        if (balance < quote.fromAmount) {
            return { ok: false, reason: 'insufficient-funds', balance };
        }
        const wallet = this.loadWallet(this.storage);
        if (this.requireWallet && (wallet.status !== 'connected' || !wallet.account)) {
            return {
                ok: false,
                reason: 'wallet-disconnected',
                message: 'Connect JoyID before chain Trader swaps',
            };
        }
        const walletAccount = wallet.status === 'connected' && wallet.account
            ? wallet.account
            : { provider: 'prototype', address: this.owner || 'local', network: 'testnet' };
        const tx = buildTraderSwapTransaction({
            walletAccount,
            quote,
            txNonce: `${Date.now()}`,
        });
        const receipt = await this.submit(tx);
        if (!receipt.ok) {
            return {
                ok: false,
                mode: 'chain',
                reason: receipt.reason || 'tx-failed',
                message: receipt.message || 'Trader swap transaction failed',
                tx,
            };
        }
        const settlement = receipt.mode === 'ccc-joyid'
            ? null
            : this.inventoryAdapter?.settleTraderSwapTx?.(tx, receipt);
        if (settlement && !settlement.ok) {
            return {
                ok: false,
                mode: 'chain',
                reason: settlement.reason || 'settlement-failed',
                message: 'Trader settlement failed',
                tx,
                settlement,
            };
        }
        this.inventoryAdapter?.addPendingDelta?.({
            currency: quote.fromCurrency,
            amount: -quote.fromAmount,
            txHash: receipt.txHash,
            source: 'trader',
        });
        this.inventoryAdapter?.addPendingDelta?.({
            currency: quote.toCurrency,
            amount: quote.toAmount,
            txHash: receipt.txHash,
            source: 'trader',
        });
        return {
            ok: true,
            mode: receipt.mode === 'ccc-joyid'
                ? 'chain-ccc-receipt'
                : settlement?.ok ? 'chain-fixture-settled' : 'chain-prototype',
            tx,
            txHash: receipt.txHash,
            settlement,
            fromCurrency: quote.fromCurrency,
            fromAmount: quote.fromAmount,
            toCurrency: quote.toCurrency,
            toAmount: quote.toAmount,
            feeUsd: quote.feeUsd,
            feeBps: quote.feeBps,
        };
    }
}

export async function defaultSubmitPrototypeTraderSwap(tx) {
    await new Promise(r => setTimeout(r, 200));
    const id = btoa(`${tx.witness?.trader_quote?.from_currency}:${tx.witness?.trader_quote?.to_currency}:${tx.tx_nonce}`)
        .replace(/=+$/, '');
    return {
        ok: true,
        mode: 'prototype',
        txHash: `0xtrader${id.slice(0, 24).padEnd(24, '0')}`,
    };
}

export function makeTraderAdapterFromParams({ params, storage, owner, inventoryAdapter, location, importModule } = {}) {
    if (!chainTraderEnabled(params)) return new LocalTraderAdapter();
    if (chainTraderSubmitMode(params) === 'ccc-joyid') {
        return new ChainTraderAdapter({
            storage,
            owner,
            inventoryAdapter,
            requireWallet: true,
            submit: createCccJoyIdTraderSwapSubmitter({ params, location, importModule }),
        });
    }
    return new ChainTraderAdapter({ storage, owner, inventoryAdapter });
}

export class CellswapTraderAdapter {
    async swap() {
        return {
            ok: false,
            mode: 'cellswap',
            reason: 'not-implemented',
        };
    }
}
