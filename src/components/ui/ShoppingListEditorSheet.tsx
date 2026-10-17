'use client'

import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Camera, Plus, Pencil, ShoppingBag, Trash2 } from '@/design/iconSystem'
import { useAppStore } from '@/store/useAppStore'
import { useLightboxStore } from '@/store/useLightboxStore'
import type { ShoppingList, ShoppingItem } from '@/types'
import { generateId, cn } from '@/lib/utils'
import { PhotoGallery } from '@/components/ui/PhotoGallery'
import { C2Sheet, C2SheetHeader, C2SheetBody, C2SheetFooter } from '@/components/ui'
import { DatePicker } from '@/components/ui/DatePicker'
import { TimePicker } from '@/components/ui/TimePicker'

const RED = '#ef4444'

/* ── Helpers ──────────────────────────────────────────────────────────────── */
export function listTotal(list: { items: Array<{ price?: number; quantity: number }> }): number {
  return list.items.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0)
}

export function resizeImage(file: File, maxPx = 900): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(maxPx / img.width, maxPx / img.height, 1)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.83))
    }
    img.src = url
  })
}

/** All photos for a list: prefer photos[], fall back to coverPhoto */
export function effectivePhotos(list: Pick<ShoppingList, 'photos' | 'coverPhoto'>): string[] {
  if (list.photos?.length) return list.photos
  if (list.coverPhoto) return [list.coverPhoto]
  return []
}

/* ── Draft item (create mode) ─────────────────────────────────────────────── */
type DraftItem = { id: string; name: string; qty: string; price: string; notes: string; photo?: string }

/* ── Props ────────────────────────────────────────────────────────────────── */
interface Props {
  mode: 'create' | 'edit'
  list?: ShoppingList       // required when mode='edit'
  onSave: (id: string) => void
  onClose: () => void
  /** true (default) = full sheet with backdrop; false = just form content */
  standalone?: boolean
}

