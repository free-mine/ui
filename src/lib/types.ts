export interface SnapshotBlock {
  number: number
  hash: string
  timestamp: number
}

export interface ChainIdentity {
  chainId: 43114
  deploymentTx: string
  magicOre: string
  freeMine: string
  oreVein: string
}

export interface FundClaim {
  miner: string
  shiftId: string
  claimId: string
  oreAmount: string
}

export interface FundShift {
  price: string
  dollar: string
  funded: boolean
  fundedAt: string
  oreAmount: string
  dollarScale: string
  currentClaimId: string
}

export interface FundState {
  magicOre: {
    name: string
    owner: string
    symbol: string
    decimals: number
    totalSupply: string
    holders: Record<string, string>
  }
  oreVein: {
    owner: string
    freeMine: string
    admins: string[]
    contractURI: string
    pendingOwner: string
    successors: Record<string, string>
  }
  freeMine: {
    owner: string
    magicOre: string
    entryPrice: string
    priceUpdatedAt: string
    currentShiftId: string
    claims: Record<string, FundClaim>
    shifts: Record<string, FundShift>
    dollar: { address: string; decimals: number }
  }
}

export interface TokenBalance {
  symbol: string
  address: string
  decimals: number
  amount: string
}

export interface AaveDebt extends TokenBalance {
  variableDebt: string
  stableDebt: string
}

export interface PairAmounts {
  base: string
  quote: string
}

export interface UniswapPool {
  baseSymbol: string
  quoteSymbol: string
  fee: number
  address: string | null
  price: string | null
}

export interface UniswapPosition {
  tokenId: string
  pool: string
  baseSymbol: string
  quoteSymbol: string
  fee: number
  liquidity: string
  range: {
    lowerPrice: string
    upperPrice: string
    fullRange: boolean
  }
  inRange: boolean
  price: string
  amounts: PairAmounts
  newlyAccruedFees: PairAmounts
  storedOwed: PairAmounts
  totalCollectable: PairAmounts
}

export interface PortfolioState {
  blockNumber: number
  nativeBalance: { symbol: 'AVAX'; decimals: 18; amount: string }
  balances: TokenBalance[]
  aave: {
    supplies: TokenBalance[]
    debts: AaveDebt[]
    healthFactor: string | null
  }
  uniswap: { pools: UniswapPool[]; positions: UniswapPosition[] }
}

export interface PublicSnapshot {
  format: 1
  chain: ChainIdentity
  block: SnapshotBlock
  updatedAt: string
  fund: FundState
  portfolio: PortfolioState
}

export interface ApiStatus {
  running: boolean
  lastError: string | null
  lastAttemptAt: string | null
  block: SnapshotBlock | null
  updatedAt: string | null
  intervalMs: number
}
