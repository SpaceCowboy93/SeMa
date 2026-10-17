'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Clock, FileText, Plus, Check, Camera, Mail, type LucideIcon, CalendarCheck2, Sparkles, Gift, Heart, ShoppingCart } from '@/design/iconSystem'
import { useAppStore } from '@/store/useAppStore'
import { useLightboxStore } from '@/store/useLightboxStore'
import type { EventColor, EventTodo, WishlistItem, Goal } from '@/types'
import { generateId, cn } from '@/lib/utils'
import { ShoppingListEditorSheet } from '@/components/ui/ShoppingListEditorSheet'
import { Chip, ChipGroup, C2Sheet, C2SheetHeader, C2SheetBody, C2SheetFooter } from '@/components/ui'
import { DatePicker } from '@/components/ui/DatePicker'
import { TimePicker } from '@/components/ui/TimePicker'

/* ── Types ─────────────────────────────────────────────────────────────── */
type CreateType = 'moment' | 'plan' | 'dream' | 'wish' | 'note' | 'shopping'

const COLOR_OPTIONS = [
  { value: 'seval',  hex: '#a78bfa', label: 'Wishes'  },
  { value: 'blue',   hex: '#60a5fa', label: 'Dreams'  },
  { value: 'yellow', hex: '#fbbf24', label: 'Moments' },
  { value: 'green',  hex: '#34d399', label: 'Plans'   },
] as const

type TypeConfig = {
  icon: LucideIcon
  label: string
  placeholder: string
  defaultColor: EventColor
  saveLabel: string
  showColor: boolean
  showDate: boolean
  showChecklist: boolean
  showPhotos: boolean
  noteMode: boolean  // true = single textarea content, no extras
  shopMode?: boolean // true = render ShoppingListEditorSheet instead of generic form
  chipHex?: string   // override chip color (e.g. shopping red)
}

const TYPE_CONFIG: Record<CreateType, TypeConfig> = {
  moment: {
    icon: Heart, label: 'Moment',
    placeholder: 'Name this moment...',
    defaultColor: 'yellow', saveLabel: 'Save Moment',
    showColor: false, showDate: true, showChecklist: true, showPhotos: true, noteMode: false,
  },
  plan: {
    icon: CalendarCheck2, label: 'Plan',
    placeholder: 'What do you want to plan?',
    defaultColor: 'green', saveLabel: 'Save Plan',
    showColor: false, showDate: true, showChecklist: true, showPhotos: true, noteMode: false,
  },
  dream: {
    icon: Sparkles, label: 'Dream',
    placeholder: 'What do you dream of?',
    defaultColor: 'blue', saveLabel: 'Save Dream',
    showColor: false, showDate: true, showChecklist: true, showPhotos: true, noteMode: false,
  },
  wish: {
    icon: Gift, label: 'Wish',
    placeholder: 'What do you wish for?',
    defaultColor: 'seval', saveLabel: 'Save Wish',
    showColor: false, showDate: true, showChecklist: true, showPhotos: true, noteMode: false,
  },
  note: {
    icon: Mail, label: 'Note',
    placeholder: 'Write something from the heart...',
    defaultColor: 'seval', saveLabel: 'Send with love',
    showColor: false, showDate: false, showChecklist: false, showPhotos: false, noteMode: true, shopMode: false, chipHex: undefined,
  },
  shopping: {
    icon: ShoppingCart, label: 'Shopping',
    placeholder: '',
    defaultColor: 'green', saveLabel: '',
    showColor: false, showDate: false, showChecklist: false, showPhotos: false,
    noteMode: false, shopMode: true, chipHex: '#ef4444',
  },
}

/* ── Props ──────────────────────────────────────────────────────────────── */
interface Props {
  open: boolean
  onClose: () => void
  primary: string
  initialDate?: string
  initialType?: CreateType
}

