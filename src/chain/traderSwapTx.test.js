import { describe, expect, it } from '../test/harness.js';
import { fixedPriceSnapshot } from '../mining/cryptoEconomy.js';
import { buildTraderRateTable, quoteTrade } from '../trader/traderRates.js';
import {
    buildTraderSwapTransaction,
    settleTraderSwapFixture,
} from './traderSwapTx.js';

describe('trader swap transaction', () => {
    it('builds a chain-shaped trader swap request from a prepared quote', () => {
        const quote = quoteTrade({
            fromCurrency: 'bch',
            toCurrency: 'zec',
            fromAmount: 0.1,
            rateTable: buildTraderRateTable(fixedPriceSnapshot()),
        });
        const tx = buildTraderSwapTransaction({
            walletAccount: { provider: 'joyid', address: 'ckt1owner', network: 'testnet' },
            quote,
            txNonce: 'swap-1',
        });
        expect(tx.kind).toBe('cellshire_trader_swap_tx');
        expect(tx.inputs.source_balance_cell.currency).toBe('bch');
        expect(tx.outputs.target_balance_cell.currency).toBe('zec');
        expect(tx.outputs.treasury_fee_receipt.fee_bps).toBe(200);
        expect(tx.witness.trader_quote.tx_nonce).toBe('swap-1');
    });

    it('settles a fixture swap by spending source and creating target balance cells', () => {
        const quote = quoteTrade({
            fromCurrency: 'bch',
            toCurrency: 'zec',
            fromAmount: 0.1,
            rateTable: buildTraderRateTable(fixedPriceSnapshot()),
        });
        const tx = buildTraderSwapTransaction({
            walletAccount: { provider: 'joyid', address: 'ckt1owner', network: 'testnet' },
            quote,
            txNonce: 'swap-1',
        });
        const settlement = settleTraderSwapFixture({
            tx,
            txHash: '0xswap',
            indexedBalances: {
                bch: { amount: 1, stale: false, outPoint: { txHash: '0xold', index: 0 } },
            },
        });
        expect(settlement.ok).toBe(true);
        expect(settlement.outputs.source_balance_cell.amount).toBe(0.9);
        expect(settlement.outputs.target_balance_cell.amount).toBe(quote.toAmount);
        expect(settlement.inputs.target_balance_cell).toBeNull();
    });

    it('omits the source balance output when a fixture swap spends it to zero', () => {
        const quote = quoteTrade({
            fromCurrency: 'bch',
            toCurrency: 'zec',
            fromAmount: 0.1,
            rateTable: buildTraderRateTable(fixedPriceSnapshot()),
        });
        const tx = buildTraderSwapTransaction({
            walletAccount: { provider: 'joyid', address: 'ckt1owner', network: 'testnet' },
            quote,
            txNonce: 'swap-2',
        });
        const settlement = settleTraderSwapFixture({
            tx,
            indexedBalances: { bch: { amount: 0.1, stale: false } },
        });
        expect(settlement.ok).toBe(true);
        expect(settlement.outputs.source_balance_cell).toBeNull();
        expect(settlement.updates.bch.spent).toBe(true);
    });
});
