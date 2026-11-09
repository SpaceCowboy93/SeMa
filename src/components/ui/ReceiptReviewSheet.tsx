'use client'

import { useRef, useState } from 'react'
import type { ReceiptResult, ReceiptItem } from '@/types'
import { financialWarnings, type ScanResult } from '@/lib/receipt-sections'
import { ReceiptRowPreview } from './ReceiptRowPreview'
import { generateId } from '@/lib/utils'
import { roundMoney, validateReceipt } from '@/lib/receipt-parser'
import { C2Sheet, C2SheetHeader, C2SheetBody, C2SheetFooter } from './C2Sheet'
import { ReceiptScannerSheet } from './ReceiptScannerSheet'

interface Props {
  result: ScanResult | null
  photos: string[]
  onClose: () => void
  onSave: (result: ReceiptResult) => void | Promise<void>
}
const newItem = (): ReceiptItem => ({ id: generateId(), name: '', quantity: 1, unitPrice: 0, lineTotal: 0 })
const inputClass = 'w-full min-w-0 min-h-11 rounded-xl bg-white border border-gray-200 px-3 text-base'
const details = (result: ScanResult | null): ReceiptResult => ({
  store: result?.store ?? '', date: result?.date ?? '', currency: result?.currency ?? 'EUR',
  items: result?.items ?? [newItem()], subtotal: result?.subtotal ?? 0,
  tax: result?.tax ?? 0, grandTotal: result?.grandTotal ?? 0,
})

