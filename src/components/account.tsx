import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownUp,
  ArrowRight,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Wallet,
} from 'lucide-react'
import { formatUnits, type Hash } from 'viem'

import {
  amount,
  claimPayout,
  date,
  dollarDecimals,
  explorer,
} from '../lib/format'
import type { FundClaim, PublicSnapshot } from '../lib/types'
import type { WalletState } from '../lib/use-wallet'
import {
  AVALANCHE_CHAIN_ID,
  buyOre,
  cancelClaim,
  checkTransaction,
  ONE_ORE,
  openClaim,
  parseTokenAmount,
  quoteOre,
  readConfirmedClaim,
  redeemClaim,
  walletErrorMessage,
} from '../lib/wallet'
import type {
  ConfirmedClaim,
  TransactionProgress,
  WalletBalances,
} from '../lib/wallet'
import {
  Address,
  Amount,
  Empty,
  ExternalLink,
  Modal,
  Panel,
  TokenIcon,
} from './ui'

type Draft =
  | { kind: 'buy'; input: string; balances: WalletBalances }
  | { kind: 'open'; input: string; balances: WalletBalances }
  | { kind: 'cancel'; claim: FundClaim }
  | { kind: 'redeem'; claim: FundClaim }

type SubmittedTransaction = {
  hash: Hash
  action: TransactionProgress['action']
  draft: Draft
}

const actionLabels: Record<TransactionProgress['action'], string> = {
  'approval-reset': 'Сброс предыдущего разрешения',
  approval: 'Разрешение на расход токенов',
  purchase: 'Покупка MagicOre',
  'open-claim': 'Создание заявки',
  'cancel-claim': 'Отмена заявки',
  'redeem-claim': 'Получение выплаты',
}

const draftActions = {
  buy: 'purchase',
  open: 'open-claim',
  cancel: 'cancel-claim',
  redeem: 'redeem-claim',
} as const

const claimKey = (claim: FundClaim) => `${claim.shiftId}:${claim.claimId}`

