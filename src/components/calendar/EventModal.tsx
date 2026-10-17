'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Clock, FileText, Plus, Check, Camera, Trash2 } from '@/design/iconSystem'
import { useAppStore } from '@/store/useAppStore'
import { useLightboxStore } from '@/store/useLightboxStore'
import { type CalendarEvent, type EventTodo } from '@/types'
import { generateId, formatDate, cn } from '@/lib/utils'
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet'
import { DatePicker } from '@/components/ui/DatePicker'
import { TimePicker } from '@/components/ui/TimePicker'
import { eventDraftValues } from '@/lib/dream-checklist'
import { mergeDraft, resolveDraftConflicts, type DraftConflict, type DraftResolutions } from '@/lib/draft-merge'
import { DraftConflictNotice } from '@/components/ui/DraftConflictNotice'

export const COLOR_OPTIONS = [
  { value: 'seval',  hex: '#a78bfa', label: 'Wishes'  },
  { value: 'blue',   hex: '#60a5fa', label: 'Dreams'  },
  { value: 'yellow', hex: '#fbbf24', label: 'Moments' },
  { value: 'green',  hex: '#34d399', label: 'Plans'   },
] as const

interface EventModalProps {
  isOpen: boolean
  onClose: () => void
  date: string
  event?: CalendarEvent | null
  initialColor?: CalendarEvent['color']
}

