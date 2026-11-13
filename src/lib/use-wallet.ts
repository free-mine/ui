import { useCallback, useEffect, useRef, useState } from 'react'

import {
  AVALANCHE_CHAIN_ID,
  connectWallet,
  discoverWallets,
  readWalletBalances,
  subscribeWallet,
  switchToAvalanche,
  walletErrorMessage,
} from './wallet'
import type { WalletBalances, WalletOption, WalletSession } from './wallet'

export function useWallet(freeMine?: string) {
  const [wallets, setWallets] = useState<WalletOption[]>([])
  const [session, setSession] = useState<WalletSession | null>(null)
  const [balances, setBalances] = useState<WalletBalances | null>(null)
  const [chainId, setChainId] = useState<number>(AVALANCHE_CHAIN_ID)
  const [connecting, setConnecting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const connectionVersion = useRef(0)
  const invalidate = useCallback(() => {
    requestId.current++
  }, [])

  useEffect(() => discoverWallets(setWallets), [])

  const disconnect = useCallback(() => {
    requestId.current++
    connectionVersion.current++
    setSession(null)
    setBalances(null)
    setError(null)
    setLoading(false)
    setConnecting(false)
  }, [])

  useEffect(() => {
    if (!session) return
    return subscribeWallet(session, {
      onAccountsChanged(accounts) {
        requestId.current++
        connectionVersion.current++
        setConnecting(false)
        setBalances(null)
        setError(null)
        if (accounts[0])
          setSession({ provider: session.provider, account: accounts[0] })
        else disconnect()
      },
      onChainChanged(id) {
        requestId.current++
        setChainId(id)
        setBalances(null)
        setLoading(false)
        setError(null)
      },
      onDisconnect: disconnect,
    })
  }, [session, disconnect])

  const refresh = useCallback(async () => {
    if (!session || !freeMine || chainId !== AVALANCHE_CHAIN_ID) return
    const id = ++requestId.current
    setLoading(true)
    try {
      const result = await readWalletBalances(session, freeMine)
      if (id !== requestId.current) return
      setBalances(result)
      setError(null)
    } catch (cause) {
      if (id !== requestId.current) return
      setBalances(null)
      setError(walletErrorMessage(cause))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [session, freeMine, chainId])

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0)
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 30_000)
    return () => {
      invalidate()
      window.clearTimeout(initial)
      window.clearInterval(interval)
    }
  }, [refresh, invalidate])

  const connect = async (wallet: WalletOption) => {
    const version = ++connectionVersion.current
    setConnecting(true)
    setError(null)
    try {
      const next = await connectWallet(wallet.provider)
      if (version !== connectionVersion.current) return false
      setBalances(null)
      setChainId(AVALANCHE_CHAIN_ID)
      setSession(next)
      return true
    } catch (cause) {
      if (version === connectionVersion.current)
        setError(walletErrorMessage(cause))
      return false
    } finally {
      if (version === connectionVersion.current) setConnecting(false)
    }
  }

  const switchChain = async () => {
    if (!session) return
    const version = connectionVersion.current
    setConnecting(true)
    setError(null)
    try {
      await switchToAvalanche(session.provider)
      if (version !== connectionVersion.current) return
      setChainId(AVALANCHE_CHAIN_ID)
    } catch (cause) {
      if (version === connectionVersion.current)
        setError(walletErrorMessage(cause))
    } finally {
      if (version === connectionVersion.current) setConnecting(false)
    }
  }

  return {
    wallets,
    session,
    balances,
    chainId,
    connecting,
    loading,
    error,
    connect,
    disconnect,
    refresh,
    switchChain,
  }
}

export type WalletState = ReturnType<typeof useWallet>
