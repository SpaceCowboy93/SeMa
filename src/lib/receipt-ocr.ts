import { parseReceipt } from './receipt-parser'

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
  const { createWorker } = await import('tesseract.js')
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
    const text: string[] = []
    let confidence = 0
    for (const photo of photos) {
      const result = await worker.recognize(photo, { rotateAuto: true })
      if (signal.aborted) throw new Error('Scan cancelled')
      text.push(result.data.text); confidence += result.data.confidence / 100; page++
    }
    if (!text.join('').trim()) throw new Error('No text found. Try a sharper photo in good light, or enter the receipt manually.')
    return parseReceipt(text.join('\n'), confidence / photos.length)
  } finally {
    signal.removeEventListener('abort', cancel)
    await worker.terminate()
  }
}
