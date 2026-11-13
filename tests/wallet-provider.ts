import type { Page } from '@playwright/test'
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  erc20Abi,
  toHex,
} from 'viem'
import type { Address, Hex } from 'viem'

import { freeMineAbi } from '../src/lib/wallet'
import type { FundClaim, PublicSnapshot } from '../src/lib/types'
import { account } from './fixtures'

interface RpcRequest {
  method: string
  params?: unknown[]
}

interface Transaction {
  from: Address
  to: Address
  data: Hex
}

const abi = [...erc20Abi, ...freeMineAbi] as const

export async function installWallet(page: Page, snapshot: PublicSnapshot) {
  const state = {
    account: account as string,
    chainId: '0x1',
    calls: [] as string[],
    writes: [] as { functionName: string; args: readonly unknown[] }[],
    oreBalance: 700n * 10n ** 18n,
    dollarBalance: 1_000_000_000n,
    allowance: 0n,
    entryPrice: BigInt(snapshot.fund.freeMine.entryPrice),
    rejectWrite: '' as string,
    receiptUnavailable: false,
    claims: new Map<string, FundClaim>(
      Object.entries(snapshot.fund.freeMine.claims),
    ),
  }
  const blockNumber = BigInt(snapshot.block.number + 100)
  const blockHash = `0x${'b'.repeat(64)}` as const
  const receipts = new Map<string, Record<string, unknown>>()

  const rpc = ({ method, params = [] }: RpcRequest): unknown => {
    state.calls.push(method)
    if (method === 'eth_chainId') return state.chainId
    if (method === 'eth_accounts' || method === 'eth_requestAccounts')
      return [state.account]
    if (method === 'wallet_switchEthereumChain') {
      state.chainId = (params[0] as { chainId: string }).chainId
      return null
    }
    if (method === 'eth_blockNumber') return toHex(blockNumber)
    if (method === 'eth_getBalance') return toHex(2n * 10n ** 18n)
    if (method === 'eth_getTransactionReceipt')
      return state.receiptUnavailable
        ? null
        : (receipts.get(params[0] as string) ?? null)
    if (method === 'eth_call' || method === 'eth_sendTransaction') {
      const tx = params[0] as Transaction
      const decoded = decodeFunctionData({ abi, data: tx.data })
      const args = decoded.args ?? []
      const claimKey = `${args[0]}:${args[1]}`
      if (method === 'eth_sendTransaction') {
        if (state.rejectWrite === decoded.functionName)
          throw { code: 4001, message: 'User rejected request' }
        state.writes.push({ functionName: decoded.functionName, args })
        const hash =
          `0x${state.writes.length.toString(16).padStart(64, '0')}` as const
        const logs: Record<string, unknown>[] = []
        if (decoded.functionName === 'approve')
          state.allowance = args[1] as bigint
        if (decoded.functionName === 'buy') {
          const amount = args[0] as bigint
          state.dollarBalance -= amount
          state.allowance -= amount
          state.oreBalance += (amount * 10n ** 30n) / state.entryPrice
        }
        if (decoded.functionName === 'openClaim') {
          const oreAmount = args[0] as bigint
          const shiftId = snapshot.fund.freeMine.currentShiftId
          const claimId = '2'
          state.oreBalance -= oreAmount
          state.claims.set(`${shiftId}:${claimId}`, {
            miner: state.account,
            shiftId,
            claimId,
            oreAmount: oreAmount.toString(),
          })
          logs.push({
            address: snapshot.chain.freeMine,
            blockHash,
            blockNumber: toHex(blockNumber),
            transactionHash: hash,
            transactionIndex: '0x0',
            logIndex: '0x0',
            removed: false,
            data: encodeAbiParameters([{ type: 'uint256' }], [oreAmount]),
            topics: encodeEventTopics({
              abi: freeMineAbi,
              eventName: 'ClaimOpened',
              args: {
                miner: state.account as Address,
                shiftId: BigInt(shiftId),
                claimId: BigInt(claimId),
              },
            }),
          })
        }
        if (
          decoded.functionName === 'cancelClaim' ||
          decoded.functionName === 'redeemClaim'
        ) {
          const claim = state.claims.get(claimKey)
          if (!claim) throw new Error('Claim not found in mock contract')
          if (decoded.functionName === 'cancelClaim')
            state.oreBalance += BigInt(claim.oreAmount) - 10n ** 18n
          else
            state.dollarBalance += (BigInt(claim.oreAmount) * 24n) / 10n ** 13n
          state.claims.delete(claimKey)
        }
        receipts.set(hash, {
          blockHash,
          blockNumber: toHex(blockNumber),
          contractAddress: null,
          cumulativeGasUsed: '0x5208',
          effectiveGasPrice: '0x1',
          from: state.account,
          gasUsed: '0x5208',
          logs,
          logsBloom: `0x${'0'.repeat(512)}`,
          status: '0x1',
          to: tx.to,
          transactionHash: hash,
          transactionIndex: '0x0',
          type: '0x2',
        })
        return hash
      }
      switch (decoded.functionName) {
        case 'magicOre':
          return encodeFunctionResult({
            abi,
            functionName: 'magicOre',
            result: snapshot.chain.magicOre as Address,
          })
        case 'dollar':
          return encodeFunctionResult({
            abi,
            functionName: 'dollar',
            result: snapshot.fund.freeMine.dollar.address as Address,
          })
        case 'entryPrice':
          return encodeFunctionResult({
            abi,
            functionName: 'entryPrice',
            result: state.entryPrice,
          })
        case 'balanceOf':
          return encodeFunctionResult({
            abi,
            functionName: 'balanceOf',
            result:
              tx.to.toLowerCase() === snapshot.chain.magicOre
                ? state.oreBalance
                : state.dollarBalance,
          })
        case 'decimals':
          return encodeFunctionResult({
            abi,
            functionName: 'decimals',
            result: 6,
          })
        case 'symbol':
          return encodeFunctionResult({
            abi,
            functionName: 'symbol',
            result: 'USDC',
          })
        case 'allowance':
          return encodeFunctionResult({
            abi,
            functionName: 'allowance',
            result: state.allowance,
          })
        case 'approve':
          return encodeFunctionResult({
            abi,
            functionName: 'approve',
            result: true,
          })
        case 'getClaim': {
          const claim = state.claims.get(claimKey)
          if (!claim) throw new Error('Claim not found in mock contract')
          return encodeFunctionResult({
            abi,
            functionName: 'getClaim',
            result: {
              miner: claim.miner as Address,
              oreAmount: BigInt(claim.oreAmount),
            },
          })
        }
        case 'shifts': {
          const shift = snapshot.fund.freeMine.shifts[String(args[0])]
          if (!shift) throw new Error('Shift not found in mock contract')
          return encodeFunctionResult({
            abi,
            functionName: 'shifts',
            result: [
              shift.funded,
              BigInt(shift.price),
              shift.dollar as Address,
              BigInt(shift.fundedAt),
              BigInt(shift.oreAmount),
              BigInt(shift.dollarScale),
              BigInt(shift.currentClaimId),
            ],
          })
        }
        case 'buy':
        case 'openClaim':
        case 'cancelClaim':
        case 'redeemClaim':
          return '0x'
        default:
          throw new Error(`Unexpected contract call: ${decoded.functionName}`)
      }
    }
    throw new Error(`Unexpected wallet RPC: ${method}`)
  }

  await page.exposeFunction('__walletRpc', (request: RpcRequest) => {
    try {
      return { value: rpc(request) }
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error)
        return { error }
      return {
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }
  })
  await page.addInitScript(() => {
    const listeners = new Map<string, Set<(value: unknown) => void>>()
    const provider = {
      request: async (request: { method: string; params?: unknown[] }) => {
        const rpc = (
          window as unknown as {
            __walletRpc: (request: unknown) => Promise<{
              value?: unknown
              error?: { code: number; message: string }
            }>
          }
        ).__walletRpc
        const result = await rpc(request)
        if (result.error)
          throw Object.assign(new Error(result.error.message), {
            code: result.error.code,
          })
        if (request.method === 'wallet_switchEthereumChain') {
          const value = (request.params?.[0] as { chainId: string }).chainId
          listeners.get('chainChanged')?.forEach(listener => listener(value))
        }
        return result.value
      },
      on: (event: string, listener: (value: unknown) => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set())
        listeners.get(event)?.add(listener)
      },
      removeListener: (event: string, listener: (value: unknown) => void) =>
        listeners.get(event)?.delete(listener),
    }
    window.addEventListener('test:wallet-event', event => {
      const { name, value } = (
        event as CustomEvent<{ name: string; value: unknown }>
      ).detail
      listeners.get(name)?.forEach(listener => listener(value))
    })
    window.addEventListener('eip6963:requestProvider', () => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: {
              uuid: 'mock-avalanche-wallet',
              name: 'Test Rabby',
              rdns: 'io.rabby.test',
            },
            provider,
          },
        }),
      )
    })
  })
  return state
}

export async function emitWalletEvent(
  page: Page,
  name: string,
  value: unknown,
) {
  await page.evaluate(
    detail =>
      window.dispatchEvent(new CustomEvent('test:wallet-event', { detail })),
    { name, value },
  )
}
