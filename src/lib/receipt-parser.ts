import type { ReceiptResult, ReceiptItem } from '@/types'

export const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const amount = (s: string) => Number(s.replace(',', '.'))
export function validReceiptDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
}

/** Conservative Irish receipt parser. Unrecognised layouts always remain reviewable. */
export function parseReceipt(text: string, confidence = 0.5): ReceiptResult {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  const shops = ['Lidl', 'Aldi', 'Tesco', 'Dunnes Stores', 'SuperValu', 'Centra', 'Spar', 'Marks & Spencer']
  const shop = shops.find(s => new RegExp(s === 'Dunnes Stores' ? 'dunnes' : s, 'i').test(text))
  const dateMatch = text.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})\b/)
  const candidate = dateMatch ? `${dateMatch[3].length === 2 ? '20' : ''}${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}` : ''
  const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? ''
  const date = validReceiptDate(iso) ? iso : validReceiptDate(candidate) ? candidate : ''
  const items: ReceiptItem[] = []
  let total: number | undefined
  let previousName = ''
  let finished = false
  for (const line of lines) {
    const money = line.match(/(-?\d+[.,]\d{2})\s*(?:[A-D*])?\s*$/i)
    if (/^(?:(?:grand|net)\s+)?total\b|^amount\s+(?:due|paid)\b|^balance\s+due\b/i.test(line) && !/^total\s+(?:saving|discount|vat|tax|items)/i.test(line)) {
      if (money) total = amount(money[1])
      finished = true
      continue
    }
    if (finished) continue
    if (/^(?:sub\s*total|vat|tax|cash|change|card|visa|mastercard|contactless|you saved|total saving|clubcard saving|saving|receipt|tel|www\.|served|store no|transaction|terminal|time|date)\b/i.test(line) || /\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}/.test(line) || shops.some(s => line.toLowerCase().includes(s.split(' ')[0].toLowerCase()))) { previousName = ''; continue }
    // Quantity can follow the product on its own line, or prefix its name.
    const qtyLine = line.match(/^(\d+(?:[.,]\d+)?)\s*(?:kg\s*)?[x×@]\s*€?\s*(\d+[.,]\d{2})(?:\s+€?\s*(\d+[.,]\d{2}))?\s*$/i)
    if (qtyLine) {
      const q = amount(qtyLine[1]), p = amount(qtyLine[2])
      const last = items[items.length - 1]
      if (previousName || last) {
        const item = previousName ? { id: `ocr-${items.length}`, name: previousName, quantity: q, unitPrice: p, lineTotal: 0, confidence } : last
        item.quantity = q; item.unitPrice = p; item.lineTotal = qtyLine[3] ? amount(qtyLine[3]) : roundMoney(q * p)
        if (previousName) items.push(item)
      }
      previousName = ''; continue
    }
    if (!money) { previousName = /[a-z]/i.test(line) ? line : ''; continue }
    let name = line.slice(0, money.index).replace(/[€\s]+$/, '').replace(/^\d{5,}\s+/, '').trim()
    if (!name && previousName) name = previousName
    previousName = ''
    if (!/[a-z]/i.test(name)) continue
    let quantity = 1
    let unitPrice: number | undefined
    const prefix = name.match(/^(\d+(?:[.,]\d+)?)\s*[x×]\s+(.+)$/i)
    if (prefix) { quantity = amount(prefix[1]); name = prefix[2] }
    const suffix = name.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:kg\s*)?[x×@]\s*€?\s*(\d+[.,]\d{2})$/i)
    if (suffix) { name = suffix[1]; quantity = amount(suffix[2]); unitPrice = amount(suffix[3]) }
    const lineTotal = amount(money[1])
    items.push({ id: `ocr-${items.length}`, name, quantity, unitPrice: unitPrice ?? roundMoney(lineTotal / quantity), lineTotal, confidence })
  }
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0))
  return { store: shop ?? lines.find(s => /[a-z]{3}/i.test(s) && !/receipt|welcome|thank/i.test(s)) ?? '', date, currency: /£|\bGBP\b/.test(text) ? 'GBP' : 'EUR', items, subtotal, tax: 0, grandTotal: total ?? 0 }
}

export function validateReceipt(receipt: ReceiptResult): string | undefined {
  if (!receipt.store.trim()) return 'Enter the shop name.'
  if (!validReceiptDate(receipt.date)) return 'Choose a valid purchase date.'
  if (receipt.currency !== 'EUR') return 'Only EUR receipts can be added to these finances.'
  if (!Number.isFinite(receipt.grandTotal) || roundMoney(receipt.grandTotal) <= 0) return 'Enter the total paid from the receipt.'
  if (!receipt.items.length || receipt.items.some(i => !i.name.trim() || !Number.isFinite(i.quantity) || i.quantity <= 0 || !Number.isFinite(i.unitPrice) || !Number.isFinite(i.lineTotal))) return 'Check every item name, quantity and price.'
}

/** Excludes OCR confidence, ordering and generated IDs; stable on both partners’ devices. */
export async function receiptFingerprint(receipt: ReceiptResult): Promise<string> {
  const normalized = JSON.stringify([receipt.store.toLowerCase().replace(/[^a-z0-9]/g, ''), receipt.date, receipt.currency, roundMoney(receipt.grandTotal), receipt.items.map(i => [i.name.toLowerCase().replace(/[^a-z0-9]/g, ''), i.quantity, roundMoney(i.lineTotal)]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))])
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
}
