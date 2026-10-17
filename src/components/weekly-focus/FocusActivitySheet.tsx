'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Trash2 } from '@/design/iconSystem'
import { useAppStore } from '@/store/useAppStore'
import { type FocusActivity, type FocusChecklistItem, type FocusReminder, type FocusPriority, type UserName } from '@/types'
import { cn, generateId } from '@/lib/utils'
import { PhotoGallery } from '@/components/ui/PhotoGallery'
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet'
import { C2Sheet, C2SheetBody, C2SheetFooter } from '@/components/ui'
import { TimePicker } from '@/components/ui/TimePicker'

interface Props {
  open: boolean
  onClose: () => void
  weekKey: string
  dayIndex: number
  activity?: FocusActivity
  suggestedTitle?: string
  primary: string
  owner?: UserName | 'both'
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const PRIORITY_OPTIONS: { value: FocusPriority | 'none'; label: string }[] = [
  { value: 'none',   label: 'None' },
  { value: 'low',    label: '!'    },
  { value: 'medium', label: '!!'   },
  { value: 'high',   label: '!!!'  },
]

const REMINDER_OPTIONS: { value: FocusReminder; label: string }[] = [
  { value: 'none',    label: 'None'          },
  { value: 'at_time', label: 'At time'       },
  { value: '5min',    label: '5 min before'  },
  { value: '10min',   label: '10 min before' },
  { value: '30min',   label: '30 min before' },
  { value: '1h',      label: '1 hr before'   },
]

export function FocusActivitySheet({
  open,
  onClose,
  weekKey,
  dayIndex,
  activity,
  suggestedTitle,
  primary,
  owner,
}: Props) {
  const addFocusActivity         = useAppStore(s => s.addFocusActivity)
  const updateFocusActivity      = useAppStore(s => s.updateFocusActivity)
  const deleteFocusActivity      = useAppStore(s => s.deleteFocusActivity)
  const uploadFocusActivityPhoto = useAppStore(s => s.uploadFocusActivityPhoto)
  const openOverlay              = useAppStore(s => s.openOverlay)
  const closeOverlay             = useAppStore(s => s.closeOverlay)

  const isEdit = !!activity

  // ── Form state ──
  const [title,         setTitle]         = useState('')
  const [time,          setTime]          = useState('')
  const [reminders,     setReminders]     = useState<FocusReminder[]>([])
  const [notes,         setNotes]         = useState('')
  const [priority,      setPriority]      = useState<FocusPriority | 'none'>('none')
  const [checklist,     setChecklist]     = useState<FocusChecklistItem[]>([])
  const [newItem,       setNewItem]       = useState('')
  const [editingChecklistId,   setEditingChecklistId]   = useState<string | null>(null)
  const [editingChecklistText, setEditingChecklistText] = useState('')
  const [photos,        setPhotos]        = useState<string[]>([])
  const [uploading,     setUploading]     = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving,        setSaving]        = useState(false)

