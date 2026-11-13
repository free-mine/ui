import { defineChain } from 'viem'

// Declare the only supported chain directly so viem's multi-chain barrel does
// not pull unrelated networks and their Node-only modules into the browser build.
export const avalanche = defineChain({
  id: 43_114,
  name: 'Avalanche',
  blockTime: 1_700,
  nativeCurrency: { decimals: 18, name: 'Avalanche', symbol: 'AVAX' },
  rpcUrls: {
    default: { http: ['https://api.avax.network/ext/bc/C/rpc'] },
  },
  blockExplorers: {
    default: { name: 'SnowTrace', url: 'https://snowtrace.io' },
  },
  contracts: {
    multicall3: {
      address: '0xca11bde05977b3631167028862be2a173976ca11',
      blockCreated: 11_907_934,
    },
  },
})
