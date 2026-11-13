import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { getAddress } from 'viem'

import { account, makeSnapshot, mockPublicApi, secondHolder } from './fixtures'
import { emitWalletEvent, installWallet } from './wallet-provider'

async function connect(page: Page) {
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Подключить кошелёк', exact: true })
    .first()
    .click()
  await page.getByRole('button', { name: /Test Rabby/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.wallet-balances')).toContainText('700 ORE')
  await expect(page.getByRole('textbox', { name: 'Вы платите' })).toBeEnabled()
}

test('connects a discovered wallet, switches to Avalanche and reads personal balances', async ({
  page,
}) => {
  const snapshot = makeSnapshot()
  const wallet = await installWallet(page, snapshot)
  await mockPublicApi(page, snapshot)
  await page.goto('/')
  expect(wallet.calls).toEqual([])
  await connect(page)
  expect(wallet.calls).toContain('wallet_switchEthereumChain')
  expect(wallet.chainId).toBe('0xa86a')
  await expect(page.locator('.wallet-balances')).toContainText('1 000 USDC')
  await expect(page.locator('.account-address')).toContainText(account)
  await expect(page.locator('.claim-row')).toContainText('К выплате: 240')
  expect(wallet.writes).toEqual([])
  await page.screenshot({
    path: '.tmp/screenshots/connected-wallet.png',
    fullPage: true,
  })
})

test('buys with exact approval and refreshes confirmed balances', async ({
  page,
}) => {
  const snapshot = makeSnapshot()
  const wallet = await installWallet(page, snapshot)
  await mockPublicApi(page, snapshot)
  await connect(page)
  await page.getByRole('textbox', { name: 'Вы платите' }).fill('25.000001')
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('25.000001 USDC')
  await page
    .getByRole('button', { name: 'Подтвердить в кошельке', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByText('Транзакция подтверждена', { exact: true }),
  ).toBeVisible()
  expect(wallet.writes.map(write => write.functionName)).toEqual([
    'approve',
    'buy',
  ])
  expect(wallet.writes[0].args).toEqual([
    getAddress(snapshot.chain.freeMine),
    25_000_001n,
  ])
  expect(wallet.writes[1].args).toEqual([25_000_001n])
  await expect(page.locator('.wallet-balances')).toContainText(
    '974,999999 USDC',
  )
  await expect(
    page.getByRole('link', { name: /^Транзакция \(/ }),
  ).toHaveAttribute('href', /\/tx\/0x0+2$/)
})

test('keeps a rejected purchase review open and does not submit a buy', async ({
  page,
}) => {
  const snapshot = makeSnapshot()
  const wallet = await installWallet(page, snapshot)
  wallet.rejectWrite = 'approve'
  await mockPublicApi(page, snapshot)
  await connect(page)
  await page.getByRole('textbox', { name: 'Вы платите' }).fill('25')
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
  await page
    .getByRole('button', { name: 'Подтвердить в кошельке', exact: true })
    .click()
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(
    'Вы отклонили запрос в кошельке',
  )
  await expect(
    page.getByRole('button', { name: 'Подтвердить в кошельке', exact: true }),
  ).toBeEnabled()
  expect(wallet.writes).toEqual([])
  expect(wallet.dollarBalance).toBe(1_000_000_000n)
})

test('creates a claim immediately and cancels it after showing the one-token burn', async ({
  page,
}) => {
  const snapshot = makeSnapshot()
  const wallet = await installWallet(page, snapshot)
  await mockPublicApi(page, snapshot)
  await connect(page)
  await page
    .getByRole('button', { name: 'Заявка на вывод', exact: true })
    .click()
  await page.getByRole('textbox', { name: 'Количество MagicOre' }).fill('2')
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
  await page
    .getByRole('button', { name: 'Подтвердить в кошельке', exact: true })
    .click()
  const created = page.locator('.claim-row').filter({ hasText: 'Заявка #2' })
  await expect(created).toContainText('Смена #8')
  await expect(created).toContainText('2 ORE')
  expect(wallet.writes.map(write => write.functionName)).toEqual(['openClaim'])
  await created
    .getByRole('button', { name: 'Отменить заявку', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toContainText(
    'безвозвратно сгорит 1 MagicOre',
  )
  await page
    .getByRole('button', { name: 'Отменить и сжечь 1 MagicOre', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(created).toHaveCount(0)
  expect(wallet.writes.map(write => write.functionName)).toEqual([
    'openClaim',
    'cancelClaim',
  ])
  await expect(page.locator('.wallet-balances')).toContainText('699 ORE')
})

test('redeems a funded claim and removes it while the public snapshot is still old', async ({
  page,
}) => {
  const snapshot = makeSnapshot()
  const wallet = await installWallet(page, snapshot)
  await mockPublicApi(page, snapshot)
  await connect(page)
  await page
    .locator('.claim-row')
    .getByRole('button', { name: 'Получить', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Подтвердить в кошельке', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByText('У вас нет активных заявок на вывод'),
  ).toBeVisible()
  expect(wallet.writes.map(write => write.functionName)).toEqual([
    'redeemClaim',
  ])
  await expect(page.locator('.wallet-balances')).toContainText('1 240 USDC')
})

test('closes a stale review on account change and blocks operations on another chain', async ({
  page,
}) => {
  const snapshot = makeSnapshot()
  const wallet = await installWallet(page, snapshot)
  await mockPublicApi(page, snapshot)
  await connect(page)
  await page.getByRole('textbox', { name: 'Вы платите' }).fill('25')
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
  wallet.account = secondHolder
  await emitWalletEvent(page, 'accountsChanged', [secondHolder])
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.account-address')).toContainText(secondHolder)
  wallet.chainId = '0x1'
  await emitWalletEvent(page, 'chainChanged', '0x1')
  await expect(page.getByText('В кошельке выбрана другая сеть')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Продолжить', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('button', { name: 'Переключить на Avalanche', exact: true })
    .click()
  await expect(page.getByText('В кошельке выбрана другая сеть')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Вы платите' })).toBeEnabled()
  expect(wallet.writes).toEqual([])
})

test('blocks duplicate submissions after a receipt timeout until its status is checked', async ({
  page,
}) => {
  const snapshot = makeSnapshot()
  const wallet = await installWallet(page, snapshot)
  wallet.receiptUnavailable = true
  await mockPublicApi(page, snapshot)
  await page.clock.install()
  await connect(page)
  await page.getByRole('textbox', { name: 'Вы платите' }).fill('25')
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
  await page
    .getByRole('button', { name: 'Подтвердить в кошельке', exact: true })
    .click()
  await expect(
    page.getByText('Ожидание подтверждения в сети…', { exact: true }),
  ).toBeVisible()
  await page.clock.fastForward(181_000)
  await expect(
    page.getByRole('button', { name: 'Проверить статус', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Подтвердить в кошельке', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Продолжить', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('button', { name: 'Проверить статус', exact: true })
    .click()
  await expect(
    page.getByText('Транзакция ещё не подтверждена. Повторите проверку позже.'),
  ).toBeVisible()
  expect(wallet.writes.map(write => write.functionName)).toEqual(['approve'])
  wallet.receiptUnavailable = false
  await page
    .getByRole('button', { name: 'Проверить статус', exact: true })
    .click()
  await expect(
    page.getByText('Разрешение подтверждено — покупка ещё не отправлена', {
      exact: true,
    }),
  ).toBeVisible()
  await page.getByRole('textbox', { name: 'Вы платите' }).fill('25')
  await expect(
    page.getByRole('button', { name: 'Продолжить', exact: true }),
  ).toBeEnabled()
  expect(wallet.writes.map(write => write.functionName)).toEqual(['approve'])
})
