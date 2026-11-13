import {
  BaseError,
  TransactionReceiptNotFoundError,
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  erc20Abi,
  getAddress,
  isAddress,
  maxUint256,
  parseAbi,
  parseUnits,
} from 'viem'
import type { Address, EIP1193Provider, Hash } from 'viem'
import { avalanche } from './chain'
import type { FundClaim } from './types'

export const AVALANCHE_CHAIN_ID = avalanche.id
export const ONE_ORE = 10n ** 18n

export const freeMineAbi = parseAbi([
  'event ClaimOpened(uint256 oreAmount, address indexed miner, uint256 indexed shiftId, uint256 indexed claimId)',
  'function magicOre() view returns (address)',
  'function dollar() view returns (address)',
  'function entryPrice() view returns (uint256)',
  'function buy(uint256 dollarAmount)',
  'function openClaim(uint256 amount)',
  'function cancelClaim(uint256 shiftId, uint256 claimId)',
  'function redeemClaim(uint256 shiftId, uint256 claimId)',
  'function getClaim(uint256 shiftId, uint256 claimId) view returns ((address miner, uint256 oreAmount))',
  'function shifts(uint256) view returns (bool funded, uint256 price, address dollar, uint256 fundedAt, uint256 oreAmount, uint256 dollarScale, uint256 currentClaimId)',
  'error OwnerCannotBuy()',
  'error SenderIsNotMiner()',
  'error ShiftIsNotFunded(uint256 shiftId)',
  'error InsufficientQuantity(uint256 amount)',
  'error ClaimNotFound(uint256 shiftId, uint256 claimId)',
])

export interface WalletOption {
  id: string
  name: string
  icon?: string
  provider: EIP1193Provider
}

export interface WalletSession {
  provider: EIP1193Provider
  account: Address
}

export interface WalletBalances {
  ore: Address
  dollar: Address
  dollarDecimals: number
  dollarSymbol: string
  oreBalance: bigint
  dollarBalance: bigint
  nativeBalance: bigint
  entryPrice: bigint
}

export interface ConfirmedClaim extends FundClaim {
  blockNumber: number
}

export interface TransactionProgress {
  action:
    | 'approval-reset'
    | 'approval'
    | 'purchase'
    | 'open-claim'
    | 'cancel-claim'
    | 'redeem-claim'
  status: 'signature' | 'pending' | 'confirmed' | 'failed'
  hash?: Hash
}

export interface TransactionOptions {
  signal?: AbortSignal
  onProgress?: (progress: TransactionProgress) => void
}

export interface WalletCallbacks {
  onAccountsChanged: (accounts: Address[]) => void
  onChainChanged: (chainId: number) => void
  onDisconnect: () => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isProvider(value: unknown): value is EIP1193Provider {
  return isRecord(value) && typeof value.request === 'function'
}

/** Discover each injected wallet without requesting accounts or permissions. */
export function discoverWallets(onChange: (wallets: WalletOption[]) => void) {
  const wallets = new Map<string, WalletOption>()
  const legacyProvider = (window as Window & { ethereum?: EIP1193Provider })
    .ethereum
  if (isProvider(legacyProvider)) {
    wallets.set('injected', {
      id: 'injected',
      name: 'Браузерный кошелёк',
      provider: legacyProvider,
    })
  }
  const announce = (event: Event) => {
    const detail: unknown = (event as CustomEvent<unknown>).detail
    if (
      !isRecord(detail) ||
      !isRecord(detail.info) ||
      !isProvider(detail.provider)
    )
      return
    const { uuid, name, icon } = detail.info
    if (typeof uuid !== 'string' || !uuid || typeof name !== 'string' || !name)
      return
    if (wallets.has(uuid)) return
    const existing = [...wallets.entries()].find(
      ([, wallet]) => wallet.provider === detail.provider,
    )
    if (existing && existing[0] !== 'injected') return
    // Replace only this provider's legacy entry; a distinct legacy wallet stays available.
    if (existing) wallets.delete(existing[0])
    wallets.set(uuid, {
      id: uuid,
      name,
      ...(typeof icon === 'string' && icon.startsWith('data:image/')
        ? { icon }
        : {}),
      provider: detail.provider,
    })
    onChange([...wallets.values()])
  }
  window.addEventListener('eip6963:announceProvider', announce)
  onChange([...wallets.values()])
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  return () => window.removeEventListener('eip6963:announceProvider', announce)
}

function errorCode(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined
  if (typeof error.code === 'number') return error.code
  return error.cause === error ? undefined : errorCode(error.cause)
}

export function walletErrorMessage(error: unknown): string {
  if (errorCode(error) === 4001) return 'Вы отклонили запрос в кошельке'
  if (errorCode(error) === -32002)
    return 'В кошельке уже открыт запрос. Завершите его и попробуйте снова'
  if (error instanceof BaseError) return error.shortMessage
  if (error instanceof Error) return error.message
  return 'Не удалось выполнить операцию с кошельком'
}

export async function switchToAvalanche(
  provider: EIP1193Provider,
): Promise<void> {
  const chainId = await provider.request({ method: 'eth_chainId' })
  if (Number(chainId) === avalanche.id) return
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0xa86a' }],
    })
  } catch (error) {
    if (errorCode(error) !== 4902) throw error
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: '0xa86a',
          chainName: avalanche.name,
          nativeCurrency: avalanche.nativeCurrency,
          rpcUrls: [...avalanche.rpcUrls.default.http],
          blockExplorerUrls: [avalanche.blockExplorers.default.url],
        },
      ],
    })
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0xa86a' }],
    })
  }
  if (
    Number(await provider.request({ method: 'eth_chainId' })) !== avalanche.id
  ) {
    throw new Error('Выберите Avalanche C-Chain в кошельке')
  }
}

