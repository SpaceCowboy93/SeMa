'use client'

import { useEffect, useRef, useState } from 'react'
import { C2Sheet, C2SheetHeader, C2SheetBody, C2SheetFooter } from './C2Sheet'
import { prepareReceiptPhoto, scanReceiptPhotos } from '@/lib/receipt-ocr'
import { photoCanvas } from '@/lib/receipt-image'
import { scanReceiptWithGemini } from '@/lib/receipt-cloud-client'
import type { ReceiptEngine } from '@/lib/receipt-gemini'
import type { ScanResult } from '@/lib/receipt-sections'
import type { ReceiptResult } from '@/types'

interface Props {
  onClose: () => void
  onResultReady: (result: ScanResult, photos: string[]) => void
  initialPhotos?: string[]
}
const blank = (): ReceiptResult => ({ store: '', date: '', currency: 'EUR', items: [], subtotal: 0, tax: 0, grandTotal: 0 })

export function ReceiptScannerSheet({ onClose, onResultReady, initialPhotos = [] }: Props) {
  const [photos, setPhotos] = useState<string[]>(initialPhotos)
  const [engine, setEngine] = useState<ReceiptEngine>('tesseract')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController | null>(null)
  const alive = useRef(true)
  const locked = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort() } }, [])
  const close = () => { controller.current?.abort(); onClose() }

  async function choose(input: HTMLInputElement) {
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (!files.length || locked.current) return
    if (files.length + photos.length > 8) { setError('Use up to eight photos of one receipt.'); return }
    locked.current = true; setBusy(true); setError(''); setStatus('Preparing photos…')
    try {
      const next: string[] = []
      for (const file of files) next.push(await prepareReceiptPhoto(file))
      if (alive.current) setPhotos(p => [...p, ...next])
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Cannot open this photo.') }
    finally { locked.current = false; if (alive.current) { setBusy(false); setStatus('') } }
  }
  async function rotate(index: number) {
    if (locked.current) return
    locked.current = true; setBusy(true)
    try {
      const canvas = await photoCanvas(photos[index], true)
      const rotated = canvas.toDataURL('image/jpeg', 0.95)
      canvas.width = canvas.height = 1
      if (alive.current) setPhotos(p => p.map((src, i) => i === index ? rotated : src))
    } catch { if (alive.current) setError('Could not rotate photo.') }
    finally { locked.current = false; if (alive.current) setBusy(false) }
  }
  async function scan() {
    if (locked.current || !photos.length) return
    locked.current = true; setBusy(true); setError(''); setStatus('Starting free OCR…')
    const abort = new AbortController(); controller.current = abort
    const started = performance.now()
    // Worker termination may not settle recognize(), so the UI also gets a bounded timeout.
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelWait: (() => void) | undefined
    try {
      const result = await Promise.race([
        engine === 'tesseract' ? scanReceiptPhotos(photos, abort.signal, setStatus) : scanReceiptWithGemini(photos, abort.signal, setStatus),
        new Promise<never>((_, reject) => {
          cancelWait = () => reject(new Error('Scan cancelled'))
          abort.signal.addEventListener('abort', cancelWait, { once: true })
          timer = setTimeout(() => { reject(new Error('Scanning took too long. Try a smaller, clearer photo or enter manually.')); abort.abort() }, 120000 * photos.length)
        }),
      ])
      if (alive.current && !abort.signal.aborted) onResultReady({ ...result, engine, elapsedMs: Math.round(performance.now() - started) }, photos)
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Could not scan. Try again or enter manually.') }
    finally { clearTimeout(timer); if (cancelWait) abort.signal.removeEventListener('abort', cancelWait); locked.current = false; if (alive.current) { setBusy(false); setStatus('') } }
  }
  return (
    <C2Sheet open fitVisualViewport onClose={close} aria-label="Scan shopping receipt" zIndex={80}>
      <C2SheetHeader title="Scan receipt" subtitle="Free scanning on your phone" onClose={close} />
      <C2SheetBody className="space-y-4">
        <p className="text-sm text-gray-600">Photograph one receipt on a flat surface in good light. Include the shop, date and total. For long receipts, use up to eight photos in top-to-bottom order. Repeat 3–5 complete lines in each new photo and rotate each section upright.</p>
        <fieldset disabled={busy} className="space-y-2">
          <legend className="text-sm font-medium">Scanner engine</legend>
          <label className="flex items-center gap-2 min-h-12 rounded-xl border border-gray-200 px-3 text-sm"><input type="radio" name="receipt-engine" checked={engine === 'tesseract'} onChange={() => setEngine('tesseract')} />On-device · Tesseract</label>
          <label className="flex items-center gap-2 min-h-12 rounded-xl border border-gray-200 px-3 text-sm"><input type="radio" name="receipt-engine" checked={engine === 'gemini'} onChange={() => setEngine('gemini')} />Cloud · Gemini</label>
        </fieldset>
        {engine === 'gemini'
          ? <p className="text-sm rounded-xl bg-amber-50 p-3">When you tap Scan with Gemini, the selected photos will be sent to Google for receipt reading. Google may use free-tier data to improve its products. Only send photos you are comfortable sharing. No paid fallback is used.</p>
          : <p className="text-xs text-gray-500">Photos stay on this device. Only the details you confirm are saved and shared. The first scan downloads the OCR files; keep the app open while scanning.</p>}
        <div className="grid grid-cols-2 gap-3">
          <button disabled={busy} onClick={() => camera.current?.click()} className="min-h-12 rounded-2xl bg-[#527052] text-white disabled:opacity-50">Take a photo</button>
          <button disabled={busy} onClick={() => gallery.current?.click()} className="min-h-12 rounded-2xl bg-gray-100 disabled:opacity-50">Upload photo</button>
        </div>
        <input ref={camera} aria-label="Receipt camera" type="file" accept="image/*" capture="environment" hidden onChange={e => void choose(e.currentTarget)} />
        <input ref={gallery} aria-label="Receipt upload" type="file" accept="image/*" multiple hidden onChange={e => void choose(e.currentTarget)} />
        <div className="grid grid-cols-2 gap-3">
          {photos.map((src, index) => <div key={index}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Receipt photo ${index + 1}`} className="w-full h-40 object-contain rounded-xl bg-white" />
            <button disabled={busy} onClick={() => void rotate(index)} className="min-h-11 w-full text-sm">Rotate photo {index + 1}</button>
            <button disabled={busy} onClick={() => setPhotos(p => p.filter((_, i) => i !== index))} className="min-h-11 w-full text-sm">Remove photo {index + 1}</button>
          </div>)}
        </div>
        <p role="status" className="text-sm">{status}</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {error && engine === 'gemini' && <button disabled={busy} onClick={() => setEngine('tesseract')} className="min-h-12 w-full rounded-xl border border-gray-300 text-sm">Use on-device scanning with these photos</button>}
      </C2SheetBody>
      <C2SheetFooter>
        <button disabled={busy || !photos.length} onClick={() => void scan()} className="w-full min-h-12 rounded-2xl bg-[#527052] text-white disabled:opacity-50">{busy ? 'Please wait…' : engine === 'gemini' ? 'Scan with Gemini' : 'Read receipt'}</button>
        <button disabled={busy} onClick={() => onResultReady(blank(), photos)} className="w-full min-h-12 text-sm">Enter receipt manually</button>
      </C2SheetFooter>
    </C2Sheet>
  )
}
