import { describe, expect, it } from 'vitest'

import { amount, claimPayout, decimal, dollarDecimals, uniswap } from './format'

describe('exact token presentation', () => {
  it('keeps large integer balances exact without Number conversion', () => {
    expect(amount('900719925474099312345678901234567890', 18, 6)).toBe(
      '900\u202f719\u202f925\u202f474\u202f099\u202f312,345678',
    )
  })

  it('distinguishes dust from zero', () => {
    expect(amount(1n, 18)).toBe('< 0,0001')
    expect(amount(0n, 18)).toBe('0')
    expect(decimal('2.500000')).toBe('2,5')
  })

  it('uses each funded shift dollar scale and contract rounding for payout', () => {
    expect(dollarDecimals('1000000000000')).toBe(6)
    expect(dollarDecimals('1')).toBe(18)
    expect(dollarDecimals('0')).toBeNull()
    expect(dollarDecimals('123')).toBeNull()
    expect(
      claimPayout(
        '1999999999999999999',
        '2500000000000000000',
        '1000000000000',
      ),
    ).toBe(4_999_999n)
    expect(claimPayout('1999999999999999999', '2500000000000000000', '1')).toBe(
      4_999_999_999_999_999_997n,
    )
  })

  it('links trading pairs to Avalanche pools', () => {
    expect(uniswap(`0x${'a'.repeat(40)}`)).toBe(
      `https://app.uniswap.org/explore/pools/avalanche/0x${'a'.repeat(40)}`,
    )
  })
})