export async function connectWallet(
  provider: EIP1193Provider,
): Promise<WalletSession> {
  const accounts = await provider.request({ method: 'eth_requestAccounts' })
  const account = accounts[0]
  if (!account || !isAddress(account))
    throw new Error('Кошелёк не предоставил адрес аккаунта')
  await switchToAvalanche(provider)
  const session = { provider, account: getAddress(account) }
  await assertSession(session)
  return session
}

export function subscribeWallet(
  session: WalletSession,
  callbacks: WalletCallbacks,
) {
  const accountsChanged = (accounts: string[]) => {
    callbacks.onAccountsChanged(
      accounts
        .filter(account => isAddress(account))
        .map(account => getAddress(account)),
    )
  }
  const chainChanged = (chainId: string) =>
    callbacks.onChainChanged(Number(chainId))
  const disconnect = () => callbacks.onDisconnect()
  session.provider.on?.('accountsChanged', accountsChanged)
  session.provider.on?.('chainChanged', chainChanged)
  session.provider.on?.('disconnect', disconnect)
  return () => {
    session.provider.removeListener?.('accountsChanged', accountsChanged)
    session.provider.removeListener?.('chainChanged', chainChanged)
    session.provider.removeListener?.('disconnect', disconnect)
  }
}

async function assertSession(session: WalletSession, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const [chainId, accounts] = await Promise.all([
    session.provider.request({ method: 'eth_chainId' }),
    session.provider.request({ method: 'eth_accounts' }),
  ])
  if (Number(chainId) !== avalanche.id)
    throw new Error('Для операции выберите Avalanche C-Chain')
  if (accounts[0]?.toLowerCase() !== session.account.toLowerCase()) {
    throw new Error('Аккаунт кошелька изменился. Подключите кошелёк заново')
  }
  signal?.throwIfAborted()
}

function clients(session: WalletSession) {
  return {
    publicClient: createPublicClient({
      chain: avalanche,
      transport: custom(session.provider),
    }),
    walletClient: createWalletClient({
      chain: avalanche,
      account: session.account,
      transport: custom(session.provider),
    }),
  }
}

/** Reject excess precision instead of silently rounding a transaction amount. */
export function parseTokenAmount(input: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18)
    throw new Error('Некорректная точность токена')
  const value = input.trim().replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(value))
    throw new Error('Введите положительное число')
  if ((value.split('.')[1]?.length ?? 0) > decimals) {
    throw new Error(`Допустимо не более ${decimals} знаков после запятой`)
  }
  const amount = parseUnits(value, decimals)
  if (amount <= 0n || amount > maxUint256)
    throw new Error(
      'Сумма должна быть больше нуля и находиться в пределах uint256',
    )
  return amount
}

export function quoteOre(
  dollarAmount: bigint,
  dollarDecimals: number,
  entryPrice: bigint,
): bigint {
  if (
    entryPrice <= 0n ||
    dollarAmount < 0n ||
    !Number.isInteger(dollarDecimals) ||
    dollarDecimals < 0 ||
    dollarDecimals > 18
  ) {
    throw new Error('Не удалось рассчитать количество MagicOre')
  }
  const ore =
    (dollarAmount * ONE_ORE * 10n ** BigInt(18 - dollarDecimals)) / entryPrice
  if (ore > maxUint256) throw new Error('Сумма покупки слишком велика')
  return ore
}

