import { describe, expect, it } from 'vitest'
import { readGeminiRows, reconcileGeminiRows } from '@/lib/receipt-gemini'
import { assembleSections, financialWarnings } from '@/lib/receipt-sections'
import { comparisonRows, comparisonBasket, comparisonTotal, unreadableSections } from '../../../tests/fixtures/receiptComparison'

describe('Gemini receipt evidence (mock transcription, no API)', () => {
  it('uses the same three-photo 50-item source and overlap parser as Tesseract', () => {
    const bands = comparisonRows.map(section => section.map(({ photo, top, bottom }) => ({ photo, top, bottom })))
    const cloud = reconcileGeminiRows(readGeminiRows({ pages: comparisonRows }, 3), bands)
    const local = assembleSections(comparisonRows)
    for (const result of [cloud, local]) {
      expect(result.items.map(i => ({ name: i.name, price: i.lineTotal }))).toEqual(comparisonBasket)
      expect(result.grandTotal).toBe(comparisonTotal)
      expect(financialWarnings(result)).toEqual([])
      expect(result.evidence?.warnings).toEqual([expect.objectContaining({ text: 'FADED PRICE' })])
    }
  })
  it('detects an omitted unreadable-price row independently when totals balance', () => {
    const rows = unreadableSections[0].map((text, i) => ({ photo: 0, text, top: (45 + i * 52 - 25) / 350, bottom: (45 + i * 52 + 3) / 350, confidence: 0.95 }))
    const result = reconcileGeminiRows([rows.filter((_, i) => i !== 3)], [rows])
    expect(result.items.map(i => i.name)).toEqual(['BEANS'])
    expect(financialWarnings(result)).toEqual([])
    expect(result.evidence?.warnings).toContainEqual(expect.objectContaining({ message: expect.stringContaining('did not read this visible band') }))
  })
  it('flags a product without a visible row instead of treating it as verified', () => {
    const result = reconcileGeminiRows([[{ photo: 0, top: 0.3, bottom: 0.4, text: 'BREAD 9.99', confidence: 1 }]], [[]])
    expect(result.items[0].confidence).toBe(0)
    expect(result.evidence?.warnings).toContainEqual(expect.objectContaining({ message: expect.stringContaining('could not match this product') }))
  })
  it('rejects missing pages, nonfinite/reversed positions, multiline and oversized text', () => {
    for (const row of [{ text: 'Milk 2.00', top: -1, bottom: 0.2 }, { text: 'Milk 2.00', top: 0.5, bottom: 0.4 }, { text: 'Milk 2.00', top: NaN, bottom: 0.5 }, { text: 'Milk\nBread 2.00', top: 0.1, bottom: 0.2 }, { text: 'x'.repeat(501), top: 0.1, bottom: 0.2 }]) expect(() => readGeminiRows({ pages: [[row]] }, 1)).toThrow()
    expect(() => readGeminiRows({ pages: [] }, 1)).toThrow()
  })
})
