import { useEffect, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  Database,
  Layers3,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Wallet,
  WifiOff,
} from 'lucide-react'

import { Account } from './components/account'
import { FundData } from './components/fund-data'
import { Overview } from './components/overview'
import { Portfolio } from './components/portfolio'
import { BrandMark, ExternalLink, Modal } from './components/ui'
import { date, shortAddress } from './lib/format'
import { useSnapshot } from './lib/use-snapshot'
import { useWallet } from './lib/use-wallet'

const pages = [
  {
    id: 'overview',
    label: 'Обзор фонда',
    title: 'Капитал в работе',
    description: 'Состояние Free Mine и активы фонда в Avalanche',
    icon: LayoutDashboard,
  },
  {
    id: 'account',
    label: 'Мой кошелёк',
    title: 'Мой кошелёк',
    description: 'Ваши токены, покупки и заявки на вывод',
    icon: Wallet,
  },
  {
    id: 'portfolio',
    label: 'Размещение капитала',
    title: 'Размещение капитала',
    description: 'Активы OreVein в протоколах и на балансе',
    icon: Layers3,
  },
  {
    id: 'data',
    label: 'Данные фонда',
    title: 'Данные фонда',
    description: 'Контракты, участники и публичные реестры',
    icon: Database,
  },
] as const
type Page = (typeof pages)[number]['id']
const currentPage = (): Page =>
  pages.find(page => `#${page.id}` === window.location.hash)?.id ?? 'overview'