export function Account({
  data,
  wallet,
  onConnect,
  onRefresh,
}: {
  data: PublicSnapshot
  wallet: WalletState
  onConnect: () => void
  onRefresh: () => Promise<void>
}) {
  const [mode, setMode] = useState<'buy' | 'open'>('buy')
  const [input, setInput] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<TransactionProgress | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ hash: Hash; label: string } | null>(
    null,
  )
  const [uncertain, setUncertain] = useState<SubmittedTransaction | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkMessage, setCheckMessage] = useState<string | null>(null)
  const [localClaims, setLocalClaims] = useState<ConfirmedClaim[]>([])
  const [closedClaims, setClosedClaims] = useState<string[]>([])
  const controller = useRef<AbortController | null>(null)
  const latestProgress = useRef<TransactionProgress | null>(null)
  const { session, balances } = wallet
  const symbol = data.fund.magicOre.symbol
  const claims = [
    ...Object.values(data.fund.freeMine.claims),
    ...localClaims.filter(
      claim =>
        claim.blockNumber > data.block.number &&
        !data.fund.freeMine.claims[claimKey(claim)],
    ),
  ].filter(
    claim =>
      claim.miner.toLowerCase() === session?.account.toLowerCase() &&
      !closedClaims.includes(claimKey(claim)),
  )

  useEffect(() => () => controller.current?.abort(), [session, wallet.chainId])

  const redemptionShift =
    draft?.kind === 'redeem'
      ? data.fund.freeMine.shifts[draft.claim.shiftId]
      : null
  const redemptionDecimals = redemptionShift
    ? dollarDecimals(redemptionShift.dollarScale)
    : null

  if (!session)
    return (
      <section className="connect-card">
        <div className="connect-icon">
          <Wallet size={32} />
        </div>
        <span className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</span>
        <h2>Ваше участие в Free Mine</h2>
        <p>
          Подключите кошелёк, чтобы увидеть баланс MagicOre и долларового
          токена, купить токены или управлять заявками на вывод
        </p>
        <button className="button primary" onClick={onConnect}>
          <Wallet size={17} />
          Подключить кошелёк
        </button>
        <span className="connect-footnote">
          MetaMask, Rabby и другие браузерные кошельки · Avalanche C-Chain
        </span>
      </section>
    )

  let inputError: string | null = null
  let quote: bigint | null = null
  if (input && balances) {
    try {
      const parsed = parseTokenAmount(
        input,
        mode === 'buy' ? balances.dollarDecimals : 18,
      )
      if (mode === 'buy') {
        quote = quoteOre(parsed, balances.dollarDecimals, balances.entryPrice)
        if (quote === 0n) inputError = 'Сумма слишком мала для покупки MagicOre'
        if (parsed > balances.dollarBalance)
          inputError = 'Недостаточно долларовых токенов'
        if (
          session.account.toLowerCase() ===
          data.fund.freeMine.owner.toLowerCase()
        )
          inputError = 'Владелец FreeMine не может покупать MagicOre'
      } else {
        if (parsed <= ONE_ORE)
          inputError = 'Заявка должна быть больше 1 MagicOre'
        if (parsed > balances.oreBalance) inputError = 'Недостаточно MagicOre'
      }
    } catch (error) {
      inputError = walletErrorMessage(error)
    }
  }
  const mismatchedOre =
    balances && balances.ore.toLowerCase() !== data.chain.magicOre.toLowerCase()
  const operationsBlocked =
    busy || Boolean(uncertain) || wallet.chainId !== AVALANCHE_CHAIN_ID
  const canSubmit =
    balances &&
    !mismatchedOre &&
    input &&
    !inputError &&
    !operationsBlocked &&
    !wallet.loading

  const review = (next: Draft) => {
    setFailure(null)
    setProgress(null)
    setDraft(next)
  }

  const completeTransaction = async (
    transaction: SubmittedTransaction,
    signal: AbortSignal,
  ) => {
    const { hash, action, draft: completed } = transaction
    if (action === 'open-claim') {
      const claim = await readConfirmedClaim(
        session,
        data.chain.freeMine,
        hash,
      ).catch(() => null)
      if (claim && !signal.aborted)
        setLocalClaims(previous => [...previous, claim])
    }
    if (signal.aborted) return
    if (completed.kind === 'cancel' || completed.kind === 'redeem')
      setClosedClaims(previous => [...previous, claimKey(completed.claim)])
    setSuccess({
      hash,
      label:
        action === 'approval' || action === 'approval-reset'
          ? 'Разрешение подтверждено — покупка ещё не отправлена'
          : 'Транзакция подтверждена',
    })
    setFailure(null)
    setDraft(null)
    setProgress(null)
    setInput('')
  }

  const perform = async () => {
    if (!draft || busy || uncertain) return
    const operation = new AbortController()
    controller.current = operation
    setBusy(true)
    setFailure(null)
    setProgress(null)
    setSuccess(null)
    latestProgress.current = null
    const options = {
      signal: operation.signal,
      onProgress: (next: TransactionProgress) => {
        latestProgress.current = next
        if (!operation.signal.aborted) setProgress(next)
      },
    }
    try {
      let hash: Hash
      if (draft.kind === 'buy')
        hash = await buyOre(
          session,
          data.chain.freeMine,
          draft.input,
          draft.balances,
          options,
        )
      else if (draft.kind === 'open')
        hash = await openClaim(
          session,
          data.chain.freeMine,
          draft.input,
          options,
        )
      else {
        const action = draft.kind === 'cancel' ? cancelClaim : redeemClaim
        hash = await action(
          session,
          data.chain.freeMine,
          draft.claim.shiftId,
          draft.claim.claimId,
          options,
        )
      }
      if (operation.signal.aborted) return
      await completeTransaction(
        { hash, action: draftActions[draft.kind], draft },
        operation.signal,
      )
      if (operation.signal.aborted) return
      await Promise.allSettled([wallet.refresh(), onRefresh()])
    } catch (error) {
      if (!operation.signal.aborted) {
        setFailure(walletErrorMessage(error))
        const latest = latestProgress.current as TransactionProgress | null
        if (latest?.status === 'pending' && latest.hash) {
          setUncertain({ hash: latest.hash, action: latest.action, draft })
          setCheckMessage(null)
        }
      }
    } finally {
      setBusy(false)
      if (operation.signal.aborted) {
        setDraft(null)
        setFailure(
          'Аккаунт или сеть изменились. Проверьте отправленные транзакции в кошельке.',
        )
        setProgress(null)
      }
    }
  }

  const resolveTransaction = async () => {
    if (!uncertain || checking) return
    const operation = new AbortController()
    controller.current = operation
    setChecking(true)
    setCheckMessage(null)
    try {
      const result = await checkTransaction(session, uncertain.hash)
      if (operation.signal.aborted) return
      if (result === 'pending') {
        setCheckMessage(
          'Транзакция ещё не подтверждена. Повторите проверку позже.',
        )
        return
      }
      if (result === 'success') {
        await completeTransaction(uncertain, operation.signal)
      } else {
        setFailure(
          'Транзакция завершилась с ошибкой в сети. Можно проверить сумму и повторить операцию.',
        )
        setDraft(null)
        setProgress(null)
      }
      if (operation.signal.aborted) return
      setUncertain(null)
      await Promise.allSettled([wallet.refresh(), onRefresh()])
    } catch (error) {
      if (!operation.signal.aborted) setCheckMessage(walletErrorMessage(error))
    } finally {
      setChecking(false)
    }
  }

  const pendingNotice = uncertain && (
    <div className="notice warning" role="status">
      <div>
        <strong>
          {actionLabels[uncertain.action]}: результат пока неизвестен
        </strong>
        <p>Новые операции приостановлены до проверки отправленной транзакции</p>
        {checkMessage && <p>{checkMessage}</p>}
        <ExternalLink href={explorer(uncertain.hash, 'tx')}>
          Открыть транзакцию
        </ExternalLink>
      </div>
      <button
        className="button secondary"
        onClick={() => void resolveTransaction()}
        disabled={checking}
      >
        {checking ? 'Проверяем…' : 'Проверить статус'}
      </button>
    </div>
  )

  return (
    <>
      <div className="section-intro">
        <div className="account-address">
          <span className="connection-dot" />
          <Address value={session.account} full />
        </div>
        <button
          className="button secondary"
          onClick={() => void wallet.refresh()}
          disabled={wallet.loading || busy}
        >
          <RefreshCw size={15} className={wallet.loading ? 'spin' : ''} />
          Обновить баланс
        </button>
      </div>
      {wallet.chainId !== AVALANCHE_CHAIN_ID && (
        <div className="notice warning">
          <span>В кошельке выбрана другая сеть</span>
          <button
            className="button secondary"
            onClick={() => void wallet.switchChain()}
            disabled={wallet.connecting}
          >
            Переключить на Avalanche
          </button>
        </div>
      )}
      {wallet.error && (
        <p role="alert" className="notice error">
          {wallet.error}
        </p>
      )}
      {mismatchedOre && (
        <p role="alert" className="notice error">
          Контракт MagicOre отличается от снимка сервера. Обновите данные фонда.
        </p>
      )}
      {success && (
        <div className="notice positive" role="status">
          <CheckCircle2 size={18} />
          <div>
            <strong>{success.label}</strong>
            <p>Публичный снимок обновляется по расписанию сервера.</p>
          </div>
          <ExternalLink href={explorer(success.hash, 'tx')}>
            Транзакция
          </ExternalLink>
        </div>
      )}
      {!draft && pendingNotice}
      {!draft && failure && (
        <p className="notice error" role="alert">
          {failure}
        </p>
      )}
      <div className="wallet-balances">
        <div className="wallet-balance">
          <TokenIcon symbol={symbol} />
          <div>
            <span>Ваш MagicOre</span>
            <strong>
              {balances ? (
                <Amount
                  value={balances.oreBalance}
                  symbol={symbol}
                  places={6}
                />
              ) : wallet.loading ? (
                'Загрузка…'
              ) : (
                '—'
              )}
            </strong>
          </div>
        </div>
        <div className="wallet-balance">
          <TokenIcon symbol={balances?.dollarSymbol ?? 'USD'} />
          <div>
            <span>Текущий доллар FreeMine</span>
            <strong>
              {balances ? (
                <Amount
                  value={balances.dollarBalance}
                  decimals={balances.dollarDecimals}
                  symbol={balances.dollarSymbol}
                  places={6}
                />
              ) : wallet.loading ? (
                'Загрузка…'
              ) : (
                '—'
              )}
            </strong>
            {balances && <Address value={balances.dollar} />}
          </div>
        </div>
        <div className="wallet-balance gas-balance">
          <div>
            <span>На комиссии сети</span>
            <strong>
              {balances ? (
                <Amount
                  value={balances.nativeBalance}
                  symbol="AVAX"
                  places={6}
                />
              ) : (
                '—'
              )}
            </strong>
          </div>
        </div>
      </div>
      <div className="trade-layout">
        <Panel title="Операции с MagicOre" className="trade-panel">
          <div className="segmented">
            <button
              aria-pressed={mode === 'buy'}
              onClick={() => {
                setMode('buy')
                setInput('')
              }}
              disabled={busy}
            >
              Купить
            </button>
            <button
              aria-pressed={mode === 'open'}
              onClick={() => {
                setMode('open')
                setInput('')
              }}
              disabled={busy}
            >
              Заявка на вывод
            </button>
          </div>
          <form
            onSubmit={event => {
              event.preventDefault()
              if (canSubmit && balances) review({ kind: mode, input, balances })
            }}
          >
            <label className="field-label" htmlFor="trade-amount">
              {mode === 'buy' ? 'Вы платите' : 'Количество MagicOre'}
            </label>
            <div className={`amount-input ${inputError ? 'invalid' : ''}`}>
              <input
                id="trade-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                value={input}
                onChange={event => setInput(event.target.value)}
                aria-invalid={!!inputError}
                aria-describedby="amount-help"
                disabled={!balances || busy}
              />
              <span>
                {mode === 'buy' ? (balances?.dollarSymbol ?? 'USD') : symbol}
              </span>
            </div>
            <div className="balance-hint">
              <span>
                {balances
                  ? `Доступно: ${amount(mode === 'buy' ? balances.dollarBalance : balances.oreBalance, mode === 'buy' ? balances.dollarDecimals : 18, 6)}`
                  : 'Загрузите баланс кошелька'}
              </span>
              <button
                type="button"
                disabled={!balances || busy}
                onClick={() => {
                  if (balances)
                    setInput(
                      formatUnits(
                        mode === 'buy'
                          ? balances.dollarBalance
                          : balances.oreBalance,
                        mode === 'buy' ? balances.dollarDecimals : 18,
                      ),
                    )
                }}
              >
                Макс
              </button>
            </div>
            <div id="amount-help">
              {inputError && (
                <p className="field-error" role="alert">
                  {inputError}
                </p>
              )}
            </div>
            {mode === 'buy' ? (
              <div className="quote-box">
                <ArrowDownUp size={18} />
                <span>Вы получите примерно</span>
                <strong>
                  {quote === null ? (
                    '—'
                  ) : (
                    <Amount value={quote} symbol={symbol} places={6} />
                  )}
                </strong>
              </div>
            ) : (
              <div className="quote-box">
                <Clock3 size={18} />
                <span>Открытая смена</span>
                <strong>#{data.fund.freeMine.currentShiftId}</strong>
              </div>
            )}
            <button
              className="button primary full-width"
              type="submit"
              disabled={!canSubmit}
            >
              {busy ? 'Транзакция выполняется…' : 'Продолжить'}
              <ArrowRight size={17} />
            </button>
            <p className="panel-note">
              {mode === 'buy'
                ? 'При необходимости кошелёк запросит разрешение на точную сумму покупки, затем — подпись покупки. Итог зависит от цены контракта в момент исполнения.'
                : 'Токены блокируются в заявке. Цена выплаты определяется при финансировании смены. Отмена заявки сжигает 1 MagicOre.'}
            </p>
          </form>
        </Panel>
        <div className="account-notes">
          <span className="eyebrow">КАК УСТРОЕН ВЫВОД</span>
          <ol>
            <li>
              <span>01</span>
              <div>
                <h3>Создайте заявку</h3>
                <p>Укажите больше 1 MagicOre. Токены перейдут в FreeMine.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Дождитесь финансирования</h3>
                <p>
                  Фонд закрывает смену и выделяет долларовые токены по цене от
                  90% до 99% цены входа на тот момент.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Получите выплату</h3>
                <p>
                  Подпишите получение в кошельке. Через 14 дней после
                  финансирования владелец может закрыть невостребованную заявку
                  с удержанием 1 MagicOre.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </div>
      <Panel
        title="Мои заявки на вывод"
        aside={<span className="tag">{claims.length} активных</span>}
      >
        {claims.length === 0 ? (
          <Empty>У вас нет активных заявок на вывод</Empty>
        ) : (
          <div className="claim-list">
            {claims.map(claim => {
              const shift = data.fund.freeMine.shifts[claim.shiftId]
              const precision = shift ? dollarDecimals(shift.dollarScale) : null
              return (
                <div className="claim-row" key={claimKey(claim)}>
                  <div>
                    <strong>Заявка #{claim.claimId}</strong>
                    <small>Смена #{claim.shiftId}</small>
                  </div>
                  <div>
                    <Amount
                      value={claim.oreAmount}
                      symbol={symbol}
                      places={6}
                    />
                    <small>
                      {shift?.funded ? (
                        <>
                          К выплате:{' '}
                          {precision === null
                            ? '—'
                            : amount(
                                claimPayout(
                                  claim.oreAmount,
                                  shift.price,
                                  shift.dollarScale,
                                ),
                                precision,
                                6,
                              )}{' '}
                          <Address value={shift.dollar} />
                        </>
                      ) : (
                        'Ожидает финансирования'
                      )}
                    </small>
                    {shift?.funded && (
                      <small>Финансирование: {date(shift.fundedAt)}</small>
                    )}
                  </div>
                  <div className="claim-actions">
                    {shift?.funded && (
                      <button
                        className="button primary"
                        disabled={operationsBlocked}
                        onClick={() => review({ kind: 'redeem', claim })}
                      >
                        Получить
                      </button>
                    )}
                    <button
                      className="button secondary"
                      disabled={operationsBlocked}
                      onClick={() => review({ kind: 'cancel', claim })}
                    >
                      Отменить заявку
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p className="panel-note">
          Состояние смен и заявок по снимку от {date(data.updatedAt)}. Перед
          подписью контракт проверяется в сети.
        </p>
      </Panel>
      {draft && (
        <Modal
          title={
            draft.kind === 'buy'
              ? 'Покупка MagicOre'
              : draft.kind === 'open'
                ? 'Новая заявка на вывод'
                : draft.kind === 'cancel'
                  ? 'Отмена заявки'
                  : 'Получение выплаты'
          }
          onClose={() => {
            setDraft(null)
            setFailure(null)
          }}
          busy={busy || checking}
        >
          <dl className="definition-list">
            <div>
              <dt>Аккаунт</dt>
              <dd>
                <Address value={session.account} />
              </dd>
            </div>
            <div>
              <dt>Контракт FreeMine</dt>
              <dd>
                <Address value={data.chain.freeMine} />
              </dd>
            </div>
            {draft.kind === 'buy' || draft.kind === 'open' ? (
              <div>
                <dt>
                  {draft.kind === 'buy'
                    ? 'Сумма покупки'
                    : 'Будет заблокировано'}
                </dt>
                <dd>
                  {draft.input}{' '}
                  {draft.kind === 'buy' ? draft.balances.dollarSymbol : symbol}
                </dd>
              </div>
            ) : (
              <>
                <div>
                  <dt>Смена / заявка</dt>
                  <dd>
                    #{draft.claim.shiftId} / #{draft.claim.claimId}
                  </dd>
                </div>
                <div>
                  <dt>В заявке</dt>
                  <dd>
                    <Amount value={draft.claim.oreAmount} symbol={symbol} />
                  </dd>
                </div>
              </>
            )}
            {draft.kind === 'buy' && (
              <>
                <div>
                  <dt>Долларовый токен</dt>
                  <dd>
                    <Address value={draft.balances.dollar} />
                  </dd>
                </div>
                <div>
                  <dt>Примерно к получению</dt>
                  <dd>
                    <Amount
                      value={quoteOre(
                        parseTokenAmount(
                          draft.input,
                          draft.balances.dollarDecimals,
                        ),
                        draft.balances.dollarDecimals,
                        draft.balances.entryPrice,
                      )}
                      symbol={symbol}
                      places={6}
                    />
                  </dd>
                </div>
              </>
            )}
            {draft.kind === 'redeem' &&
              redemptionShift &&
              redemptionDecimals !== null && (
                <>
                  <div>
                    <dt>К выплате</dt>
                    <dd>
                      <Amount
                        value={claimPayout(
                          draft.claim.oreAmount,
                          redemptionShift.price,
                          redemptionShift.dollarScale,
                        )}
                        decimals={redemptionDecimals}
                        places={6}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>Доллар смены</dt>
                    <dd>
                      <Address value={redemptionShift.dollar} />
                    </dd>
                  </div>
                </>
              )}
            {draft.kind === 'cancel' && (
              <div>
                <dt>Вернётся в кошелёк</dt>
                <dd>
                  <Amount
                    value={BigInt(draft.claim.oreAmount) - ONE_ORE}
                    symbol={symbol}
                    places={6}
                  />
                </dd>
              </div>
            )}
          </dl>
          {draft.kind === 'cancel' && (
            <p className="notice warning">
              При отмене безвозвратно сгорит 1 MagicOre. Остальные токены
              вернутся в ваш кошелёк.
            </p>
          )}
          {draft.kind === 'open' && (
            <p className="notice">
              MagicOre будут заблокированы до выплаты или отмены. Отмена сжигает
              1 MagicOre.
            </p>
          )}
          {progress && (
            <div className="transaction-progress" role="status">
              <strong>{actionLabels[progress.action]}</strong>
              <p>
                {progress.status === 'signature'
                  ? 'Подтвердите запрос в кошельке'
                  : progress.status === 'pending'
                    ? failure
                      ? 'Подтверждение не получено. Перед новой операцией проверьте статус отправленной транзакции по ссылке ниже.'
                      : 'Ожидание подтверждения в сети…'
                    : progress.status === 'failed'
                      ? 'Транзакция не выполнена'
                      : 'Подтверждено в сети'}
              </p>
              {progress.hash && (
                <ExternalLink href={explorer(progress.hash, 'tx')}>
                  Посмотреть транзакцию
                </ExternalLink>
              )}
            </div>
          )}
          {pendingNotice}
          {failure && (
            <p className="notice error" role="alert">
              {failure}
            </p>
          )}
          <button
            className="button primary full-width"
            onClick={() => void perform()}
            disabled={busy || Boolean(uncertain)}
          >
            {busy
              ? 'Ожидание кошелька и сети…'
              : draft.kind === 'cancel'
                ? 'Отменить и сжечь 1 MagicOre'
                : 'Подтвердить в кошельке'}
          </button>
        </Modal>
      )}
    </>
  )
}
