import type { ApiStatus, PublicSnapshot } from './types'

type Validator = (value: unknown) => boolean

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const string: Validator = value => typeof value === 'string'
const boolean: Validator = value => typeof value === 'boolean'
const integer: Validator = value =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const units: Validator = value =>
  typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)
const decimal: Validator = value =>
  typeof value === 'string' && /^(0|[1-9]\d*)(\.\d+)?$/.test(value)
const address: Validator = value =>
  typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value)
const hash: Validator = value =>
  typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value)
const date: Validator = value =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))
const decimals: Validator = value => integer(value) && Number(value) <= 255
const nullable =
  (validate: Validator): Validator =>
  value =>
    value === null || validate(value)
const list =
  (validate: Validator): Validator =>
  value =>
    Array.isArray(value) && value.every(validate)
const fields =
  (shape: Record<string, Validator>): Validator =>
  value =>
    record(value) &&
    Object.entries(shape).every(([key, validate]) => validate(value[key]))
const dictionary =
  (key: Validator, validate: Validator): Validator =>
  value =>
    record(value) &&
    Object.entries(value).every(([name, entry]) => key(name) && validate(entry))

const block = fields({ number: integer, hash, timestamp: integer })
const tokenFields = { symbol: string, address, decimals, amount: units }
const pairAmounts = fields({ base: units, quote: units })
const pairFields = { baseSymbol: string, quoteSymbol: string, fee: integer }
const snapshot = fields({
  format: value => value === 1,
  chain: fields({
    chainId: value => value === 43114,
    deploymentTx: hash,
    magicOre: address,
    freeMine: address,
    oreVein: address,
  }),
  block,
  updatedAt: date,
  fund: fields({
    magicOre: fields({
      name: string,
      owner: address,
      symbol: string,
      decimals: value => value === 18,
      totalSupply: units,
      holders: dictionary(address, units),
    }),
    oreVein: fields({
      owner: address,
      freeMine: address,
      admins: list(address),
      contractURI: string,
      pendingOwner: address,
      successors: dictionary(address, units),
    }),
    freeMine: fields({
      owner: address,
      magicOre: address,
      entryPrice: units,
      priceUpdatedAt: units,
      currentShiftId: units,
      dollar: fields({
        address,
        decimals: value => integer(value) && Number(value) <= 18,
      }),
      claims: dictionary(
        value => typeof value === 'string' && /^[1-9]\d*:[1-9]\d*$/.test(value),
        fields({
          miner: address,
          shiftId: units,
          claimId: units,
          oreAmount: units,
        }),
      ),
      shifts: dictionary(
        units,
        fields({
          price: units,
          dollar: address,
          funded: boolean,
          fundedAt: units,
          oreAmount: units,
          dollarScale: units,
          currentClaimId: units,
        }),
      ),
    }),
  }),
  portfolio: fields({
    blockNumber: integer,
    nativeBalance: fields({
      symbol: value => value === 'AVAX',
      decimals: value => value === 18,
      amount: units,
    }),
    balances: list(fields(tokenFields)),
    aave: fields({
      supplies: list(fields(tokenFields)),
      debts: list(
        fields({ ...tokenFields, variableDebt: units, stableDebt: units }),
      ),
      healthFactor: nullable(decimal),
    }),
    uniswap: fields({
      pools: list(
        fields({
          ...pairFields,
          address: nullable(address),
          price: nullable(decimal),
        }),
      ),
      positions: list(
        fields({
          ...pairFields,
          tokenId: units,
          pool: address,
          liquidity: units,
          range: fields({
            lowerPrice: decimal,
            upperPrice: decimal,
            fullRange: boolean,
          }),
          inRange: boolean,
          price: decimal,
          amounts: pairAmounts,
          newlyAccruedFees: pairAmounts,
          storedOwed: pairAmounts,
          totalCollectable: pairAmounts,
        }),
      ),
    }),
  }),
})

const status = fields({
  running: boolean,
  lastError: nullable(string),
  lastAttemptAt: nullable(date),
  block: nullable(block),
  updatedAt: nullable(date),
  intervalMs: integer,
})

export class ApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function parseSnapshot(value: unknown): PublicSnapshot {
  if (!snapshot(value)) {
    throw new ApiError('Сервер вернул несовместимые данные или другую сеть')
  }
  const result = value as PublicSnapshot
  if (
    result.portfolio.blockNumber !== result.block.number ||
    result.fund.freeMine.magicOre.toLowerCase() !==
      result.chain.magicOre.toLowerCase() ||
    result.fund.oreVein.freeMine.toLowerCase() !==
      result.chain.freeMine.toLowerCase()
  ) {
    throw new ApiError('Данные сервера не согласованы: обновите снимок')
  }
  return result
}

export function parseStatus(value: unknown): ApiStatus {
  if (!status(value)) {
    throw new ApiError('Сервер вернул неизвестный формат статуса')
  }
  return value as ApiStatus
}

export function createApiClient(
  baseUrl = '',
  fetcher: typeof fetch = globalThis.fetch,
) {
  const base = baseUrl.trim().replace(/\/+$/, '') || '/api'

  async function request<T>(
    path: string,
    read: (response: Response) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController()
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetcher(`${base}/v1/${path}`, {
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          Accept: path === 'backup' ? 'application/gzip' : 'application/json',
        },
      })
      if (!response.ok) {
        throw new ApiError(
          response.status === 503
            ? 'Сервер пока недоступен или ещё готовит первый снимок'
            : `Не удалось получить данные сервера (HTTP ${response.status})`,
          response.status,
        )
      }
      return await read(response)
    } catch (error) {
      if (signal?.aborted || error instanceof ApiError) throw error
      if (error instanceof SyntaxError) {
        throw new ApiError('Сервер вернул некорректный JSON')
      }
      throw new ApiError(
        controller.signal.aborted
          ? 'Сервер не ответил за 20 секунд. Попробуйте ещё раз'
          : 'Не удалось подключиться к серверу. Проверьте соединение',
      )
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }
  }

  return {
    getState(signal?: AbortSignal) {
      return request(
        'state',
        async response => parseSnapshot(await response.json()),
        signal,
      )
    },
    getStatus(signal?: AbortSignal) {
      return request(
        'status',
        async response => parseStatus(await response.json()),
        signal,
      )
    },
    getBackup(signal?: AbortSignal) {
      return request('backup', response => response.blob(), signal)
    },
  }
}

export const api = createApiClient(import.meta.env.VITE_API_BASE_URL ?? '')
