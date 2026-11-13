import { decimal, uniswap } from '../lib/format'
import type {
  PairAmounts,
  PublicSnapshot,
  TokenBalance,
  UniswapPosition,
} from '../lib/types'
import { Address, Amount, Empty, ExternalLink, Panel, TokenIcon } from './ui'

function BalanceTable({ tokens }: { tokens: TokenBalance[] }) {
  return tokens.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Актив</th>
            <th>Контракт</th>
            <th className="align-right">Количество</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map(token => (
            <tr key={token.address}>
              <td>
                <span className="inline-token">
                  <TokenIcon symbol={token.symbol} />
                  {token.symbol}
                </span>
              </td>
              <td>
                <Address value={token.address} />
              </td>
              <td className="align-right">
                <Amount value={token.amount} decimals={token.decimals} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty>Нет размещённых активов</Empty>
  )
}

function PairAmount({
  pair,
  position,
  tokens,
}: {
  pair: PairAmounts
  position: UniswapPosition
  tokens: TokenBalance[]
}) {
  return (
    <div className="pair-amounts">
      {(['base', 'quote'] as const).map(side => {
        const symbol =
          side === 'base' ? position.baseSymbol : position.quoteSymbol
        const token = tokens.find(item => item.symbol === symbol)
        return (
          <span key={side}>
            {token ? (
              <Amount
                value={pair[side]}
                decimals={token.decimals}
                symbol={symbol}
                places={6}
              />
            ) : (
              <span>
                {pair[side]} минимальных единиц {symbol}
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}

export function Portfolio({ data }: { data: PublicSnapshot }) {
  const { portfolio } = data
  const tokens = [
    ...portfolio.balances,
    ...portfolio.aave.supplies,
    ...portfolio.aave.debts,
  ]
  return (
    <>
      <div className="section-intro">
        <div>
          <span className="eyebrow">ORE VEIN</span>
          <p>Свободные активы, кредитование и ликвидность фонда</p>
        </div>
        <ExternalLink
          href={`https://debank.com/profile/${data.chain.oreVein}`}
          className="button secondary"
        >
          Открыть DeBank
        </ExternalLink>
      </div>
      <Panel
        title="Свободные средства"
        aside={<Address value={data.chain.oreVein} />}
      >
        <div className="native-balance">
          <TokenIcon symbol="AVAX" />
          <span>Баланс для сетевых комиссий</span>
          <Amount value={portfolio.nativeBalance.amount} symbol="AVAX" />
        </div>
        <BalanceTable tokens={portfolio.balances} />
      </Panel>
      <div className="protocol-heading">
        <span className="protocol-icon aave-icon">A</span>
        <h2>Aave</h2>
        <span
          className={`tag ${portfolio.aave.healthFactor !== null && Number(portfolio.aave.healthFactor) < 1.2 ? 'warning' : ''}`}
        >
          Health Factor:{' '}
          {portfolio.aave.healthFactor === null
            ? 'нет долга'
            : decimal(portfolio.aave.healthFactor, 4)}
        </span>
      </div>
      <div className="two-columns">
        <Panel title="Предоставлено">
          <BalanceTable tokens={portfolio.aave.supplies} />
        </Panel>
        <Panel title="Заёмные средства">
          {portfolio.aave.debts.length === 0 ? (
            <Empty>Заёмных средств нет</Empty>
          ) : (
            portfolio.aave.debts.map(debt => (
              <div className="debt-row" key={debt.address}>
                <div className="asset-row">
                  <TokenIcon symbol={debt.symbol} />
                  <div className="asset-name">
                    <strong>{debt.symbol}</strong>
                    <Address value={debt.address} />
                  </div>
                  <Amount value={debt.amount} decimals={debt.decimals} />
                </div>
                <div className="debt-details">
                  <span>
                    Плавающая ставка{' '}
                    <Amount
                      value={debt.variableDebt}
                      decimals={debt.decimals}
                    />
                  </span>
                  <span>
                    Фиксированная ставка{' '}
                    <Amount value={debt.stableDebt} decimals={debt.decimals} />
                  </span>
                </div>
              </div>
            ))
          )}
        </Panel>
      </div>
      <div className="protocol-heading">
        <span className="protocol-icon uni-icon">U</span>
        <h2>Uniswap V3</h2>
        <span className="tag">
          {portfolio.uniswap.positions.length} позиций
        </span>
      </div>
      <Panel title="Торговые пары">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Пара</th>
                <th>Комиссия</th>
                <th>Цена базового актива</th>
                <th>Пул</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.uniswap.pools.map(pool => (
                <tr key={`${pool.baseSymbol}-${pool.quoteSymbol}-${pool.fee}`}>
                  <td>
                    <strong>
                      {pool.baseSymbol} / {pool.quoteSymbol}
                    </strong>
                  </td>
                  <td>{decimal(String(pool.fee / 10_000))}%</td>
                  <td>
                    {pool.price === null
                      ? 'Недоступна'
                      : `${decimal(pool.price, 6)} ${pool.quoteSymbol}`}
                  </td>
                  <td>
                    {pool.address ? (
                      <ExternalLink href={uniswap(pool.address)}>
                        Uniswap
                      </ExternalLink>
                    ) : (
                      'Пул ещё не создан'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {portfolio.uniswap.pools.length === 0 && (
          <Empty>Торговых пар нет</Empty>
        )}
      </Panel>
      {portfolio.uniswap.positions.length === 0 ? (
        <Panel title="Позиции ликвидности">
          <Empty>Открытых позиций нет</Empty>
        </Panel>
      ) : (
        <div className="positions-grid">
          {portfolio.uniswap.positions.map(position => (
            <Panel
              key={position.tokenId}
              title={`${position.baseSymbol} / ${position.quoteSymbol}`}
              aside={
                <ExternalLink href={uniswap(position.pool)}>
                  Uniswap
                </ExternalLink>
              }
            >
              <div className="position-meta">
                <span>NFT #{position.tokenId}</span>
                <span
                  className={`tag ${position.inRange ? 'positive' : 'warning'}`}
                >
                  {position.inRange ? 'В диапазоне' : 'Вне диапазона'}
                </span>
              </div>
              <div className="position-value">
                <PairAmount
                  pair={position.amounts}
                  position={position}
                  tokens={tokens}
                />
              </div>
              <div className="range-track" aria-hidden="true">
                <span className={position.inRange ? 'in-range' : 'out-range'} />
              </div>
              <div className="range-labels">
                <span>{decimal(position.range.lowerPrice, 4)}</span>
                <span>{decimal(position.range.upperPrice, 4)}</span>
              </div>
              <p className="panel-note">
                {position.range.fullRange ? 'Полный диапазон' : 'Диапазон цены'}{' '}
                в {position.quoteSymbol} · Текущая: {decimal(position.price, 6)}{' '}
                · Комиссия {decimal(String(position.fee / 10_000))}%
              </p>
              <details className="position-details">
                <summary>Начисления и параметры позиции</summary>
                <dl className="definition-list">
                  <div>
                    <dt>Новые комиссии</dt>
                    <dd>
                      <PairAmount
                        pair={position.newlyAccruedFees}
                        position={position}
                        tokens={tokens}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>Учтено к получению</dt>
                    <dd>
                      <PairAmount
                        pair={position.storedOwed}
                        position={position}
                        tokens={tokens}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>Всего к получению</dt>
                    <dd>
                      <PairAmount
                        pair={position.totalCollectable}
                        position={position}
                        tokens={tokens}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>Ликвидность (L)</dt>
                    <dd className="break-word numeric">{position.liquidity}</dd>
                  </div>
                  <div>
                    <dt>Контракт пула</dt>
                    <dd>
                      <Address value={position.pool} />
                    </dd>
                  </div>
                </dl>
                <p className="panel-note">
                  Учтённые суммы и итог к получению могут включать ранее
                  выведенный капитал. Новые комиссии — начисления после
                  последнего обновления учёта NFT.
                </p>
              </details>
            </Panel>
          ))}
        </div>
      )}
    </>
  )
}
