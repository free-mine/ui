import { useCallback, useEffect, useRef, useState } from 'react'

import { api } from './api'
import { errorMessage } from './format'
import type { ApiStatus, PublicSnapshot } from './types'

export function useSnapshot() {
  const [snapshot, setSnapshot] = useState<PublicSnapshot | null>(null)
  const [status, setStatus] = useState<ApiStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const controller = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    setLoading(true)
    const results = await Promise.allSettled([
      api.getState(current.signal),
      api.getStatus(current.signal),
    ])
    if (current.signal.aborted) return
    const [stateResult, statusResult] = results
    if (stateResult.status === 'fulfilled') {
      setSnapshot(stateResult.value)
      setError(null)
    } else {
      setError(errorMessage(stateResult.reason))
    }
    if (statusResult.status === 'fulfilled') setStatus(statusResult.value)
    else {
      setStatus(null)
      if (stateResult.status === 'fulfilled')
        setError(
          'Снимок доступен, но статус синхронизации получить не удалось.',
        )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0)
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 30_000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(interval)
      controller.current?.abort()
    }
  }, [refresh])

  return { snapshot, status, error, loading, refresh }
}