export async function readWalletBalances(
  session: WalletSession,
  freeMine: string,
): Promise<WalletBalances> {
  await assertSession(session)
  const { publicClient } = clients(session)
  const address = getAddress(freeMine)
  const blockNumber = await publicClient.getBlockNumber()
  const [ore, dollar, entryPrice] = await Promise.all([
    publicClient.readContract({
      address,
      blockNumber,
      abi: freeMineAbi,
      functionName: 'magicOre',
    }),
    publicClient.readContract({
      address,
      blockNumber,
      abi: freeMineAbi,
      functionName: 'dollar',
    }),
    publicClient.readContract({
      address,
      blockNumber,
      abi: freeMineAbi,
      functionName: 'entryPrice',
    }),
  ])
  const [
    oreBalance,
    dollarBalance,
    dollarDecimals,
    dollarSymbol,
    nativeBalance,
  ] = await Promise.all([
    publicClient.readContract({
      address: ore,
      blockNumber,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [session.account],
    }),
    publicClient.readContract({
      address: dollar,
      blockNumber,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [session.account],
    }),
    publicClient.readContract({
      address: dollar,
      blockNumber,
      abi: erc20Abi,
      functionName: 'decimals',
    }),
    // The fund requires ERC20 + decimals; symbol is optional metadata.
    publicClient
      .readContract({
        address: dollar,
        blockNumber,
        abi: erc20Abi,
        functionName: 'symbol',
      })
      .catch(() => 'USD'),
    publicClient.getBalance({ address: session.account, blockNumber }),
  ])
  if (dollarDecimals > 18)
    throw new Error('Точность долларового токена не поддерживается контрактом')
  await assertSession(session)
  return {
    ore,
    dollar,
    entryPrice,
    oreBalance,
    dollarBalance,
    dollarDecimals,
    dollarSymbol,
    nativeBalance,
  }
}

/** Read a confirmed claim without waiting for the server's next indexing pass. */
export async function readConfirmedClaim(
  session: WalletSession,
  freeMine: string,
  hash: Hash,
): Promise<ConfirmedClaim | null> {
  await assertSession(session)
  const { publicClient } = clients(session)
  const receipt = await publicClient.getTransactionReceipt({ hash })
  if (receipt.status !== 'success') return null
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== freeMine.toLowerCase()) continue
    let event
    try {
      event = decodeEventLog({
        abi: freeMineAbi,
        eventName: 'ClaimOpened',
        topics: log.topics,
        data: log.data,
      })
    } catch {
      // Receipts also contain ERC20 Transfer and other unrelated events.
      continue
    }
    if (event.args.miner.toLowerCase() !== session.account.toLowerCase())
      continue
    await assertSession(session)
    return {
      miner: event.args.miner,
      shiftId: event.args.shiftId.toString(),
      claimId: event.args.claimId.toString(),
      oreAmount: event.args.oreAmount.toString(),
      blockNumber: Number(receipt.blockNumber),
    }
  }
  return null
}

/** Recheck a known hash without requesting another signature or transaction. */
export async function checkTransaction(
  session: WalletSession,
  hash: Hash,
): Promise<'pending' | 'success' | 'reverted'> {
  await assertSession(session)
  const { publicClient } = clients(session)
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash })
    await assertSession(session)
    return receipt.status
  } catch (error) {
    if (!(error instanceof TransactionReceiptNotFoundError)) throw error
    await assertSession(session)
    return 'pending'
  }
}

async function submit(
  session: WalletSession,
  action: TransactionProgress['action'],
  send: () => Promise<Hash>,
  options: TransactionOptions,
): Promise<Hash> {
  await assertSession(session, options.signal)
  options.onProgress?.({ action, status: 'signature' })
  const hash = await send()
  options.onProgress?.({ action, status: 'pending', hash })
  const { publicClient } = clients(session)
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    signal: options.signal,
    timeout: 180_000,
    onReplaced: ({ reason, transaction }) => {
      if (reason === 'cancelled' || reason === 'replaced') {
        options.onProgress?.({
          action,
          status: 'failed',
          hash: transaction.hash,
        })
        throw new Error('Транзакция отменена или заменена в кошельке')
      }
      options.onProgress?.({
        action,
        status: 'pending',
        hash: transaction.hash,
      })
    },
  })
  if (receipt.status !== 'success') {
    options.onProgress?.({
      action,
      status: 'failed',
      hash: receipt.transactionHash,
    })
    throw new Error('Транзакция завершилась с ошибкой в сети')
  }
  options.onProgress?.({
    action,
    status: 'confirmed',
    hash: receipt.transactionHash,
  })
  return receipt.transactionHash
}

