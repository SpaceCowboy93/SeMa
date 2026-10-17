'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { differenceInCalendarDays, differenceInYears, differenceInMonths, addYears, addMonths, startOfDay, parseISO } from 'date-fns'
import { Plus, X, Check, Camera, Trash2, Pencil, Mail, type LucideIcon, Utensils, Flower2, Gift, BookOpen, Flame, Wine, Heart, Gem, CakeSlice, PartyPopper, Waves, TreePine, Drama, Star, Sun, Plane } from '@/design/iconSystem'
import { useAppStore } from '@/store/useAppStore'
import { useLightboxStore } from '@/store/useLightboxStore'
import { type Countdown, type ChecklistEntry } from '@/types'
import { cn } from '@/lib/utils'
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet'
import { DatePicker } from '@/components/ui/DatePicker'
import { Progress } from '@/components/ui/Progress'
import { C2SheetBody, C2SheetFooter } from '@/components/ui'

export const ANNIVERSARY_SUGGESTIONS: { icon: LucideIcon; text: string }[] = [
  { icon: Utensils, text: 'Plan a dinner reservation'     },
  { icon: Flower2,  text: 'Buy flowers'                   },
  { icon: Gift,     text: 'Prepare a small gift'          },
  { icon: Mail,     text: 'Write a love letter'           },
  { icon: Camera,   text: 'Choose a favourite photo together' },
  { icon: Flame,    text: 'Set the mood with candles'     },
  { icon: Wine,     text: 'Open something special to drink' },
  { icon: BookOpen, text: 'Write a memory from this day'  },
]

// Maps milestone emoji strings (legacy) or key strings → LucideIcon
const MILESTONE_ICON_MAP: Record<string, LucideIcon> = {
  heart: Heart, gem: Gem, cake: CakeSlice, star: Star, party: PartyPopper,
  plane: Plane, flower: Flower2, waves: Waves, sun: Sun, tree: TreePine, drama: Drama,
  '💕': Heart, '💍': Gem, '🎂': CakeSlice, '🌟': Star, '🎉': PartyPopper,
  '✈️': Plane, '🌸': Flower2, '🌊': Waves, '🏖️': Waves, '🎊': PartyPopper,
  '🎄': TreePine, '🎭': Drama,
}
function getMilestoneIcon(key: string): LucideIcon {
  return MILESTONE_ICON_MAP[key] ?? Heart
}

async function resizeImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const max   = 800
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const w     = Math.round(img.width * scale)
      const h     = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.src = url
  })
}