  const titleRef    = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    openOverlay()
    return () => closeOverlay()
  }, [open, openOverlay, closeOverlay])

  // Sync form when sheet opens
  useEffect(() => {
    if (!open) return
    if (activity) {
      setTitle(activity.title)
      setTime(activity.time ?? '')
      // Prefer new `reminders` array; fall back to legacy single `reminder`
      setReminders(
        activity.reminders
          ? [...activity.reminders]
          : activity.reminder && activity.reminder !== 'none'
          ? [activity.reminder]
          : []
      )
      setPriority(activity.priority ?? 'none')
      setNotes(activity.notes ?? '')
      setChecklist(activity.checklist ? [...activity.checklist] : [])
      setPhotos(activity.photos ? [...activity.photos] : [])
    } else {
      setTitle(suggestedTitle ?? '')
      setTime('')
      setReminders([])
      setPriority('none')
      setNotes('')
      setChecklist([])
      setPhotos([])
    }
    setNewItem('')
    setSaving(false)
    setConfirmDelete(false)
    setTimeout(() => titleRef.current?.focus(), 340)
  }, [open, activity, suggestedTitle])

  // ── Checklist helpers ──
  function addChecklistItem() {
    const text = newItem.trim()
    if (!text) return
    setChecklist(prev => [...prev, { id: generateId(), text, done: false }])
    setNewItem('')
  }

  function toggleChecklistItem(id: string) {
    setChecklist(prev => prev.map(i => i.id === id ? { ...i, done: !i.done } : i))
  }

  function removeChecklistItem(id: string) {
    setChecklist(prev => prev.filter(i => i.id !== id))
  }

  function startEditChecklistItem(id: string, text: string) {
    setEditingChecklistId(id)
    setEditingChecklistText(text)
  }

  function commitEditChecklistItem() {
    if (!editingChecklistId) return
    const text = editingChecklistText.trim()
    if (text) {
      setChecklist(prev => prev.map(i => i.id === editingChecklistId ? { ...i, text } : i))
    }
    setEditingChecklistId(null)
    setEditingChecklistText('')
  }

  // ── Photo upload ──
  async function handlePhotoFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)

    if (isEdit && activity) {
      for (const file of Array.from(files)) {
        await uploadFocusActivityPhoto(activity.id, file)
      }
    } else {
      const previews = Array.from(files).map(f => URL.createObjectURL(f))
      setPhotos(prev => [...prev, ...previews])
    }
    setUploading(false)
  }

  function removePhoto(idx: number) {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
    if (isEdit && activity) {
      updateFocusActivity(activity.id, { photos: (activity.photos ?? []).filter((_, i) => i !== idx) })
    }
  }

  // ── Save ──
  async function handleSave() {
    const titleTrimmed = title.trim()
    if (!titleTrimmed) { titleRef.current?.focus(); return }
    if (saving) return

    setSaving(true)
    try {
      const checklistData  = checklist.length > 0 ? checklist : undefined
      const timeTrimmed    = time.trim() || undefined
      // Only keep reminders that make sense when a time is set
      const remindersVal   = timeTrimmed && reminders.length > 0 ? reminders : undefined
      const priorityVal    = priority !== 'none' ? priority : undefined

      if (isEdit && activity) {
        updateFocusActivity(activity.id, {
          title:     titleTrimmed,
          time:      timeTrimmed,
          reminders: remindersVal,
          reminder:  undefined,
          priority:  priorityVal,
          notes:     notes.trim() || undefined,
          checklist: checklistData,
        })
      } else {
        const newId = addFocusActivity({
          weekKey,
          dayIndex,
          title:     titleTrimmed,
          time:      timeTrimmed,
          reminders: remindersVal,
          priority:  priorityVal,
          notes:     notes.trim() || undefined,
          checklist: checklistData,
          owner,
        })

        if (photos.length > 0 && newId) {
          for (const preview of photos) {
            if (preview.startsWith('blob:')) {
              try {
                const res  = await fetch(preview)
                const blob = await res.blob()
                const file = new File([blob], 'photo.jpg', { type: blob.type })
                await uploadFocusActivityPhoto(newId, file)
                URL.revokeObjectURL(preview)
              } catch {
                // skip failed photo silently — activity is already saved
              }
            }
          }
        }
      }

      onClose()
    } catch {
      // restore button state on unexpected error
    } finally {
      setSaving(false)
    }
  }

  function handleDelete() {
    if (!activity) return
    deleteFocusActivity(activity.id)
    setConfirmDelete(false)
    onClose()
  }

  const canSave   = title.trim().length > 0
  const hasTime   = !!time.trim()

  return (
    <>
      <C2Sheet open={open} onClose={onClose} aria-label={isEdit ? 'Edit Activity' : 'New Activity'}>
        {/* Custom header with trash button */}
        <div className="px-5 pt-4 shrink-0">
          <div className="c2-handle" aria-hidden="true" />
          <div className="flex items-center justify-between mb-5 mt-1">
            <div>
              <h2 className="text-base font-bold text-gray-800">
                {isEdit ? 'Edit Activity' : 'New Activity'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">{DAYS[dayIndex]}</p>
            </div>
            <div className="flex items-center gap-2">
              {isEdit && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Delete activity"
                  className="w-8 h-8 flex items-center justify-center rounded-full c2-sheet-danger-soft"
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-8 h-8 flex items-center justify-center rounded-full c2-sheet-x"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable form content */}
        <C2SheetBody className="pb-4">

                {/* Title */}
                <div className="mb-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                    Activity
                  </label>
                  <input
                    ref={titleRef}
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="What are you planning?"
                    inputMode="text"
                    enterKeyHint="done"
                    className="w-full text-sm text-gray-800 placeholder:text-gray-300 bg-gray-50 rounded-2xl px-4 py-3 outline-none"
                    onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                  />
                </div>

                {/* Time */}
                <div className="mb-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                    Time{' '}
                    <span className="font-normal normal-case text-gray-300">(optional)</span>
                  </label>
                  <TimePicker
                    value={time}
                    onChange={v => {
                      setTime(v)
                      // Clear reminders if time is removed
                      if (!v) setReminders([])
                    }}
                    triggerClassName="bg-gray-50"
                  />
                </div>

                {/* Reminders (multi-select) */}
                <div className="mb-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                    Reminders{' '}
                    <span className="font-normal normal-case text-gray-300">(optional, tap to toggle)</span>
                  </label>

                  {!hasTime ? (
                    <p className="text-xs text-gray-300">Set a time above to enable reminders</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {REMINDER_OPTIONS.filter(opt => opt.value !== 'none').map(opt => {
                        const isActive = reminders.includes(opt.value)
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              setReminders(prev =>
                                isActive
                                  ? prev.filter(r => r !== opt.value)
                                  : [...prev, opt.value]
                              )
                            }
                            aria-pressed={isActive}
                            className={cn(
                              'text-xs px-3 py-1.5 rounded-xl font-medium transition-colors',
                              isActive
                                ? 'text-white'
                                : 'bg-gray-100 text-gray-500',
                            )}
                            style={isActive ? { background: primary } : undefined}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Priority */}
                <div className="mb-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                    Priority{' '}
                    <span className="font-normal normal-case text-gray-300">(optional)</span>
                  </label>
                  <div className="flex gap-1.5">
                    {PRIORITY_OPTIONS.map(opt => {
                      const isActive = priority === opt.value
                      return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPriority(opt.value)}
                        aria-pressed={isActive}
                        className={cn(
                          'text-xs px-3 py-1.5 rounded-xl font-medium transition-colors',
                          isActive
                            ? 'text-white'
                            : 'bg-gray-100 text-gray-500',
                        )}
                        style={isActive ? { background: primary } : undefined}
                      >
                        {opt.label}
                      </button>
                      )
                    })}
                  </div>
                </div>

                {/* Notes */}
                <div className="mb-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                    Notes{' '}
                    <span className="font-normal normal-case text-gray-300">(optional)</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Any notes..."
                    rows={2}
                    enterKeyHint="enter"
                    className="w-full text-sm text-gray-700 placeholder:text-gray-300 bg-gray-50 rounded-xl px-4 py-3 outline-none resize-none leading-relaxed"
                  />
                </div>

                {/* Checklist */}
                <div className="mb-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                    Checklist{' '}
                    <span className="font-normal normal-case text-gray-300">(optional)</span>
                  </label>

                  {checklist.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {checklist.map(item => (
                        <div key={item.id} className="flex items-center gap-2">
                          <button
                            onClick={() => toggleChecklistItem(item.id)}
                            className="shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-all"
                            style={{
                              borderColor: item.done ? primary : '#d1d5db',
                              background:  item.done ? primary : 'transparent',
                            }}
                          >
                            {item.done && (
                              <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                                <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                          {editingChecklistId === item.id ? (
                            <input
                              autoFocus
                              value={editingChecklistText}
                              onChange={e => setEditingChecklistText(e.target.value)}
                              onBlur={commitEditChecklistItem}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); commitEditChecklistItem() }
                                if (e.key === 'Escape') { setEditingChecklistId(null) }
                              }}
                              className="flex-1 text-sm text-gray-700 outline-none bg-transparent border-b border-gray-200 pb-0.5 rounded-none focus-visible:shadow-none"
                            />
                          ) : (
                            <button
                              type="button"
                              className={`flex-1 text-left text-sm ${item.done ? 'line-through text-gray-400' : 'text-gray-700'}`}
                              onPointerDown={() => startEditChecklistItem(item.id, item.text)}
                            >
                              {item.text}
                            </button>
                          )}
                          <button
                            onClick={() => removeChecklistItem(item.id)}
                            className="text-gray-300 active:text-gray-500"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      value={newItem}
                      onChange={e => setNewItem(e.target.value)}
                      placeholder="Add item..."
                      inputMode="text"
                      enterKeyHint="done"
                      className="flex-1 text-sm text-gray-700 placeholder:text-gray-300 outline-none bg-gray-50 rounded-xl px-3 py-2"
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); addChecklistItem() }
                      }}
                    />
                    <button
                      onClick={addChecklistItem}
                      className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full"
                      style={{ background: `${primary}20`, color: primary }}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>

                {/* Photos */}
                <div className="mb-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                    Photos{' '}
                    <span className="font-normal normal-case text-gray-300">(optional)</span>
                  </label>
                  <PhotoGallery
                    photos={isEdit ? (activity?.photos ?? []) : photos}
                    onRemove={removePhoto}
                    onAddClick={() => fileInputRef.current?.click()}
                    uploading={uploading}
                    size="sm"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => handlePhotoFiles(e.target.files)}
                  />
                </div>
        </C2SheetBody>

        {/* Pinned save footer */}
        <C2SheetFooter>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSave}
            disabled={!canSave || saving}
            className="w-full py-4 rounded-2xl text-white text-sm font-semibold disabled:opacity-40 transition-opacity"
            style={{ background: primary }}
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Activity'}
          </motion.button>
        </C2SheetFooter>
      </C2Sheet>

      <DeleteConfirmSheet
        open={confirmDelete}
        title="Delete Activity"
        message="This activity will be permanently removed."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      />
    </>
  )
}