export async function buyOre(
  session: WalletSession,
  freeMine: string,
  input: string,
  expected: { dollar: string; entryPrice: bigint },
  options: TransactionOptions = {},
): Promise<Hash> {
  await assertSession(session, options.signal)
  const address = getAddress(freeMine)
  const { publicClient, walletClient } = clients(session)
  const balances = await readWalletBalances(session, freeMine)
  const ensureQuote = (dollar: string, entryPrice: bigint) => {
    if (
      dollar.toLowerCase() !== expected.dollar.toLowerCase() ||
      entryPrice !== expected.entryPrice
    ) {
      throw new Error(
        'Цена или долларовый токен изменились. Обновите данные и проверьте сумму покупки',
      )
    }
  }
  ensureQuote(balances.dollar, balances.entryPrice)
  const amount = parseTokenAmount(input, balances.dollarDecimals)
  if (amount > balances.dollarBalance)
    throw new Error('Недостаточно долларовых токенов')
  if (quoteOre(amount, balances.dollarDecimals, balances.entryPrice) === 0n)
    throw new Error('Сумма покупки слишком мала')
  const allowance = await publicClient.readContract({
    address: balances.dollar,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [session.account, address],
  })
  if (allowance < amount) {
    // Reset an existing allowance first for tokens that enforce a zero-to-value approval.
    for (const approval of allowance > 0n ? [0n, amount] : [amount]) {
      await assertSession(session, options.signal)
      const { request } = await publicClient.simulateContract({
        address: balances.dollar,
        abi: erc20Abi,
        functionName: 'approve',
        args: [address, approval],
        account: session.account,
      })
      await submit(
        session,
        approval === 0n ? 'approval-reset' : 'approval',
        () => walletClient.writeContract(request),
        options,
      )
    }
  }
  await assertSession(session, options.signal)
  const [currentDollar, currentPrice] = await Promise.all([
    publicClient.readContract({
      address,
      abi: freeMineAbi,
      functionName: 'dollar',
    }),
    publicClient.readContract({
      address,
      abi: freeMineAbi,
      functionName: 'entryPrice',
    }),
  ])
  ensureQuote(currentDollar, currentPrice)
  const { request } = await publicClient.simulateContract({
    address,
    abi: freeMineAbi,
    functionName: 'buy',
    args: [amount],
    account: session.account,
  })
  return submit(
    session,
    'purchase',
    () => walletClient.writeContract(request),
    options,
  )
}

export async function openClaim(
  session: WalletSession,
  freeMine: string,
  input: string,
  options: TransactionOptions = {},
): Promise<Hash> {
  await assertSession(session, options.signal)
  const amount = parseTokenAmount(input, 18)
  if (amount <= ONE_ORE) throw new Error('Для заявки нужно больше 1 MagicOre')
  const balances = await readWalletBalances(session, freeMine)
  if (amount > balances.oreBalance) throw new Error('Недостаточно MagicOre')
  const { publicClient, walletClient } = clients(session)
  // FreeMine owns MagicOre and locks tokens directly; no approval is required.
  const { request } = await publicClient.simulateContract({
    address: getAddress(freeMine),
    abi: freeMineAbi,
    functionName: 'openClaim',
    args: [amount],
    account: session.account,
  })
  return submit(
    session,
    'open-claim',
    () => walletClient.writeContract(request),
    options,
  )
}

async function closeClaim(
  session: WalletSession,
  freeMine: string,
  shiftId: string,
  claimId: string,
  redeem: boolean,
  options: TransactionOptions,
): Promise<Hash> {
  await assertSession(session, options.signal)
  const address = getAddress(freeMine)
  const args = [
    parseTokenAmount(shiftId, 0),
    parseTokenAmount(claimId, 0),
  ] as const
  const { publicClient, walletClient } = clients(session)
  const claim = await publicClient.readContract({
    address,
    abi: freeMineAbi,
    functionName: 'getClaim',
    args,
  })
  if (claim.miner.toLowerCase() !== session.account.toLowerCase())
    throw new Error('Эта заявка принадлежит другому аккаунту')
  if (redeem) {
    const shift = await publicClient.readContract({
      address,
      abi: freeMineAbi,
      functionName: 'shifts',
      args: [args[0]],
    })
    if (!shift[0]) throw new Error('Смена ещё не профинансирована')
  }
  const { request } = await publicClient.simulateContract({
    address,
    abi: freeMineAbi,
    functionName: redeem ? 'redeemClaim' : 'cancelClaim',
    args,
    account: session.account,
  })
  return submit(
    session,
    redeem ? 'redeem-claim' : 'cancel-claim',
    () => walletClient.writeContract(request),
    options,
  )
}

export function cancelClaim(
  session: WalletSession,
  freeMine: string,
  shiftId: string,
  claimId: string,
  options: TransactionOptions = {},
) {
  return closeClaim(session, freeMine, shiftId, claimId, false, options)
}

export function redeemClaim(
  session: WalletSession,
  freeMine: string,
  shiftId: string,
  claimId: string,
  options: TransactionOptions = {},
) {
  return closeClaim(session, freeMine, shiftId, claimId, true, options)
}
