import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  encodeAbiParameters,
  encodeEventTopics,
  TransactionReceiptNotFoundError,
} from 'viem'
import type { EIP1193Provider } from 'viem'
import type * as Viem from 'viem'
import {
  buyOre,
  cancelClaim,
  checkTransaction,
  connectWallet,
  discoverWallets,
  freeMineAbi,
  ONE_ORE,
  openClaim,
  parseTokenAmount,
  quoteOre,
  readConfirmedClaim,
  readWalletBalances,
  redeemClaim,
  walletErrorMessage,
} from './wallet'
import type { WalletOption, WalletSession } from './wallet'

const mocks = vi.hoisted(() => ({
  readContract: vi.fn(),
  simulateContract: vi.fn(),
  getBalance: vi.fn(),
  getBlockNumber: vi.fn(),
  getTransactionReceipt: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  writeContract: vi.fn(),
}))

vi.mock('viem', async importOriginal => {
  const actual = await importOriginal<typeof Viem>()
  return {
    ...actual,
    createPublicClient: () => mocks,
    createWalletClient: () => mocks,
  }
})

const account = '0x1111111111111111111111111111111111111111'
const freeMine = '0x2222222222222222222222222222222222222222'
const dollar = '0x3333333333333333333333333333333333333333'
const ore = '0x4444444444444444444444444444444444444444'
const hash = `0x${'a'.repeat(64)}` as const
let chainId = '0xa86a'
let accounts = [account]
let allowance = 0n
let price = 2n * ONE_ORE
let currentDollar = dollar
let funded = true
let miner = account

function provider() {
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === 'eth_chainId') return chainId
    if (method === 'eth_requestAccounts' || method === 'eth_accounts')
      return accounts
    if (method === 'wallet_switchEthereumChain') chainId = '0xa86a'
    return undefined
  })
  return { request }
}

function session(): WalletSession {
  return { provider: provider() as unknown as EIP1193Provider, account }
}

