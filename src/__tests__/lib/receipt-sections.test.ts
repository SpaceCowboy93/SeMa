import { describe, expect, it } from 'vitest'
import { assembleSections, financialWarnings } from '@/lib/receipt-sections'
import { inkBands } from '@/lib/receipt-image'
import { parseReceipt } from '@/lib/receipt-parser'

const page = (text: string[], photo: number) => text.map((s, i) => ({
  text: s, confidence: s ? 0.95 : 0, photo, top: i / text.length, bottom: (i + 1) / text.length,
}))

describe('receipt section review', () => {
  it('merges three overlapping sections of a 50-item receipt and preserves repeated purchases', () => {
    const products = Array.from({ length: 50 }, (_, i) => i % 4 ? `Product ${i} 1.00` : 'Milk 1.00')
    products[20] = products[21] = 'Milk 1.00'
    const r = assembleSections([page(['Lidl', ...products.slice(0, 23)], 0),
      page(products.slice(18, 40), 1), page([...products.slice(36), 'TOTAL 50.00'], 2)])
    expect(r.items.map(i => i.name)).toEqual(products.map(s => s.slice(0, -5)))
    expect(r.evidence?.positions[r.items[49].id].photo).toBe(2)
    expect(r.evidence?.warnings).toEqual([])
    expect(financialWarnings(r)).toEqual([])
  })
  it('retains an ambiguous overlap for review', () => {
    const milk = 'Milk 1.50'
    const r = assembleSections([page(['Aldi', milk, milk], 0), page([milk, milk, 'TOTAL 6.00'], 1)])
    expect(r.items).toHaveLength(4)
    expect(r.evidence?.warnings[0].message).toMatch(/overlap/)
  })
  it('retains blank and unparsed rows even when the total matches', () => {
    const r = assembleSections([page(['Tesco', '', 'unreadable price', 'Beans 2.00', 'Total 2.00'], 0)])
    expect(financialWarnings(r)).toEqual([])
    expect(r.evidence?.warnings.map(w => w.text)).toEqual(['', 'unreadable price'])
  })
  it('warns about a printed count mismatch even when the total agrees', () => {
    const r = assembleSections([page(['Lidl', 'Milk 1.00', 'TOTAL 1.00', 'Items: 3'], 0)])
    expect(financialWarnings(r)).toEqual([])
    expect(r.evidence?.warnings[0].message).toContain('item count')
  })
  it('finds physical rows solely from pixels', () => {
    const width = 120, height = 60
    const pixels = new Uint8ClampedArray(width * height * 4).fill(255)
    for (const top of [6, 25, 42]) for (let y = top; y < top + 6; y++)
      for (let x = 10; x < 85; x += 6) pixels[(y * width + x) * 4] = 80
    expect(inkBands(pixels, width, height).map(b => b.top)).toEqual([6, 25, 42])
  })
  it('reconciles discounts, deposits and weighted purchases to the cent', () => {
    const r = parseReceipt('Aldi\nApples 0.5 kg @ 2.00 1.00\nMilk 2.00\nDeposit 0.15\nCoupon 0.50\nTOTAL 2.65')
    expect(financialWarnings(r)).toEqual([])
    expect(financialWarnings({ ...r, grandTotal: 2.66 })[0]).toContain('€0.01')
  })
  it('accounts for multibuy savings, deposit refunds and trailing minus signs', () => {
    const r = parseReceipt('Tesco\nMilk 4.00\nMultibuy saving 0.80\nDeposit 0.30\nDeposit refund 0.15\nReturn 0.20-\nTOTAL 3.15')
    expect(r.items.map(i => i.lineTotal)).toEqual([4, -0.8, 0.3, -0.15, -0.2])
    expect(financialWarnings(r)).toEqual([])
  })
  it('retains the printed price when a separate quantity line conflicts', () => {
    const r = parseReceipt('Tesco\nBread 2.00\n2 x 1.50\nTOTAL 2.00')
    expect(r.items[0].lineTotal).toBe(2)
    expect(financialWarnings(r)).toHaveLength(1)
  })
})
