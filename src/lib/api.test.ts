import { describe, expect, it, vi } from 'vitest'

import { ApiError, createApiClient, parseSnapshot, parseStatus } from './api'
import type { PublicSnapshot } from './types'

const address = `0x${'1'.repeat(40)}`
const zeroAddress = `0x${'0'.repeat(40)}`
const fixture: PublicSnapshot = {
  format: 1,
  chain: {
    chainId: 43114,
    deploymentTx: `0x${'a'.repeat(64)}`,
    magicOre: address,
    freeMine: address,
    oreVein: address,
  },
  block: { number: 100, hash: `0x${'b'.repeat(64)}`, timestamp: 1700000000 },
  updatedAt: '2026-11-11T00:00:00.000Z',
  fund: {
    magicOre: {
      name: 'Magic Ore',
      owner: address,
      symbol: 'ORE',
      decimals: 18,
      totalSupply: '9007199254740993123456789',
      holders: { [address]: '9007199254740993123456789' },
    },
    oreVein: {
      owner: address,
      freeMine: address,
      admins: [],
      successors: {},
      pendingOwner: zeroAddress,
      contractURI: '',
    },
    freeMine: {
      owner: address,
      magicOre: address,
      entryPrice: '1000000000000000000',
      priceUpdatedAt: '1700000000',
      currentShiftId: '1',
      dollar: { address, decimals: 6 },
      claims: {},
      shifts: {},
    },
  },
  portfolio: {
    blockNumber: 100,
    nativeBalance: { symbol: 'AVAX', decimals: 18, amount: '0' },
    balances: [],
    aave: { supplies: [], debts: [], healthFactor: null },
    uniswap: { pools: [], positions: [] },
  },
}

describe('public API', () => {
  it('keeps token balances exact and rejects other networks or mismatched blocks', () => {
    expect(parseSnapshot(fixture).fund.magicOre.totalSupply).toBe(
      '9007199254740993123456789',
    )
    expect(() =>
      parseSnapshot({ ...fixture, chain: { ...fixture.chain, chainId: 1 } }),
    ).toThrow(ApiError)
    expect(() =>
      parseSnapshot({
        ...fixture,
        portfolio: { ...fixture.portfolio, blockNumber: 99 },
      }),
    ).toThrow(ApiError)
    expect(() =>
      parseSnapshot({
        ...fixture,
        fund: {
          ...fixture.fund,
          magicOre: { ...fixture.fund.magicOre, totalSupply: 123 },
        },
      }),
    ).toThrow(ApiError)
  })

  it('accepts status before initial synchronization', () => {
    expect(
      parseStatus({
        running: true,
        lastError: null,
        lastAttemptAt: '2026-11-11T00:00:00.000Z',
        block: null,
        updatedAt: null,
        intervalMs: 3600000,
      }).block,
    ).toBeNull()
  })

  it('uses the configured URL without sending browser credentials', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(fixture))
    const client = createApiClient('https://example.test/api/', fetcher)
    await expect(client.getState()).resolves.toEqual(fixture)
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test/api/v1/state',
      expect.objectContaining({
        credentials: 'omit',
        cache: 'no-store',
      }),
    )
    expect(client.backupUrl).toBe('https://example.test/api/v1/backup')
  })

  it('distinguishes unavailable snapshots from invalid JSON', async () => {
    const unavailable = createApiClient(
      '',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('', { status: 503 })),
    )
    await expect(unavailable.getState()).rejects.toMatchObject({ status: 503 })
    const invalid = createApiClient(
      '',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>')),
    )
    await expect(invalid.getState()).rejects.toThrow('некорректный JSON')
  })

  it('propagates cancellation instead of displaying a network failure', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        }),
    )
    const promise = createApiClient('', fetcher).getState(controller.signal)
    controller.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('downloads the public backup as a binary blob', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([31, 139, 8]), {
        headers: { 'Content-Type': 'application/gzip' },
      }),
    )
    const result = await createApiClient('', fetcher).getBackup()
    expect(result.type).toBe('application/gzip')
    expect(Array.from(new Uint8Array(await result.arrayBuffer()))).toEqual([
      31, 139, 8,
    ])
  })
})
