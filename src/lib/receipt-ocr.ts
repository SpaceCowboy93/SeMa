import { assembleSections, type ScanRow } from './receipt-sections'
import { enhance, photoCanvas, straighten, type Band } from './receipt-image'
import type { Line } from 'tesseract.js'

function alignLines(bands: Band[], lines: Line[]) {
  const rows = bands.map(b => ({ ...b, lines: [] as Line[] }))
  for (const line of lines) {
    const { y0, y1 } = line.bbox
    const mid = (y1 + y0) / 2
    const row = rows.find(b => mid >= b.top - 2 && mid <= b.bottom + 2)
    if (row) row.lines.push(line)
    else rows.push({ top: y0, bottom: y1, lines: [line] })
  }
  return rows.flatMap(row => {
    // Shadows sometimes connect two physical bands. Keep separate OCR baselines,
    // combining only fragments at the same height (e.g. name and price).
    const groups: typeof rows = []
    for (const line of row.lines.sort((a, b) => a.bbox.y0 - b.bbox.y0)) {
      const { y0, y1 } = line.bbox
      const last = groups[groups.length - 1]
      if (last && last.bottom - y0 > (y1 - y0) / 2) {
        last.lines.push(line)
        last.bottom = Math.max(last.bottom, y1)
      } else groups.push({ top: y0, bottom: y1, lines: [line] })
    }
    return groups.length > 1 ? groups : [row]
  }).sort((a, b) => a.top - b.top)
}

export async function prepareReceiptPhoto(file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MB.')
  if (file.type && !file.type.startsWith('image/')) throw new Error('Choose a receipt photo (JPEG, PNG or a supported phone image).')
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Cannot prepare this photo.')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.92)
  } catch {
    throw new Error('This image could not be opened. Try taking a new photo or uploading JPEG/PNG.')
  } finally { URL.revokeObjectURL(url) }
}

export async function scanReceiptPhotos(photos: string[], signal: AbortSignal, progress: (message: string) => void) {
  const { createWorker, PSM } = await import('tesseract.js')
  if (signal.aborted) throw new Error('Scan cancelled')
  let page = 1
  const worker = await createWorker('eng', 1, {
    // Job promises surface errors to the review flow; suppress the library's
    // additional uncaught throw from its message handler.
    errorHandler: () => {},
    workerPath: '/receipt-ocr/worker.min.js', corePath: '/receipt-ocr', langPath: '/receipt-ocr',
    logger: m => { if (!signal.aborted) progress(`Photo ${page}/${photos.length}: ${m.status} ${Math.round(m.progress * 100)}%`) },
  })
  const cancel = () => { void worker.terminate() }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    if (signal.aborted) throw new Error('Scan cancelled')
    const pages: ScanRow[][] = []
    for (const photo of photos) {
      const canvas = await photoCanvas(photo)
      try {
        const originalPosition = straighten(canvas)
        const bands = enhance(canvas)
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
        const result = await worker.recognize(canvas, {}, { blocks: true })
        const lines = result.data.blocks?.flatMap(b => b.paragraphs.flatMap(p => p.lines)) ?? []
        const rows = alignLines(bands, lines)
        const section: ScanRow[] = []
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE })
        for (const row of rows) {
          if (signal.aborted) throw new Error('Scan cancelled')
          const pieces = row.lines.sort((a, b) => a.bbox.x0 - b.bbox.x0)
          let text = pieces.map(l => l.text.trim()).join(' ')
          let confidence = pieces.length ? Math.min(...pieces.map(l => l.confidence)) : 0
          if (!text || confidence < 80 || (/[a-z]/i.test(text) && !/\d[.,]\d{2}/.test(text))) {
            const top = Math.max(0, row.top - 3)
            const bottom = Math.min(canvas.height, row.bottom + 3)
            // Transfer only the difficult strip to the worker on mobile.
            const strip = document.createElement('canvas')
            strip.width = canvas.width
            strip.height = Math.max(1, bottom - top)
            strip.getContext('2d')!.drawImage(canvas, 0, -top)
            const retry = await worker.recognize(strip)
            strip.width = strip.height = 1
            const candidate = retry.data.text.trim().replace(/\s+/g, ' ')
            const lostPrice = /\d[.,]\d{2}/.test(text) && !/\d[.,]\d{2}/.test(candidate)
            if (candidate && !lostPrice && (!text || retry.data.confidence > confidence)) {
              text = candidate
              confidence = retry.data.confidence
            }
          }
          section.push({ photo: page - 1, ...originalPosition(row), text, confidence: confidence / 100 })
        }
        if (!section.length) section.push({ photo: page - 1, top: 0, bottom: 1, text: '', confidence: 0 })
        pages.push(section)
        page++
      } finally { canvas.width = canvas.height = 1 }
    }
    return assembleSections(pages)
  } finally {
    signal.removeEventListener('abort', cancel)
    await worker.terminate()
  }
}