beforeEach(() => {
  vi.clearAllMocks()
  chainId = '0xa86a'
  accounts = [account]
  allowance = 0n
  price = 2n * ONE_ORE
  currentDollar = dollar
  funded = true
  miner = account
  mocks.readContract.mockImplementation(
    async ({
      functionName,
      address,
    }: {
      functionName: string
      address: string
    }) => {
      switch (functionName) {
        case 'magicOre':
          return ore
        case 'dollar':
          return currentDollar
        case 'entryPrice':
          return price
        case 'balanceOf':
          return address === ore ? 10n * ONE_ORE : 20_000_000n
        case 'decimals':
          return 6
        case 'symbol':
          return 'USDC'
        case 'allowance':
          return allowance
        case 'getClaim':
          return { miner, oreAmount: 2n * ONE_ORE }
        case 'shifts':
          return [funded, price, dollar, 0n, 2n * ONE_ORE, 10n ** 12n, 1n]
        default:
          throw new Error(`Unexpected read ${functionName}`)
      }
    },
  )
  mocks.getBalance.mockResolvedValue(ONE_ORE)
  mocks.getBlockNumber.mockResolvedValue(123n)
  mocks.simulateContract.mockImplementation(async (request: unknown) => ({
    request,
  }))
  mocks.writeContract.mockResolvedValue(hash)
  mocks.waitForTransactionReceipt.mockResolvedValue({
    status: 'success',
    transactionHash: hash,
  })
  mocks.getTransactionReceipt.mockResolvedValue({
    status: 'success',
    transactionHash: hash,
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('amounts', () => {
  it('preserves 18-decimal precision without using floating point', () => {
    expect(parseTokenAmount('9007199254740993.000000000000000001', 18)).toBe(
      9007199254740993000000000000000001n,
    )
    expect(parseTokenAmount('1,000001', 6)).toBe(1_000_001n)
    expect(quoteOre(3_000_001n, 6, 2n * ONE_ORE)).toBe(
      1_500_000_500_000_000_000n,
    )
  })

  it.each(['0', '-1', '1e6', 'Infinity', '0.0000001', '1.2.3', ''])(
    'rejects invalid amount %s',
    value => {
      expect(() => parseTokenAmount(value, 6)).toThrow()
    },
  )

  it('rejects uint256 overflow and invalid token precision', () => {
    expect(() => parseTokenAmount((2n ** 256n).toString(), 0)).toThrow()
    expect(() => parseTokenAmount('1', 19)).toThrow()
    expect(() => quoteOre(1n, 6, 0n)).toThrow()
  })
})

describe('wallet connection and chain enforcement', () => {
  it('connects only after requesting accounts and switching to Avalanche', async () => {
    chainId = '0x1'
    const injected = provider()
    const result = await connectWallet(injected as unknown as EIP1193Provider)
    expect(result.account).toBe(account)
    expect(injected.request).toHaveBeenCalledWith({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0xa86a' }],
    })
  })

  it('does not swallow a rejected connection', async () => {
    const injected = { request: vi.fn().mockRejectedValue({ code: 4001 }) }
    await expect(
      connectWallet(injected as unknown as EIP1193Provider),
    ).rejects.toEqual({ code: 4001 })
    expect(walletErrorMessage({ code: 4001 })).toMatch(/отклонили/)
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })

  it('blocks operations on another chain', async () => {
    chainId = '0x1'
    await expect(
      buyOre(session(), freeMine, '2', { dollar, entryPrice: price }),
    ).rejects.toThrow(/Avalanche/)
    expect(mocks.readContract).not.toHaveBeenCalled()
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })

  it('blocks an account changed since connection', async () => {
    accounts = [ore]
    await expect(readWalletBalances(session(), freeMine)).rejects.toThrow(
      /Аккаунт/,
    )
    expect(mocks.readContract).not.toHaveBeenCalled()
  })

  it('discovers multiple wallets without opening a permission prompt', () => {
    const target = new EventTarget()
    vi.stubGlobal('window', target)
    const updates: WalletOption[][] = []
    const stop = discoverWallets(wallets => updates.push(wallets))
    const injected = provider()
    const announcement = (uuid: string, name: string, wallet = injected) =>
      new CustomEvent('eip6963:announceProvider', {
        detail: {
          info: { uuid, name, icon: 'https://untrusted.example/icon.svg' },
          provider: wallet,
        },
      })
    target.dispatchEvent(announcement('one', 'MetaMask'))
    target.dispatchEvent(announcement('two', 'Rabby', provider()))
    target.dispatchEvent(announcement('one', 'MetaMask'))
    expect(updates.at(-1)?.map(wallet => wallet.name)).toEqual([
      'MetaMask',
      'Rabby',
    ])
    expect(updates.at(-1)?.[0].icon).toBeUndefined()
    expect(injected.request).not.toHaveBeenCalled()
    stop()
    target.dispatchEvent(announcement('three', 'Another'))
    expect(updates.at(-1)).toHaveLength(2)
  })

  it('preserves a distinct legacy provider and deduplicates provider identities', () => {
    const legacy = provider()
    const modern = provider()
    const target = Object.assign(new EventTarget(), { ethereum: legacy })
    vi.stubGlobal('window', target)
    const updates: WalletOption[][] = []
    const stop = discoverWallets(wallets => updates.push(wallets))
    const announce = (
      uuid: string,
      name: string,
      injected: ReturnType<typeof provider>,
    ) => {
      target.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: { info: { uuid, name }, provider: injected },
        }),
      )
    }
    announce('modern', 'Modern wallet', modern)
    expect(updates.at(-1)?.map(wallet => wallet.name)).toEqual([
      'Браузерный кошелёк',
      'Modern wallet',
    ])
    announce('legacy', 'Named legacy wallet', legacy)
    announce('duplicate', 'Duplicate announcement', modern)
    expect(updates.at(-1)?.map(wallet => wallet.name)).toEqual([
      'Modern wallet',
      'Named legacy wallet',
    ])
    expect(updates.at(-1)).toHaveLength(2)
    stop()
  })
})

describe('purchases', () => {
  it('approves only the exact amount and waits before buying', async () => {
    const onProgress = vi.fn()
    const result = await buyOre(
      session(),
      freeMine,
      '3.000001',
      { dollar, entryPrice: price },
      { onProgress },
    )
    expect(result).toBe(hash)
    expect(
      mocks.writeContract.mock.calls.map(([request]) => request.functionName),
    ).toEqual(['approve', 'buy'])
    expect(mocks.writeContract.mock.calls[0]?.[0].args).toEqual([
      freeMine,
      3_000_001n,
    ])
    expect(mocks.waitForTransactionReceipt).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenCalledWith({
      action: 'approval',
      status: 'pending',
      hash,
    })
    expect(onProgress).toHaveBeenLastCalledWith({
      action: 'purchase',
      status: 'confirmed',
      hash,
    })
  })

  it('resets insufficient existing approval before approving', async () => {
    allowance = 1n
    await buyOre(session(), freeMine, '3', { dollar, entryPrice: price })
    expect(
      mocks.writeContract.mock.calls.map(([request]) => request.args),
    ).toEqual([[freeMine, 0n], [freeMine, 3_000_000n], [3_000_000n]])
  })

  it('skips approval when allowance already covers the amount', async () => {
    allowance = 10_000_000n
    await buyOre(session(), freeMine, '3', { dollar, entryPrice: price })
    expect(mocks.writeContract).toHaveBeenCalledTimes(1)
    expect(mocks.writeContract.mock.calls[0]?.[0].functionName).toBe('buy')
  })

  it('stops when the displayed quote has changed', async () => {
    await expect(
      buyOre(session(), freeMine, '3', { dollar, entryPrice: ONE_ORE }),
    ).rejects.toThrow(/изменились/)
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })

  it('checks the quote again after approval', async () => {
    const originalPrice = price
    mocks.waitForTransactionReceipt.mockImplementation(async () => {
      price = 3n * ONE_ORE
      return { status: 'success', transactionHash: hash }
    })
    await expect(
      buyOre(session(), freeMine, '3', { dollar, entryPrice: originalPrice }),
    ).rejects.toThrow(/изменились/)
    expect(mocks.writeContract).toHaveBeenCalledTimes(1)
  })

  it('does not buy after a reverted approval', async () => {
    const onProgress = vi.fn()
    mocks.waitForTransactionReceipt.mockResolvedValue({
      status: 'reverted',
      transactionHash: hash,
    })
    await expect(
      buyOre(
        session(),
        freeMine,
        '3',
        { dollar, entryPrice: price },
        { onProgress },
      ),
    ).rejects.toThrow(/ошибкой/)
    expect(mocks.writeContract).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenLastCalledWith({
      action: 'approval',
      status: 'failed',
      hash,
    })
  })

  it.each(['cancelled', 'replaced'])(
    'marks a %s transaction as a known failure',
    async reason => {
      const onProgress = vi.fn()
      const replacementHash = `0x${'b'.repeat(64)}`
      mocks.waitForTransactionReceipt.mockImplementation(
        async ({
          onReplaced,
        }: {
          onReplaced: (replacement: unknown) => void
        }) => {
          onReplaced({ reason, transaction: { hash: replacementHash } })
        },
      )
      await expect(
        buyOre(
          session(),
          freeMine,
          '3',
          { dollar, entryPrice: price },
          { onProgress },
        ),
      ).rejects.toThrow(/отменена или заменена/)
      expect(mocks.writeContract).toHaveBeenCalledTimes(1)
      expect(onProgress).toHaveBeenLastCalledWith({
        action: 'approval',
        status: 'failed',
        hash: replacementHash,
      })
    },
  )

  it('keeps an unknown receipt failure pending instead of marking it safe to retry', async () => {
    const onProgress = vi.fn()
    mocks.waitForTransactionReceipt.mockRejectedValue(new Error('Timed out'))
    await expect(
      buyOre(
        session(),
        freeMine,
        '3',
        { dollar, entryPrice: price },
        { onProgress },
      ),
    ).rejects.toThrow('Timed out')
    expect(onProgress).toHaveBeenLastCalledWith({
      action: 'approval',
      status: 'pending',
      hash,
    })
    expect(mocks.writeContract).toHaveBeenCalledTimes(1)
  })

  it('does not continue after disconnect aborts the operation', async () => {
    const controller = new AbortController()
    mocks.waitForTransactionReceipt.mockImplementation(async () => {
      controller.abort()
      return { status: 'success', transactionHash: hash }
    })
    await expect(
      buyOre(
        session(),
        freeMine,
        '3',
        { dollar, entryPrice: price },
        { signal: controller.signal },
      ),
    ).rejects.toThrow()
    expect(mocks.writeContract).toHaveBeenCalledTimes(1)
  })
})

describe('transaction status checks', () => {
  it.each(['success', 'reverted'] as const)(
    'returns a mined %s receipt without sending a transaction',
    async status => {
      mocks.getTransactionReceipt.mockResolvedValue({
        status,
        transactionHash: hash,
      })
      await expect(checkTransaction(session(), hash)).resolves.toBe(status)
      expect(mocks.writeContract).not.toHaveBeenCalled()
    },
  )

  it('treats a missing receipt as pending', async () => {
    mocks.getTransactionReceipt.mockRejectedValue(
      new TransactionReceiptNotFoundError({ hash }),
    )
    await expect(checkTransaction(session(), hash)).resolves.toBe('pending')
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })

  it('preserves RPC errors instead of treating them as a pending or failed transaction', async () => {
    mocks.getTransactionReceipt.mockRejectedValue(new Error('RPC unavailable'))
    await expect(checkTransaction(session(), hash)).rejects.toThrow(
      'RPC unavailable',
    )
  })

  it('does not query a hash on the wrong chain', async () => {
    chainId = '0x1'
    await expect(checkTransaction(session(), hash)).rejects.toThrow(/Avalanche/)
    expect(mocks.getTransactionReceipt).not.toHaveBeenCalled()
  })
})

describe('withdrawal claims', () => {
  it('reads balances and contract state at one block', async () => {
    await readWalletBalances(session(), freeMine)
    expect(
      mocks.readContract.mock.calls.every(
        ([request]) => request.blockNumber === 123n,
      ),
    ).toBe(true)
    expect(mocks.getBalance).toHaveBeenCalledWith({
      address: account,
      blockNumber: 123n,
    })
  })

  it('decodes a confirmed claim from this account and the FreeMine contract only', async () => {
    const topics = encodeEventTopics({
      abi: freeMineAbi,
      eventName: 'ClaimOpened',
      args: { miner: account, shiftId: 3n, claimId: 5n },
    })
    const data = encodeAbiParameters([{ type: 'uint256' }], [2n * ONE_ORE])
    mocks.getTransactionReceipt.mockResolvedValue({
      status: 'success',
      blockNumber: 123n,
      logs: [
        { address: ore, topics, data },
        { address: freeMine, topics: [], data: '0x' },
        { address: freeMine, topics, data },
      ],
    })
    await expect(
      readConfirmedClaim(session(), freeMine, hash),
    ).resolves.toEqual({
      miner: account,
      shiftId: '3',
      claimId: '5',
      oreAmount: (2n * ONE_ORE).toString(),
      blockNumber: 123,
    })
  })

  it('ignores claims from another account', async () => {
    mocks.getTransactionReceipt.mockResolvedValue({
      status: 'success',
      logs: [
        {
          address: freeMine,
          topics: encodeEventTopics({
            abi: freeMineAbi,
            eventName: 'ClaimOpened',
            args: { miner: ore, shiftId: 3n, claimId: 5n },
          }),
          data: encodeAbiParameters([{ type: 'uint256' }], [2n * ONE_ORE]),
        },
      ],
    })
    await expect(
      readConfirmedClaim(session(), freeMine, hash),
    ).resolves.toBeNull()
  })

  it('requires more than one MagicOre', async () => {
    await expect(openClaim(session(), freeMine, '1')).rejects.toThrow(
      /больше 1/,
    )
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })

  it('opens a claim without requesting token approval', async () => {
    await openClaim(session(), freeMine, '2')
    expect(mocks.writeContract).toHaveBeenCalledTimes(1)
    expect(mocks.writeContract.mock.calls[0]?.[0]).toMatchObject({
      functionName: 'openClaim',
      args: [2n * ONE_ORE],
    })
  })

  it('allows cancellation before funding', async () => {
    funded = false
    await cancelClaim(session(), freeMine, '2', '3')
    expect(mocks.writeContract.mock.calls[0]?.[0]).toMatchObject({
      functionName: 'cancelClaim',
      args: [2n, 3n],
    })
  })

  it('blocks redeeming an unfunded claim', async () => {
    funded = false
    await expect(redeemClaim(session(), freeMine, '2', '3')).rejects.toThrow(
      /профинансирована/,
    )
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })

  it('checks claim ownership before requesting a signature', async () => {
    miner = ore
    await expect(cancelClaim(session(), freeMine, '2', '3')).rejects.toThrow(
      /другому/,
    )
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })
})
