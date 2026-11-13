import { formatUnits } from 'viem'

export const ZERO_ADDRESS = `0x${'0'.repeat(40)}`

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function decimal(value: string, places = 4): string {
  const [whole = '0', fraction = ''] = value.split('.')
  const digits = fraction.slice(0, places).replace(/0+$/, '')
  if (whole === '0' && !digits && /[1-9]/.test(fraction)) {
    return `< 0,${'0'.repeat(Math.max(places - 1, 0))}1`
  }
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')}${digits ? `,${digits}` : ''}`
}

export function amount(
  value: string | bigint,
  decimals = 18,
  places = 4,
): string {
  return decimal(formatUnits(BigInt(value), decimals), places)
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function date(value: string | number | null): string {
  if (value === null || value === '0') return '—'
  const parsed =
    typeof value === 'number' || /^\d+$/.test(value)
      ? new Date(Number(value) * 1000)
      : new Date(value)
  if (!Number.isFinite(parsed.getTime())) return '—'
  return dateFormatter.format(parsed)
}

export const explorer = (
  value: string,
  type: 'address' | 'tx' | 'block' = 'address',
) => `https://snowtrace.io/${type}/${encodeURIComponent(value)}`

export const uniswap = (pool: string) =>
  `https://app.uniswap.org/explore/pools/avalanche/${encodeURIComponent(pool)}`

export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Не удалось выполнить запрос. Попробуйте ещё раз.'
}

export function dollarDecimals(scale: string): number | null {
  if (!/^10*$/.test(scale) || scale.length > 19) return null
  return 19 - scale.length
}

export function claimPayout(ore: string, price: string, scale: string): bigint {
  return BigInt(scale) > 0n
    ? (BigInt(ore) * BigInt(price)) / (10n ** 18n * BigInt(scale))
    : 0n
}
