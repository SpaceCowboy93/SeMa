'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, X, Camera, Check, Trash2, Pencil, ScanLine, ChevronDown, ChevronRight,
  type LucideIcon, Globe, Coins, Dumbbell, Leaf, BookOpen, Palette, Trophy,
  CalendarCheck2, Sparkles, Gift, ShoppingBag, Heart, PartyPopper,
} from '@/design/iconSystem'
import { useAppStore } from '@/store/useAppStore'
import { useLightboxStore } from '@/store/useLightboxStore'
import { ShoppingListEditorSheet, effectivePhotos } from '@/components/ui/ShoppingListEditorSheet'
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet'
import { ReceiptScannerSheet } from '@/components/ui/ReceiptScannerSheet'
import { ReceiptReviewSheet } from '@/components/ui/ReceiptReviewSheet'
import { FullCreateSheet } from '@/components/ui/FullCreateSheet'
import { WISHLIST_CATEGORY_CONFIG, cn, formatTime, generateId } from '@/lib/utils'
import { goalDraftValues } from '@/lib/dream-checklist'
import { mergeDraft, resolveDraftConflicts, type DraftConflict, type DraftResolutions } from '@/lib/draft-merge'
import { DraftConflictNotice } from '@/components/ui/DraftConflictNotice'
import { DatePicker } from '@/components/ui/DatePicker'
import { TimePicker } from '@/components/ui/TimePicker'
import {
  USERS,
  type UserName, type WishlistCategory, type GoalCategory,
  type EventColor, type CalendarEvent, type EventTodo, type ShoppingList, type ShoppingItem,
  type ReceiptResult, type ShoppingListReceipt,
} from '@/types'

/* ── Constants ─────────────────────────────────────────────────────────────── */

export const GOAL_CATEGORIES: [GoalCategory, { icon: LucideIcon; label: string }][] = [
  ['travel',     { icon: Globe,        label: 'Travel'     }],
  ['money',      { icon: Coins,        label: 'Money'      }],
  ['fitness',    { icon: Dumbbell,     label: 'Fitness'    }],
  ['life',       { icon: Leaf,         label: 'Life'       }],
  ['learning',   { icon: BookOpen,     label: 'Learning'   }],
  ['hobbies',    { icon: Palette,      label: 'Hobbies'    }],
  ['challenges', { icon: Trophy,       label: 'Challenges' }],
]

export type CategoryType = 'wishes' | 'shopping' | 'dreams' | 'moments' | 'plans'

export const CATEGORY_DEFS: {
  id: CategoryType; icon: LucideIcon; label: string; hex: string; color?: EventColor
}[] = [
  { id: 'plans',    icon: CalendarCheck2, label: 'Plans',    hex: '#34d399', color: 'green'  },
  { id: 'dreams',   icon: Sparkles,       label: 'Dreams',   hex: '#60a5fa', color: 'blue'   },
  { id: 'wishes',   icon: Gift,           label: 'Wishes',   hex: '#a78bfa', color: 'seval'  },
  { id: 'shopping', icon: ShoppingBag,    label: 'Shopping', hex: '#ef4444'                  },
  { id: 'moments',  icon: Heart,          label: 'Moments',  hex: '#fbbf24', color: 'yellow' },
]

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function listTotal(list: ShoppingList): number {
  return list.items.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0)
}

function resizeImage(file: File, maxPx = 800): Promise<string> {
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
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.src = url
  })
}

/* ── Botanical leaf decoration ──────────────────────────────────────────────── */

function BotanicalLeaf({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 130"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('pointer-events-none', className)}
    >
      <path
        d="M68 118 Q72 72 102 16"
        stroke="#8FA68D" strokeWidth="1.4" strokeLinecap="round"
      />
      <ellipse cx="90" cy="44" rx="15" ry="8.5"
        transform="rotate(-42 90 44)" fill="#8FA68D" />
      <ellipse cx="103" cy="23" rx="12" ry="7"
        transform="rotate(-58 103 23)" fill="#8FA68D" />
      <ellipse cx="79" cy="68" rx="13.5" ry="7.5"
        transform="rotate(-28 79 68)" fill="#8FA68D" />
      <ellipse cx="70" cy="92" rx="10.5" ry="6"
        transform="rotate(-16 70 92)" fill="#8FA68D" />
    </svg>
  )
}

/* ── CategoryHubSheet ───────────────────────────────────────────────────────── */

