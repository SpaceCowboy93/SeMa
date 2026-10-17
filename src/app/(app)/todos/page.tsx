'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Check, ChevronDown, ChevronUp, Pencil, X, CalendarDays, FileText, Sparkles } from '@/design/iconSystem'
import { EmptyState } from '@/components/ui/EmptyState'
import { format, parseISO } from 'date-fns'
import { useAppStore } from '@/store/useAppStore'
import { USERS, type SharedTodo } from '@/types'
import { cn } from '@/lib/utils'
import { COLOR_OPTIONS } from '@/components/calendar/EventModal'
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet'
import { C2SheetHeader, C2SheetBody, C2SheetFooter } from '@/components/ui'
import { DatePicker } from '@/components/ui/DatePicker'

export default function TodosPage() {
  const currentUser = useAppStore(s => s.currentUser)!
  const todos       = useAppStore(s => s.todos)
  const addTodo     = useAppStore(s => s.addTodo)
  const updateTodo  = useAppStore(s => s.updateTodo)
  const toggleTodo  = useAppStore(s => s.toggleTodo)
  const deleteTodo  = useAppStore(s => s.deleteTodo)

  const isSeval      = currentUser === 'seval'
  const primaryColor = isSeval ? '#8b5cf6' : '#14b8a6'
  const lightBg      = isSeval ? 'bg-seval-50' : 'bg-mateo-50'

  const [showForm, setShowForm]       = useState(false)
  const [taskTitle, setTaskTitle]     = useState('')
  const [subItems, setSubItems]       = useState<string[]>([''])
  const [taskNotes, setTaskNotes]     = useState('')
  const [taskDate, setTaskDate]       = useState('')
  const [focusLast, setFocusLast]     = useState(false)
  const [editingTodo, setEditingTodo] = useState<SharedTodo | null>(null)
  const [deleteTodoId, setDeleteTodoId] = useState<string | null>(null)

  const titleRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<(HTMLInputElement | null)[]>([])

  const pending   = todos.filter(t => !t.isCompleted)
  const completed = todos.filter(t => t.isCompleted)

  useEffect(() => {
    if (focusLast) {
      itemRefs.current[subItems.length - 1]?.focus()
      setFocusLast(false)
    }
  }, [focusLast, subItems.length])

  function openForm() {
    setTaskTitle('')
    setSubItems([''])
    setTaskDate('')
    setShowForm(true)
    setTimeout(() => titleRef.current?.focus(), 50)
  }

  function closeForm() {
    setShowForm(false)
    setTaskTitle('')
    setSubItems([''])
    setTaskNotes('')
    setTaskDate('')
  }

  function handleItemChange(index: number, value: string) {
    setSubItems(prev => prev.map((it, i) => i === index ? value : it))
  }

  function handleItemKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (index === subItems.length - 1) {
        setSubItems(prev => [...prev, ''])
        setFocusLast(true)
      } else {
        itemRefs.current[index + 1]?.focus()
      }
    }
    if (e.key === 'Backspace' && subItems[index] === '' && subItems.length > 1) {
      e.preventDefault()
      setSubItems(prev => prev.filter((_, i) => i !== index))
      setTimeout(() => itemRefs.current[Math.max(0, index - 1)]?.focus(), 0)
    }
  }

  function handleSave() {
    if (!taskTitle.trim()) return
    const validItems = subItems.filter(i => i.trim())
    addTodo(
      taskTitle.trim(),
      validItems.length ? validItems : undefined,
      taskDate || undefined,
      'green',
      taskNotes.trim() || undefined,
    )
    closeForm()
  }

  return (
    <div className="min-h-screen px-4 pt-14">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Together Plans</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {pending.length === 0 ? 'all done 🫶' : `${pending.length} little plans left`}
          </p>
        </div>
        {!showForm && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={openForm}
            aria-label="Add plan"
            className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-soft"
            style={{ background: primaryColor }}
          >
            <Plus size={20} strokeWidth={2.5} />
          </motion.button>
        )}
      </div>

      {/* Add task form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={cn('rounded-3xl p-4 mb-5 shadow-soft', lightBg)}
          >
            {/* Task title */}
            <input
              ref={titleRef}
              type="text"
              value={taskTitle}
              onChange={e => setTaskTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && itemRefs.current[0]?.focus()}
              placeholder="Plan name..."
              className="w-full text-base font-semibold text-gray-800 placeholder:text-gray-300
                         bg-transparent outline-none pb-3 border-b border-white/60 mb-3"
            />

            {/* Sub-items */}
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
              Steps
            </p>
            <div className="space-y-1.5">
              {subItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full shrink-0 opacity-50"
                    style={{ background: primaryColor }}
                  />
                  <input
                    ref={el => { itemRefs.current[idx] = el }}
                    type="text"
                    value={item}
                    onChange={e => handleItemChange(idx, e.target.value)}
                    onKeyDown={e => handleItemKeyDown(e, idx)}
                    placeholder={idx === 0 ? 'Add a step... (Enter for more)' : 'Another step...'}
                    className="flex-1 text-sm text-gray-700 placeholder:text-gray-300 bg-white/70
                               rounded-xl px-3 py-1.5 outline-none"
                  />
                </div>
              ))}
            </div>

            <p className="text-[10px] text-gray-300 mt-2 ml-4">
              Enter to add more items · Backspace to remove empty ones
            </p>

            {/* Notes */}
            <div className="mt-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                Notes
              </p>
              <textarea
                value={taskNotes}
                onChange={e => setTaskNotes(e.target.value)}
                placeholder="Add any notes or details..."
                rows={3}
                className="w-full text-sm text-gray-700 placeholder:text-gray-300 bg-white/70
                           rounded-xl px-3 py-2 outline-none resize-none"
              />
            </div>

            {/* Date */}
            <div className="mt-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                Date (marks on calendar)
              </p>
              <DatePicker value={taskDate} onChange={setTaskDate} />
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={closeForm}
                className="flex-1 py-2.5 rounded-2xl bg-white/80 text-gray-500 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!taskTitle.trim()}
                className="flex-1 py-2.5 rounded-2xl text-white text-sm font-semibold disabled:opacity-40"
                style={{ background: primaryColor }}
              >
                Save Plan
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      {todos.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="All clear!"
          description="Tap + to plan something together 🫶"
          className="pt-16"
        />
      ) : (
        <>
          <AnimatePresence mode="popLayout">
            {pending.map(todo => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={() => toggleTodo(todo.id)}
                onDelete={() => setDeleteTodoId(todo.id)}
                onEdit={() => setEditingTodo(todo)}
                primaryColor={primaryColor}
              />
            ))}
          </AnimatePresence>

          {completed.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">
                Completed ({completed.length})
              </p>
              <AnimatePresence mode="popLayout">
                {completed.map(todo => (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    onToggle={() => toggleTodo(todo.id)}
                    onDelete={() => setDeleteTodoId(todo.id)}
                    onEdit={() => setEditingTodo(todo)}
                    primaryColor={primaryColor}
                    isDone
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </>
      )}

      <DeleteConfirmSheet
        open={!!deleteTodoId}
        title="Remove this plan?"
        message="This plan will be permanently removed."
        confirmLabel="Remove"
        onCancel={() => setDeleteTodoId(null)}
        onConfirm={() => { deleteTodo(deleteTodoId!); setDeleteTodoId(null) }}
      />

      {/* Edit modal */}
      <AnimatePresence>
        {editingTodo && (
          <EditTodoModal
            todo={editingTodo}
            primaryColor={primaryColor}
            lightBg={lightBg}
            onClose={() => setEditingTodo(null)}
            onSave={updates => {
              updateTodo(editingTodo.id, updates)
              setEditingTodo(null)
            }}
            onDelete={() => {
              deleteTodo(editingTodo.id)
              setEditingTodo(null)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Todo item card ─────────────────────────────────────────────────────────── */
function TodoItem({
  todo, onToggle, onDelete, onEdit, primaryColor, isDone,
}: {
  todo: SharedTodo
  onToggle: () => void
  onDelete: () => void
  onEdit: () => void
  primaryColor: string
  isDone?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const creator  = USERS[todo.createdBy]
  const hasItems = todo.items && todo.items.length > 0
  const colorHex = COLOR_OPTIONS.find(c => c.value === todo.color)?.hex

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="bg-white rounded-2xl mb-2 shadow-card overflow-hidden group flex"
    >
      {/* Color bar */}
      {colorHex && (
        <div
          className="w-1 shrink-0"
          style={{ background: colorHex }}
        />
      )}

      <div className="flex-1 min-w-0">
        {/* Main row */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <button
            onClick={onToggle}
            aria-label={isDone ? `Mark "${todo.title}" as not done` : `Mark "${todo.title}" as done`}
            className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0
                       transition-all active:scale-90"
            style={{
              borderColor: isDone ? primaryColor : '#d1d5db',
              background:  isDone ? primaryColor : 'transparent',
            }}
          >
            {isDone && <Check size={13} color="white" strokeWidth={3} />}
          </button>

          <div className="flex-1 min-w-0">
            <p className={cn(
              'text-sm font-medium',
              isDone ? 'line-through text-gray-300' : 'text-gray-700'
            )}>
              {todo.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[11px] text-gray-300">by {creator.displayName}</span>
              {todo.date && (
                <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                  <CalendarDays size={9} />
                  {format(parseISO(todo.date), 'MMM d')}
                </span>
              )}
              {todo.linkedEventId && !todo.date && (
                <span className="text-[11px] text-gray-300 flex items-center gap-0.5">
                  <CalendarDays size={9} />
                  calendar
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {hasItems && (
              <button
                onClick={() => setExpanded(e => !e)}
                aria-label={expanded ? 'Collapse steps' : 'Expand steps'}
                className="text-gray-300 active:text-gray-500 transition-colors p-1"
              >
                {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            )}
            <button
              onClick={onEdit}
              aria-label={`Edit "${todo.title}"`}
              className="opacity-0 group-hover:opacity-100 text-gray-300 active:text-gray-600
                         transition-all p-1"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={onDelete}
              aria-label={`Delete "${todo.title}"`}
              className="opacity-0 group-hover:opacity-100 text-gray-300 active:text-red-400
                         transition-all p-1"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Sub-items expanded */}
        <AnimatePresence>
          {hasItems && expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3 space-y-1.5 border-t border-gray-50 pt-2">
                {todo.items!.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0 opacity-40"
                      style={{ background: primaryColor }}
                    />
                    <span className={cn(
                      'text-xs',
                      isDone ? 'line-through text-gray-300' : 'text-gray-500'
                    )}>
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Items count badge when collapsed */}
        {hasItems && !expanded && (
          <div
            className="px-4 -mt-1 flex items-center gap-1.5 cursor-pointer"
            onClick={() => setExpanded(true)}
          >
            <div className="flex gap-0.5">
              {todo.items!.slice(0, 5).map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full opacity-30"
                  style={{ background: primaryColor }}
                />
              ))}
            </div>
            <span className="text-[10px] text-gray-300">
              {todo.items!.length} item{todo.items!.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Notes section */}
        {todo.notes && (
          <div className="mx-4 mb-3 mt-2 rounded-xl bg-gray-50 px-3 py-2.5 flex gap-2">
            <FileText size={12} className="text-gray-300 shrink-0 mt-0.5" />
            <p className={cn(
              'text-xs leading-relaxed',
              isDone ? 'text-gray-300' : 'text-gray-500'
            )}>
              {todo.notes}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ─── Edit todo modal ────────────────────────────────────────────────────────── */
function EditTodoModal({
  todo, primaryColor, lightBg, onClose, onSave, onDelete,
}: {
  todo: SharedTodo
  primaryColor: string
  lightBg: string
  onClose: () => void
  onSave: (updates: Partial<SharedTodo>) => void
  onDelete: () => void
}) {
  const [title, setTitle]           = useState(todo.title)
  const [items, setItems]           = useState<string[]>(todo.items?.length ? todo.items : [''])
  const [notes, setNotes]           = useState(todo.notes ?? '')
  const [date, setDate]             = useState(todo.date ?? '')
  const [showDelete, setShowDelete] = useState(false)
  const [focusLast, setFocusLast]   = useState(false)
  const itemRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (focusLast) {
      itemRefs.current[items.length - 1]?.focus()
      setFocusLast(false)
    }
  }, [focusLast, items.length])

  function handleItemChange(index: number, value: string) {
    setItems(prev => prev.map((it, i) => i === index ? value : it))
  }

  function handleItemKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (index === items.length - 1) {
        setItems(prev => [...prev, ''])
        setFocusLast(true)
      } else {
        itemRefs.current[index + 1]?.focus()
      }
    }
    if (e.key === 'Backspace' && items[index] === '' && items.length > 1) {
      e.preventDefault()
      setItems(prev => prev.filter((_, i) => i !== index))
      setTimeout(() => itemRefs.current[Math.max(0, index - 1)]?.focus(), 0)
    }
  }

  function handleSave() {
    if (!title.trim()) return
    const validItems = items.filter(i => i.trim())
    onSave({
      title: title.trim(),
      items: validItems.length ? validItems : undefined,
      notes: notes.trim() || undefined,
      date: date || undefined,
    })
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 c2-backdrop"
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 400 }}
        className="fixed bottom-0 left-0 right-0 z-50 c2-sheet-bg rounded-t-[2rem] shadow-modal max-w-lg mx-auto flex flex-col"
        style={{ maxHeight: 'calc(100dvh - 48px)' }}
      >
        <C2SheetHeader title="Edit Plan" onClose={onClose} />

        <C2SheetBody className="pb-4">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Task name..."
            className="w-full text-xl font-semibold text-gray-800 placeholder:text-gray-300
                       border-b-2 border-gray-100 focus:border-gray-200 pb-3 mb-5 outline-none
                       transition-colors bg-transparent"
            autoFocus
          />

          {/* Sub-items */}
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Steps</p>
          <div className={cn('rounded-2xl p-4 mb-4', lightBg)}>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full shrink-0 opacity-50"
                    style={{ background: primaryColor }}
                  />
                  <input
                    ref={el => { itemRefs.current[idx] = el }}
                    type="text"
                    value={item}
                    onChange={e => handleItemChange(idx, e.target.value)}
                    onKeyDown={e => handleItemKeyDown(e, idx)}
                    placeholder={idx === 0 ? 'Add a step...' : 'Another step...'}
                    className="flex-1 text-sm text-gray-700 placeholder:text-gray-300 bg-white/70
                               rounded-xl px-3 py-1.5 outline-none"
                  />
                  {items.length > 1 && (
                    <button
                      onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                      className="text-gray-300 active:text-red-400 transition-colors shrink-0"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => { setItems(prev => [...prev, '']); setFocusLast(true) }}
              className="flex items-center gap-1.5 mt-3 text-xs font-medium"
              style={{ color: primaryColor }}
            >
              <Plus size={13} />
              Add step
            </button>
          </div>

          {/* Notes */}
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Notes</p>
          <div className="bg-gray-50 rounded-2xl p-4 mb-4 flex gap-3">
            <FileText size={15} className="text-gray-300 shrink-0 mt-0.5" />
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any thoughts or details..."
              rows={4}
              className="flex-1 text-sm text-gray-700 placeholder:text-gray-300 bg-transparent
                         outline-none resize-none"
            />
          </div>

          {/* Date */}
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Date</p>
          <DatePicker value={date} onChange={setDate} />
        </C2SheetBody>

        <C2SheetFooter>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="w-full py-4 rounded-2xl text-white text-sm font-semibold mb-3 disabled:opacity-40"
            style={{ background: primaryColor }}
          >
            Save Changes
          </button>

          <button
            onClick={() => setShowDelete(true)}
            className="w-full py-3 rounded-2xl text-sm font-medium text-red-400
                       active:bg-red-50 transition-colors"
          >
            Remove Plan
          </button>
        </C2SheetFooter>
      </motion.div>

      <DeleteConfirmSheet
        open={showDelete}
        title="Remove this plan?"
        message="This can't be undone."
        onCancel={() => setShowDelete(false)}
        onConfirm={onDelete}
        confirmLabel="Remove"
      />
    </>
  )
}
