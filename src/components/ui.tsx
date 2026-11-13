import { useEffect, useId, useRef, type ReactNode } from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import { formatUnits } from 'viem'

import { decimal, explorer, shortAddress } from '../lib/format'

export function BrandMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="m8 16 16-9 16 9-16 9zM8 24l16 9 16-9M8 32l16 9 16-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ExternalLink({
  href,
  children,
  className = '',
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  return (
    <a
      className={`external ${className}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ArrowUpRight size={14} aria-hidden="true" />
      <span className="sr-only"> (в новой вкладке)</span>
    </a>
  )
}

export function Address({
  value,
  full = false,
}: {
  value: string
  full?: boolean
}) {
  return (
    <ExternalLink href={explorer(value)} className="address">
      <span title={value}>{full ? value : shortAddress(value)}</span>
    </ExternalLink>
  )
}

export function Amount({
  value,
  decimals = 18,
  symbol,
  places = 4,
}: {
  value: string | bigint
  decimals?: number
  symbol?: string
  places?: number
}) {
  const exact = formatUnits(BigInt(value), decimals)
  return (
    <span className="numeric" title={`${exact}${symbol ? ` ${symbol}` : ''}`}>
      {decimal(exact, places)}
      {symbol && <span className="unit"> {symbol}</span>}
    </span>
  )
}

export function TokenIcon({ symbol }: { symbol: string }) {
  const tone =
    symbol === 'AVAX' || symbol === 'WAVAX'
      ? 'avax'
      : symbol.includes('BTC')
        ? 'btc'
        : symbol.includes('USD')
          ? 'usd'
          : 'ore'
  return (
    <span className={`token-icon ${tone}`} aria-hidden="true">
      {tone === 'ore' ? (
        <BrandMark />
      ) : tone === 'avax' ? (
        'Λ'
      ) : tone === 'btc' ? (
        '₿'
      ) : (
        '$'
      )}
    </span>
  )
}

export function Panel({
  title,
  aside,
  children,
  className = '',
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={event => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="panel-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Закрыть"
          onClick={onClose}
          disabled={busy}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