export function AnniversarySheet({
  countdown, primary, onClose, onDelete,
}: {
  countdown: Countdown
  primary: string
  onClose: () => void
  onDelete: () => void
}) {
  const updateCountdown = useAppStore(s => s.updateCountdown)
  const uploadPhoto     = useAppStore(s => s.uploadPhoto)
  const openLightbox    = useLightboxStore(s => s.open)
  const openOverlay     = useAppStore(s => s.openOverlay)
  const closeOverlay    = useAppStore(s => s.closeOverlay)

  useEffect(() => {
    openOverlay()
    return () => closeOverlay()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [title,    setTitle]    = useState(countdown.title)
  const [date,     setDate]     = useState(countdown.date)
  const [notes,    setNotes]    = useState(countdown.notes ?? '')
  const [romantic, setRomantic] = useState(countdown.romanticMessage ?? '')
  const [photos,   setPhotos]   = useState<string[]>(countdown.photos ?? [])
  const [uploading, setUploading] = useState(false)
  const [dirty,    setDirty]    = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  // Migrate legacy checklist (string[]) → ChecklistEntry[]
  const initEntries: ChecklistEntry[] = countdown.checklistEntries
    ?? (countdown.checklist ?? []).map(text => ({ text, isCompleted: false }))
  const [entries,    setEntries]    = useState<ChecklistEntry[]>(initEntries)
  const [newItem,    setNewItem]    = useState('')
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editText,   setEditText]   = useState('')

  function mark() { setDirty(true) }

  function addEntry(text: string) {
    if (!text.trim()) return
    setEntries(e => [...e, { text: text.trim(), isCompleted: false }])
    setNewItem('')
    mark()
  }

  function toggleEntry(idx: number) {
    setEntries(e => e.map((item, i) => i === idx ? { ...item, isCompleted: !item.isCompleted } : item))
    mark()
  }

  function startEditEntry(idx: number) {
    setEditingIdx(idx)
    setEditText(entries[idx].text)
  }

  function saveEditEntry() {
    if (editingIdx === null || !editText.trim()) return
    setEntries(e => e.map((item, i) => i === editingIdx ? { ...item, text: editText.trim() } : item))
    setEditingIdx(null)
    mark()
  }

  function removeEntry(idx: number) {
    setEntries(e => e.filter((_, i) => i !== idx))
    if (editingIdx === idx) setEditingIdx(null)
    mark()
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    const url = await uploadPhoto(`anniversaries/${countdown.id}`, file)
    if (url) { setPhotos(p => [...p, url]); mark() }
    setUploading(false)
  }

  function handleSave() {
    updateCountdown(countdown.id, {
      title:            title.trim() || countdown.title,
      date,
      notes:            notes || undefined,
      checklistEntries: entries.length ? entries : undefined,
      photos:           photos.length  ? photos  : undefined,
      romanticMessage:  romantic || undefined,
    })
    onClose()
  }

  const doneCount  = entries.filter(e => e.isCompleted).length
  const totalCount = entries.length

  // Use the same two-step noon anchor as us/page.tsx to avoid UTC date-shift
  // bugs in UTC+ timezones, then use calendar-aware date-fns functions.
  const todayStart     = startOfDay(new Date())
  const milestoneStart = startOfDay(parseISO(countdown.date + 'T12:00:00'))
  const daysSince      = differenceInCalendarDays(todayStart, milestoneStart)
  const isFuture       = daysSince < 0
  const absDays        = Math.abs(daysSince)
  const ageLabel       = isFuture
    ? (absDays === 0 ? 'Today!' : `in ${absDays} day${absDays !== 1 ? 's' : ''}`)
    : (() => {
        const years  = differenceInYears(todayStart, milestoneStart)
        const afterY = addYears(milestoneStart, years)
        const months = differenceInMonths(todayStart, afterY)
        const afterM = addMonths(afterY, months)
        const days   = differenceInCalendarDays(todayStart, afterM)
        return years >= 1
          ? `${years} year${years !== 1 ? 's' : ''} ago`
          : months >= 1
          ? `${months} month${months !== 1 ? 's' : ''} ago`
          : `${days} day${days !== 1 ? 's' : ''} ago`
      })()

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={dirty ? handleSave : onClose}
        aria-hidden="true"
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(45,41,38,0.35)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 360 }}
        className="fixed bottom-0 left-0 right-0 z-50 c2-sheet-bg rounded-t-[2rem] shadow-modal max-w-lg mx-auto flex flex-col"
        style={{ maxHeight: 'calc(100dvh - 48px)' }}
      >
        {/* Non-scrolling header */}
        <div className="px-5 pt-4 shrink-0">
          <div className="drag-handle mb-4" />

          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: `${primary}15` }}
              >
                {(() => { const MIcon = getMilestoneIcon(countdown.emoji); return <MIcon size={22} strokeWidth={1.75} style={{ color: primary }} /> })()}
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{ageLabel}</p>
                <input
                  value={title}
                  onChange={e => { setTitle(e.target.value); mark() }}
                  className="text-base font-bold text-gray-800 bg-transparent outline-none w-full"
                  aria-label="Milestone title"
                />
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-full c2-sheet-x shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable form content */}
        <C2SheetBody className="pb-4">
          <div className="mb-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1">Date</p>
            <DatePicker value={date} onChange={v => { setDate(v); mark() }} accentColor={primary} />
          </div>

          <div className="rounded-2xl px-4 py-3 mb-3" style={{ background: `${primary}06` }}>
            <p className="text-[10px] font-bold mb-1 flex items-center gap-1" style={{ color: primary }}><Mail size={11} strokeWidth={2} /> A message to remember</p>
            <textarea
              value={romantic}
              onChange={e => { setRomantic(e.target.value); mark() }}
              placeholder="Write something beautiful about this memory..."
              rows={2}
              className="w-full text-sm text-gray-700 placeholder:text-gray-300 bg-transparent outline-none resize-none leading-relaxed"
            />
          </div>

          <div className="c2-sheet-section px-4 py-3 mb-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
            <textarea
              value={notes}
              onChange={e => { setNotes(e.target.value); mark() }}
              placeholder="Details, feelings, memories..."
              rows={2}
              className="w-full text-sm text-gray-700 placeholder:text-gray-300 bg-transparent outline-none resize-none"
            />
          </div>

          {/* Anniversary Preparation checklist */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Anniversary Preparation
              </p>
              {totalCount > 0 && (
                <span className="text-[10px] font-semibold" style={{ color: primary }}>
                  {doneCount} of {totalCount} completed
                </span>
              )}
            </div>

            {totalCount > 0 && (
              <Progress value={(doneCount / totalCount) * 100} color={primary} className="mb-3" />
            )}

            <div className="space-y-1.5">
              <AnimatePresence initial={false}>
                {entries.map((entry, idx) => (
                  <motion.div
                    key={idx}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.13 }}
                  >
                    {editingIdx === idx ? (
                      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                        <input
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEditEntry(); if (e.key === 'Escape') setEditingIdx(null) }}
                          autoFocus
                          className="flex-1 text-sm text-gray-700 bg-transparent outline-none"
                        />
                        <button onClick={saveEditEntry} disabled={!editText.trim()}
                          className="text-xs font-bold px-2 py-1 rounded-lg text-white disabled:opacity-40"
                          style={{ background: primary }}>
                          Save
                        </button>
                        <button onClick={() => setEditingIdx(null)}
                          className="text-xs font-medium px-2 py-1 rounded-lg bg-gray-200 text-gray-600">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-opacity',
                        entry.isCompleted ? 'bg-gray-50 opacity-70' : 'bg-gray-50'
                      )}>
                        <motion.button
                          whileTap={{ scale: 0.85 }}
                          onClick={() => toggleEntry(idx)}
                          className={cn(
                            'w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all',
                            entry.isCompleted ? 'border-transparent' : 'border-gray-300'
                          )}
                          style={entry.isCompleted ? { background: primary, borderColor: primary } : {}}
                        >
                          {entry.isCompleted && <Check size={10} color="white" strokeWidth={3} />}
                        </motion.button>
                        <button
                          className="flex-1 text-left"
                          onClick={() => startEditEntry(idx)}
                        >
                          <span className={cn('text-sm', entry.isCompleted ? 'line-through text-gray-400' : 'text-gray-700')}>
                            {entry.text}
                          </span>
                        </button>
                        <button onClick={() => startEditEntry(idx)}
                          className="text-gray-300 active:text-blue-400 p-0.5 shrink-0">
                          <Pencil size={11} />
                        </button>
                        <button onClick={() => removeEntry(idx)}
                          className="text-gray-300 active:text-red-400 p-0.5 shrink-0">
                          <X size={13} />
                        </button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="flex gap-2 mt-2">
              <input
                value={newItem}
                onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEntry(newItem) } }}
                placeholder="Add something to prepare..."
                className="flex-1 text-sm text-gray-700 placeholder:text-gray-300 bg-gray-50 rounded-xl px-3 py-2 outline-none"
              />
              <button
                onClick={() => addEntry(newItem)}
                disabled={!newItem.trim()}
                className="w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-30"
                style={{ background: primary }}
              >
                <Plus size={16} className="text-white" />
              </button>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Suggestions</p>
            <div className="flex flex-wrap gap-2">
              {ANNIVERSARY_SUGGESTIONS.map((s, i) => {
                const already = entries.some(e => e.text === s.text)
                return (
                  <button
                    key={i}
                    onClick={() => { if (!already) addEntry(s.text) }}
                    className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium', already ? 'opacity-40' : 'active:opacity-80')}
                    style={{ background: `${primary}10`, color: already ? primary : '#6b7280', border: `1px solid ${primary}20` }}
                  >
                    <s.icon size={13} strokeWidth={1.75} /> {s.text} {already && <Check size={10} />}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mb-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Photos</p>
              <button
                onClick={() => photoRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1 text-xs font-semibold disabled:opacity-40"
                style={{ color: primary }}
              >
                <Camera size={12} /> {uploading ? 'Uploading...' : 'Add photo'}
              </button>
            </div>
            <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            {photos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {photos.map((src, i) => (
                  <img key={i} src={src} alt="" className="w-24 h-24 object-cover rounded-2xl shrink-0 cursor-pointer"
                    onClick={() => openLightbox(photos, i)} />
                ))}
              </div>
            )}
          </div>
        </C2SheetBody>

        {/* Pinned action footer */}
        <C2SheetFooter>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              aria-label="Delete this milestone"
              className="w-12 h-12 flex items-center justify-center rounded-2xl c2-sheet-danger-soft shrink-0 active:opacity-80"
            >
              <Trash2 size={16} />
            </button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSave}
              className="flex-1 py-3.5 rounded-2xl text-white text-sm font-semibold"
              style={{ background: primary }}
            >
              Save
            </motion.button>
          </div>
        </C2SheetFooter>
      </motion.div>

      <DeleteConfirmSheet
        open={showDeleteConfirm}
        title="Delete this milestone?"
        message="This anniversary or milestone will be permanently removed."
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => { onDelete(); setShowDeleteConfirm(false) }}
      />
    </>
  )
}
