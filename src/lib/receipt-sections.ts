import { parseReceipt, roundMoney } from './receipt-parser'
import type { ReceiptResult } from '@/types'

export interface Position { photo: number; top: number; bottom: number }
export interface ScanRow extends Position { text: string; confidence: number }
export interface ScanEvidence {
  positions: Record<string, Position>
  warnings: { message: string; position: Position; text?: string }[]
}
export type ScanResult = ReceiptResult & { evidence?: ScanEvidence; engine?: 'tesseract' | 'gemini'; elapsedMs?: number }

const normalized = (s: string) => s.toLowerCase().replace(/[^\p{L}\d-]+/gu, ' ').trim()

// Match only a suffix against the next prefix. Multiple different anchors
// distinguish an overlapping section from a run of identical purchases.
export function assembleSections(pages: ScanRow[][]): ScanResult {
  const rows: ScanRow[] = []
  const evidence: ScanEvidence = { positions: {}, warnings: [] }
  for (const [page, section] of pages.entries()) {
    let overlap = 0
    const left = rows.map(r => normalized(r.text))
    const right = section.map(r => normalized(r.text))
    for (let size = Math.min(left.length, right.length); size >= 2; size--) {
      const prefix = right.slice(0, size)
      if (prefix.some(t => !t) || new Set(prefix).size < 2) continue
      if (prefix.every((s, i) => s === left[left.length - size + i])) {
        // A recurring sequence on either photo is ambiguous.
        const unique = (keys: string[]) => keys.filter((_, start) => prefix.every((s, i) => s === keys[start + i])).length === 1
        if (unique(left) && unique(right)) overlap = size
        break
      }
    }
    if (page && !overlap) evidence.warnings.push({ position: section[0] ?? { photo: page, top: 0, bottom: 1 }, message: 'Could not verify the overlap. Check for repeated or missing rows at this join.' })
    rows.push(...section.slice(overlap))
  }
  const claimed = new Set<number>()
  // A sentinel preserves unreadable physical lines in the parser index.
  const result = parseReceipt(rows.map(r => r.text.trim() || '…').join('\n'), 1, (index, item) => {
    const row = rows[index]
    claimed.add(index)
    evidence.positions[item.id] ??= row
    item.confidence = Math.min(item.confidence ?? 1, row.confidence)
  })
  rows.forEach((row, i) => {
    const count = row.text.match(/^(?:total\s+items|items(?:\s+(?:sold|purchased))?|number of items)\s*[:=]?\s*(\d+)$/i)
    if (count) {
      const products = result.items.filter(item => item.lineTotal >= 0 && !/deposit/i.test(item.name))
      const units = products.reduce((sum, item) => sum + item.quantity, 0)
      if (Number(count[1]) !== products.length && Number(count[1]) !== units) evidence.warnings.push({
        position: row, text: row.text, message: 'Printed item count differs from the extracted products. Check for missing rows.',
      })
    }
    const known = Boolean(count) || row.text.toLowerCase() === result.store.toLowerCase()
      || /^(?:lidl|aldi|tesco|dunnes stores|supervalu|centra|spar)$/i.test(row.text)
      || /^(?:(?:grand |net )?total(?: paid| due| amount)?|sub\s*total|vat|visa|cash|card|change|balance due|amount (?:paid|due))\s*[:€£]?\s*(?:EUR|GBP)?\s*[€£]?\s*-?\d+[.,]\d{2}$/i.test(row.text)
      || /^\d{1,4}[/.\-]\d{1,2}[/.\-]\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.test(row.text)
    if ((!claimed.has(i) && !known) || row.confidence < 0.65 || !row.text) evidence.warnings.push({
      position: row, text: row.text, message: claimed.has(i) ? 'Check this hard-to-read product.' : 'Possible missing or incomplete row.',
    })
  })
  return { ...result, evidence }
}

export function financialWarnings(receipt: ReceiptResult) {
  const cents = (value: number) => Math.round(roundMoney(value) * 100)
  const difference = cents(receipt.grandTotal) - receipt.items.reduce((sum, item) => sum + cents(item.lineTotal), 0)
  const warnings = receipt.items.flatMap(item => cents(item.quantity * item.unitPrice) !== cents(item.lineTotal)
    ? [`${item.name || 'Product'}: quantity × unit price differs from the line total.`] : [])
  if (difference) warnings.push(`Items and total differ by €${(Math.abs(difference) / 100).toFixed(2)}. Check missing purchases, deposits and discounts.`)
  return warnings
}
