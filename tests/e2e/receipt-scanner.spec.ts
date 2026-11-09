import { test, expect } from '@playwright/test'
import { comparisonBasket, comparisonSections, comparisonTotal, unreadableSections } from '../fixtures/receiptComparison'

test('local OCR → correction → history and finance → duplicate guard', async ({ page }) => {
  test.setTimeout(120000)
  const external: string[] = []
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('request', request => { if (/receipts\/scan|api\.openai|anthropic|jsdelivr|tessdata/.test(request.url())) external.push(request.url()) })
  await page.goto('/dev-preview/shopping')
  await page.getByRole('button', { name: /Scan receipt/ }).click()
  const scan = page.getByRole('dialog', { name: 'Scan shopping receipt' })
  await expect(scan.getByLabel('Receipt camera')).toHaveAttribute('capture', 'environment')
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 1000
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 900, 1000)
    ctx.fillStyle = 'black'; ctx.font = '36px monospace'
    ;['LIDL', '04/11/2026', '', 'MILK                  2.00', 'BREAD                 3.00', '', 'TOTAL EUR             5.00', 'VISA                  5.00'].forEach((line, i) => ctx.fillText(line, 45, 80 + i * 75))
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await scan.getByLabel('Receipt upload').setInputFiles({ name: 'lidl-test.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') })
  await scan.getByRole('button', { name: 'Read receipt' }).click()
  const review = page.getByRole('dialog', { name: 'Review shopping receipt' })
  await expect(review).toBeVisible({ timeout: 90000 })
  await expect(review.getByLabel('Shop', { exact: true })).toHaveValue('Lidl')
  await expect(review.getByLabel('Purchase date')).toHaveValue('2026-11-04')
  await expect(review.getByLabel('Total paid (€)')).toHaveValue('5')
  await expect(review.getByLabel('Product 1', { exact: true })).toHaveValue('MILK')
  // Correct a field without losing the receipt's printed total.
  await review.getByLabel('Product 1', { exact: true }).fill('Milk 1L')
  await expect(review.getByLabel('Total paid (€)')).toHaveValue('5')
  const overflow = await review.evaluate(el => el.scrollWidth > el.clientWidth)
  expect(overflow).toBe(false)
  await review.getByRole('button', { name: 'Confirm purchase & add to Finances' }).click()
  await expect(review).not.toBeVisible()
  await expect(page.getByText('Lidl receipt', { exact: true })).toBeVisible()
  await page.getByText('View purchased items', { exact: true }).click()
  await expect(page.getByText(/Milk 1L · 1/)).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: /Shopping history/ }).click()
  await expect(page.getByText('Lidl receipt', { exact: true })).toBeVisible()
  const saved = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.includes('preview') && localStorage.getItem(k)?.includes('shoppingLists'))!
    return JSON.parse(localStorage.getItem(key)!)
  })
  const state = saved.state ?? saved
  const list = state.shoppingLists.find((l: { name: string }) => l.name === 'Lidl receipt')
  expect(list.isCompleted).toBe(true)
  const finance = state.financeMonths.find((m: { key: string }) => m.key === '2026-11').budgetItems.find((b: { category: string }) => b.category === 'Shopping')
  expect(finance.items.filter((i: { id: string }) => i.id === list.financeItemId)).toHaveLength(1)
  expect(finance.items.find((i: { id: string }) => i.id === list.financeItemId).unitPrice).toBe(5)
  // Replay the same confirmed receipt through manual entry after reload.
  await page.getByRole('button', { name: /Scan receipt/ }).click()
  await page.getByRole('button', { name: 'Enter receipt manually' }).click()
  await review.getByLabel('Shop', { exact: true }).fill('Lidl')
  await review.getByLabel('Purchase date').fill('2026-11-04')
  await review.getByRole('button', { name: 'Add product / discount' }).click()
  await review.getByLabel('Product 1', { exact: true }).fill('Milk 1L')
  await review.getByLabel('Unit price (€)').nth(0).fill('2')
  await review.getByRole('button', { name: 'Add product / discount' }).click()
  await review.getByLabel('Product 2', { exact: true }).fill('BREAD')
  await review.getByLabel('Unit price (€)').nth(1).fill('3')
  await review.getByLabel('Total paid (€)').fill('5')
  await review.getByRole('button', { name: 'Confirm purchase & add to Finances' }).click()
  await expect(review.getByRole('alert')).toContainText('already in Shopping history')
  expect(external).toEqual([])
  expect(errors).toEqual([])
})