export default function App() {
  const [page, setPage] = useState<Page>(currentPage)
  const [walletPicker, setWalletPicker] = useState(false)
  const [now, setNow] = useState(Date.now)
  const { snapshot, status, error, loading, refresh } = useSnapshot()
  const wallet = useWallet(snapshot?.chain.freeMine)
  const selected = pages.find(item => item.id === page) ?? pages[0]
  const stale =
    snapshot &&
    now - Date.parse(snapshot.updatedAt) >
      Math.max((status?.intervalMs ?? 3_600_000) * 2, 120_000)
  const degraded = !!error || !!status?.lastError || stale

  useEffect(() => {
    const onHash = () => setPage(currentPage())
    window.addEventListener('hashchange', onHash)
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.clearInterval(timer)
    }
  }, [])

  const navigate = (next: Page) => {
    window.location.hash = next
  }

  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={event => {
          event.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >
        К содержимому
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#overview"
          aria-label="Free Mine — обзор фонда"
        >
          <span className="brand-mark">
            <BrandMark />
          </span>
          <span>
            free mine<span className="brand-caption">ИНВЕСТИЦИОННЫЙ ФОНД</span>
          </span>
        </a>
        <span className="nav-caption">ЛИЧНЫЙ КАБИНЕТ</span>
        <nav aria-label="Основная навигация">
          {pages.map(item => (
            <a
              key={item.id}
              className={item.id === page ? 'nav-item active' : 'nav-item'}
              href={`#${item.id}`}
              aria-current={item.id === page ? 'page' : undefined}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === page && (
                <ChevronRight size={15} className="nav-arrow" />
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="network-card">
            <span className="avalanche-mark">Λ</span>
            <div>
              <strong>Avalanche</strong>
              <span>C-Chain · 43114</span>
            </div>
            <span className="connection-dot" />
          </div>
          <ExternalLink href="https://github.com/free-mine">
            Исходный код фонда
          </ExternalLink>
          <div className="sidebar-wordmark" aria-hidden="true">
            FM<span>®</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Free Mine</span>
            <ChevronRight size={13} />
            <strong>{selected.label}</strong>
          </div>
          <div className="topbar-actions">
            <span className="network-pill">
              <span className="connection-dot" />
              Avalanche C-Chain
            </span>
            <button
              className="button primary wallet-button"
              onClick={() =>
                wallet.session ? navigate('account') : setWalletPicker(true)
              }
            >
              <Wallet size={16} />
              {wallet.session
                ? shortAddress(wallet.session.account)
                : 'Подключить кошелёк'}
            </button>
            {wallet.session && (
              <button
                className="icon-button"
                onClick={wallet.disconnect}
                aria-label="Отключить кошелёк"
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                FREE MINE /{' '}
                {String(pages.indexOf(selected) + 1).padStart(2, '0')}
              </span>
              <h1>{selected.title}</h1>
              <p>{selected.description}</p>
            </div>
            <button
              className="icon-button refresh-button"
              aria-label="Обновить данные"
              title="Обновить данные"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw size={19} className={loading ? 'spin' : ''} />
            </button>
          </div>
          <div
            className={`sync-line ${degraded ? 'degraded' : ''}`}
            role="status"
          >
            <Activity size={14} />
            <span>
              {snapshot
                ? `Снимок от ${date(snapshot.updatedAt)}`
                : loading
                  ? 'Загрузка состояния фонда…'
                  : 'Нет доступного снимка'}
            </span>
            {snapshot && (
              <span className="block-label">
                Блок {snapshot.block.number.toLocaleString('ru-RU')}
              </span>
            )}
            {status?.running && (
              <span className="tag">Сервер обновляет данные</span>
            )}
          </div>
          {degraded && (
            <div className="notice warning" role="alert">
              <WifiOff size={18} />
              <div>
                <strong>
                  {error ??
                    (status?.lastError
                      ? 'Сервер не смог обновить снимок'
                      : 'Снимок давно не обновлялся')}
                </strong>
                {snapshot && (
                  <p>
                    Показаны последние доступные данные от{' '}
                    {date(snapshot.updatedAt)}
                  </p>
                )}
                {status?.lastError && (
                  <p className="break-word">{status.lastError}</p>
                )}
              </div>
              <button
                className="text-button"
                onClick={() => void refresh()}
                disabled={loading}
              >
                Повторить <RefreshCw size={14} />
              </button>
            </div>
          )}
          {!snapshot &&
            (loading ? (
              <div className="skeleton-grid" aria-label="Загрузка данных">
                <div />
                <div />
                <div />
                <div />
              </div>
            ) : (
              <section className="unavailable">
                <span className="unavailable-icon">
                  <Database size={30} />
                </span>
                <h2>Данные фонда пока недоступны</h2>
                <p>
                  Дождитесь завершения синхронизации сервера или повторите
                  запрос
                </p>
                <button
                  className="button primary"
                  onClick={() => void refresh()}
                >
                  Повторить загрузку <ArrowUpRight size={17} />
                </button>
              </section>
            ))}
          {snapshot && (
            <>
              {page === 'overview' && (
                <Overview
                  data={snapshot}
                  onPortfolio={() => navigate('portfolio')}
                  onAccount={() => navigate('account')}
                />
              )}
              <div hidden={page !== 'account'}>
                <Account
                  key={`${wallet.session?.account ?? 'disconnected'}:${wallet.chainId}:${snapshot.chain.freeMine}`}
                  data={snapshot}
                  wallet={wallet}
                  onConnect={() => setWalletPicker(true)}
                  onRefresh={refresh}
                />
              </div>
              {page === 'portfolio' && <Portfolio data={snapshot} />}
              {page === 'data' && <FundData data={snapshot} status={status} />}
            </>
          )}
        </main>
        <footer className="footer">
          <span>
            Free Mine <span className="footer-separator">/</span> Avalanche
            C-Chain
          </span>
          <span>
            Проверяемые данные сети <span className="connection-dot" />
          </span>
        </footer>
      </div>
      {walletPicker && (
        <Modal
          title="Подключить кошелёк"
          onClose={() => setWalletPicker(false)}
          busy={wallet.connecting}
        >
          <p className="modal-description">
            Выберите браузерный кошелёк. Для операций используется Avalanche
            C-Chain.
          </p>
          <div className="wallet-options">
            {wallet.wallets.length === 0 ? (
              <div className="empty-wallet">
                <Wallet size={30} />
                <h3>Кошельки не обнаружены</h3>
                <p>
                  Установите MetaMask или Rabby, затем обновите страницу. На
                  телефоне откройте сайт во встроенном браузере кошелька.
                </p>
                <div>
                  <ExternalLink href="https://metamask.io/download/">
                    MetaMask
                  </ExternalLink>
                  <ExternalLink href="https://rabby.io/">Rabby</ExternalLink>
                </div>
              </div>
            ) : (
              wallet.wallets.map(option => (
                <button
                  key={option.id}
                  className="wallet-option"
                  disabled={wallet.connecting}
                  onClick={() => {
                    void wallet.connect(option).then(connected => {
                      if (connected) {
                        setWalletPicker(false)
                        navigate('account')
                      }
                    })
                  }}
                >
                  {option.icon ? (
                    <img src={option.icon} width="32" height="32" alt="" />
                  ) : (
                    <Wallet size={26} />
                  )}
                  <span>{option.name}</span>
                  <ArrowUpRight size={18} />
                </button>
              ))
            )}
          </div>
          {wallet.connecting && (
            <p className="notice" role="status">
              Подтвердите подключение и выбор сети в кошельке
            </p>
          )}
          {wallet.error && (
            <p className="notice error" role="alert">
              {wallet.error}
            </p>
          )}
          <p className="panel-note">
            Подключение открывает доступ к адресу. Любая операция с токенами
            требует отдельной подписи.
          </p>
        </Modal>
      )}
    </div>
  )
}