/* ── Component ────────────────────────────────────────────────────────────── */
export function ShoppingListEditorSheet({ mode, list, onSave, onClose, standalone = true }: Props) {
  const createList      = useAppStore(s => s.createShoppingList)
  const updateList      = useAppStore(s => s.updateShoppingList)
  const addStoreItem    = useAppStore(s => s.addShoppingItem)
  const updateStoreItem = useAppStore(s => s.updateShoppingItem)
  const deleteStoreItem = useAppStore(s => s.deleteShoppingItem)
  const openLightbox    = useLightboxStore(s => s.open)

  /* ── Metadata state ───────────────────────────────────────────────────── */
  const [name,      setName]      = useState(list?.name ?? '')
  const [storeName, setStoreName] = useState(list?.storeName ?? '')
  const [date,      setDate]      = useState(list?.date ?? '')
  const [time,      setTime]      = useState(list?.time ?? '')
  const [notes,     setNotes]     = useState(list?.notes ?? '')

  /* ── Photos state ─────────────────────────────────────────────────────── */
  const initPhotos = mode === 'edit' && list ? effectivePhotos(list) : []
  const [photos,       setPhotos]       = useState<string[]>(initPhotos)
  const [photoLoading, setPhotoLoading] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  /* ── Create mode: draft items ─────────────────────────────────────────── */
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])

  /* ── Shared add-item form ─────────────────────────────────────────────── */
  const [itemName,  setItemName]  = useState('')
  const [itemQty,   setItemQty]   = useState('1')
  const [itemPrice, setItemPrice] = useState('')
  const [itemNotes, setItemNotes] = useState('')
  const [itemPhoto, setItemPhoto] = useState<string | undefined>(undefined)
  const itemPhotoRef = useRef<HTMLInputElement>(null)

  /* ── Edit mode: inline item editing ──────────────────────────────────── */
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editName,      setEditName]      = useState('')
  const [editQty,       setEditQty]       = useState('1')
  const [editPrice,     setEditPrice]     = useState('')
  const [editNotes,     setEditNotes]     = useState('')
  const [editPhoto,     setEditPhoto]     = useState<string | undefined>(undefined)
  const editPhotoRef = useRef<HTMLInputElement>(null)

  const [saving,      setSaving]      = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  /* ── Photo handling ───────────────────────────────────────────────────── */
  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setPhotoLoading(true)
    try { setPhotos(prev => [...prev, '']) // placeholder
      const resized = await resizeImage(file)
      setPhotos(prev => [...prev.slice(0, -1), resized])
    } catch { setPhotos(prev => prev.slice(0, -1)) }
    finally { setPhotoLoading(false) }
    e.target.value = ''
  }

  function removePhoto(i: number) { setPhotos(prev => prev.filter((_, idx) => idx !== i)) }

  /* ── Item photo helpers ───────────────────────────────────────────────── */
  async function handleItemPhotoPick(e: React.ChangeEvent<HTMLInputElement>, setter: (v: string | undefined) => void) {
    const file = e.target.files?.[0]; if (!file) return
    try { setter(await resizeImage(file, 600)) } catch { /* ignore */ }
    e.target.value = ''
  }

  /* ── Add item ─────────────────────────────────────────────────────────── */
  const handleAddItem = useCallback(() => {
    if (!itemName.trim()) return
    if (mode === 'create') {
      setDraftItems(prev => [...prev, {
        id: generateId(), name: itemName.trim(),
        qty: itemQty || '1', price: itemPrice, notes: itemNotes.trim(), photo: itemPhoto,
      }])
    } else if (list) {
      addStoreItem(list.id, itemName.trim(), parseFloat(itemQty) || 1, itemNotes.trim() || undefined, parseFloat(itemPrice) || undefined, itemPhoto)
    }
    setItemName(''); setItemQty('1'); setItemPrice(''); setItemNotes(''); setItemPhoto(undefined)
  }, [mode, list, itemName, itemQty, itemPrice, itemNotes, itemPhoto, addStoreItem])

  /* ── Item inline editing (edit mode) ─────────────────────────────────── */
  function startEditItem(item: ShoppingItem) {
    setEditingItemId(item.id)
    setEditName(item.name)
    setEditQty(String(item.quantity))
    setEditPrice(item.price != null ? String(item.price) : '')
    setEditNotes(item.notes ?? '')
    setEditPhoto(item.photo)
  }

  function saveItemEdit() {
    if (!list || !editingItemId || !editName.trim()) return
    updateStoreItem(list.id, editingItemId, {
      name:     editName.trim(),
      quantity: parseFloat(editQty) || 1,
      price:    parseFloat(editPrice) || undefined,
      notes:    editNotes.trim() || undefined,
      photo:    editPhoto,
    })
    setEditingItemId(null)
    setEditPhoto(undefined)
  }

  function confirmDeleteItem(itemId: string) {
    if (!list) return
    deleteStoreItem(list.id, itemId)
    if (editingItemId === itemId) setEditingItemId(null)
    setDeleteConfirmId(null)
  }

  /* ── Save ─────────────────────────────────────────────────────────────── */
  async function handleSave() {
    if (!name.trim() || saving) return
    setSaving(true)
    const validPhotos = photos.filter(p => p.length > 0)
    try {
      if (mode === 'create') {
        // Include any item the user typed but didn't press + to confirm yet
        const pendingItem: DraftItem | null = itemName.trim()
          ? { id: generateId(), name: itemName.trim(), qty: itemQty || '1', price: itemPrice, notes: itemNotes.trim(), photo: itemPhoto }
          : null
        const allItems = pendingItem ? [...draftItems, pendingItem] : draftItems

        const id = createList({
          name: name.trim(),
          storeName: storeName.trim() || undefined,
          date: date || undefined,
          time: time || undefined,
          notes: notes.trim() || undefined,
          photos: validPhotos.length ? validPhotos : undefined,
          coverPhoto: validPhotos[0] || undefined,
        })
        for (const it of allItems) {
          addStoreItem(id, it.name, parseFloat(it.qty) || 1, it.notes || undefined, parseFloat(it.price) || undefined, it.photo)
        }
        onSave(id)
      } else if (list) {
        updateList(list.id, {
          name: name.trim(),
          storeName: storeName.trim() || undefined,
          date: date || undefined,
          time: time || undefined,
          notes: notes.trim() || undefined,
          photos: validPhotos.length ? validPhotos : undefined,
          coverPhoto: validPhotos[0] || undefined,
        })
        onSave(list.id)
      }
    } finally {
      setSaving(false)
    }
  }

  /* ── Computed ─────────────────────────────────────────────────────────── */
  const draftTotal  = draftItems.reduce((s, it) => s + (parseFloat(it.price) || 0) * (parseFloat(it.qty) || 1), 0)
  const editTotal   = mode === 'edit' && list ? listTotal(list) : 0
  const displayTotal = mode === 'create' ? draftTotal : editTotal
  const liveItems   = mode === 'edit' ? (list?.items ?? []) : []

  /* ── Save button ──────────────────────────────────────────────────────── */
  const saveButton = (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={handleSave}
      disabled={!name.trim() || saving}
      className="w-full py-4 rounded-2xl text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
      style={{ background: RED }}
    >
      {saving
        ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
        : <><ShoppingBag size={16} />{mode === 'create' ? 'Create Shopping List' : 'Save Changes'}</>
      }
    </motion.button>
  )

  /* ── Form content ─────────────────────────────────────────────────────── */
  const formContent = (
    <div className="space-y-3 pb-4">
      <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} />
      <input ref={itemPhotoRef} type="file" accept="image/*" className="hidden" onChange={e => handleItemPhotoPick(e, setItemPhoto)} />
      <input ref={editPhotoRef} type="file" accept="image/*" className="hidden" onChange={e => handleItemPhotoPick(e, setEditPhoto)} />

      {/* Photos */}
      <PhotoGallery
        photos={photos}
        size="md"
        onRemove={removePhoto}
        onAddClick={() => photoRef.current?.click()}
        uploading={photoLoading}
      />

      {/* List metadata */}
      <input
        type="text" value={name} onChange={e => setName(e.target.value)}
        placeholder="List name (e.g. Groceries, IKEA) *"
        autoFocus={mode === 'create'}
        className="w-full text-sm text-gray-700 bg-gray-50 rounded-2xl px-4 py-3 outline-none"
      />
      <input
        type="text" value={storeName} onChange={e => setStoreName(e.target.value)}
        placeholder="Store name (optional)"
        className="w-full text-sm text-gray-700 bg-gray-50 rounded-2xl px-4 py-3 outline-none"
      />
      <div className="flex gap-2">
        <DatePicker value={date} onChange={setDate} placeholder="Date (optional)" className="flex-1" />
        <TimePicker value={time} onChange={setTime} className="flex-1" />
      </div>
      <textarea
        value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="Notes (optional)" rows={2}
        className="w-full text-sm text-gray-700 bg-gray-50 rounded-2xl px-4 py-3 outline-none resize-none"
      />

      {/* Items section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Items</p>
          {displayTotal > 0 && (
            <motion.p key={displayTotal.toFixed(2)} initial={{ scale: 0.9 }} animate={{ scale: 1 }}
              className="text-xs font-bold" style={{ color: RED }}>
              €{displayTotal.toFixed(2)} total
            </motion.p>
          )}
        </div>

        <div className="bg-gray-50 rounded-2xl p-3 space-y-2">
          {/* Add-item row */}
          <div className="flex items-center gap-1.5">
            {/* Item photo thumbnail / camera */}
            {itemPhoto ? (
              <div className="relative shrink-0">
                <img src={itemPhoto} alt="" className="w-8 h-8 rounded-lg object-cover cursor-pointer"
                  onClick={() => openLightbox([itemPhoto])} />
                <button
                  onClick={() => setItemPhoto(undefined)}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center"
                >
                  <X size={8} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => itemPhotoRef.current?.click()}
                className="w-8 h-8 rounded-lg border border-dashed border-gray-200 flex items-center justify-center text-gray-300 shrink-0 bg-white"
              >
                <Camera size={13} />
              </button>
            )}
            <input
              type="text" value={itemName} onChange={e => setItemName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddItem()}
              placeholder="Item name…"
              className="flex-1 text-sm text-gray-700 bg-white rounded-xl px-3 py-2 outline-none border border-gray-100 min-w-0"
            />
            <input type="number" value={itemQty} onChange={e => setItemQty(e.target.value)}
              onFocus={e => e.target.select()}
              min="0" step="any" inputMode="decimal"
              className="w-10 text-xs text-center bg-white rounded-xl px-1 py-2 outline-none border border-gray-100 shrink-0" />
            <input type="number" value={itemPrice} onChange={e => setItemPrice(e.target.value)} placeholder="€"
              min="0" step="any" inputMode="decimal"
              className="w-14 text-xs bg-white rounded-xl px-2 py-2 outline-none border border-gray-100 shrink-0" />
            <button
              onClick={handleAddItem} disabled={!itemName.trim()}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white disabled:opacity-40 shrink-0"
              style={{ background: RED }}
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Create mode: draft items */}
          {mode === 'create' && (
            <AnimatePresence initial={false}>
              {draftItems.map(it => (
                <motion.div
                  key={it.id}
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.13 }}
                  className="flex items-center gap-2 px-2.5 py-2 bg-white rounded-xl border border-gray-100"
                >
                  {it.photo && (
                    <img src={it.photo} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0 cursor-pointer"
                      onClick={() => openLightbox([it.photo!])} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">{it.name}</p>
                    <p className="text-[10px] text-gray-400">
                      ×{it.qty}
                      {it.price ? ` · €${parseFloat(it.price).toFixed(2)}` : ''}
                      {parseFloat(it.price) > 0 && parseFloat(it.qty) > 1 ? ` = €${(parseFloat(it.price) * parseFloat(it.qty)).toFixed(2)}` : ''}
                      {it.notes ? ` · ${it.notes}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => setDraftItems(prev => prev.filter(d => d.id !== it.id))}
                    className="text-gray-300 active:text-red-400 p-0.5 shrink-0"
                  >
                    <X size={13} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          )}

          {/* Edit mode: live items */}
          {mode === 'edit' && (
            <AnimatePresence initial={false}>
              {liveItems.map(item => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.13 }}
                >
                  {editingItemId === item.id ? (
                    /* Inline edit form */
                    <div className="bg-white rounded-xl border-2 p-2.5 space-y-2" style={{ borderColor: RED + '40' }}>
                      <div className="flex gap-1.5 items-center">
                        {/* Edit item photo */}
                        {editPhoto ? (
                          <div className="relative shrink-0">
                            <img src={editPhoto} alt="" className="w-8 h-8 rounded-lg object-cover cursor-pointer"
                              onClick={() => openLightbox([editPhoto])} />
                            <button
                              onClick={() => setEditPhoto(undefined)}
                              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center"
                            >
                              <X size={8} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => editPhotoRef.current?.click()}
                            className="w-8 h-8 rounded-lg border border-dashed border-gray-200 flex items-center justify-center text-gray-300 shrink-0 bg-gray-50"
                          >
                            <Camera size={13} />
                          </button>
                        )}
                        <input
                          type="text" value={editName} onChange={e => setEditName(e.target.value)}
                          autoFocus
                          className="flex-1 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-1.5 outline-none min-w-0"
                        />
                        <input
                          type="number" value={editQty} onChange={e => setEditQty(e.target.value)}
                          onFocus={e => e.target.select()}
                          min="0" step="any" inputMode="decimal"
                          className="w-12 text-xs text-center bg-gray-50 rounded-lg px-1.5 py-1.5 outline-none shrink-0"
                        />
                        <input
                          type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} placeholder="€"
                          min="0" step="any" inputMode="decimal"
                          className="w-16 text-xs bg-gray-50 rounded-lg px-2 py-1.5 outline-none shrink-0"
                        />
                      </div>
                      <input
                        type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Note (optional)"
                        className="w-full text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5 outline-none"
                      />
                      {parseFloat(editPrice) > 0 && parseFloat(editQty) > 0 && (
                        <p className="text-[10px] text-gray-400 pl-1">
                          Line total: €{(parseFloat(editPrice) * parseFloat(editQty)).toFixed(2)}
                        </p>
                      )}
                      <div className="flex gap-1.5">
                        <button
                          onClick={saveItemEdit}
                          disabled={!editName.trim()}
                          className="flex-1 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold disabled:opacity-40"
                        >Save</button>
                        <button
                          onClick={() => setEditingItemId(null)}
                          className="flex-1 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold"
                        >Cancel</button>
                        <button
                          onClick={() => setDeleteConfirmId(item.id)}
                          className="w-8 py-1.5 rounded-lg bg-red-50 text-red-400 flex items-center justify-center"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Display row */
                    <div className={cn(
                      'flex items-center gap-2 px-2.5 py-2 bg-white rounded-xl border border-gray-100 transition-opacity',
                      item.isChecked && 'opacity-50'
                    )}>
                      {item.photo && (
                        <img src={item.photo} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0 cursor-pointer"
                          onClick={() => openLightbox([item.photo!])} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium', item.isChecked ? 'line-through text-gray-400' : 'text-gray-700')}>
                          {item.name}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          ×{item.quantity}
                          {item.price != null && item.price > 0 ? ` · €${item.price.toFixed(2)}` : ''}
                          {item.quantity > 1 && item.price != null && item.price > 0
                            ? ` = €${(item.price * item.quantity).toFixed(2)}` : ''}
                          {item.notes ? ` · ${item.notes}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => startEditItem(item)}
                        className="text-gray-300 active:text-blue-400 p-1 shrink-0"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(item.id)}
                        className="text-gray-300 active:text-red-400 p-0.5 shrink-0"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}

          {mode === 'create' && draftItems.length === 0 && (
            <p className="text-center text-xs text-gray-400 py-2">No items yet — add one above</p>
          )}
          {mode === 'edit' && liveItems.length === 0 && (
            <p className="text-center text-xs text-gray-400 py-2">No items yet — add one above</p>
          )}
        </div>
      </div>

    </div>
  )

  /* ── Delete item confirm overlay ──────────────────────────────────────── */
  const deleteConfirm = deleteConfirmId && (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex items-end justify-center p-4"
        onClick={() => setDeleteConfirmId(null)}
      >
        <div className="absolute inset-0 c2-backdrop" />
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className="relative c2-sheet-bg rounded-3xl p-5 w-full max-w-xs text-center shadow-modal"
        >
          <p className="font-bold text-gray-800 mb-1">Remove item?</p>
          <p className="text-sm text-gray-400 mb-4">This can&apos;t be undone.</p>
          <div className="flex gap-2">
            <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 rounded-2xl c2-sheet-cancel font-medium text-sm">Cancel</button>
            <button onClick={() => confirmDeleteItem(deleteConfirmId)} className="flex-1 py-3 rounded-2xl c2-sheet-danger font-medium text-sm">Remove</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )

  /* ── Render ───────────────────────────────────────────────────────────── */
  if (!standalone) {
    return (
      <>
        {formContent}
        <div className="pb-4">{saveButton}</div>
        {deleteConfirm}
      </>
    )
  }

  return (
    <>
      <C2Sheet open zIndex={60} onClose={onClose} aria-label={mode === 'create' ? 'New Shopping List' : 'Edit Shopping List'}>
        <C2SheetHeader
          title={mode === 'create' ? 'New Shopping List' : 'Edit Shopping List'}
          onClose={onClose}
        />
        <C2SheetBody>{formContent}</C2SheetBody>
        <C2SheetFooter>{saveButton}</C2SheetFooter>
      </C2Sheet>

      {deleteConfirm}
    </>
  )
}