test('50 synthetic products across three overlapping photos, plus an unreadable row', async ({ page }, testInfo) => {
  test.setTimeout(240000)
  await page.goto('/dev-preview/shopping')
  const basket = comparisonBasket
  const total = comparisonTotal
  const sections = comparisonSections
  const photos = await page.evaluate(parts => parts.map(lines => {
    const canvas = document.createElement('canvas')
    canvas.width = 720
    canvas.height = 50 + lines.length * 42
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'black'; ctx.font = 'bold 28px monospace'
    lines.forEach((line, i) => ctx.fillText(line, 36, 40 + i * 42))
    return canvas.toDataURL('image/png').split(',')[1]
  }), sections)
  async function scan() {
    await page.getByRole('button', { name: /Scan receipt/ }).click()
    await page.getByLabel('Receipt upload').setInputFiles(photos.map((data, i) => ({
      name: `synthetic-${i}.png`, mimeType: 'image/png', buffer: Buffer.from(data, 'base64'),
    })))
    await page.getByRole('button', { name: 'Read receipt' }).click()
    await expect(review).toBeVisible({ timeout: 115000 })
  }
  const review = page.getByRole('dialog', { name: 'Review shopping receipt' })
  await scan()
  const values = (label: string | RegExp) => review.getByLabel(label).evaluateAll(inputs => inputs.map(el => (el as HTMLInputElement).value))
  expect(await values(/^Product \d+$/)).toEqual(basket.map(p => p.name))
  expect((await values('Quantity')).map(Number)).toEqual(basket.map(() => 1))
  for (const label of ['Unit price (€)', 'Line total (€)']) {
    expect((await values(label)).map(Number)).toEqual(basket.map(p => Number(p.price)))
  }
  await expect(review.getByLabel('Total paid (€)')).toHaveValue(String(Number(total)))
  await expect(review.getByText(/Possible missing or incomplete row.*FADED PRICE/i)).toBeVisible()
  const timing = await review.getByText(/On-device · Tesseract ·/).textContent()
  const metrics = { engine: 'tesseract', browser: testInfo.project.name, fixture: 'three-photo-50-item-plus-unreadable', expected: 50, actual: (await values(/^Product \d+$/)).length, missed: 0, duplicated: 0, expectedTotal: total, actualTotal: Number(await review.getByLabel('Total paid (€)').inputValue()), timing, source: 'real browser Tesseract', unreadablePriceInvented: false }
  console.log('RECEIPT_BENCHMARK', JSON.stringify(metrics))
  await testInfo.attach('receipt-comparison.json', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' })
  for (const [index, photo, line] of [[0, 0, 2], [25, 1, 8], [49, 2, 14]]) {
    const button = review.getByRole('button', { name: `Locate product ${index + 1} on photo ${photo + 1}` })
    await button.click()
    const rect = button.locator('..').locator('svg rect')
    const y = Number(await rect.getAttribute('y'))
    const h = Number(await rect.getAttribute('height'))
    // The highlighted band must contain the printed text center.
    const center = (40 + line * 42 - 10) / (50 + sections[photo].length * 42) * 100
    expect(y).toBeLessThanOrEqual(center)
    expect(y + h).toBeGreaterThanOrEqual(center)
  }
  const confirm = review.getByRole('button', { name: /Confirm purchase/ })
  await confirm.click()
  await expect(review.getByRole('alert')).toContainText('Review each flagged row')
  async function acknowledge() {
    for (const box of await review.getByRole('checkbox').all()) await box.check()
  }
  await acknowledge()
  await confirm.evaluate(button => { (button as HTMLElement).click(); (button as HTMLElement).click() })
  await expect(review).toBeHidden()
  await page.reload()
  await scan()
  await acknowledge()
  await confirm.click()
  await expect(review.getByRole('alert')).toContainText('already in Shopping history')
  const counts = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.includes('preview') && localStorage.getItem(k)?.includes('shoppingLists'))!
    const raw = JSON.parse(localStorage.getItem(key)!)
    const { shoppingLists, financeMonths } = raw.state ?? raw
    const lists = shoppingLists.filter((l: { name: string }) => l.name === 'Lidl receipt')
    const month = financeMonths.find((m: { key: string }) => m.key === '2026-11')
    const budget = month.budgetItems.find((b: { category: string }) => b.category === 'Shopping')
    const finance = budget.items.filter((i: { id: string }) => i.id === lists[0]?.financeItemId)
    return [lists.length, finance.length, finance[0]?.unitPrice]
  })
  expect(counts).toEqual([1, 1, Number(total)])
})