export function ReceiptReviewSheet({ result, photos: initialPhotos, onClose, onSave }: Props) {
  const [photos, setPhotos] = useState(initialPhotos)
  const [candidatePhotos, setCandidatePhotos] = useState<string[]>([])
  const [source, setSource] = useState(result)
  const evidence = source?.evidence
  const [receipt, setReceipt] = useState<ReceiptResult>(() => details(result))
  const [retrying, setRetrying] = useState(false)
  const [candidate, setCandidate] = useState<ScanResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState('')
  const [reviewed, setReviewed] = useState<number[]>([])
  const [acceptedReceipt, setAcceptedReceipt] = useState<ReceiptResult>()
  const discrepancies = financialWarnings(receipt)
  const lock = useRef(false)
  function editItem(index: number, patch: Partial<ReceiptItem>) {
    setReceipt(r => ({ ...r, items: r.items.map((item, i) => {
      if (i !== index) return item
      const next = { ...item, ...patch }
      if ('quantity' in patch || 'unitPrice' in patch) next.lineTotal = roundMoney(next.quantity * next.unitPrice)
      return next
    }) }))
  }
  async function save() {
    if (lock.current) return
    const checked = { ...receipt, store: receipt.store.trim(), subtotal: roundMoney(receipt.items.reduce((s, i) => s + i.lineTotal, 0)), tax: 0 }
    const message = validateReceipt(checked)
    if (message) { setError(message); return }
    if (reviewed.length < (evidence?.warnings.length ?? 0) || (discrepancies.length && acceptedReceipt !== receipt)) {
      setError('Review each flagged row and financial difference before confirming.')
      return
    }
    lock.current = true; setSaving(true); setError('')
    try { await onSave(checked); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save the receipt. Please try again.') }
    finally { lock.current = false; setSaving(false) }
  }
  const subtotal = roundMoney(receipt.items.reduce((sum, item) => sum + item.lineTotal, 0))
  // This component stays mounted while retrying, retaining the full edited draft,
  // row acknowledgements and financial review until explicit replacement.
  if (retrying) return <ReceiptScannerSheet initialPhotos={photos} onClose={() => setRetrying(false)} onResultReady={(next, nextPhotos) => { setCandidate(next); setCandidatePhotos(nextPhotos); setRetrying(false) }} />
  return (
    <C2Sheet open fitVisualViewport onClose={() => { if (!lock.current) onClose() }} aria-label="Review shopping receipt" zIndex={80}>
      <C2SheetHeader title="Review receipt" subtitle="Check each field before saving" onClose={() => { if (!lock.current) onClose() }} />
      <C2SheetBody className="space-y-4">
        <p className="text-sm text-gray-600">OCR can miss items, discounts and quantities. Compare with your receipt. The confirmed total below is the amount added to Shopping in Finances.</p>
        {source?.engine && <p className="text-xs text-gray-500">{source.engine === 'tesseract' ? 'On-device · Tesseract' : 'Cloud · Gemini'}{source.elapsedMs !== undefined && ` · ${(source.elapsedMs / 1000).toFixed(1)} seconds`}</p>}
        {photos.length > 0 && <button disabled={saving} className="min-h-12 w-full rounded-xl border border-gray-300 text-sm" onClick={() => { setCandidate(null); setRetrying(true) }}>Retry these photos with another engine</button>}
        {candidate && <div className="rounded-xl bg-amber-50 p-3 space-y-2">
          <p className="text-sm">New scan: {candidate.items.length} products{candidate.elapsedMs !== undefined && ` in ${(candidate.elapsedMs / 1000).toFixed(1)} seconds`}. Your reviewed details and edits are still kept. Replace them only if you want to use this scan.</p>
          <button className="min-h-12 w-full rounded-xl border border-gray-300" onClick={() => setCandidate(null)}>Keep my reviewed details</button>
          <button className="min-h-12 w-full rounded-xl bg-[#527052] text-white" onClick={() => { setReceipt(details(candidate)); setPhotos(candidatePhotos); setSource(candidate); setCandidate(null); setReviewed([]); setAcceptedReceipt(undefined); setSelected(''); setError('') }}>Replace reviewed details with this scan</button>
        </div>}
        {photos.length > 0 && <details><summary className="min-h-11 text-sm">View receipt photos</summary>{photos.map((src, index) =>
          // eslint-disable-next-line @next/next/no-img-element
          <img key={index} src={src} alt={`Original receipt ${index + 1}`} className="w-full rounded-xl mb-2" />)}</details>}
        <fieldset disabled={saving} className="space-y-4 min-w-0">
          <label className="block text-sm">Shop<input className={inputClass} value={receipt.store} onChange={e => setReceipt(r => ({ ...r, store: e.target.value }))} /></label>
          <label className="block text-sm">Purchase date<input className={inputClass} type="date" value={receipt.date} onChange={e => setReceipt(r => ({ ...r, date: e.target.value }))} /></label>
          {evidence?.warnings.map((warning, i) => <div key={i} className="p-3 rounded-xl bg-amber-50 space-y-2">
            <p className="text-sm">{warning.message} Photo {warning.position.photo + 1}{warning.text && ` · ${warning.text}`}</p>
            <ReceiptRowPreview photos={photos} position={warning.position} />
            <label className="flex gap-2 items-center min-h-11 text-sm"><input type="checkbox" checked={reviewed.includes(i)} onChange={e => setReviewed(ids => e.target.checked ? [...ids, i] : ids.filter(id => id !== i))} />I checked this row against the products below</label>
          </div>)}
          {receipt.items.map((item, index) => <div key={item.id} onClick={() => setSelected(item.id)} onFocus={() => setSelected(item.id)} className="rounded-2xl bg-gray-50 p-3 space-y-2">
            {evidence?.positions[item.id] && <button type="button" className="min-h-11 text-sm text-[#527052]" onClick={() => setSelected(item.id)}>Locate product {index + 1} on photo {evidence.positions[item.id].photo + 1}</button>}
            {selected === item.id && evidence?.positions[item.id] && <ReceiptRowPreview photos={photos} position={evidence.positions[item.id]} />}
            {item.confidence !== undefined && item.confidence < 0.65 && <p className="text-xs text-amber-800">Hard to read — please check this item.</p>}
            <label className="block text-sm">Product {index + 1}<input className={inputClass} value={item.name} onChange={e => editItem(index, { name: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">Quantity<input className={inputClass} inputMode="decimal" type="number" min="0.001" step="any" value={Number.isFinite(item.quantity) ? item.quantity : ''} onChange={e => editItem(index, { quantity: e.target.valueAsNumber })} /></label>
              <label className="text-sm">Unit price (€)<input className={inputClass} inputMode="decimal" type="number" step="0.01" value={Number.isFinite(item.unitPrice) ? item.unitPrice : ''} onChange={e => editItem(index, { unitPrice: e.target.valueAsNumber })} /></label>
            </div>
            <label className="block text-sm">Line total (€)<input className={inputClass} inputMode="decimal" type="number" step="0.01" value={Number.isFinite(item.lineTotal) ? item.lineTotal : ''} onChange={e => editItem(index, { lineTotal: e.target.valueAsNumber })} /></label>
            <button className="min-h-11 text-sm text-gray-600" onClick={() => setReceipt(r => ({ ...r, items: r.items.filter((_, i) => i !== index) }))}>Remove product {index + 1}</button>
          </div>)}
          <button className="min-h-12 w-full rounded-xl border border-gray-300" onClick={() => setReceipt(r => ({ ...r, items: [...r.items, newItem()] }))}>Add product / discount</button>
          <p className="text-sm">Item sum: €{Number.isFinite(subtotal) ? subtotal.toFixed(2) : '—'}</p>
          <label className="block font-medium text-sm">Total paid (€)<input className={inputClass} inputMode="decimal" type="number" min="0.01" step="0.01" value={Number.isFinite(receipt.grandTotal) ? receipt.grandTotal : ''} onChange={e => setReceipt(r => ({ ...r, grandTotal: e.target.valueAsNumber }))} /></label>
          <p className="text-xs text-gray-500">Use the final EUR total after discounts, including VAT and deposits. VAT is not added again.</p>
          {discrepancies.map((message, i) => <p key={i} className="text-sm text-amber-800">{message}</p>)}
          {discrepancies.length > 0 && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={acceptedReceipt === receipt} onChange={e => setAcceptedReceipt(e.target.checked ? receipt : undefined)} />I checked these differences and verified the total paid</label>}
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </C2SheetBody>
      <C2SheetFooter><button disabled={saving} className="w-full min-h-12 rounded-2xl bg-[#527052] text-white disabled:opacity-50" onClick={() => void save()}>{saving ? 'Saving…' : 'Confirm purchase & add to Finances'}</button></C2SheetFooter>
    </C2Sheet>
  )
}
