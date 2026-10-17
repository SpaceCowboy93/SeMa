'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trash2, AlertTriangle } from '@/design/iconSystem'
import { useAppStore } from '@/store/useAppStore'
import { type ReceiptResult, type ReceiptItem } from '@/types'
import { cn, generateId } from '@/lib/utils'
import { DatePicker } from '@/components/ui/DatePicker'

const CONFIDENCE_WARN = 0.65

interface Props {
  result: ReceiptResult | null   // null = manual entry (blank form)
  photos: string[]
  onClose: () => void
  onSave: (result: ReceiptResult) => void
}

function blankResult(): ReceiptResult {
  return { store: '', date: '', currency: 'EUR', items: [], subtotal: 0, tax: 0, grandTotal: 0 }
}

function blankItem(): ReceiptItem {
  return { id: generateId(), name: '', quantity: 1, unitPrice: 0, lineTotal: 0 }
}

function computeTotals(items: ReceiptItem[], tax: number) {
  const subtotal   = items.reduce((s, it) => s + it.lineTotal, 0)
  const grandTotal = parseFloat((subtotal + tax).toFixed(2))
  return { subtotal: parseFloat(subtotal.toFixed(2)), grandTotal }
}

export function ReceiptReviewSheet({ result: initialResult, photos, onClose, onSave }: Props) {
  const currentUser = useAppStore(s => s.currentUser)
  const primary     = currentUser === 'seval' ? '#8b5cf6' : '#14b8a6'

  const [store,    setStore]    = useState(initialResult?.store    ?? '')
  const [date,     setDate]     = useState(initialResult?.date     ?? '')
  const [currency, setCurrency] = useState(initialResult?.currency ?? 'EUR')
  const [tax,      setTax]      = useState(initialResult?.tax      ?? 0)
  const [items,    setItems]    = useState<ReceiptItem[]>(
    initialResult?.items.length
      ? initialResult.items.map(it => ({ ...it, id: it.id ?? generateId() }))
      : [blankItem()]
  )

  function updateItem(idx: number, patch: Partial<ReceiptItem>) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const next = { ...it, ...patch }
      if (!('lineTotal' in patch)) {
        next.lineTotal = parseFloat((next.quantity * next.unitPrice).toFixed(2))
      }
      return next
    }))
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function handleSave() {
    const validItems = items.filter(it => it.name.trim())
    const { subtotal, grandTotal } = computeTotals(validItems, tax)
    onSave({
      store:     store.trim() || 'Receipt',
      date:      date || new Date().toISOString().slice(0, 10),
      currency,
      items:     validItems,
      subtotal,
      tax,
      grandTotal,
    })
    onClose()
  }

  const { subtotal, grandTotal } = computeTotals(items, tax)
  const hasLowConfidence = items.some(it => it.confidence !== undefined && it.confidence < CONFIDENCE_WARN)
  const isManual = !initialResult

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[80] c2-backdrop"
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 360 }}
        className="fixed bottom-0 left-0 right-0 z-[80] c2-sheet-bg rounded-t-[2rem] shadow-modal max-w-lg mx-auto max-h-[92vh] overflow-y-auto"
      >
        <div className="px-5 pt-4 pb-12">
          <div className="drag-handle mb-5" />

          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-gray-800">
                {isManual ? 'Enter Receipt' : 'Review Receipt'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {isManual ? 'Fill in the details manually' : 'Check and correct the scanned details'}
              </p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full c2-sheet-x shrink-0">
              <X size={16} />
            </button>
          </div>

          {/* Low-confidence warning */}
          <AnimatePresence>
            {hasLowConfidence && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="mb-4 flex items-start gap-2 px-4 py-3 rounded-2xl bg-amber-50 text-amber-700"
              >
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed">
                  Some fields were hard to read — highlighted items may need correction.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Receipt photos */}
          {photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-hide">
              {photos.map((src, i) => (
                <img key={i} src={src} alt="" className="w-20 h-24 object-cover rounded-xl shrink-0 border border-gray-100" />
              ))}
            </div>
          )}

          {/* Store + Date + Currency */}
          <div className="space-y-2 mb-4">
            <div className="c2-sheet-section px-4 py-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Store / Merchant</p>
              <input
                value={store} onChange={e => setStore(e.target.value)}
                placeholder="e.g. Carrefour"
                className="w-full text-sm text-gray-800 bg-transparent outline-none"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 bg-gray-50 rounded-2xl px-4 py-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Date</p>
                <DatePicker value={date} onChange={setDate}
                  triggerClassName="bg-transparent px-0 py-0 rounded-none text-sm text-gray-700" />
              </div>
              <div className="w-24 bg-gray-50 rounded-2xl px-4 py-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Currency</p>
                <input
                  value={currency} onChange={e => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                  placeholder="EUR"
                  className="w-full text-sm text-gray-700 bg-transparent outline-none"
                />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="mb-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Items</p>

            {/* Column labels */}
            <div className="grid grid-cols-[1fr_56px_72px_28px] gap-1.5 px-2 mb-1">
              <span className="text-[9px] font-bold text-gray-300 uppercase">Name</span>
              <span className="text-[9px] font-bold text-gray-300 uppercase text-center">Qty</span>
              <span className="text-[9px] font-bold text-gray-300 uppercase text-right">Price</span>
              <span />
            </div>

            <div className="space-y-1.5">
              <AnimatePresence initial={false}>
                {items.map((it, idx) => {
                  const isLowConf = it.confidence !== undefined && it.confidence < CONFIDENCE_WARN
                  return (
                    <motion.div
                      key={it.id}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div className={cn(
                        'grid grid-cols-[1fr_56px_72px_28px] gap-1.5 px-2 py-2.5 rounded-xl',
                        isLowConf ? 'bg-amber-50' : 'bg-gray-50'
                      )}>
                        <input
                          value={it.name}
                          onChange={e => updateItem(idx, { name: e.target.value })}
                          placeholder="Item name"
                          className={cn('text-sm bg-transparent outline-none truncate', isLowConf ? 'text-amber-800' : 'text-gray-800')}
                        />
                        <input
                          type="number" min={1}
                          value={it.quantity}
                          onChange={e => updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })}
                          onFocus={e => e.target.select()}
                          className="text-sm text-center bg-transparent outline-none text-gray-700 w-full"
                        />
                        <input
                          type="number" min={0} step={0.01}
                          value={it.unitPrice}
                          onChange={e => updateItem(idx, { unitPrice: Number(e.target.value) })}
                          onFocus={e => e.target.select()}
                          className={cn('text-sm text-right bg-transparent outline-none w-full', isLowConf ? 'text-amber-800' : 'text-gray-700')}
                        />
                        <button onClick={() => removeItem(idx)} className="flex items-center justify-center text-gray-300 active:text-red-400">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* Totals */}
          <div className="c2-sheet-section px-4 py-3 mb-6 space-y-2">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span>{currency} {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Tax</span>
              <input
                type="number" min={0} step={0.01}
                value={tax} onChange={e => setTax(Number(e.target.value))}
                onFocus={e => e.target.select()}
                className="text-right text-sm text-gray-700 bg-transparent outline-none w-24"
              />
            </div>
            <div className="h-px bg-gray-200" />
            <div className="flex items-center justify-between text-sm font-bold text-gray-800">
              <span>Total</span>
              <span>{currency} {grandTotal.toFixed(2)}</span>
            </div>
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSave}
            disabled={items.filter(it => it.name.trim()).length === 0}
            className="w-full py-4 rounded-2xl text-white text-sm font-semibold disabled:opacity-40"
            style={{ background: primary }}
          >
            Save receipt
          </motion.button>
        </div>
      </motion.div>
    </>
  )
}
