import { describe, expect, it, vi } from 'vitest'

import { makeSnapshot } from '../../tests/fixtures'
import { ApiError, createApiClient, parseSnapshot, parseStatus } from './api'

const fixture = makeSnapshot()

describe('public API', () => {
  it('keeps token balances exact and rejects other networks or mismatched blocks', () => {
    const precise = makeSnapshot()
    precise.fund.magicOre.totalSupply = '9007199254740993123456789'
    expect(parseSnapshot(precise).fund.magicOre.totalSupply).toBe(
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

  it('aborts a stalled request after 20 seconds', async () => {
    vi.useFakeTimers()
    try {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(init.signal?.reason),
            )
          }),
      )
      const result = expect(
        createApiClient('', fetcher).getState(),
      ).rejects.toThrow('Сервер не ответил за 20 секунд')
      await vi.advanceTimersByTimeAsync(20_000)
      await result
    } finally {
      vi.useRealTimers()
    }
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
