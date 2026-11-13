import { expect, test } from '@playwright/test'
import { gzipSync } from 'node:zlib'

import {
  account,
  makeSnapshot,
  makeStatus,
  mockPublicApi,
  secondHolder,
  wavaxPool,
} from './fixtures'

test('shows public balances, portfolio positions and independent explorer links', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const state = makeSnapshot()
  await mockPublicApi(page, state)
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Капитал в работе' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Токены фонда' }),
  ).toBeVisible()
  await expect(page.locator('.price-value')).toHaveText('$2,5')
  await expect(page.locator('[title="125"]')).toHaveText('125')
  await page.screenshot({
    path: '.tmp/screenshots/desktop-overview.png',
    fullPage: true,
    animations: 'disabled',
  })
  await expect(
    page.getByRole('link', { name: /Портфель в DeBank/ }),
  ).toHaveAttribute('href', `https://debank.com/profile/${state.chain.oreVein}`)
  await expect(
    page.getByRole('link', { name: /WAVAX \/ USDC на Uniswap/ }),
  ).toHaveAttribute(
    'href',
    `https://app.uniswap.org/explore/pools/avalanche/${wavaxPool}`,
  )
  await page
    .getByRole('button', { name: 'Размещение капитала', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Заёмные средства' }),
  ).toBeVisible()
  await expect(page.getByText('NFT #15835', { exact: true })).toBeVisible()
  await expect(page.getByText('Вне диапазона', { exact: true })).toBeVisible()
  await page
    .getByText('Начисления и параметры позиции', { exact: true })
    .first()
    .click()
  await expect(
    page.getByText('Новые комиссии', { exact: true }).first(),
  ).toBeVisible()
  await expect(
    page.getByText('Всего к получению', { exact: true }).first(),
  ).toBeVisible()
  await expect(
    page.getByText('987654321987654321', { exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([])
})

test('recovers from initial synchronization failure on refresh', async ({
  page,
}) => {
  const state = makeSnapshot()
  await mockPublicApi(page, state)
  let unavailable = true
  await page.route('**/v1/state', route =>
    unavailable
      ? route.fulfill({
          status: 503,
          json: { error: 'Initial synchronization has not completed' },
        })
      : route.fulfill({ json: state }),
  )
  await page.goto('/')
  await expect(
    page.getByText('Сервер пока недоступен или ещё готовит первый снимок'),
  ).toBeVisible()
  unavailable = false
  await page
    .getByRole('button', { name: 'Обновить данные', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Токены фонда' }),
  ).toBeVisible()
  await expect(
    page.getByText('Сервер пока недоступен или ещё готовит первый снимок'),
  ).toHaveCount(0)
})

test('exposes governance, holder search, withdrawal shifts and the public backup', async ({
  page,
}) => {
  const state = makeSnapshot()
  await mockPublicApi(page, state)
  await page.route('**/v1/backup', route =>
    route.fulfill({
      contentType: 'application/gzip',
      body: gzipSync(JSON.stringify(state)),
    }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Данные фонда', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Управление фондом' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Преемники' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Смены вывода' }),
  ).toBeVisible()
  await expect(page.getByText('#7 / #1', { exact: true })).toBeVisible()
  await expect(page.getByText(secondHolder, { exact: true })).toBeVisible()
  await page
    .getByRole('textbox', { name: 'Поиск держателя по адресу' })
    .fill(account)
  await expect(page.getByText(account, { exact: true })).toBeVisible()
  await expect(page.getByText(secondHolder, { exact: true })).toHaveCount(0)
  const downloaded = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Скачать снимок', exact: true })
    .click()
  const download = await downloaded
  expect(download.suggestedFilename()).toBe('free-mine-backup.json.gz')
  expect(await download.failure()).toBeNull()
})

test('keeps the last snapshot visible when synchronization reports an error', async ({
  page,
}) => {
  const state = makeSnapshot()
  const status = { ...makeStatus(state), lastError: 'RPC unavailable' }
  await mockPublicApi(page, state, status)
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Токены фонда' }),
  ).toBeVisible()
  await expect(page.getByText(/RPC unavailable/)).toBeVisible()
})

test('navigation and portfolio remain within a mobile viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockPublicApi(page)
  await page.goto('/')
  for (const label of [
    'Размещение капитала',
    'Данные фонда',
    'Мой кошелёк',
    'Обзор фонда',
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Капитал в работе' }),
    ).toHaveCount(label === 'Обзор фонда' ? 1 : 0)
    await page.screenshot({
      path: `.tmp/screenshots/mobile-${label}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll('body *')]
        .filter(element => {
          const rect = element.getBoundingClientRect()
          return rect.width > 0 && rect.right > window.innerWidth + 1
        })
        .slice(0, 10)
        .map(element => `${element.tagName}.${element.className}`),
      hidden: [...document.querySelectorAll('.sr-only')]
        .map(element => ({
          right: element.getBoundingClientRect().right,
          parent: element.parentElement?.outerHTML.slice(0, 180),
        }))
        .filter(element => element.right > window.innerWidth),
    }))
    expect(
      overflow.width,
      `${label}: ${overflow.elements.join(', ')} ${JSON.stringify(overflow.hidden)}`,
    ).toBeLessThanOrEqual(391)
  }
})

test('offers wallet installation when no injected provider exists', async ({
  page,
}) => {
  await mockPublicApi(page)
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Подключить кошелёк', exact: true })
    .first()
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText(/MetaMask|Rabby/)
  await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(2)
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('discovers an EIP-6963 wallet and explains a rejected connection', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const provider = {
      request: async ({ method }: { method: string }) => {
        sessionStorage.setItem('wallet-last-method', method)
        throw { code: 4001, message: 'User rejected request' }
      },
      on: () => {},
      removeListener: () => {},
    }
    window.addEventListener('eip6963:requestProvider', () => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: {
              uuid: 'test-provider',
              name: 'Test Wallet',
              rdns: 'test.wallet',
            },
            provider,
          },
        }),
      )
    })
  })
  await mockPublicApi(page)
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Подключить кошелёк', exact: true })
    .first()
    .click()
  await page.getByRole('button', { name: /Test Wallet/ }).click()
  await expect(
    page.getByText('Вы отклонили запрос в кошельке', { exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => sessionStorage.getItem('wallet-last-method')),
  ).toBe('eth_requestAccounts')
})
