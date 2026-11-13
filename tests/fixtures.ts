import type { Page } from '@playwright/test'

import type { ApiStatus, PublicSnapshot } from '../src/lib/types'

export const account = '0x1111111111111111111111111111111111111111'
export const secondHolder = '0x2222222222222222222222222222222222222222'
const owner = '0x3333333333333333333333333333333333333333'
const admin = '0x4444444444444444444444444444444444444444'
const successor = '0x5555555555555555555555555555555555555555'
const zero = '0x0000000000000000000000000000000000000000'
export const wavaxPool = '0x6666666666666666666666666666666666666666'
const btcPool = '0x7777777777777777777777777777777777777777'
const wavax = '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7'
const btc = '0x152b9d0fdc40c096757f570a51e494bd4b943e50'
const usdc = '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e'
const usdt = '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7'
const magicOre = '0xfb58d4b7c4c9f834a7211b5ae0e636cbd1b2feac'
const freeMine = '0x5a2ba936848220f0cb7a4c3b961612674c135168'
const oreVein = '0xe757a8b1d003bc8704de110c8458b5358db12070'

export function makeSnapshot(): PublicSnapshot {
  return {
    format: 1,
    chain: {
      chainId: 43114,
      deploymentTx:
        '0x55f4fc48647fc41b96fb52125d11427473c215d76bac672b261f159c3f46d42d',
      magicOre,
      freeMine,
      oreVein,
    },
    block: {
      number: 55443322,
      hash: `0x${'a'.repeat(64)}`,
      timestamp: Math.floor(Date.now() / 1000),
    },
    updatedAt: new Date().toISOString(),
    fund: {
      magicOre: {
        name: 'Magic Ore',
        symbol: 'ORE',
        owner: freeMine,
        decimals: 18,
        totalSupply: '1000000000000000000000',
        holders: {
          [account]: '700000000000000000000',
          [secondHolder]: '200000000000000000000',
          [freeMine]: '100000000000000000000',
        },
      },
      oreVein: {
        owner,
        freeMine,
        admins: [admin],
        contractURI: 'https://example.test/fund.json',
        pendingOwner: zero,
        successors: { [successor]: '1900000000' },
      },
      freeMine: {
        owner: oreVein,
        magicOre,
        entryPrice: '2500000000000000000',
        priceUpdatedAt: '1794513600',
        currentShiftId: '8',
        dollar: { address: usdc, decimals: 6 },
        claims: {
          '7:1': {
            miner: account,
            shiftId: '7',
            claimId: '1',
            oreAmount: '100000000000000000000',
          },
        },
        shifts: {
          '7': {
            funded: true,
            price: '2400000000000000000',
            dollar: usdc,
            fundedAt: '1794513600',
            oreAmount: '100000000000000000000',
            dollarScale: '1000000000000',
            currentClaimId: '1',
          },
          '8': {
            funded: false,
            price: '0',
            dollar: zero,
            fundedAt: '0',
            oreAmount: '0',
            dollarScale: '0',
            currentClaimId: '0',
          },
        },
      },
    },
    portfolio: {
      blockNumber: 55443322,
      nativeBalance: {
        symbol: 'AVAX',
        decimals: 18,
        amount: '42000000000000000000',
      },
      balances: [
        {
          symbol: 'WAVAX',
          address: wavax,
          decimals: 18,
          amount: '125000000000000000000',
        },
        { symbol: 'BTC.b', address: btc, decimals: 8, amount: '50000000' },
        { symbol: 'USDC', address: usdc, decimals: 6, amount: '5300000000' },
        { symbol: 'USDT', address: usdt, decimals: 6, amount: '200000000' },
      ],
      aave: {
        supplies: [
          {
            symbol: 'WAVAX',
            address: wavax,
            decimals: 18,
            amount: '1000000000000000000000',
          },
          { symbol: 'BTC.b', address: btc, decimals: 8, amount: '150000000' },
        ],
        debts: [
          {
            symbol: 'USDC',
            address: usdc,
            decimals: 6,
            amount: '25000000000',
            variableDebt: '24000000000',
            stableDebt: '1000000000',
          },
          {
            symbol: 'USDT',
            address: usdt,
            decimals: 6,
            amount: '10000000000',
            variableDebt: '10000000000',
            stableDebt: '0',
          },
        ],
        healthFactor: '2.475',
      },
      uniswap: {
        pools: [
          {
            baseSymbol: 'WAVAX',
            quoteSymbol: 'USDC',
            fee: 500,
            address: wavaxPool,
            price: '24.125',
          },
          {
            baseSymbol: 'BTC.b',
            quoteSymbol: 'USDC',
            fee: 500,
            address: btcPool,
            price: '82000',
          },
        ],
        positions: [
          {
            tokenId: '15835',
            pool: wavaxPool,
            baseSymbol: 'WAVAX',
            quoteSymbol: 'USDC',
            fee: 500,
            liquidity: '987654321987654321',
            range: { lowerPrice: '18.5', upperPrice: '32.5', fullRange: false },
            inRange: true,
            price: '24.125',
            amounts: { base: '900000000000000000000', quote: '21000000000' },
            newlyAccruedFees: { base: '100000000000000000', quote: '2500000' },
            storedOwed: { base: '500000000000000000', quote: '10000000' },
            totalCollectable: { base: '600000000000000000', quote: '12500000' },
          },
          {
            tokenId: '15836',
            pool: btcPool,
            baseSymbol: 'BTC.b',
            quoteSymbol: 'USDC',
            fee: 500,
            liquidity: '76543217654321',
            range: {
              lowerPrice: '90000',
              upperPrice: '110000',
              fullRange: false,
            },
            inRange: false,
            price: '82000',
            amounts: { base: '25000000', quote: '0' },
            newlyAccruedFees: { base: '0', quote: '0' },
            storedOwed: { base: '0', quote: '0' },
            totalCollectable: { base: '0', quote: '0' },
          },
        ],
      },
    },
  }
}

export function makeStatus(state: PublicSnapshot): ApiStatus {
  return {
    running: false,
    lastError: null,
    lastAttemptAt: state.updatedAt,
    block: state.block,
    updatedAt: state.updatedAt,
    intervalMs: 3600000,
  }
}

export async function mockPublicApi(
  page: Page,
  state = makeSnapshot(),
  status = makeStatus(state),
) {
  await page.route('**/api/v1/state', route => route.fulfill({ json: state }))
  await page.route('**/api/v1/status', route => route.fulfill({ json: status }))
}
