import {
  ArrowRight,
  ArrowUpRight,
  CircleDollarSign,
  Gem,
  Layers3,
  Users,
} from 'lucide-react'

import { amount, date, decimal, uniswap } from '../lib/format'
import type { PublicSnapshot } from '../lib/types'
import { Amount, BrandMark, Empty, ExternalLink, Panel, TokenIcon } from './ui'

export function Overview({
  data,
  onPortfolio,
  onAccount,
}: {
  data: PublicSnapshot
  onPortfolio: () => void
  onAccount: () => void
}) {
  const { fund, portfolio } = data
  const claims = Object.values(fund.freeMine.claims)
  const locked = claims.reduce(
    (sum, claim) => sum + BigInt(claim.oreAmount),
    0n,
  )
  const total = BigInt(fund.magicOre.totalSupply)
  const unlocked = total > locked ? total - locked : 0n
  const percent = total > 0n ? Number((locked * 10_000n) / total) / 100 : 0
  const ore = fund.magicOre.symbol
  const holders = Object.keys(fund.magicOre.holders).length
  return (
    <>
      <div className="overview-top">
        <section className="price-card">
          <div className="price-card-top">
            <span className="eyebrow">MAGIC ORE</span>
            <span className="light-tag">Цена входа</span>
          </div>
          <div className="price-value">
            <span>$</span>
            {amount(fund.freeMine.entryPrice, 18, 6)}
          </div>
          <p>
            за 1 {ore} · {date(fund.freeMine.priceUpdatedAt)}
          </p>
          <button className="button lime" onClick={onAccount}>
            Купить MagicOre <ArrowUpRight size={18} />
          </button>
          <div className="ore-art" aria-hidden="true">
            <BrandMark />
          </div>
        </section>
        <section className="supply-card panel">
          <div className="panel-heading">
            <h2>Токены фонда</h2>
            <Gem size={18} />
          </div>
          <div className="supply-content">
            <svg
              className="supply-ring"
              viewBox="0 0 120 120"
              role="img"
              aria-label={`${percent.toLocaleString('ru-RU')}% токенов в заявках на вывод`}
            >
              <circle
                cx="60"
                cy="60"
                r="48"
                fill="none"
                stroke="var(--line)"
                strokeWidth="12"
              />
              <circle
                cx="60"
                cy="60"
                r="48"
                fill="none"
                stroke="var(--green)"
                strokeWidth="12"
                pathLength="100"
                strokeDasharray={`${100 - percent} 100`}
                transform="rotate(-90 60 60)"
              />
              <text x="60" y="57" textAnchor="middle" className="ring-symbol">
                {ore}
              </text>
              <text x="60" y="75" textAnchor="middle" className="ring-label">
                в обращении
              </text>
            </svg>
            <div className="supply-legend">
              <div>
                <span className="legend-label">
                  <i />
                  Вне заявок
                </span>
                <strong>
                  <Amount value={unlocked} />
                </strong>
              </div>
              <div>
                <span className="legend-label">
                  <i className="muted-dot" />В заявках на вывод
                </span>
                <strong>
                  <Amount value={locked} />
                </strong>
              </div>
              <small>
                Всего выпущено: <Amount value={total} symbol={ore} />
              </small>
            </div>
          </div>
        </section>
      </div>
      <div className="metric-grid">
        <div className="metric">
          <span>
            <Users size={17} />
            Держателей
          </span>
          <strong>{holders.toLocaleString('ru-RU')}</strong>
          <small>Адреса с балансом {ore}</small>
        </div>
        <div className="metric">
          <span>
            <Layers3 size={17} />
            Позиции Uniswap
          </span>
          <strong>{portfolio.uniswap.positions.length}</strong>
          <small>Ликвидность в торговых парах</small>
        </div>
        <div className="metric">
          <span>
            <CircleDollarSign size={17} />
            Health Factor Aave
          </span>
          <strong>
            {portfolio.aave.healthFactor === null
              ? '—'
              : decimal(portfolio.aave.healthFactor, 2)}
          </strong>
          <small>
            {portfolio.aave.healthFactor === null
              ? 'Нет долга'
              : 'Показатель обеспеченности долга'}
          </small>
        </div>
        <div className="metric">
          <span>
            <ArrowUpRight size={17} />
            Заявки на вывод
          </span>
          <strong>{claims.length}</strong>
          <small>Открытая смена № {fund.freeMine.currentShiftId}</small>
        </div>
      </div>
      <div className="two-columns">
        <Panel
          title="На балансе OreVein"
          aside={
            <button className="text-button" onClick={onPortfolio}>
              Все активы <ArrowRight size={15} />
            </button>
          }
        >
          <div className="asset-list">
            {[portfolio.nativeBalance, ...portfolio.balances].map(
              (token, index) => (
                <div className="asset-row" key={`${token.symbol}-${index}`}>
                  <TokenIcon symbol={token.symbol} />
                  <div className="asset-name">
                    <strong>{token.symbol}</strong>
                    <small>
                      {token.symbol === 'AVAX'
                        ? 'Нативный токен'
                        : 'Свободный баланс'}
                    </small>
                  </div>
                  <Amount value={token.amount} decimals={token.decimals} />
                </div>
              ),
            )}
          </div>
        </Panel>
        <Panel title="Рынки" aside={<span className="tag">Uniswap V3</span>}>
          {portfolio.uniswap.pools.length === 0 ? (
            <Empty>Торговые пары пока не добавлены</Empty>
          ) : (
            <div className="market-list">
              {portfolio.uniswap.pools.map(pool => (
                <div
                  className="market-row"
                  key={`${pool.baseSymbol}-${pool.quoteSymbol}-${pool.fee}`}
                >
                  <div className="pair-icons">
                    <TokenIcon symbol={pool.baseSymbol} />
                    <TokenIcon symbol={pool.quoteSymbol} />
                  </div>
                  <div className="asset-name">
                    <strong>
                      {pool.baseSymbol} / {pool.quoteSymbol}
                    </strong>
                    <small>
                      Комиссия {decimal(String(pool.fee / 10_000), 4)}%
                    </small>
                  </div>
                  <div className="market-price">
                    <strong>
                      {pool.price === null ? '—' : decimal(pool.price, 4)}
                    </strong>
                    <small>{pool.quoteSymbol}</small>
                  </div>
                  {pool.address && (
                    <ExternalLink href={uniswap(pool.address)}>
                      <span className="sr-only">
                        {pool.baseSymbol} / {pool.quoteSymbol} на Uniswap
                      </span>
                    </ExternalLink>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="panel-note">
            Цены пар и балансы относятся к одному блоку сети
          </p>
        </Panel>
      </div>
      <div className="transparency-strip">
        <div className="strip-icon">
          <BrandMark />
        </div>
        <div>
          <strong>Капитал открыт для проверки</strong>
          <p>Состав портфеля, размещение и обязательства — в данных фонда</p>
        </div>
        <ExternalLink
          href={`https://debank.com/profile/${data.chain.oreVein}`}
          className="button secondary"
        >
          Портфель в DeBank
        </ExternalLink>
      </div>
    </>
  )
}