/* ── Component ──────────────────────────────────────────────────────────── */
export function FullCreateSheet({ open, onClose, primary, initialDate, initialType }: Props) {
  const currentUser       = useAppStore(s => s.currentUser)!
  const openLightbox      = useLightboxStore(s => s.open)
  const addEvent          = useAppStore(s => s.addEvent)
  const updateEvent       = useAppStore(s => s.updateEvent)
  const uploadEventPhoto  = useAppStore(s => s.uploadEventPhoto)
  const addTodo           = useAppStore(s => s.addTodo)
  const updateTodo        = useAppStore(s => s.updateTodo)
  const uploadTodoPhoto   = useAppStore(s => s.uploadTodoPhoto)
  const addGoal           = useAppStore(s => s.addGoal)
  const updateGoal        = useAppStore(s => s.updateGoal)
  const addWishlistItem   = useAppStore(s => s.addWishlistItem)
  const updateWishlistItem = useAppStore(s => s.updateWishlistItem)
  const uploadPhoto       = useAppStore(s => s.uploadPhoto)
  const sendPartnerNote   = useAppStore(s => s.sendPartnerNote)

  const [type,       setType]       = useState<CreateType>('moment')
  const [title,      setTitle]      = useState('')
  const [notes,      setNotes]      = useState('')
  const [date,       setDate]       = useState('')
  const [time,       setTime]       = useState('')
  const [color,      setColor]      = useState<EventColor>('yellow')
  const [checkItems,       setCheckItems]       = useState<EventTodo[]>([])
  const [newItem,          setNewItem]          = useState('')
  const [editingCheckId,   setEditingCheckId]   = useState<string | null>(null)
  const [editingCheckText, setEditingCheckText] = useState('')
  const [photos,     setPhotos]     = useState<string[]>([])      // blob or real URLs
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [bgPhotoIdx, setBgPhotoIdx] = useState<number | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [sent,       setSent]       = useState(false)

  const photoInputRef = useRef<HTMLInputElement>(null)
  const cfg = TYPE_CONFIG[type]

  // Pre-populate date when opened from a specific date context (e.g. calendar)
  useEffect(() => {
    if (open && initialDate) setDate(initialDate)
  }, [open, initialDate])

  // Pre-select type when opened from a category context (e.g. Planner category sheets)
  useEffect(() => {
    if (open && initialType) {
      setType(initialType)
      setColor(TYPE_CONFIG[initialType].defaultColor)
    }
  }, [open, initialType])

  function reset() {
    setTitle(''); setNotes(''); setDate(''); setTime('')
    setCheckItems([]); setNewItem(''); setEditingCheckId(null); setEditingCheckText('')
    setPhotos([]); setPendingFiles([])
    setBgPhotoIdx(null); setSaving(false)
    setUploading(false); setUploadError(null); setSent(false)
  }

  function close() { reset(); onClose() }

  function switchType(t: CreateType) {
    setType(t)
    setColor(TYPE_CONFIG[t].defaultColor)
    // Keep title, notes, date, time, checkItems, photos across type switches
  }

  /* ── Checklist ────────────────────────────────────────────────────────── */
  function addCheckItem() {
    if (!newItem.trim()) return
    setCheckItems(prev => [...prev, { id: generateId(), title: newItem.trim(), isCompleted: false }])
    setNewItem('')
  }
  function toggleCheck(id: string) {
    setCheckItems(prev => prev.map(i => i.id === id ? { ...i, isCompleted: !i.isCompleted } : i))
  }
  function removeCheck(id: string) {
    setCheckItems(prev => prev.filter(i => i.id !== id))
    if (editingCheckId === id) setEditingCheckId(null)
  }
  function startEditCheck(id: string, title: string) {
    setEditingCheckId(id)
    setEditingCheckText(title)
  }
  function commitEditCheck() {
    if (!editingCheckId) return
    const text = editingCheckText.trim()
    if (text) setCheckItems(prev => prev.map(i => i.id === editingCheckId ? { ...i, title: text } : i))
    setEditingCheckId(null)
  }

  /* ── Photos ───────────────────────────────────────────────────────────── */
  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    setPhotos(prev => [...prev, previewUrl])
    setPendingFiles(prev => [...prev, file])
    if (e.target) e.target.value = ''
  }

  function removePhoto(i: number) {
    setPhotos(prev => prev.filter((_, idx) => idx !== i))
    setPendingFiles(prev => prev.filter((_, idx) => idx !== i))
    if (bgPhotoIdx === i) setBgPhotoIdx(null)
    else if (bgPhotoIdx !== null && bgPhotoIdx > i) setBgPhotoIdx(bgPhotoIdx - 1)
  }

  /* ── Upload helper ────────────────────────────────────────────────────── */
  async function uploadPendingFiles(folder: string): Promise<string[]> {
    const urls: string[] = []
    for (const file of pendingFiles) {
      const url = await uploadPhoto(folder, file)
      if (url) urls.push(url)
    }
    return urls
  }

  /* ── Save ─────────────────────────────────────────────────────────────── */
  async function handleSave() {
    if (!title.trim() || saving) return
    setSaving(true)
    setUploadError(null)

    try {
      if (type === 'note') {
        sendPartnerNote(title.trim())
        setSent(true)
        setSaving(false)
        setTimeout(() => close(), 1800)
        return
      }

      const editedItems = editingCheckId && editingCheckText.trim()
        ? checkItems.map(item => item.id === editingCheckId ? { ...item, title: editingCheckText.trim() } : item) : checkItems
      const finalItems = newItem.trim() ? [...editedItems, { id: generateId(), title: newItem.trim(), isCompleted: false }] : editedItems
      setCheckItems(finalItems); setNewItem(''); setEditingCheckId(null)
      const checkStrings = finalItems.map(i => i.title)

      if (type === 'moment') {
        const newId = addEvent({
          title:      title.trim(),
          date:       date || new Date().toISOString().slice(0, 10),
          startTime:  time || undefined,
          notes:      notes.trim() || undefined,
          color,
          todos:      finalItems,
          createdBy:  currentUser,
        })
        // Upload photos; track indices for backgroundPhoto
        setUploading(true)
        for (const file of pendingFiles) {
          await uploadEventPhoto(newId, file)
        }
        // Resolve background from real stored URLs
        if (bgPhotoIdx !== null && pendingFiles.length > 0) {
          const stored = useAppStore.getState().events.find(e => e.id === newId)
          const bpUrl  = stored?.photos?.[bgPhotoIdx]
          if (bpUrl) updateEvent(newId, { backgroundPhoto: bpUrl })
        }
        setUploading(false)

      } else if (type === 'plan') {
        const newId = addTodo(
          title.trim(),
          finalItems.length ? checkStrings : undefined,
          date || undefined,
          color,
          notes.trim() || undefined,
          time || undefined,
        )
        if (pendingFiles.length > 0) {
          setUploading(true)
          await uploadTodoPhoto(newId, pendingFiles[0])
          // If multiple files, upload sequentially
          for (let i = 1; i < pendingFiles.length; i++) {
            await uploadTodoPhoto(newId, pendingFiles[i])
          }
          if (bgPhotoIdx !== null) {
            const stored = useAppStore.getState().todos.find(t => t.id === newId)
            const bpUrl  = stored?.photos?.[bgPhotoIdx]
            if (bpUrl) updateTodo(newId, { backgroundPhoto: bpUrl })
          }
          setUploading(false)
        }

      } else if (type === 'dream') {
        // Pass checklist atomically to addGoal so it lands on goal.checklist AND
        // event.todos in a single synchronous store write — same pattern as startTime.
        const newId = addGoal(
          'life',
          title.trim(),
          notes.trim() || undefined,
          date || undefined,
          0,
          time || undefined,
          finalItems,
        )
        const updates: Partial<Goal> = {}
        if (pendingFiles.length > 0) {
          setUploading(true)
          const urls = await uploadPendingFiles(`goals/${newId}`)
          if (urls.length) updates.photos = urls
          if (bgPhotoIdx !== null && urls[bgPhotoIdx]) updates.backgroundPhoto = urls[bgPhotoIdx]
          setUploading(false)
        }
        if (Object.keys(updates).length) updateGoal(newId, updates)

      } else if (type === 'wish') {
        const newId = addWishlistItem(title.trim(), 'plan', notes.trim() || undefined)
        const updates: Partial<WishlistItem> = {}
        if (date)              updates.date = date
        if (time)              updates.startTime = time
        if (finalItems.length) updates.checklist = checkStrings
        if (pendingFiles.length > 0) {
          setUploading(true)
          const urls = await uploadPendingFiles(`wishes/${newId}`)
          if (urls.length) updates.photos = urls
          if (bgPhotoIdx !== null && urls[bgPhotoIdx]) updates.backgroundPhoto = urls[bgPhotoIdx]
          setUploading(false)
        }
        if (Object.keys(updates).length) updateWishlistItem(newId, updates)
      }

      close()
    } catch (err) {
      console.error('[FullCreateSheet] save error:', err)
      setUploadError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = !!title.trim() && !saving
  const activeColor = COLOR_OPTIONS.find(c => c.value === color)

  return (
    <C2Sheet open={open} onClose={close} aria-label="Add something">
      <C2SheetHeader title="Add something" onClose={close} />

      {/* Type selector chips — full-bleed horizontal scroll between header and body */}
      <div className="pb-3 shrink-0 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="flex gap-2 px-5 pb-1 min-w-max">
          {(Object.keys(TYPE_CONFIG) as CreateType[]).map(t => {
            const tc = TYPE_CONFIG[t]
            const col = COLOR_OPTIONS.find(c => c.value === tc.defaultColor)
            const chipHex = tc.chipHex ?? col?.hex ?? primary
            return (
              <Chip
                key={t}
                icon={tc.icon}
                label={tc.label}
                selected={type === t}
                activeColor={chipHex}
                onClick={() => switchType(t)}
              />
            )
          })}
        </div>
      </div>

      <C2SheetBody>
              <AnimatePresence mode="wait">
                {/* Sent state (note) */}
                {sent ? (
                  <motion.div
                    key="sent"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center py-8 text-center"
                  >
                    <motion.div
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ repeat: 2, duration: 0.4 }}
                      className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
                      style={{ background: 'rgba(158,201,179,0.18)', color: '#7BBBA5' }}
                    >
                      <Mail size={32} strokeWidth={1.5} />
                    </motion.div>
                    <p className="font-bold text-gray-800">Sent</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key={type}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4 pb-4"
                  >
                    {/* Shopping list mode — render dedicated editor, no generic form */}
                    {cfg.shopMode ? (
                      <ShoppingListEditorSheet
                        mode="create"
                        onSave={close}
                        onClose={close}
                        standalone={false}
                      />
                    ) : (
                    <>
                    {/* Title */}
                    <div className="mb-2">
                      {cfg.noteMode ? (
                        <textarea
                          value={title}
                          onChange={e => setTitle(e.target.value)}
                          placeholder={cfg.placeholder}
                          rows={5}
                          autoFocus
                          enterKeyHint="send"
                          className="w-full text-xl font-semibold text-gray-800 placeholder:text-gray-300
                                     border-b-2 border-gray-100 focus:border-gray-200 pb-3 outline-none
                                     transition-colors bg-transparent resize-none leading-snug rounded-none focus-visible:shadow-none"
                        />
                      ) : (
                        <input
                          type="text"
                          value={title}
                          onChange={e => setTitle(e.target.value)}
                          placeholder={cfg.placeholder}
                          autoFocus
                          enterKeyHint="next"
                          className="w-full text-xl font-semibold text-gray-800 placeholder:text-gray-300
                                     border-b-2 border-gray-100 focus:border-gray-200 text-center py-3 outline-none
                                     transition-colors bg-transparent rounded-none focus-visible:shadow-none"
                        />
                      )}
                    </div>

                    {!cfg.noteMode && (
                      <>
                        {/* Date & Time */}
                        {cfg.showDate && (
                          <div className="c2-sheet-section p-4 space-y-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-white shadow-card flex items-center justify-center shrink-0">
                                <Clock size={14} className="text-gray-400" />
                              </div>
                              <DatePicker
                                value={date}
                                onChange={setDate}
                                className="flex-1"
                                triggerClassName="bg-transparent px-0 py-0 rounded-none text-sm text-gray-700"
                              />
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 shrink-0" />
                              <TimePicker
                                value={time}
                                onChange={setTime}
                                className="flex-1"
                                triggerClassName="bg-white rounded-xl px-3 py-1.5 shadow-card"
                              />
                              <span className="text-xs text-gray-400 shrink-0">start time</span>
                            </div>
                          </div>
                        )}

                        {/* Notes */}
                        <div className="c2-sheet-section p-4 flex gap-3">
                          <div className="w-8 h-8 rounded-xl bg-white shadow-card flex items-center justify-center shrink-0">
                            <FileText size={14} className="text-gray-400" />
                          </div>
                          <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Add notes..."
                            rows={3}
                            className="flex-1 text-sm text-gray-700 bg-transparent outline-none resize-none
                                       placeholder:text-gray-300"
                          />
                        </div>

                        {/* Checklist */}
                        {cfg.showChecklist && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                              Checklist
                            </p>
                            <div className="space-y-2">
                              {checkItems.map(item => (
                                <div key={item.id} className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => toggleCheck(item.id)}
                                    aria-label={`Mark "${item.title}" ${item.isCompleted ? 'not done' : 'done'}`}
                                    aria-pressed={item.isCompleted}
                                    className={cn(
                                      'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                                      item.isCompleted ? 'border-emerald-400 bg-emerald-400' : 'border-gray-300'
                                    )}
                                  >
                                    {item.isCompleted && <Check size={11} color="white" strokeWidth={3} />}
                                  </button>
                                  {editingCheckId === item.id ? (
                                    <input
                                      autoFocus
                                      value={editingCheckText}
                                      aria-label="Checklist item text"
                                      onChange={e => setEditingCheckText(e.target.value)}
                                      onBlur={commitEditCheck}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter')  { e.preventDefault(); commitEditCheck() }
                                        if (e.key === 'Escape') { setEditingCheckId(null) }
                                      }}
                                      className="flex-1 text-sm text-gray-700 outline-none bg-transparent border-b border-gray-200 pb-0.5 rounded-none focus-visible:shadow-none"
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      className={cn(
                                        'flex-1 text-left text-sm',
                                        item.isCompleted ? 'line-through text-gray-400' : 'text-gray-700'
                                      )}
                                      onPointerDown={() => startEditCheck(item.id, item.title)}
                                    >
                                      {item.title}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => removeCheck(item.id)}
                                    aria-label={`Remove "${item.title}"`}
                                    className="text-gray-300 active:text-red-400 transition-all"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ))}
                              <div className="flex items-center gap-3 mt-2">
                                <div className="w-5 h-5 rounded-full border-2 border-dashed border-gray-200 shrink-0" />
                                <input
                                  type="text"
                                  value={newItem}
                                  onChange={e => setNewItem(e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && addCheckItem()}
                                  placeholder="Add item..."
                                  className="flex-1 text-sm text-gray-600 placeholder:text-gray-300
                                             outline-none bg-transparent"
                                />
                                {newItem && (
                                  <button onClick={addCheckItem} className="text-gray-400 active:text-gray-600">
                                    <Plus size={16} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Photos */}
                        {cfg.showPhotos && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                              Photos
                            </p>
                            {photos.length > 0 && (
                              <div className="flex gap-2 flex-wrap mb-3">
                                {photos.map((url, i) => (
                                  <div key={i} className="relative w-20 h-20">
                                    <img src={url} alt="" className="w-full h-full rounded-2xl object-cover cursor-pointer"
                                      onClick={() => openLightbox(photos, i)} />
                                    <button
                                      onClick={() => removePhoto(i)}
                                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white
                                                 flex items-center justify-center text-xs"
                                    >×</button>
                                    <button
                                      onClick={() => setBgPhotoIdx(bgPhotoIdx === i ? null : i)}
                                      className={cn(
                                        'absolute bottom-1 left-1 text-[9px] px-1.5 py-0.5 rounded-lg font-bold transition-all',
                                        bgPhotoIdx === i
                                          ? 'bg-yellow-400 text-white'
                                          : 'bg-black/40 text-white/80'
                                      )}
                                    >
                                      {bgPhotoIdx === i ? '★ BG' : '☆'}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <input
                              ref={photoInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handlePhotoSelect}
                            />
                            <button
                              onClick={() => photoInputRef.current?.click()}
                              disabled={uploading}
                              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gray-50
                                         text-sm text-gray-500 font-medium active:bg-gray-100 disabled:opacity-50"
                            >
                              {uploading ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <Camera size={15} className="text-gray-400" />
                                  {photos.length > 0 ? 'Add another photo' : 'Add photo'}
                                </>
                              )}
                            </button>
                            <p className="text-[10px] text-gray-300 mt-1">
                              Max 5MB · JPG, PNG, WebP · ☆ = set as card background
                            </p>
                            {uploadError && (
                              <p className="text-xs text-red-400 mt-1">{uploadError}</p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
      </C2SheetBody>

      {/* Pinned footer — only when there's a save action */}
      {!sent && !cfg.shopMode && (
        <C2SheetFooter>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSave}
            disabled={!canSubmit}
            className="w-full py-4 rounded-2xl text-white text-sm font-semibold
                       disabled:opacity-40 flex items-center justify-center gap-2"
            style={{
              background: cfg.noteMode
                ? primary
                : `linear-gradient(135deg, ${activeColor?.hex}, ${activeColor?.hex}cc)`,
            }}
          >
            {saving ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
            ) : (
              <><Plus size={16} /> {cfg.saveLabel}</>
            )}
          </motion.button>
        </C2SheetFooter>
      )}
    </C2Sheet>
  )
}
