import { describe, it, expect } from 'vitest'
import { parseReceipt, validateReceipt } from '@/lib/receipt-parser'

describe('Irish shopping receipt parsing', () => {
  it.each(['LIDL', 'ALDI', 'TESCO', 'DUNNES STORES', 'SuperValu', 'Centra', 'Spar'])('reads %s without adding VAT twice', shop => {
    const r = parseReceipt(`${shop}\n04/11/2026 14:23\nMILK 2.00 A\n2 x BREAD 3.00\nSUBTOTAL 5.00\nTOTAL EUR 5.00\nVAT 0.50\nVISA 5.00\nCHANGE 0.00`, 0.9)
    expect(r.date).toBe('2026-11-04')
    expect(r.items).toHaveLength(2)
    expect(r.items[1]).toMatchObject({ name: 'BREAD', quantity: 2, unitPrice: 1.5 })
    expect(r.grandTotal).toBe(5)
    expect(r.tax).toBe(0)
    expect(validateReceipt(r)).toBeUndefined()
  })
  it('handles weighted items, comma decimals, discounts and unknown shops', () => {
    const r = parseReceipt('Local Market\n4.11.26\nAPPLES\n0.500 kg @ 2,00 1,00\nBREAD 2,50\nDiscount -0,50\nTOTAL 3,00')
    expect(r.store).toBe('Local Market')
    expect(r.items[0]).toMatchObject({ name: 'APPLES', quantity: 0.5, unitPrice: 2, lineTotal: 1 })
    expect(r.items[2].lineTotal).toBe(-0.5)
    expect(r.subtotal).toBe(3)
  })
  it('handles a quantity line after a priced item', () => {
    expect(parseReceipt('ALDI\nMilk 3.00\n2 x 1.50\nTOTAL 3.00').items[0]).toMatchObject({ quantity: 2, unitPrice: 1.5, lineTotal: 3 })
  })
  it('requires review of absent or impossible dates and absent totals', () => {
    const r = parseReceipt('Lidl\n31/02/2026\nMilk 2.00')
    expect(r.date).toBe(''); expect(r.grandTotal).toBe(0)
    expect(validateReceipt(r)).toBeTruthy()
    expect(validateReceipt({ ...r, date: '2026-11-04', grandTotal: 2, currency: 'GBP' })).toContain('EUR')
    expect(validateReceipt({ ...r, date: '2026-11-04', grandTotal: Infinity })).toBeTruthy()
  })
})