test('balanced total still flags an unreadable price; failed cloud retry keeps edited draft and photos', async ({ page }, testInfo) => {
  await page.goto('/dev-preview/shopping')
  const data = await page.evaluate(lines => {
    const c = document.createElement('canvas'); c.width = 720; c.height = 350
    const ctx = c.getContext('2d')!; ctx.fillStyle = 'white'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.fillStyle = 'black'; ctx.font = 'bold 28px monospace'
    lines.forEach((line, i) => ctx.fillText(line, 36, 45 + i * 52))
    return c.toDataURL('image/png').split(',')[1]
  }, unreadableSections[0])
  let cloudRequests = 0
  page.on('request', r => { if (r.url().includes('/api/receipts/scan')) cloudRequests++ })
  await page.getByRole('button', { name: /Scan receipt/ }).click()
  await expect(page.getByRole('radio', { name: 'On-device · Tesseract' })).toBeChecked()
  await page.getByLabel('Receipt upload').setInputFiles({ name: 'balanced-unreadable.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') })
  await page.getByRole('button', { name: 'Read receipt' }).click()
  const review = page.getByRole('dialog', { name: 'Review shopping receipt' })
  await expect(review).toBeVisible({ timeout: 90000 })
  await expect(review.getByLabel('Product 1', { exact: true })).toHaveValue('BEANS')
  await expect(review.getByLabel('Total paid (€)')).toHaveValue('2')
  await expect(review.getByText(/Possible missing or incomplete row.*FADED PRICE/i)).toBeVisible()
  expect(await review.getByLabel(/^Product \d+$/).count()).toBe(1)
  const metrics = { engine: 'tesseract', browser: testInfo.project.name, fixture: 'balanced-unreadable-price', expectedReadable: 1, actual: 1, expectedUnresolved: 1, flaggedUnresolved: 1, missedReadable: 0, duplicated: 0, total: 2, timing: await review.getByText(/On-device · Tesseract ·/).textContent(), source: 'real browser Tesseract' }
  console.log('RECEIPT_BENCHMARK', JSON.stringify(metrics))
  await testInfo.attach('balanced-unreadable.json', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' })
  await review.getByLabel('Product 1', { exact: true }).fill('My corrected beans')
  await review.getByRole('button', { name: /Retry these photos/ }).click()
  const scan = page.getByRole('dialog', { name: 'Scan shopping receipt' })
  await expect(scan.getByRole('radio', { name: 'On-device · Tesseract' })).toBeChecked()
  await scan.getByRole('radio', { name: 'Cloud · Gemini' }).click()
  await expect(scan.getByText(/selected photos will be sent to Google/)).toBeVisible()
  expect(cloudRequests).toBe(0)
  await scan.getByRole('button', { name: 'Scan with Gemini' }).click()
  // Isolated dev fixtures deliberately have no auth. This is a real signed-out
  // failure, not a fake successful Gemini result or a live account request.
  await expect(scan.getByRole('alert')).toContainText('Please sign in to SeMa')
  expect(cloudRequests).toBe(0)
  await expect(scan.getByRole('img', { name: 'Receipt photo 1' })).toBeVisible()
  await scan.getByRole('button', { name: 'Use on-device scanning with these photos' }).click()
  await expect(scan.getByRole('radio', { name: 'On-device · Tesseract' })).toBeChecked()
  await scan.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(review.getByLabel('Product 1', { exact: true })).toHaveValue('My corrected beans')
  await review.getByRole('button', { name: /Confirm purchase/ }).click()
  await expect(review.getByRole('alert')).toContainText('Review each flagged row')
})

test('weighted goods, savings, deposits and a refund require review for a one-cent difference', async ({ page }) => {
  await page.goto('/dev-preview/shopping')
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 900; canvas.height = 550
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 900, 550)
    ctx.fillStyle = 'black'; ctx.font = 'bold 30px monospace'
    const lines = ['TESCO', '04/11/2026', 'APPLES 0.5 kg @ 2.00 1.00', 'BREAD 4.00',
      'MULTIBUY SAVING 0.80', 'DEPOSIT 0.30', 'DEPOSIT REFUND 0.15', 'TOTAL EUR 4.36']
    lines.forEach((line, i) => ctx.fillText(line, 30, 55 + i * 52))
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.getByRole('button', { name: /Scan receipt/ }).click()
  await page.getByLabel('Receipt upload').setInputFiles({ name: 'synthetic-finances.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') })
  await page.getByRole('button', { name: 'Read receipt' }).click()
  const review = page.getByRole('dialog', { name: 'Review shopping receipt' })
  await expect(review).toBeVisible({ timeout: 90000 })
  await expect(review.getByLabel('Quantity').first()).toHaveValue('0.5')
  const totals = await review.getByLabel('Line total (€)').evaluateAll(inputs => inputs.map(el => Number((el as HTMLInputElement).value)))
  expect(totals).toEqual([1, 4, -0.8, 0.3, -0.15])
  await expect(review.getByText(/Items and total differ by €0.01/)).toBeVisible()
  const confirm = review.getByRole('button', { name: /Confirm purchase/ })
  for (const box of await review.getByRole('checkbox').all()) await box.check()
  await review.getByLabel('Unit price (€)').nth(1).fill('4.02')
  const accepted = review.getByRole('checkbox', { name: /checked these differences/ })
  await expect(accepted).not.toBeChecked()
  await confirm.click()
  await expect(review.getByRole('alert')).toContainText('Review each flagged row')
  // Keyboard activation also verifies the acknowledgement remains reachable
  // after editing a row above the scrollable phone-sheet footer.
  await accepted.focus()
  await accepted.press('Space')
  await expect(accepted).toBeChecked()
  await confirm.click()
  await expect(review).toBeHidden()
  const paid = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.includes('preview') && localStorage.getItem(k)?.includes('shoppingLists'))!
    const { financeMonths } = JSON.parse(localStorage.getItem(key)!)
    const month = financeMonths.find((m: { key: string }) => m.key === '2026-11')
    return month.budgetItems.find((b: { category: string }) => b.category === 'Shopping').items.map((i: { unitPrice: number }) => i.unitPrice)
  })
  expect(paid).toEqual([4.36])
})