export function EventModal({ isOpen, onClose, date, event, initialColor }: EventModalProps) {
  const currentUser       = useAppStore(s => s.currentUser)
  const addEvent          = useAppStore(s => s.addEvent)
  const updateEvent       = useAppStore(s => s.updateEvent)
  const deleteEvent       = useAppStore(s => s.deleteEvent)
  const uploadEventPhoto  = useAppStore(s => s.uploadEventPhoto)
  const openOverlay       = useAppStore(s => s.openOverlay)
  const closeOverlay      = useAppStore(s => s.closeOverlay)
  const [title, setTitle]           = useState('')
  const [selectedDate, setDate]     = useState(date)
  const [startTime, setStartTime]   = useState('')
  const [endTime, setEndTime]       = useState('')
  const [notes, setNotes]           = useState('')
  const [color, setColor]           = useState<CalendarEvent['color']>('seval')
  const [todos, setTodos]           = useState<EventTodo[]>([])
  const [newTodo, setNewTodo]       = useState('')
  const [editingTodoId,   setEditingTodoId]   = useState<string | null>(null)
  const [editingTodoText, setEditingTodoText] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [photos, setPhotos]         = useState<string[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [saving, setSaving]         = useState(false)
  const [uploading, setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [bgPhotoIdx, setBgPhotoIdx]   = useState<number | null>(null)
  const openLightbox = useLightboxStore(s => s.open)

  const photoInputRef = useRef<HTMLInputElement>(null)
  const isEdit = !!event

  // Tracks the current modal "session" so that background Zustand updates
  // (Supabase sync, goals array reference changes) never re-hydrate an active
  // draft.  Reset to null on close so the next open always reads fresh data.
  const initSessionRef = useRef<string | null>(null)
  const openingRef = useRef<{ values: ReturnType<typeof eventDraftValues>; goalId?: string; hadGoal: boolean } | null>(null)
  const resolutionsRef = useRef<DraftResolutions>({})
  const [conflicts, setConflicts] = useState<DraftConflict[]>([])

  useEffect(() => {
    if (!isOpen) return
    openOverlay()
    return () => closeOverlay()
  }, [isOpen, openOverlay, closeOverlay])

  useEffect(() => {
    if (!isOpen) {
      // Reset guard so reopening the same event loads the latest saved data.
      initSessionRef.current = null
      return
    }

    // Build a key that changes only when the modal genuinely opens for a new
    // session or a different event is loaded — not when background store
    // updates (e.g. Supabase sync replacing the goals array) arrive.
    const sessionKey = `${event?.id ?? 'new'}:${event ? '' : date}:${currentUser ?? ''}`
    if (initSessionRef.current === sessionKey) return
    initSessionRef.current = sessionKey

    // Read the goals snapshot at initialization time rather than subscribing
    // the effect to the live goals array, which gets a new object reference on
    // background synchronization and would wipe in-progress form state.
    const linkedGoal = event?.linkedGoalId
      ? useAppStore.getState().goals.find(g => g.id === event.linkedGoalId)
      : null

    if (event) {
      // For goal-linked events (Dreams created via FullCreateSheet), the linked
      // CalendarEvent may not carry all fields — enrich from the Goal as fallback.
      const values = eventDraftValues(event, linkedGoal ?? undefined)
      openingRef.current = { values: structuredClone(values), goalId: event.linkedGoalId, hadGoal: !!linkedGoal }
      setTitle(values.title)
      setDate(values.date)
      setStartTime(values.startTime)
      setEndTime(values.endTime)
      setNotes(values.notes)
      setColor(values.color)
      setTodos(values.todos)
      // Photos: prefer the event's own uploaded photos; fall back to goal photos
      const p = values.photos
      setPhotos(p)
      const bpIdx = values.backgroundPhoto ? p.indexOf(values.backgroundPhoto) : -1
      setBgPhotoIdx(bpIdx >= 0 ? bpIdx : null)
    } else {
      openingRef.current = null
      setTitle('')
      setDate(date)
      setStartTime('')
      setEndTime('')
      setNotes('')
      setColor(initialColor ?? 'yellow')
      setTodos([])
      setPhotos([])
      setPendingFiles([])
      setBgPhotoIdx(null)
    }
    setShowDelete(false)
    setNewTodo('')
    setSaving(false)
    setUploading(false)
    setUploadError(null)
    setConflicts([])
    resolutionsRef.current = {}
  // `goals` intentionally absent: we read via getState() snapshot to prevent
  // Supabase sync from re-initialising the form while the user is editing.
  }, [event, date, currentUser, isOpen, initialColor])

  async function handleSave() {
    if (!title.trim() || !currentUser || saving) return
    setSaving(true)
    try {
      // Auto-commit any checklist text the user typed without pressing Enter or +.
      // This handles the mobile "tap Save" path where the keyboard dismisses before
      // the user can commit the item explicitly.
      const pendingTrim = newTodo.trim()
      const editedTodos = editingTodoId && editingTodoText.trim()
        ? todos.map(item => item.id === editingTodoId ? { ...item, title: editingTodoText.trim() } : item) : todos
      const finalTodos = pendingTrim
        ? [...editedTodos, { id: generateId(), title: pendingTrim, isCompleted: false }] : editedTodos
      setTodos(finalTodos); setNewTodo(''); setEditingTodoId(null)

      const data = {
        title: title.trim(),
        date: selectedDate,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        notes: notes.trim() || undefined,
        color,
        todos: finalTodos,
        photos: photos.length ? photos : undefined,
        // For edit: photos[] are real URLs; for new: resolved after upload below
        backgroundPhoto: (isEdit && bgPhotoIdx !== null) ? photos[bgPhotoIdx] : undefined,
        createdBy: currentUser,
      }
      if (isEdit && event) {
        const opening = openingRef.current
        const state = useAppStore.getState()
        const latest = state.events.find(e => e.id === event.id)
        const goal = state.goals.find(g => g.id === latest?.linkedGoalId)
        if (!opening || !latest || latest.linkedGoalId !== opening.goalId || (opening.hadGoal && !goal)) {
          setConflicts([{ path: latest ? 'link' : 'record', mine: opening?.values, latest: undefined }]); return
        }
        const draft = { title: title.trim(), date: selectedDate, startTime, endTime, notes: notes.trim(), color,
          todos: finalTodos, photos, backgroundPhoto: bgPhotoIdx !== null ? photos[bgPhotoIdx] : undefined }
        const result = mergeDraft(opening.values, draft, eventDraftValues(latest, goal), resolutionsRef.current)
        setConflicts(result.conflicts)
        if (result.conflicts.length) return
        if (Object.keys(result.changes).length) updateEvent(event.id, {
          ...result.changes,
          ...('notes' in result.changes ? { notes: result.changes.notes || undefined } : {}),
          ...('startTime' in result.changes ? { startTime: result.changes.startTime || undefined } : {}),
          ...('endTime' in result.changes ? { endTime: result.changes.endTime || undefined } : {}),
        })
      } else {
        const nPending = pendingFiles.length
        const newId = addEvent(data)
        if (nPending > 0) {
          for (const file of pendingFiles) {
            await uploadEventPhoto(newId, file)
          }
          // Resolve real URL: blob previews occupy indices 0..nPending-1,
          // real uploads are appended at nPending, nPending+1, ...
          if (bgPhotoIdx !== null) {
            const stored = useAppStore.getState().events.find(e => e.id === newId)
            const bpUrl  = stored?.photos?.[nPending + bgPhotoIdx]
            if (bpUrl) updateEvent(newId, { backgroundPhoto: bpUrl })
          }
        }
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (event) {
      // Edit mode: upload immediately
      setUploading(true)
      setUploadError(null)
      const before = useAppStore.getState().events.find(ev => ev.id === event.id)?.photos ?? []
      await uploadEventPhoto(event.id, file)
      const updated = useAppStore.getState().events.find(ev => ev.id === event.id)
      if (updated?.photos) setPhotos(previous => [...previous,
        ...updated.photos!.filter(url => !before.includes(url) && !previous.includes(url))])
      setUploading(false)
    } else {
      // New event: queue file and show local preview
      const previewUrl = URL.createObjectURL(file)
      setPhotos(prev => [...prev, previewUrl])
      setPendingFiles(prev => [...prev, file])
    }
    if (e.target) e.target.value = ''
  }

  function handleDelete() {
    if (event) deleteEvent(event.id)
    onClose()
  }

  function addTodoItem() {
    if (!newTodo.trim()) return
    setTodos(prev => [...prev, { id: generateId(), title: newTodo.trim(), isCompleted: false }])
    setNewTodo('')
  }

  function toggleTodo(id: string) {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, isCompleted: !t.isCompleted } : t))
  }

  function removeTodo(id: string) {
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  function startEditTodo(id: string, title: string) {
    setEditingTodoId(id)
    setEditingTodoText(title)
  }

  function commitEditTodo() {
    if (!editingTodoId) return
    const text = editingTodoText.trim()
    if (text) {
      setTodos(prev => prev.map(t => t.id === editingTodoId ? { ...t, title: text } : t))
    }
    setEditingTodoId(null)
    setEditingTodoText('')
  }

  const activeColor = COLOR_OPTIONS.find(c => c.value === color)

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 c2-backdrop"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
            className="fixed bottom-0 left-0 right-0 z-50 c2-sheet-bg rounded-t-[2rem] shadow-modal max-w-lg mx-auto flex flex-col"
            style={{ maxHeight: 'calc(100dvh - 48px)' }}
          >
            {/* Non-scrolling header */}
            <div className="px-5 pt-4 shrink-0">
              <div className="drag-handle" />

              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-800">
                  {isEdit ? 'Edit Event' : `New Event · ${formatDate(date, 'MMM d')}`}
                </h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full c2-sheet-x"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Scrollable form content */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-4">
              {/* Title */}
              <div className="mb-4">
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Event title..."
                  className="w-full text-xl font-semibold text-gray-800 placeholder:text-gray-300
                             border-b-2 border-gray-100 focus:border-gray-200 pb-3 outline-none
                             transition-colors bg-transparent"
                  autoFocus={!isEdit}
                />
              </div>

              {/* Date & Time */}
              <div className="c2-sheet-section p-4 mb-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-white shadow-card flex items-center justify-center">
                    <Clock size={14} className="text-gray-400" />
                  </div>
                  <DatePicker
                    value={selectedDate}
                    onChange={setDate}
                    allowClear={false}
                    triggerClassName="bg-transparent text-sm text-gray-700 rounded-none px-0 py-0"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8" />
                  <TimePicker
                    value={startTime}
                    onChange={setStartTime}
                    className="flex-1"
                    triggerClassName="bg-white rounded-xl px-3 py-1.5 shadow-card"
                  />
                  <span className="text-xs text-gray-400">start time (optional)</span>
                </div>
              </div>

              {/* Notes */}
              <div className="c2-sheet-section p-4 mb-4 flex gap-3">
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
              <div className="mb-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Checklist
                </p>
                <div className="space-y-2">
                  {todos.map(todo => (
                    <div key={todo.id} className="flex items-center gap-3 group">
                      <button
                        onClick={() => toggleTodo(todo.id)}
                        aria-label={`Mark "${todo.title}" ${todo.isCompleted ? 'not done' : 'done'}`}
                        aria-pressed={todo.isCompleted}
                        className={cn(
                          'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                          todo.isCompleted ? 'border-emerald-400 bg-emerald-400' : 'border-gray-300'
                        )}
                      >
                        {todo.isCompleted && <Check size={11} color="white" strokeWidth={3} />}
                      </button>
                      {editingTodoId === todo.id ? (
                        <input
                          autoFocus
                          value={editingTodoText}
                          aria-label="Checklist item text"
                          onChange={e => setEditingTodoText(e.target.value)}
                          onBlur={commitEditTodo}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); commitEditTodo() }
                            if (e.key === 'Escape') { setEditingTodoId(null) }
                          }}
                          className="flex-1 text-sm text-gray-700 outline-none bg-transparent border-b border-gray-200 pb-0.5 rounded-none focus-visible:shadow-none"
                        />
                      ) : (
                        <span
                          className={cn(
                            'flex-1 text-sm',
                            todo.isCompleted ? 'line-through text-gray-400' : 'text-gray-700'
                          )}
                          onClick={() => startEditTodo(todo.id, todo.title)}
                        >
                          {todo.title}
                        </span>
                      )}
                      <button
                        onClick={() => removeTodo(todo.id)}
                        aria-label={`Remove "${todo.title}"`}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 active:text-red-400
                                   transition-all"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  <div className="flex items-center gap-3 mt-2">
                    <div className="w-5 h-5 rounded-full border-2 border-dashed border-gray-200 shrink-0" />
                    <input
                      type="text"
                      value={newTodo}
                      onChange={e => setNewTodo(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addTodoItem()}
                      placeholder="Add item..."
                      className="flex-1 text-sm text-gray-600 placeholder:text-gray-300 outline-none
                                 bg-transparent"
                    />
                    {newTodo && (
                      <button onClick={addTodoItem} className="text-gray-400 active:text-gray-600">
                        <Plus size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Photos */}
              <div className="mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Photos
                </p>
                {photos.length > 0 && (
                  <div className="flex gap-2 flex-wrap mb-3">
                    {photos.map((url, i) => (
                      <div key={i} className="relative w-20 h-20">
                        {/* Tap to open lightbox */}
                        <button className="w-full h-full" onClick={() => openLightbox(photos, i)}>
                          <img src={url} alt="" className="w-full h-full rounded-2xl object-cover" />
                        </button>
                        {/* Remove */}
                        <button
                          onClick={() => {
                            const next = photos.filter((_, idx) => idx !== i)
                            setPhotos(next)
                            if (!event) setPendingFiles(prev => prev.filter((_, idx) => idx !== i))
                            if (bgPhotoIdx === i) setBgPhotoIdx(null)
                            else if (bgPhotoIdx !== null && bgPhotoIdx > i) setBgPhotoIdx(bgPhotoIdx - 1)
                          }}
                          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white
                                     flex items-center justify-center text-xs"
                        >×</button>
                        {/* Set as card background */}
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
              </div>
            </div>

            {/* Pinned action footer */}
            <div className="shrink-0 px-5 pt-3 border-t border-[rgba(180,165,140,0.15)] pb-sheet-footer">
              <DraftConflictNotice conflicts={conflicts} onResolve={choice => {
                if (conflicts.some(conflict => conflict.path === 'record' || conflict.path === 'link')) { onClose(); return }
                resolutionsRef.current = { ...resolutionsRef.current, ...resolveDraftConflicts(conflicts, choice) }
                void handleSave()
              }} />
              <button
                onClick={handleSave}
                disabled={!title.trim() || saving}
                className="btn-primary mb-3 disabled:opacity-40"
                style={{ background: `linear-gradient(135deg, ${activeColor?.hex}, ${activeColor?.hex}cc)` }}
              >
                {saving ? 'Saving...' : (isEdit ? 'Save Changes' : 'Add Event')}
              </button>

              {isEdit && (
                <button
                  onClick={() => setShowDelete(true)}
                  className="w-full py-3 rounded-2xl text-sm font-medium text-red-400
                             active:bg-red-50 transition-colors"
                >
                  Delete Event
                </button>
              )}
            </div>
          </motion.div>

          <DeleteConfirmSheet
            open={showDelete}
            title="Delete Event?"
            message="This can't be undone."
            onCancel={() => setShowDelete(false)}
            onConfirm={handleDelete}
          />
        </>
      )}
    </AnimatePresence>
  )
}