export function CategoryHubSheet({
  type, primary, currentUser, onClose, onEditMoment,
}: {
  type: 'wishes' | 'dreams' | 'moments' | 'plans'
  primary: string
  currentUser: UserName
  onClose: () => void
  onEditMoment: (ev: CalendarEvent) => void
}) {
  const goals          = useAppStore(s => s.goals)
  const wishlist       = useAppStore(s => s.wishlistItems)
  const events         = useAppStore(s => s.events)
  const todos          = useAppStore(s => s.todos)
  const toggleWishlist = useAppStore(s => s.toggleWishlistItem)
  const updateGoal     = useAppStore(s => s.updateGoal)
  const updateWishlist = useAppStore(s => s.updateWishlistItem)
  const deleteGoal     = useAppStore(s => s.deleteGoal)
  const deleteWishlist = useAppStore(s => s.deleteWishlistItem)
  const toggleTodoDo   = useAppStore(s => s.toggleTodo)
  const updateTodoDo   = useAppStore(s => s.updateTodo)
  const deleteTodoDo   = useAppStore(s => s.deleteTodo)
  const sendNote       = useAppStore(s => s.sendPartnerNote)
  const openOverlay    = useAppStore(s => s.openOverlay)
  const closeOverlay   = useAppStore(s => s.closeOverlay)

  useEffect(() => {
    openOverlay()
    return () => closeOverlay()
  }, [openOverlay, closeOverlay])

  const def    = CATEGORY_DEFS.find(d => d.id === type)!
  const catHex = def.hex

  const [addOpen, setAddOpen] = useState(false)

  const addLabel = type === 'dreams' ? 'Dream' : type === 'wishes' ? 'Wish' : type === 'plans' ? 'Plan' : 'Moment'
  const createTypeMap = { plans: 'plan', dreams: 'dream', wishes: 'wish', moments: 'moment' } as const

  type ListItem = { id: string; title: string; sub?: string; done: boolean }

  const items: ListItem[] = useMemo(() => {
    switch (type) {
      case 'wishes':
        return wishlist.map(i => ({
          id: i.id, title: i.title,
          sub: i.notes || WISHLIST_CATEGORY_CONFIG[i.category].label,
          done: i.isCompleted,
        }))
      case 'dreams':
        return goals.map(g => ({
          id: g.id, title: g.title,
          sub: g.notes || g.targetDate,
          done: g.isCompleted,
        }))
      case 'plans':
        return todos.map(t => ({
          id: t.id, title: t.title,
          sub: t.notes || t.date,
          done: t.isCompleted,
        }))
      case 'moments':
        return [...events].sort((a, b) => a.date.localeCompare(b.date)).map(e => ({
          id: e.id, title: e.title,
          sub: e.date + (e.startTime ? ` · ${formatTime(e.startTime)}` : ''),
          done: false,
        }))
    }
  }, [type, goals, wishlist, todos, events])

  const [editingId, setEditingId]   = useState<string | null>(null)
  const [editTitle, setEditTitle]   = useState('')
  const [editNotes, setEditNotes]   = useState('')
  const [editDate,  setEditDate]    = useState('')
  const [editTime,  setEditTime]    = useState('')
  const [editChecklist, setEditChecklist] = useState<EventTodo[]>([])
  const [newCheckItem,  setNewCheckItem]  = useState('')
  const [editPhotos,    setEditPhotos]    = useState<string[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const openingRef = useRef<ReturnType<typeof goalDraftValues> | null>(null)
  const resolutionsRef = useRef<DraftResolutions>({})
  const [conflicts, setConflicts] = useState<DraftConflict[]>([])

  function openEdit(id: string) {
    if (type === 'moments') {
      const ev = events.find(e => e.id === id)
      if (ev) { onClose(); onEditMoment(ev) }
      return
    }
    let src: { title: string; notes?: string; date?: string; startTime?: string; targetDate?: string } | undefined
    if (type === 'wishes') src = wishlist.find(i => i.id === id)
    if (type === 'dreams') src = goals.find(g => g.id === id)
    if (type === 'plans')  src = todos.find(t => t.id === id)
    if (!src) return
    setEditTitle(src.title)
    setEditNotes(src.notes ?? '')
    setEditDate(src.date ?? src.targetDate ?? '')
    setEditTime(src.startTime ?? '')
    // For Dreams: also load checklist and photos from the Goal
    if (type === 'dreams') {
      const goal = goals.find(g => g.id === id)
      if (!goal) return
      const values = goalDraftValues(goal, events.find(e => e.id === goal.linkedEventId || e.linkedGoalId === goal.id))
      openingRef.current = structuredClone(values)
      setEditTitle(values.title); setEditNotes(values.notes)
      setEditChecklist(values.checklistItems)
      setEditPhotos(values.photos)
    } else {
      setEditChecklist([])
      setEditPhotos([])
    }
    setNewCheckItem('')
    setConflicts([]); resolutionsRef.current = {}
    setEditingId(id)
  }

  function saveEdit() {
    if (!editingId || !editTitle.trim()) return
    const base = { title: editTitle.trim(), notes: editNotes.trim() || undefined, startTime: editTime || undefined }
    if (type === 'dreams') {
      const finalItems = newCheckItem.trim()
        ? [...editChecklist, { id: generateId(), title: newCheckItem.trim(), isCompleted: false }] : editChecklist
      setEditChecklist(finalItems); setNewCheckItem('')
      const state = useAppStore.getState()
      const latest = state.goals.find(goal => goal.id === editingId)
      if (!latest || !openingRef.current) {
        setConflicts([{ path: 'record', mine: openingRef.current, latest: undefined }]); return
      }
      const draft = { title: editTitle.trim(), notes: editNotes.trim(), startTime: editTime,
        targetDate: editDate, checklistItems: finalItems, photos: editPhotos }
      const result = mergeDraft(openingRef.current, draft,
        goalDraftValues(latest, state.events.find(e => e.id === latest.linkedEventId || e.linkedGoalId === latest.id)), resolutionsRef.current)
      setConflicts(result.conflicts)
      if (result.conflicts.length) return
      if (Object.keys(result.changes).length) updateGoal(editingId, {
        ...result.changes,
        ...('notes' in result.changes ? { notes: result.changes.notes || undefined } : {}),
        ...('startTime' in result.changes ? { startTime: result.changes.startTime || undefined } : {}),
        ...('targetDate' in result.changes ? { targetDate: result.changes.targetDate || undefined } : {}),
      })
    }
    if (type === 'wishes') updateWishlist(editingId, { ...base, date: editDate || undefined })
    if (type === 'plans')  updateTodoDo(editingId,   { ...base, date: editDate || undefined })
    setEditingId(null)
  }

  function handleDelete() {
    if (!editingId) return
    if (type === 'dreams') deleteGoal(editingId)
    if (type === 'wishes') deleteWishlist(editingId)
    if (type === 'plans')  deleteTodoDo(editingId)
    setEditingId(null)
  }

  function handleToggle(id: string, title: string, done: boolean) {
    if (type === 'wishes') toggleWishlist(id)
    if (type === 'dreams') updateGoal(id, { isCompleted: !done })
    if (type === 'plans')  toggleTodoDo(id)
    if (!done) sendNote(`${USERS[currentUser].emoji} just confirmed "${title}" ✅`)
  }

  const pending   = items.filter(i => !i.done)
  const completed = items.filter(i => i.done)

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 c2-backdrop"
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 380 }}
        className="fixed bottom-0 left-0 right-0 z-50 c2-sheet-bg rounded-t-[2rem] shadow-modal
                   max-w-lg mx-auto flex flex-col"
        style={{ maxHeight: 'calc(100dvh - 48px)' }}
        role="dialog" aria-modal="true" aria-label={def.label}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 shrink-0">
          <div className="drag-handle mb-3" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: `${catHex}18`, color: catHex }}>
                <def.icon size={18} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-800">{def.label}</h2>
                <p className="text-xs text-gray-400">{items.length} item{items.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-full c2-sheet-x"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="h-px bg-gray-100 mx-5 shrink-0" />

        {/* Add button */}
        <div className="px-4 py-2.5 shrink-0">
          <button
            onClick={() => setAddOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-semibold"
            style={{ background: `${catHex}20`, color: catHex }}
          >
            <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
            Add New {addLabel}
          </button>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 space-y-2">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-3xl flex items-center justify-center mb-3 opacity-30"
                style={{ background: `${catHex}18`, color: catHex }}>
                <def.icon size={28} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <p className="text-sm text-gray-400">Nothing here yet</p>
            </div>
          ) : (
            <>
              {pending.map(item => (
                <div key={item.id} className="bg-gray-50 rounded-2xl p-3.5 flex items-center gap-3">
                  {type !== 'moments' && (
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={() => handleToggle(item.id, item.title, item.done)}
                      className="w-6 h-6 rounded-full border-2 shrink-0 transition-all"
                      style={{ borderColor: catHex }}
                      aria-label={`Mark "${item.title}" complete`}
                    />
                  )}
                  <button onClick={() => openEdit(item.id)} className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.title}</p>
                    {item.sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.sub}</p>}
                  </button>
                  <span className="text-gray-300 text-lg shrink-0" aria-hidden="true">›</span>
                </div>
              ))}
              {completed.length > 0 && (
                <>
                  <p className="text-[11px] font-medium text-gray-400 uppercase tracking-widest pt-2 px-1">
                    Completed ({completed.length})
                  </p>
                  {completed.map(item => (
                    <div key={item.id} className="bg-gray-50 rounded-2xl p-3.5 flex items-center gap-3 opacity-50">
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        onClick={() => handleToggle(item.id, item.title, item.done)}
                        className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold"
                        style={{ background: catHex }}
                        aria-label={`Unmark "${item.title}" complete`}
                      >
                        <Check size={11} />
                      </motion.button>
                      <button onClick={() => openEdit(item.id)} className="flex-1 text-left min-w-0">
                        <p className="text-sm text-gray-400 line-through truncate">{item.title}</p>
                      </button>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </motion.div>

      <DeleteConfirmSheet
        open={showDeleteConfirm}
        title={`Delete this ${addLabel.toLowerCase()}?`}
        message="This item will be permanently removed."
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => { handleDelete(); setShowDeleteConfirm(false) }}
      />

      <FullCreateSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        primary={catHex}
        initialType={createTypeMap[type]}
      />

      <AnimatePresence>
        {editingId && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setEditingId(null)}
              className="fixed inset-0 z-[60] c2-backdrop"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 380 }}
              className="fixed bottom-0 left-0 right-0 z-[60] c2-sheet-bg rounded-t-[2rem] shadow-modal
                         max-w-lg mx-auto flex flex-col"
              style={{ maxHeight: 'calc(100dvh - 48px)' }}
              role="dialog" aria-modal="true" aria-label={`Edit ${addLabel}`}
            >
              <div className="px-5 pt-4 pb-3 shrink-0">
                <div className="drag-handle mb-4" />
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-gray-800">Edit {addLabel}</h3>
                  <button onClick={() => setEditingId(null)} aria-label="Close"
                    className="w-8 h-8 flex items-center justify-center rounded-full c2-sheet-x">
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-4">
                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-2xl px-4 py-3">
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-1">Title</p>
                    <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                      className="w-full text-sm text-gray-800 bg-transparent outline-none" placeholder="Title..." />
                  </div>
                  <div className="bg-gray-50 rounded-2xl px-4 py-3">
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-1">Notes</p>
                    <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3}
                      className="w-full text-sm text-gray-700 bg-transparent outline-none resize-none placeholder:text-gray-300"
                      placeholder="Add notes..." />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-gray-50 rounded-2xl px-4 py-3">
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-1">Date</p>
                      <DatePicker value={editDate} onChange={setEditDate}
                        triggerClassName="bg-transparent px-0 py-0 rounded-none text-sm text-gray-700" />
                    </div>
                    <div className="flex-1 bg-gray-50 rounded-2xl px-4 py-3">
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-1">Time</p>
                      <TimePicker value={editTime} onChange={setEditTime}
                        triggerClassName="bg-transparent px-0 py-0 rounded-none" />
                    </div>
                  </div>

                  {/* Checklist — Dreams only */}
                  {type === 'dreams' && (
                    <div className="bg-gray-50 rounded-2xl px-4 py-3">
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-2">Checklist</p>
                      <div className="space-y-2">
                        {editChecklist.map(item => (
                          <div key={item.id} className="flex items-center gap-2">
                            <button type="button" aria-label={`Mark "${item.title}" ${item.isCompleted ? 'not done' : 'done'}`}
                              aria-pressed={item.isCompleted}
                              onClick={() => setEditChecklist(prev => prev.map(entry => entry.id === item.id ? { ...entry, isCompleted: !entry.isCompleted } : entry))}
                              className="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0 flex items-center justify-center">
                              {item.isCompleted && <Check size={12} />}
                            </button>
                            <input value={item.title} aria-label="Checklist item text"
                              onChange={e => setEditChecklist(prev => prev.map(entry => entry.id === item.id ? { ...entry, title: e.target.value } : entry))}
                              className="flex-1 min-w-0 text-sm text-gray-700 bg-transparent outline-none" />
                            <button
                              type="button"
                              onClick={() => setEditChecklist(prev => prev.filter(entry => entry.id !== item.id))}
                              className="text-gray-300 active:text-red-400"
                              aria-label={`Remove "${item.title}"`}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-4 h-4 rounded-full border-2 border-dashed border-gray-200 shrink-0" />
                          <input
                            type="text"
                            value={newCheckItem}
                            onChange={e => setNewCheckItem(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                const t = newCheckItem.trim()
                                if (t) { setEditChecklist(prev => [...prev, { id: generateId(), title: t, isCompleted: false }]); setNewCheckItem('') }
                              }
                            }}
                            placeholder="Add item..."
                            className="flex-1 text-sm text-gray-600 placeholder:text-gray-300 bg-transparent outline-none leading-normal"
                          />
                          {newCheckItem.trim() && (
                            <button
                              type="button"
                              onClick={() => {
                                const t = newCheckItem.trim()
                                if (t) { setEditChecklist(prev => [...prev, { id: generateId(), title: t, isCompleted: false }]); setNewCheckItem('') }
                              }}
                              className="text-gray-400 active:text-gray-600"
                            >
                              <Plus size={15} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Photos — Dreams only (display existing; no upload here) */}
                  {type === 'dreams' && editPhotos.length > 0 && (
                    <div className="bg-gray-50 rounded-2xl px-4 py-3">
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-2">Photos</p>
                      <div className="flex gap-2 flex-wrap">
                        {editPhotos.map((url, idx) => (
                          <img
                            key={idx}
                            src={url}
                            alt={`Photo ${idx + 1}`}
                            className="w-16 h-16 rounded-xl object-cover"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="shrink-0 px-5 pt-3 border-t border-gray-50 pb-sheet-footer">
                <DraftConflictNotice conflicts={conflicts} onResolve={choice => {
                  if (conflicts.some(conflict => conflict.path === 'record')) { setEditingId(null); return }
                  resolutionsRef.current = { ...resolutionsRef.current, ...resolveDraftConflicts(conflicts, choice) }
                  saveEdit()
                }} />
                <div className="flex gap-2">
                  <button onClick={() => setShowDeleteConfirm(true)}
                    className="flex-1 py-3.5 rounded-2xl text-red-400 text-sm font-semibold bg-red-50 active:opacity-80">
                    Delete
                  </button>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={saveEdit} disabled={!editTitle.trim()}
                    className="flex-1 py-3.5 rounded-2xl text-white text-sm font-semibold disabled:opacity-40"
                    style={{ background: catHex }}>
                    Save
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

/* ── ShoppingHubSheet ────────────────────────────────────────────────────────
 * Editorial "kitchen" identity — Botanical Journal design.
 * Header: eyebrow (contextual) + Playfair title + dynamic item count.
 * List: flat rows, not card-per-list.
 * Completed: collapsible section.
 * ──────────────────────────────────────────────────────────────────────────── */

const SHOP_RED = '#ef4444'

export function ShoppingHubSheet({
  primary, currentUser, onClose, shoppingTitle, shoppingSubtitle,
}: {
  primary: string
  currentUser: UserName
  onClose: () => void
  /** Contextual eyebrow text from Living Moments. Defaults to "Shopping together". */
  shoppingTitle?: string
  /** Contextual subtitle from Living Moments. Defaults to item-count sentence. */
  shoppingSubtitle?: string
}) {
  const lists      = useAppStore(s => s.shoppingLists)
  const createList = useAppStore(s => s.createShoppingList)
  const updateList = useAppStore(s => s.updateShoppingList)
  const deleteList = useAppStore(s => s.deleteShoppingList)
  const addItem    = useAppStore(s => s.addShoppingItem)
  const toggleItem = useAppStore(s => s.toggleShoppingItem)
  const deleteItem = useAppStore(s => s.deleteShoppingItem)
  const updateItem = useAppStore(s => s.updateShoppingItem)
  const openOverlay  = useAppStore(s => s.openOverlay)
  const closeOverlay = useAppStore(s => s.closeOverlay)
  const openLightbox = useLightboxStore(s => s.open)

  // FAB overlay tracking
  useEffect(() => {
    openOverlay()
    return () => closeOverlay()
  }, [openOverlay, closeOverlay])

  const [view, setView]   = useState<null | 'new' | string>(null)
  const [completedOpen, setCompletedOpen] = useState(false)

  // Hub-level receipt scanning: scan → review → create new list with receipt
  const [hubScannerOpen, setHubScannerOpen]   = useState(false)
  const [hubScanResult,  setHubScanResult]    = useState<ReceiptResult | null>(null)
  const [hubScanPhotos,  setHubScanPhotos]    = useState<string[]>([])

  function handleHubScanSave(result: ReceiptResult) {
    const now     = new Date().toISOString()
    const name    = result.store
      ? `${result.store} receipt`
      : `Shopping ${result.date || new Date().toLocaleDateString()}`
    const receipt: ShoppingListReceipt = {
      ...result,
      photos: hubScanPhotos.length ? hubScanPhotos : undefined,
    }
    const newId = createList({ name })
    // updateList is async-safe — receipt attaches on next render cycle
    setTimeout(() => updateList(newId, { receipt }), 0)
    setHubScanResult(null)
    setHubScanPhotos([])
    setView(newId)
  }

  const incompleteLists = lists.filter(l => !l.isCompleted)
  const completedLists  = lists.filter(l =>  l.isCompleted)

  const totalPending = incompleteLists.reduce(
    (a, l) => a + l.items.filter(i => !i.isChecked).length, 0,
  )

  const activeList = typeof view === 'string' ? lists.find(l => l.id === view) ?? null : null

  // Derive the item count subtitle if no Living Moment override
  const defaultSubtitle = totalPending === 0
    ? (incompleteLists.length === 0 ? 'A fresh list starts here.' : 'Everything is home.')
    : `${totalPending} thing${totalPending !== 1 ? 's' : ''} left to bring home.`

  const eyebrow  = shoppingTitle    || 'Shopping together'
  const subtitle = shoppingSubtitle || defaultSubtitle

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 c2-backdrop"
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 380 }}
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[2rem] shadow-modal
                   max-w-lg mx-auto flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100dvh - 48px)', background: '#FDFAF5' }}
        role="dialog" aria-modal="true" aria-label="Shopping"
      >
        {/* ── Editorial header ── */}
        <div className="relative px-5 pt-5 pb-4 shrink-0 overflow-hidden">
          {/* Botanical decoration — far right, aria-hidden */}
          <BotanicalLeaf className="absolute right-0 top-0 w-28 h-28 opacity-[0.08]" />

          {/* Drag handle */}
          <div className="drag-handle mb-4" />

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close shopping"
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center
                       rounded-full bg-white/80 text-gray-500 shadow-card z-10"
          >
            <X size={16} />
          </button>

          {/* Eyebrow */}
          <p className="text-[11px] font-medium text-gray-400 tracking-widest uppercase mb-2">
            {eyebrow}
          </p>

          {/* Title — Playfair Display, fixed editorial identity */}
          <h2
            className="text-2xl leading-tight text-gray-900 mb-3"
            style={{ fontFamily: 'var(--font-playfair)', fontWeight: 600 }}
          >
            Home,<br />one item at a time
          </h2>

          {/* Dynamic subtitle */}
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>

        {/* Hairline divider */}
        <div className="mx-5 h-px bg-gray-200/60 shrink-0" />

        {/* ── Action row ── */}
        <div className="px-5 py-3.5 shrink-0 grid grid-cols-2 gap-2.5">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setHubScannerOpen(true)}
            className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-white
                       border border-gray-100 text-left shadow-card"
            style={{ boxShadow: '0 2px 10px rgba(45,41,38,0.05)' }}
          >
            <ScanLine size={16} className="text-gray-500 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-gray-700 leading-tight">Scan receipt</p>
              <p className="text-[10px] text-gray-400 leading-tight mt-0.5">Attach a photo</p>
            </div>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setView('new')}
            className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-white
                       border border-gray-100 text-left shadow-card"
            style={{ boxShadow: '0 2px 10px rgba(45,41,38,0.05)' }}
          >
            <Plus size={16} className="text-gray-500 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-gray-700 leading-tight">New list</p>
              <p className="text-[10px] text-gray-400 leading-tight mt-0.5">Start fresh</p>
            </div>
          </motion.button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-6">

          {lists.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-14 text-center px-8">
              <p className="text-sm font-medium text-gray-500 mb-1.5">A fresh list starts here.</p>
              <p className="text-xs text-gray-400 mb-6">Create your first list.</p>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setView('new')}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl text-white text-sm font-semibold"
                style={{ background: SHOP_RED }}
              >
                <Plus size={14} aria-hidden="true" /> Create a list
              </motion.button>
            </div>
          ) : (
            <>
              {/* Active list section */}
              {incompleteLists.length > 0 && (
                <div className="px-5 pt-2 pb-1">
                  {/* Section label */}
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-medium text-gray-400 tracking-widest uppercase">
                      Active list
                    </p>
                    <span className="text-[11px] text-gray-400 tabular-nums">
                      {totalPending} pending
                    </span>
                  </div>

                  {/* Flat list rows */}
                  <div className="space-y-px">
                    {incompleteLists.map((list, idx) => {
                      const checked  = list.items.filter(i => i.isChecked).length
                      const total    = list.items.length
                      const unchecked = total - checked
                      const pct      = total > 0 ? (checked / total) * 100 : 0
                      const cost     = listTotal(list)
                      const hasPhotos = effectivePhotos(list).length > 0

                      return (
                        <motion.button
                          key={list.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04, duration: 0.22 }}
                          whileTap={{ scale: 0.985 }}
                          onClick={() => setView(list.id)}
                          className="w-full text-left rounded-2xl px-4 py-3.5 bg-white
                                     border border-gray-100/80 mb-2"
                          style={{ boxShadow: '0 1px 8px rgba(45,41,38,0.04)' }}
                        >
                          {/* Cover photo strip */}
                          {hasPhotos && (
                            <div
                              className="w-full h-20 rounded-xl overflow-hidden mb-3 cursor-pointer"
                              onClick={e => {
                                e.stopPropagation()
                                openLightbox(effectivePhotos(list))
                              }}
                            >
                              <img
                                src={effectivePhotos(list)[0]}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}

                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-[15px] font-semibold text-gray-800 truncate leading-tight">
                                {list.name}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {list.storeName && (
                                  <span className="text-[11px] text-gray-400">{list.storeName}</span>
                                )}
                                {list.date && (
                                  <span className="text-[11px] text-gray-400">{list.date}</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              {cost > 0 && (
                                <p className="text-sm font-semibold text-gray-700">
                                  €{cost.toFixed(2)}
                                </p>
                              )}
                              <p className="text-xs text-gray-400 mt-0.5">
                                {unchecked} of {total} left
                              </p>
                            </div>
                          </div>

                          {/* Thin progress line */}
                          {total > 0 && (
                            <div className="mt-3 h-[2px] bg-gray-100 rounded-full overflow-hidden">
                              <motion.div
                                className="h-full rounded-full"
                                style={{ background: SHOP_RED, opacity: 0.55 }}
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ type: 'spring', stiffness: 80, damping: 18 }}
                              />
                            </div>
                          )}
                        </motion.button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Completed section — collapsible */}
              {completedLists.length > 0 && (
                <div className="px-5 pt-1">
                  <button
                    onClick={() => setCompletedOpen(c => !c)}
                    className="w-full flex items-center justify-between py-3 text-left
                               active:opacity-70 transition-opacity"
                    aria-expanded={completedOpen}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                        <Check size={10} className="text-emerald-500" />
                      </div>
                      <span className="text-[11px] font-medium text-gray-400 tracking-widest uppercase">
                        Completed
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-gray-400">{completedLists.length}</span>
                      {completedOpen
                        ? <ChevronDown size={14} className="text-gray-400" aria-hidden="true" />
                        : <ChevronRight size={14} className="text-gray-400" aria-hidden="true" />
                      }
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {completedOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-2 pb-2">
                          {completedLists.map((list, idx) => {
                            const checked = list.items.filter(i => i.isChecked).length
                            const total   = list.items.length
                            const cost    = listTotal(list)
                            return (
                              <motion.button
                                key={list.id}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.03 }}
                                whileTap={{ scale: 0.985 }}
                                onClick={() => setView(list.id)}
                                className="w-full text-left rounded-2xl px-4 py-3 bg-white/60
                                           border border-gray-100/60 opacity-65"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-600 truncate">
                                      {list.name}
                                    </p>
                                    {list.completedAt && (
                                      <p className="text-[10px] text-gray-400 mt-0.5">
                                        {new Date(list.completedAt).toLocaleDateString(undefined, {
                                          month: 'short', day: 'numeric'
                                        })}
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0">
                                    {cost > 0 && (
                                      <p className="text-xs font-medium text-gray-500">€{cost.toFixed(2)}</p>
                                    )}
                                    <p className="text-[10px] text-gray-400">
                                      {checked}/{total} done
                                    </p>
                                  </div>
                                </div>
                              </motion.button>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Closing human copy */}
              <p className="text-center text-xs text-gray-400/70 italic px-8 pt-6 pb-2 leading-relaxed">
                Good food, good mood,<br />better together.
              </p>
            </>
          )}
        </div>
      </motion.div>

      {/* New list editor */}
      <AnimatePresence>
        {view === 'new' && (
          <ShoppingListEditorSheet
            mode="create"
            onSave={(id) => setView(id)}
            onClose={() => setView(null)}
          />
        )}
      </AnimatePresence>

      {/* List detail */}
      <AnimatePresence>
        {activeList && (
          <ShoppingDetailSheet
            list={activeList}
            onUpdate={(updates) => updateList(activeList.id, updates)}
            onDelete={() => { deleteList(activeList.id); setView(null) }}
            onAddItem={(name, qty, notes, price) => addItem(activeList.id, name, qty, notes, price)}
            onToggleItem={(itemId) => toggleItem(activeList.id, itemId)}
            onDeleteItem={(itemId) => deleteItem(activeList.id, itemId)}
            onUpdateItem={(itemId, updates) => updateItem(activeList.id, itemId, updates)}
            onClose={() => setView(null)}
          />
        )}
      </AnimatePresence>

      {/* Hub-level receipt scanner */}
      <AnimatePresence>
        {hubScannerOpen && (
          <ReceiptScannerSheet
            onClose={() => setHubScannerOpen(false)}
            onResultReady={(result, photos) => {
              setHubScanResult(result)
              setHubScanPhotos(photos)
              setHubScannerOpen(false)
            }}
          />
        )}
      </AnimatePresence>

      {/* Hub-level receipt review */}
      <AnimatePresence>
        {hubScanResult && (
          <ReceiptReviewSheet
            result={hubScanResult}
            photos={hubScanPhotos}
            onClose={() => { setHubScanResult(null); setHubScanPhotos([]) }}
            onSave={handleHubScanSave}
          />
        )}
      </AnimatePresence>
    </>
  )
}

/* ── ShoppingDetailSheet ─────────────────────────────────────────────────────
 * Individual shopping list view — items, receipt, progress, completion.
 * ──────────────────────────────────────────────────────────────────────────── */

export function ShoppingDetailSheet({
  list, onUpdate, onDelete, onAddItem, onToggleItem, onDeleteItem, onUpdateItem, onClose,
}: {
  list: ShoppingList
  onUpdate: (updates: Partial<ShoppingList>) => void
  onDelete: () => void
  onAddItem: (name: string, qty: number, notes?: string, price?: number) => void
  onToggleItem: (itemId: string) => void
  onDeleteItem: (itemId: string) => void
  onUpdateItem: (itemId: string, updates: Partial<ShoppingItem>) => void
  onClose: () => void
}) {
  const openOverlay  = useAppStore(s => s.openOverlay)
  const closeOverlay = useAppStore(s => s.closeOverlay)

  // FAB overlay tracking
  useEffect(() => {
    openOverlay()
    return () => closeOverlay()
  }, [openOverlay, closeOverlay])

  const [itemName,  setItemName]  = useState('')
  const [itemQty,   setItemQty]   = useState('1')
  const [itemPrice, setItemPrice] = useState('')
  const photoRef    = useRef<HTMLInputElement>(null)
  const itemNameRef = useRef<HTMLInputElement>(null)

  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editName,  setEditName]  = useState('')
  const [editQty,   setEditQty]   = useState('1')
  const [editPrice, setEditPrice] = useState('')
  const [editNotes, setEditNotes] = useState('')

  // Receipt scanning (from within detail view)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanResult,  setScanResult]  = useState<ReceiptResult | null>(null)
  const [scanPhotos,  setScanPhotos]  = useState<string[]>([])

  const [completionDialog,     setCompletionDialog]     = useState(false)
  const [leaveNoteMode,        setLeaveNoteMode]        = useState(false)
  const [completionNote,       setCompletionNote]       = useState(list.completionNote ?? '')
  const [showDeleteListConfirm, setShowDeleteListConfirm] = useState(false)
  const [deleteItemId,         setDeleteItemId]         = useState<string | null>(null)

  const prevCompletedRef = useRef(list.isCompleted ?? false)
  useEffect(() => {
    if (list.isCompleted && !prevCompletedRef.current) setCompletionDialog(true)
    prevCompletedRef.current = list.isCompleted ?? false
  }, [list.isCompleted])

  const openLightbox = useLightboxStore(s => s.open)

  const checked = list.items.filter(i => i.isChecked).length
  const total   = list.items.length
  const pct     = total > 0 ? (checked / total) * 100 : 0
  const cost    = listTotal(list)
  const photos  = effectivePhotos(list)

  // Item count summary for header
  const remaining = total - checked
  const listStatus = list.isCompleted
    ? 'Everything is home.'
    : remaining === 0 && total > 0
    ? 'All checked off.'
    : `${remaining} of ${total} left`

  function handleAddItem() {
    if (!itemName.trim()) return
    onAddItem(itemName.trim(), parseFloat(itemQty) || 1, undefined, parseFloat(itemPrice) || undefined)
    setItemName(''); setItemQty('1'); setItemPrice('')
    requestAnimationFrame(() => itemNameRef.current?.focus())
  }

  function startEditItem(item: ShoppingItem) {
    setEditingItemId(item.id)
    setEditName(item.name)
    setEditQty(String(item.quantity))
    setEditPrice(item.price != null ? String(item.price) : '')
    setEditNotes(item.notes ?? '')
  }

  function saveItemEdit() {
    if (!editingItemId || !editName.trim()) return
    onUpdateItem(editingItemId, {
      name:     editName.trim(),
      quantity: parseFloat(editQty) || 1,
      price:    parseFloat(editPrice) || undefined,
      notes:    editNotes.trim() || undefined,
    })
    setEditingItemId(null)
  }

  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const resized = await resizeImage(file)
    const updated = [...photos, resized]
    onUpdate({ photos: updated, coverPhoto: updated[0] })
    e.target.value = ''
  }

  function saveCompletionNote() {
    onUpdate({ completionNote: completionNote.trim() || undefined })
    setCompletionDialog(false)
    setLeaveNoteMode(false)
  }

  function handleSaveReceipt(result: ReceiptResult) {
    const receipt: ShoppingListReceipt = { ...result, photos: scanPhotos.length ? scanPhotos : undefined }
    onUpdate({ receipt })
    setScanResult(null)
    setScanPhotos([])
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[60] c2-backdrop"
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 380 }}
        className="fixed bottom-0 left-0 right-0 z-[60] rounded-t-[2rem] shadow-modal
                   max-w-lg mx-auto flex flex-col"
        style={{ maxHeight: 'calc(100dvh - 48px)', background: '#FDFAF5' }}
        role="dialog" aria-modal="true" aria-label={`${list.name} shopping list`}
      >
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoPick}
          aria-label="Add photo"
        />

        {/* ── Header ── */}
        <div className="px-5 pt-4 pb-3 shrink-0">
          <div className="drag-handle mb-3" />
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <h3
                  className="text-base font-semibold text-gray-800 truncate"
                  style={{ fontFamily: 'var(--font-playfair)' }}
                >
                  {list.name}
                </h3>
                {list.isCompleted && (
                  <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600 shrink-0">
                    Done
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
                {list.storeName && <span>{list.storeName}</span>}
                {list.date     && <span>{list.date}</span>}
                <span>{listStatus}</span>
                {cost > 0      && (
                  <span className="font-medium text-gray-500">€{cost.toFixed(2)}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => photoRef.current?.click()}
                aria-label="Add photo"
                className="w-8 h-8 rounded-full bg-white border border-gray-100 flex items-center justify-center text-gray-400"
              >
                <Camera size={14} aria-hidden="true" />
              </button>
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-8 h-8 rounded-full bg-white border border-gray-100 flex items-center justify-center text-gray-500"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-5 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: list.isCompleted ? '#10b981' : SHOP_RED }}
                animate={{ width: `${pct}%` }}
                transition={{ type: 'spring', stiffness: 100, damping: 18 }}
              />
            </div>
            <span
              className="text-xs font-medium shrink-0 tabular-nums"
              style={{ color: list.isCompleted ? '#10b981' : '#9ca3af' }}
            >
              {checked}/{total}
            </span>
          </div>
        </div>

        <div className="h-px bg-gray-200/60 mx-5 shrink-0" />

        {/* ── Scrollable content ── */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-3">

          {/* Completion banner */}
          {list.isCompleted && (
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="rounded-2xl px-4 py-3.5"
              style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0' }}
            >
              <p className="text-sm font-semibold text-emerald-600">Shopping complete!</p>
              {list.completedAt && (
                <p className="text-[10px] text-emerald-400 mt-0.5">
                  {new Date(list.completedAt).toLocaleDateString(undefined, {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })}
                  {list.completedBy ? ` · by ${list.completedBy}` : ''}
                </p>
              )}
              {list.completionNote ? (
                <div className="mt-2 pt-2 border-t border-emerald-100">
                  <p className="text-[11px] text-emerald-700 leading-relaxed italic">
                    &ldquo;{list.completionNote}&rdquo;
                  </p>
                  <button
                    onClick={() => { setLeaveNoteMode(true); setCompletionDialog(true) }}
                    className="text-[10px] text-emerald-500 font-semibold mt-1 active:opacity-70"
                  >
                    Edit note
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setLeaveNoteMode(true); setCompletionDialog(true) }}
                  className="mt-1.5 text-[10px] text-emerald-500 font-semibold active:opacity-70"
                >
                  + Add a note about this trip
                </button>
              )}
            </motion.div>
          )}

          {/* Add item row */}
          <div className="bg-white rounded-2xl border border-gray-100 p-3">
            <div className="flex items-center gap-2">
              <input
                ref={itemNameRef}
                type="text"
                value={itemName}
                onChange={e => setItemName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddItem() } }}
                placeholder="Add item..."
                aria-label="New item name"
                className="flex-1 text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2 outline-none border border-gray-100 placeholder:text-gray-300"
              />
              <input
                type="number"
                value={itemQty}
                onChange={e => setItemQty(e.target.value)}
                min="0" step="any" inputMode="decimal"
                aria-label="Quantity"
                onFocus={e => e.target.select()}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddItem() } }}
                className="w-10 text-xs text-center bg-gray-50 rounded-xl px-1.5 py-2 outline-none border border-gray-100"
              />
              <input
                type="number"
                value={itemPrice}
                onChange={e => setItemPrice(e.target.value)}
                placeholder="€"
                aria-label="Price"
                min="0" step="any" inputMode="decimal"
                onFocus={e => e.target.select()}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddItem() } }}
                className="w-14 text-xs bg-gray-50 rounded-xl px-2 py-2 outline-none border border-gray-100"
              />
            </div>
          </div>

          {/* Section label */}
          {list.items.length > 0 && (
            <p className="text-[11px] font-medium text-gray-400 tracking-widest uppercase px-1 pt-1">
              Active list · {list.items.filter(i => !i.isChecked).length} remaining
            </p>
          )}

          {/* Item rows */}
          <AnimatePresence initial={false}>
            {list.items.map(item => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
              >
                {editingItemId === item.id ? (
                  /* Inline edit form */
                  <div
                    className="bg-white rounded-2xl border-2 p-2.5 space-y-2"
                    style={{ borderColor: SHOP_RED + '40' }}
                  >
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        autoFocus
                        aria-label="Edit item name"
                        className="flex-1 text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-1.5 outline-none min-w-0"
                      />
                      <input
                        type="number"
                        value={editQty}
                        onChange={e => setEditQty(e.target.value)}
                        min="0" step="any" inputMode="decimal"
                        aria-label="Edit quantity"
                        onFocus={e => e.target.select()}
                        className="w-12 text-xs text-center bg-gray-50 rounded-xl px-1.5 py-1.5 outline-none shrink-0"
                      />
                      <input
                        type="number"
                        value={editPrice}
                        onChange={e => setEditPrice(e.target.value)}
                        placeholder="€"
                        aria-label="Edit price"
                        min="0" step="any" inputMode="decimal"
                        className="w-16 text-xs bg-gray-50 rounded-xl px-2 py-1.5 outline-none shrink-0"
                      />
                    </div>
                    <input
                      type="text"
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                      placeholder="Note (optional)"
                      aria-label="Edit notes"
                      className="w-full text-xs text-gray-600 bg-gray-50 rounded-xl px-3 py-1.5 outline-none"
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={saveItemEdit}
                        disabled={!editName.trim()}
                        className="flex-1 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-bold disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingItemId(null)}
                        className="flex-1 py-1.5 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => setDeleteItemId(item.id)}
                        aria-label="Delete item"
                        className="w-8 py-1.5 rounded-xl bg-red-50 text-red-400 flex items-center justify-center"
                      >
                        <Trash2 size={12} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Normal item row — flat, no card border on each item */
                  <div className={cn(
                    'flex items-center gap-3 px-3 py-3 rounded-2xl transition-colors',
                    item.isChecked
                      ? 'opacity-50 bg-white/50'
                      : 'bg-white border border-gray-100/80',
                  )}>
                    <button
                      onClick={() => onToggleItem(item.id)}
                      aria-label={item.isChecked ? `Uncheck ${item.name}` : `Check off ${item.name}`}
                      className={cn(
                        'w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all',
                        item.isChecked
                          ? 'bg-emerald-400 border-emerald-400'
                          : 'border-gray-300',
                      )}
                    >
                      {item.isChecked && <Check size={10} color="white" strokeWidth={3} aria-hidden="true" />}
                    </button>

                    <button className="flex-1 min-w-0 text-left" onClick={() => startEditItem(item)}>
                      <p className={cn(
                        'text-sm font-medium leading-tight',
                        item.isChecked ? 'line-through text-gray-400' : 'text-gray-800',
                      )}>
                        {item.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {item.quantity > 1 && (
                          <span className="text-[10px] text-gray-400">×{item.quantity}</span>
                        )}
                        {item.price != null && item.price > 0 && (
                          <span className="text-[10px] text-gray-400">€{item.price.toFixed(2)}</span>
                        )}
                        {item.quantity > 1 && item.price != null && item.price > 0 && (
                          <span className="text-[10px] font-medium text-gray-500">
                            = €{(item.price * item.quantity).toFixed(2)}
                          </span>
                        )}
                        {item.notes && (
                          <span className="text-[10px] text-gray-400 italic truncate">{item.notes}</span>
                        )}
                      </div>
                    </button>

                    <button
                      onClick={() => startEditItem(item)}
                      aria-label={`Edit ${item.name}`}
                      className="text-gray-300 active:text-blue-400 p-1 shrink-0"
                    >
                      <Pencil size={12} aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => setDeleteItemId(item.id)}
                      aria-label={`Remove ${item.name}`}
                      className="text-gray-200 active:text-red-400 p-0.5 shrink-0"
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {list.items.length === 0 && (
            <p className="text-center text-xs text-gray-400 py-6">
              Nothing here yet — add the first item above
            </p>
          )}

          {/* ── Estimated total ── (only when prices are set) */}
          {(() => {
            const itemsWithPrice = list.items.filter(i => i.price != null && i.price > 0)
            if (itemsWithPrice.length === 0) return null
            return (
              <div className="rounded-2xl bg-white border border-gray-100 px-4 py-3.5 mt-1">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-700">Estimated total</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Based on {itemsWithPrice.length} priced item{itemsWithPrice.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <p className="text-lg font-semibold text-gray-800">€{cost.toFixed(2)}</p>
                </div>
              </div>
            )
          })()}

          {/* ── Receipt / photo section ── */}
          {list.receipt ? (
            <div className="mt-1 rounded-2xl overflow-hidden border border-gray-100 bg-white">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                <div>
                  <p className="text-[11px] font-medium text-gray-400 tracking-widest uppercase">
                    Receipt
                  </p>
                  {(list.receipt.store || list.receipt.date) && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {list.receipt.store}
                      {list.receipt.store && list.receipt.date ? ' · ' : ''}
                      {list.receipt.date}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setScannerOpen(true)}
                  className="text-[10px] font-medium text-gray-400 active:opacity-70"
                >
                  Update
                </button>
              </div>

              {list.receipt.photos && list.receipt.photos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto px-4 py-3 border-b border-gray-50 scrollbar-hide">
                  {list.receipt.photos.map((src, i) => (
                    <button
                      key={i}
                      onClick={() => openLightbox(list.receipt!.photos!, i)}
                      aria-label={`View receipt photo ${i + 1}`}
                      className="relative shrink-0"
                    >
                      <img
                        src={src}
                        alt={`Receipt photo ${i + 1}`}
                        className="w-16 h-20 object-cover rounded-xl border border-gray-100 active:opacity-80"
                      />
                    </button>
                  ))}
                </div>
              )}

              <div className="divide-y divide-gray-50">
                {list.receipt.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">{it.name}</p>
                      {it.quantity > 1 && <p className="text-[10px] text-gray-400">×{it.quantity}</p>}
                    </div>
                    <p className="text-sm font-medium text-gray-600 shrink-0 ml-3">
                      {list.receipt?.currency} {it.lineTotal.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 bg-gray-50/60 border-t border-gray-100 space-y-1">
                {list.receipt.tax > 0 && (
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Tax</span>
                    <span>{list.receipt.currency} {list.receipt.tax.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold text-gray-800">
                  <span>Total paid</span>
                  <span>{list.receipt.currency} {list.receipt.grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setScannerOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl
                         border-2 border-dashed border-gray-200 text-sm font-medium text-gray-400
                         active:border-gray-300 active:text-gray-500 transition-colors"
            >
              <ScanLine size={16} aria-hidden="true" />
              Scan receipt
            </button>
          )}

          {/* List photos */}
          {photos.length > 0 && (
            <div className="pt-1">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[11px] font-medium text-gray-400 tracking-widest uppercase">Photos</p>
                <button
                  onClick={() => photoRef.current?.click()}
                  aria-label="Add another photo"
                  className="text-[10px] font-medium text-gray-400 active:opacity-70 flex items-center gap-0.5"
                >
                  <Camera size={11} aria-hidden="true" /> Add
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => openLightbox(photos, i)}
                    aria-label={`View photo ${i + 1}`}
                    className="relative shrink-0 w-20 h-20 rounded-2xl overflow-hidden active:opacity-80"
                  >
                    <img src={p} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 pt-3 shrink-0 border-t border-gray-100 pb-sheet-footer">
          <button
            onClick={() => setShowDeleteListConfirm(true)}
            className="w-full py-3 rounded-2xl text-red-400 text-sm font-medium
                       flex items-center justify-center gap-2 bg-red-50/60"
          >
            <Trash2 size={14} aria-hidden="true" /> Delete list
          </button>
        </div>
      </motion.div>

      {/* Delete list confirmation */}
      <DeleteConfirmSheet
        open={showDeleteListConfirm}
        title="Delete this list?"
        message="This shopping list and all its items will be permanently removed."
        onCancel={() => setShowDeleteListConfirm(false)}
        onConfirm={() => { onDelete(); setShowDeleteListConfirm(false) }}
      />

      {/* Delete item confirmation */}
      <DeleteConfirmSheet
        open={!!deleteItemId}
        title="Remove this item?"
        message="This item will be permanently removed from the list."
        confirmLabel="Remove"
        onCancel={() => setDeleteItemId(null)}
        onConfirm={() => {
          onDeleteItem(deleteItemId!)
          if (editingItemId === deleteItemId) setEditingItemId(null)
          setDeleteItemId(null)
        }}
      />

      {/* Receipt scanner */}
      <AnimatePresence>
        {scannerOpen && (
          <ReceiptScannerSheet
            onClose={() => setScannerOpen(false)}
            onResultReady={(result, photos) => {
              setScanResult(result)
              setScanPhotos(photos)
              setScannerOpen(false)
            }}
          />
        )}
      </AnimatePresence>

      {/* Receipt review */}
      <AnimatePresence>
        {scanResult && (
          <ReceiptReviewSheet
            result={scanResult}
            photos={scanPhotos}
            onClose={() => { setScanResult(null); setScanPhotos([]) }}
            onSave={handleSaveReceipt}
          />
        )}
      </AnimatePresence>

      {/* Completion dialog */}
      <AnimatePresence>
        {completionDialog && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setCompletionDialog(false); setLeaveNoteMode(false) }}
              className="fixed inset-0 z-[70] c2-backdrop flex items-center justify-center p-6"
            />
            <motion.div
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.88, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 320 }}
              className="fixed inset-0 z-[70] flex items-center justify-center p-6 pointer-events-none"
            >
              <div
                className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-modal pointer-events-auto"
                onClick={e => e.stopPropagation()}
              >
                {!leaveNoteMode ? (
                  <>
                    <div className="text-center mb-5">
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: 2, duration: 0.45 }}
                        className="w-14 h-14 rounded-full flex items-center justify-center mb-3 mx-auto"
                        style={{ background: 'rgba(158,201,179,0.18)', color: '#7BBBA5' }}
                        aria-hidden="true"
                      >
                        <PartyPopper size={28} strokeWidth={1.5} />
                      </motion.div>
                      <h3 className="text-base font-bold text-gray-800 mb-1">Shopping complete!</h3>
                      <p className="text-sm text-gray-400 leading-relaxed">
                        Would you like to leave a note about this shopping trip?
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCompletionDialog(false)}
                        className="flex-1 py-3.5 rounded-2xl c2-sheet-cancel text-sm font-semibold active:opacity-80"
                      >
                        Not now
                      </button>
                      <button
                        onClick={() => setLeaveNoteMode(true)}
                        className="flex-1 py-3.5 rounded-2xl text-white text-sm font-semibold active:opacity-80"
                        style={{ background: SHOP_RED }}
                      >
                        Leave note
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-bold text-gray-800">Trip note</h3>
                      <button
                        onClick={() => { setCompletionDialog(false); setLeaveNoteMode(false) }}
                        aria-label="Close"
                        className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </div>
                    <textarea
                      value={completionNote}
                      onChange={e => setCompletionNote(e.target.value)}
                      placeholder="How did the trip go?"
                      rows={4}
                      autoFocus
                      className="w-full text-sm text-gray-700 placeholder:text-gray-300 bg-gray-50
                                 rounded-2xl px-4 py-3 outline-none resize-none mb-4 leading-relaxed"
                    />
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={saveCompletionNote}
                      className="w-full py-3.5 rounded-2xl text-white text-sm font-semibold"
                      style={{ background: SHOP_RED }}
                    >
                      Save note
                    </motion.button>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
