import { useState } from 'react'
import { Download, Search } from 'lucide-react'

import { api } from '../lib/api'
import {
  claimPayout,
  date,
  dollarDecimals,
  errorMessage,
  explorer,
  ZERO_ADDRESS,
} from '../lib/format'
import type { ApiStatus, PublicSnapshot } from '../lib/types'
import { Address, Amount, Empty, ExternalLink, Panel } from './ui'

export function FundData({
  data,
  status,
}: {
  data: PublicSnapshot
  status: ApiStatus | null
}) {
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(10)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const { chain, fund } = data
  const holders = Object.entries(fund.magicOre.holders).filter(([address]) =>
    address.toLowerCase().includes(search.toLowerCase()),
  )
  const claims = Object.values(fund.freeMine.claims)
  const download = async () => {
    setDownloading(true)
    setDownloadError(null)
    try {
      const blob = await api.getBackup()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'free-mine-backup.json.gz'
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    } catch (error) {
      setDownloadError(errorMessage(error))
    } finally {
      setDownloading(false)
    }
  }
  return (
    <>
      <div className="section-intro">
        <p>Публичный снимок фонда и параметры контрактов</p>
        <button
          className="button secondary"
          onClick={() => void download()}
          disabled={downloading}
        >
          <Download size={16} />
          {downloading ? 'Скачивание…' : 'Скачать снимок'}
        </button>
      </div>
      {downloadError && (
        <p className="notice error" role="alert">
          {downloadError}
        </p>
      )}
      <div className="two-columns">
        <Panel title="Контракты">
          <dl className="definition-list">
            <div>
              <dt>MagicOre · {fund.magicOre.name}</dt>
              <dd>
                <Address value={chain.magicOre} />
              </dd>
            </div>
            <div>
              <dt>FreeMine</dt>
              <dd>
                <Address value={chain.freeMine} />
              </dd>
            </div>
            <div>
              <dt>OreVein</dt>
              <dd>
                <Address value={chain.oreVein} />
              </dd>
            </div>
            <div>
              <dt>Текущий доллар · {fund.freeMine.dollar.decimals} знаков</dt>
              <dd>
                <Address value={fund.freeMine.dollar.address} />
              </dd>
            </div>
            <div>
              <dt>Транзакция развёртывания</dt>
              <dd>
                <ExternalLink href={explorer(chain.deploymentTx, 'tx')}>
                  В обозревателе
                </ExternalLink>
              </dd>
            </div>
            <div>
              <dt>Сеть</dt>
              <dd>Avalanche C-Chain · {chain.chainId}</dd>
            </div>
            <div>
              <dt>
                Токен {fund.magicOre.symbol} · {fund.magicOre.decimals} знаков
              </dt>
              <dd>
                <Amount
                  value={fund.magicOre.totalSupply}
                  symbol={fund.magicOre.symbol}
                />
              </dd>
            </div>
            <div>
              <dt>
                Цена входа · обновлена {date(fund.freeMine.priceUpdatedAt)}
              </dt>
              <dd>
                $<Amount value={fund.freeMine.entryPrice} places={6} />
              </dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Обновление данных">
          <dl className="definition-list">
            <div>
              <dt>Состояние</dt>
              <dd>
                {status
                  ? status.running
                    ? 'Синхронизация'
                    : status.lastError
                      ? 'Ошибка синхронизации'
                      : 'Ожидание следующего обновления'
                  : 'Статус недоступен'}
              </dd>
            </div>
            <div>
              <dt>Снимок от</dt>
              <dd>{date(data.updatedAt)}</dd>
            </div>
            <div>
              <dt>Блок снимка</dt>
              <dd>
                <ExternalLink
                  href={explorer(String(data.block.number), 'block')}
                >
                  {data.block.number.toLocaleString('ru-RU')}
                </ExternalLink>
              </dd>
            </div>
            <div>
              <dt>Время блока</dt>
              <dd>{date(data.block.timestamp)}</dd>
            </div>
            <div>
              <dt>Хеш блока</dt>
              <dd className="break-word numeric">{data.block.hash}</dd>
            </div>
            <div>
              <dt>Последняя попытка</dt>
              <dd>{date(status?.lastAttemptAt ?? null)}</dd>
            </div>
            <div>
              <dt>Интервал сервера</dt>
              <dd>{status ? `${status.intervalMs / 1_000} сек` : '—'}</dd>
            </div>
            <div>
              <dt>Формат снимка</dt>
              <dd>{data.format}</dd>
            </div>
            {status?.block && (
              <div>
                <dt>Блок в статусе сервера</dt>
                <dd>
                  <ExternalLink href={explorer(status.block.hash, 'block')}>
                    {status.block.number.toLocaleString('ru-RU')}
                  </ExternalLink>{' '}
                  · {date(status.block.timestamp)}
                </dd>
              </div>
            )}
            {status?.updatedAt && (
              <div>
                <dt>Обновление в статусе сервера</dt>
                <dd>{date(status.updatedAt)}</dd>
              </div>
            )}
          </dl>
          {status?.lastError && (
            <p className="notice error break-word">{status.lastError}</p>
          )}
        </Panel>
      </div>
      <Panel title="Управление фондом">
        <div className="two-columns governance">
          <dl className="definition-list">
            <div>
              <dt>Владелец OreVein</dt>
              <dd>
                <Address value={fund.oreVein.owner} />
              </dd>
            </div>
            <div>
              <dt>Владелец FreeMine</dt>
              <dd>
                <Address value={fund.freeMine.owner} />
              </dd>
            </div>
            <div>
              <dt>Владелец MagicOre</dt>
              <dd>
                <Address value={fund.magicOre.owner} />
              </dd>
            </div>
            <div>
              <dt>Предложенный владелец OreVein</dt>
              <dd>
                {fund.oreVein.pendingOwner === ZERO_ADDRESS ? (
                  'Не назначен'
                ) : (
                  <Address value={fund.oreVein.pendingOwner} />
                )}
              </dd>
            </div>
            <div>
              <dt>FreeMine в OreVein</dt>
              <dd>
                <Address value={fund.oreVein.freeMine} />
              </dd>
            </div>
            <div>
              <dt>MagicOre в FreeMine</dt>
              <dd>
                <Address value={fund.freeMine.magicOre} />
              </dd>
            </div>
            <div>
              <dt>Метаданные контракта</dt>
              <dd className="break-word">
                {fund.oreVein.contractURI ? (
                  /^https?:\/\//i.test(fund.oreVein.contractURI) ? (
                    <ExternalLink href={fund.oreVein.contractURI}>
                      Открыть метаданные
                    </ExternalLink>
                  ) : (
                    fund.oreVein.contractURI
                  )
                ) : (
                  'Не заданы'
                )}
              </dd>
            </div>
          </dl>
          <div>
            <h3>Администраторы</h3>
            {fund.oreVein.admins.length ? (
              <ul className="address-list">
                {fund.oreVein.admins.map(address => (
                  <li key={address}>
                    <Address value={address} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Не назначены</p>
            )}
            <h3>Преемники</h3>
            {Object.keys(fund.oreVein.successors).length ? (
              <dl className="definition-list">
                {Object.entries(fund.oreVein.successors).map(
                  ([address, timestamp]) => (
                    <div key={address}>
                      <dt>
                        {address === ZERO_ADDRESS ? (
                          'Отказ от полномочий'
                        ) : (
                          <Address value={address} />
                        )}
                      </dt>
                      <dd>{date(timestamp)}</dd>
                    </div>
                  ),
                )}
              </dl>
            ) : (
              <p className="muted">Не назначены</p>
            )}
            <p className="panel-note">
              Время означает доступность получения полномочий. Передача не
              происходит автоматически.
            </p>
          </div>
        </div>
      </Panel>
      <Panel
        title="Держатели MagicOre"
        aside={
          <span className="tag">
            {Object.keys(fund.magicOre.holders).length} адресов
          </span>
        }
      >
        <label className="search">
          <Search size={17} />
          <input
            value={search}
            onChange={event => {
              setSearch(event.target.value)
              setLimit(10)
            }}
            placeholder="Поиск по адресу"
            aria-label="Поиск держателя по адресу"
          />
        </label>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Адрес</th>
                <th className="align-right">Баланс {fund.magicOre.symbol}</th>
              </tr>
            </thead>
            <tbody>
              {holders.slice(0, limit).map(([address, balance]) => (
                <tr key={address}>
                  <td>
                    <Address value={address} full />
                    {address.toLowerCase() === chain.freeMine.toLowerCase() && (
                      <span className="tag">FreeMine · включая заявки</span>
                    )}
                  </td>
                  <td className="align-right">
                    <Amount value={balance} places={6} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {holders.length === 0 && (
          <Empty>{search ? 'Адрес не найден' : 'Держателей пока нет'}</Empty>
        )}
        {holders.length > limit && (
          <button
            className="button secondary show-more"
            onClick={() => setLimit(value => value + 50)}
          >
            Показать ещё · {holders.length - limit}
          </button>
        )}
      </Panel>
      <Panel
        title="Смены вывода"
        aside={
          <span className="tag">Текущая № {fund.freeMine.currentShiftId}</span>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Смена</th>
                <th>Статус</th>
                <th>MagicOre в заявках</th>
                <th>Цена выплаты</th>
                <th>Доллар смены</th>
                <th>Финансирование</th>
                <th>Последняя заявка</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(fund.freeMine.shifts).map(([id, shift]) => (
                <tr key={id}>
                  <td>#{id}</td>
                  <td>
                    <span className={`tag ${shift.funded ? 'positive' : ''}`}>
                      {shift.funded
                        ? 'Профинансирована'
                        : id === fund.freeMine.currentShiftId
                          ? 'Открыта'
                          : 'Не профинансирована'}
                    </span>
                  </td>
                  <td>
                    <Amount value={shift.oreAmount} />
                  </td>
                  <td>
                    {shift.funded ? (
                      <>
                        $<Amount value={shift.price} places={6} />
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {shift.funded ? (
                      <>
                        <Address value={shift.dollar} />
                        <small className="block muted">
                          Масштаб: {shift.dollarScale}
                        </small>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{date(shift.fundedAt)}</td>
                  <td>#{shift.currentClaimId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="panel-note">
          Сервер хранит текущую, предыдущую смену и более ранние смены с
          активными заявками
        </p>
      </Panel>
      <Panel
        title="Все активные заявки"
        aside={<span className="tag">{claims.length}</span>}
      >
        {claims.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Смена / заявка</th>
                  <th>Участник</th>
                  <th>MagicOre</th>
                  <th>К выплате</th>
                </tr>
              </thead>
              <tbody>
                {claims.map(claim => {
                  const shift = fund.freeMine.shifts[claim.shiftId]
                  const precision = shift
                    ? dollarDecimals(shift.dollarScale)
                    : null
                  return (
                    <tr key={`${claim.shiftId}:${claim.claimId}`}>
                      <td>
                        #{claim.shiftId} / #{claim.claimId}
                      </td>
                      <td>
                        <Address value={claim.miner} />
                      </td>
                      <td>
                        <Amount value={claim.oreAmount} />
                      </td>
                      <td>
                        {shift?.funded && precision !== null ? (
                          <>
                            <Amount
                              value={claimPayout(
                                claim.oreAmount,
                                shift.price,
                                shift.dollarScale,
                              )}
                              decimals={precision}
                              places={6}
                            />
                            <Address value={shift.dollar} />
                          </>
                        ) : (
                          'Ожидает финансирования'
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Активных заявок нет</Empty>
        )}
      </Panel>
    </>
  )
}
