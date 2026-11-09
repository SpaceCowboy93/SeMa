import { assembleSections, type Position, type ScanRow } from './receipt-sections'

export const GEMINI_RECEIPT_MODEL = 'gemini-3.1-flash-lite'
export type ReceiptEngine = 'tesseract' | 'gemini'

/** Treat provider output as untrusted, including coordinates used by the UI. */
export function readGeminiRows(value: unknown, count: number): ScanRow[][] {
  if (!value || typeof value !== 'object' || !('pages' in value) || !Array.isArray(value.pages) || value.pages.length !== count) throw new Error('Invalid receipt response. Try on-device scanning.')
  return value.pages.map((page: unknown, photo) => {
    if (!Array.isArray(page) || page.length > 300) throw new Error('Invalid receipt rows.')
    let previous = -1
    return page.map((row: unknown) => {
      if (!row || typeof row !== 'object' || !('text' in row) || typeof row.text !== 'string' || row.text.length > 500 || /[\r\n]/.test(row.text)
        || !('top' in row) || typeof row.top !== 'number' || !('bottom' in row) || typeof row.bottom !== 'number'
        || !Number.isFinite(row.top) || !Number.isFinite(row.bottom) || row.top < previous || row.top < 0 || row.bottom > 1 || row.bottom <= row.top) throw new Error('Invalid receipt row position.')
      previous = row.top
      return { photo, top: row.top, bottom: row.bottom, text: row.text, confidence: 0.8 }
    })
  })
}

/** Physical ink bands are measured locally, independently of model text and totals. */
export function reconcileGeminiRows(pages: ScanRow[][], bands: Position[][]) {
  const unmatched: Position[] = []
  const result = assembleSections(pages.map((rows, photo) => rows.map(row => {
    const matches = bands[photo].filter(b => Math.min(b.bottom, row.bottom) - Math.max(b.top, row.top) > Math.min(b.bottom - b.top, row.bottom - row.top) * 0.35)
    // A box spanning several physical lines is not reliable row evidence.
    return { ...row, confidence: matches.length === 1 ? 0.8 : 0 }
  })))
  for (const [photo, section] of bands.entries()) {
    for (const band of section) {
      if (!pages[photo].some(row => row.text.trim() && Math.min(band.bottom, row.bottom) - Math.max(band.top, row.top) > (band.bottom - band.top) * 0.35)) unmatched.push(band)
    }
  }
  result.evidence!.warnings.push(...unmatched.map(position => ({ position, message: 'Possible missing or incomplete row. Gemini did not read this visible band.' })))
  for (const item of result.items) {
    if (item.confidence === 0) result.evidence!.warnings.push({ position: result.evidence!.positions[item.id], message: 'Gemini could not match this product to a single visible receipt row. Verify its name and price.', text: item.name })
  }
  return result
}
