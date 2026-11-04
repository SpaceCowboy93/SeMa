import { test, expect } from '@playwright/test'

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
