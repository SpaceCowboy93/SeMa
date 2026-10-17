'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Plus, Clock, CalendarDays, CheckSquare, X, FileText } from '@/design/iconSystem'
import { format, isSameMonth, isToday, parseISO } from 'date-fns'
import { useAppStore } from '@/store/useAppStore'
import { EventModal, COLOR_OPTIONS } from '@/components/calendar/EventModal'
import { FullCreateSheet } from '@/components/ui/FullCreateSheet'
import { type CalendarEvent, type SharedTodo, USERS, OTHER_USER } from '@/types'
import { getCalendarDays, toDateString, formatTime, getTodayString, cn, EVENT_COLOR_CLASS, MOOD_CONFIG } from '@/lib/utils'

const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function CalendarPage() {
  const currentUser = useAppStore(s => s.currentUser)!
  const events      = useAppStore(s => s.events)
  const todos       = useAppStore(s => s.todos)
  const getMood     = useAppStore(s => s.getMoodForUser)

  const [viewDate, setViewDate]         = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(getTodayString())
  const [modalOpen, setModalOpen]       = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [categoryColor, setCategoryColor] = useState<CalendarEvent['color'] | null>(null)

  const isSeval     = currentUser === 'seval'
  const partnerUser = OTHER_USER[currentUser]
  const partnerMood = getMood(partnerUser)
  const primaryColor = isSeval ? '#8b5cf6' : '#14b8a6'
  const lightBg      = isSeval ? 'bg-seval-100' : 'bg-mateo-100'
  const lighterBg    = isSeval ? 'bg-seval-50'  : 'bg-mateo-50'
  const textColor    = isSeval ? 'text-seval-600' : 'text-mateo-600'

  const calendarDays = useMemo(
    () => getCalendarDays(viewDate.getFullYear(), viewDate.getMonth()),
    [viewDate]
  )

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    events.forEach(e => {
      if (!map[e.date]) map[e.date] = []
      map[e.date].push(e)
    })
    return map
  }, [events])

  const selectedEvents = eventsByDate[selectedDate] ?? []

  function prevMonth() {
    setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }
  function nextMonth() {
    setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }
  function handleDayPress(day: Date) {
    setSelectedDate(toDateString(day))
  }
  function openNewEvent() {
    setEditingEvent(null)
    setModalOpen(true)
  }
  function openEditEvent(e: CalendarEvent) {
    setEditingEvent(e)
    setModalOpen(true)
  }
  function openCategoryHub(color: CalendarEvent['color']) {
    setCategoryColor(color)
  }

  // Items for the hub, filtered by selected color
  const hubEvents = categoryColor ? events.filter(e => e.color === categoryColor) : []
  const hubTodos  = categoryColor ? todos.filter(t => t.color === categoryColor) : []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div
        className="px-5 pt-14 pb-4"
        style={{
          background: isSeval
            ? 'linear-gradient(135deg, #f5f3ff, #fafafa)'
            : 'linear-gradient(135deg, #f0fdfa, #fafafa)',
        }}
      >
        {/* Partner mood strip */}
        {partnerMood && (
          <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-2xl ${lighterBg}`}>
            <span className="text-lg">{MOOD_CONFIG[partnerMood.mood].emoji}</span>
            <p className="text-xs text-gray-500">
              <span className="font-semibold">{USERS[partnerUser].displayName}</span>
              {' '}is feeling {MOOD_CONFIG[partnerMood.mood].label.toLowerCase()} today
            </p>
          </div>
        )}

        {/* Month navigation */}
        <div className="flex items-center justify-between mt-1">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              {format(viewDate, 'MMMM')}
            </h1>
            <p className="text-sm text-gray-400">{format(viewDate, 'yyyy')}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={prevMonth}
              aria-label="Previous month"
              className="w-9 h-9 rounded-full bg-white shadow-card flex items-center justify-center
                         active:scale-90 transition-transform"
            >
              <ChevronLeft size={18} className="text-gray-500" />
            </button>
            <button
              onClick={nextMonth}
              aria-label="Next month"
              className="w-9 h-9 rounded-full bg-white shadow-card flex items-center justify-center
                         active:scale-90 transition-transform"
            >
              <ChevronRight size={18} className="text-gray-500" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1 mt-2">
          {DOW_LABELS.map((d, i) => (
            <div key={i} className="text-center text-[11px] font-semibold text-gray-400 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-y-1 mb-5">
          {calendarDays.map((day, i) => {
            const dateStr        = toDateString(day)
            const isCurrentMonth = isSameMonth(day, viewDate)
            const isSelected     = dateStr === selectedDate
            const isTodayDate    = isToday(day)
            const dayEvents      = eventsByDate[dateStr] ?? []
            const hasEvents      = dayEvents.length > 0

            return (
              <motion.button
                key={i}
                whileTap={{ scale: 0.88 }}
                onClick={() => handleDayPress(day)}
                className="calendar-day flex-col relative"
              >
                <div
                  className={cn(
                    'absolute inset-1 rounded-full transition-all',
                    isSelected && !isTodayDate && 'opacity-15',
                    isSelected ? (isSeval ? 'bg-seval-400' : 'bg-mateo-400') : '',
                  )}
                />
                {isTodayDate && (
                  <div
                    className={cn(
                      'absolute inset-1 rounded-full',
                      isSelected ? 'opacity-100' : 'opacity-20'
                    )}
                    style={{ background: primaryColor }}
                  />
                )}
                <span
                  className={cn(
                    'relative z-10 text-sm font-medium transition-colors',
                    !isCurrentMonth && 'text-gray-300',
                    isCurrentMonth && !isSelected && !isTodayDate && 'text-gray-700',
                    isTodayDate && !isSelected && textColor,
                    isSelected && isTodayDate && 'text-white font-bold',
                    isSelected && !isTodayDate && (isSeval ? 'text-seval-700' : 'text-mateo-700'),
                  )}
                >
                  {day.getDate()}
                </span>
                {hasEvents && (
                  <div className="relative z-10 flex gap-0.5 mt-0.5">
                    {dayEvents.slice(0, 3).map(ev => (
                      <div
                        key={ev.id}
                        className={cn('w-1.5 h-1.5 rounded-full', EVENT_COLOR_CLASS[ev.color])}
                      />
                    ))}
                  </div>
                )}
              </motion.button>
            )
          })}
        </div>

        {/* Selected date events */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-700">
              {selectedDate === getTodayString()
                ? 'Today'
                : format(parseISO(selectedDate), 'EEEE, MMM d')}
            </h2>
            <button
              onClick={openNewEvent}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white',
                'active:scale-95 transition-transform shadow-sm'
              )}
              style={{ background: primaryColor }}
            >
              <Plus size={14} strokeWidth={2.5} />
              Add
            </button>
          </div>

          <AnimatePresence mode="popLayout">
            {selectedEvents.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={cn('rounded-2xl py-4 px-4 text-center', lighterBg)}
              >
                <p className="text-xs text-gray-400">A quiet day 🌙</p>
              </motion.div>
            ) : (
              selectedEvents.map(ev => (
                <motion.button
                  key={ev.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => openEditEvent(ev)}
                  className="w-full text-left bg-white rounded-2xl p-4 mb-2 shadow-card flex gap-3
                             active:scale-[0.98] transition-transform"
                >
                  <div
                    className={cn('w-1 rounded-full shrink-0 self-stretch', EVENT_COLOR_CLASS[ev.color])}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm">{ev.title}</p>
                    {(ev.startTime || ev.endTime) && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock size={11} className="text-gray-400" />
                        <p className="text-xs text-gray-400">
                          {ev.startTime && formatTime(ev.startTime)}
                          {ev.startTime && ev.endTime && ' – '}
                          {ev.endTime && formatTime(ev.endTime)}
                        </p>
                      </div>
                    )}
                    {ev.notes && (
                      <p className="text-xs text-gray-400 mt-1 truncate">{ev.notes}</p>
                    )}
                    {ev.todos && ev.todos.length > 0 && (
                      <p className="text-xs text-gray-300 mt-1">
                        {ev.todos.filter(t => t.isCompleted).length}/{ev.todos.length} done
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 self-center">
                    <div
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: ev.createdBy === 'seval' ? '#ede9fe' : '#ccfbf1',
                        color: ev.createdBy === 'seval' ? '#7c3aed' : '#0d9488',
                      }}
                    >
                      {USERS[ev.createdBy].displayName}
                    </div>
                  </div>
                </motion.button>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Color category hubs — always visible */}
        <div className={cn('rounded-2xl px-4 py-3 mb-8', lighterBg)}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
            Browse by feeling ✨
          </p>
          <div className="flex justify-around">
            {COLOR_OPTIONS.map(c => {
              const evCount   = events.filter(e => e.color === c.value).length
              const todoCount = todos.filter(t => t.color === c.value).length
              const total     = evCount + todoCount
              return (
                <motion.button
                  key={c.value}
                  whileTap={{ scale: 0.88 }}
                  onClick={() => openCategoryHub(c.value as CalendarEvent['color'])}
                  className="flex flex-col items-center gap-1.5"
                >
                  <div className="relative">
                    <div
                      className="w-10 h-10 rounded-full shadow-card"
                      style={{ background: c.hex }}
                    />
                    {total > 0 && (
                      <div
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white
                                   flex items-center justify-center shadow-sm"
                      >
                        <span className="text-[9px] font-bold text-gray-600">{total}</span>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">{c.label}</span>
                </motion.button>
              )
            })}
          </div>
        </div>
      </div>

      {/* EventModal — edit existing calendar events only */}
      <EventModal
        isOpen={modalOpen && !!editingEvent}
        onClose={() => { setModalOpen(false); setEditingEvent(null) }}
        date={selectedDate}
        event={editingEvent}
      />

      {/* FullCreateSheet — new items with category picker */}
      <FullCreateSheet
        open={modalOpen && !editingEvent}
        onClose={() => setModalOpen(false)}
        primary={primaryColor}
        initialDate={selectedDate}
      />

      {/* Category Hub Modal */}
      <AnimatePresence>
        {categoryColor && (
          <CategoryHubModal
            color={categoryColor}
            events={hubEvents}
            todos={hubTodos}
            primaryColor={primaryColor}
            onClose={() => setCategoryColor(null)}
            onEditEvent={ev => {
              setCategoryColor(null)
              setEditingEvent(ev)
              setModalOpen(true)
            }}
            onAddEvent={() => {
              setCategoryColor(null)
              setModalOpen(true)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Category Hub Modal ─────────────────────────────────────────────────────── */
function CategoryHubModal({
  color, events, todos, primaryColor, onClose, onEditEvent, onAddEvent,
}: {
  color: CalendarEvent['color']
  events: CalendarEvent[]
  todos: SharedTodo[]
  primaryColor: string
  onClose: () => void
  onEditEvent: (ev: CalendarEvent) => void
  onAddEvent: () => void
}) {
  const [expandedTodo, setExpandedTodo] = useState<string | null>(null)

  const colorOption = COLOR_OPTIONS.find(c => c.value === color)!
  const totalCount  = events.length + todos.length

  // Merge and sort by date (events have date, todos may have date)
  type HubItem =
    | { kind: 'event'; data: CalendarEvent }
    | { kind: 'todo';  data: SharedTodo }

  const allItems: HubItem[] = [
    ...events.map(e => ({ kind: 'event' as const, data: e })),
    ...todos.map(t => ({ kind: 'todo' as const, data: t })),
  ].sort((a, b) => {
    const dateA = a.data.date ?? a.data.createdAt ?? ''
    const dateB = b.data.date ?? b.data.createdAt ?? ''
    return dateA.localeCompare(dateB)
  })

  return (
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
        className="fixed bottom-0 left-0 right-0 z-50 c2-sheet-bg rounded-t-[2rem] shadow-modal
                   max-w-lg mx-auto max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 shrink-0">
          <div className="drag-handle mb-3" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full shadow-card"
                style={{ background: colorOption.hex }}
              />
              <div>
                <h2 className="text-base font-bold text-gray-800">{colorOption.label}</h2>
                <p className="text-xs text-gray-400">
                  {totalCount === 0
                    ? 'No items yet'
                    : `${totalCount} item${totalCount !== 1 ? 's' : ''} · ${events.length} event${events.length !== 1 ? 's' : ''}, ${todos.length} task${todos.length !== 1 ? 's' : ''}`}
                </p>
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

        {/* Divider */}
        <div className="h-px bg-gray-100 mx-5 shrink-0" />

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {allItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div
                className="w-16 h-16 rounded-full mb-4 opacity-20"
                style={{ background: colorOption.hex }}
              />
              <p className="font-semibold text-gray-500 mb-1">Nothing here yet 🌙</p>
              <p className="text-sm text-gray-400">
                Plan a moment with the {colorOption.label} colour.
              </p>
            </div>
          ) : (
            allItems.map(item => {
              if (item.kind === 'event') {
                const ev = item.data
                return (
                  <motion.button
                    key={ev.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onEditEvent(ev)}
                    className="w-full text-left bg-gray-50 hover:bg-gray-100 rounded-2xl p-3.5
                               flex gap-3 transition-colors"
                  >
                    {/* Color bar */}
                    <div
                      className="w-1 rounded-full shrink-0 self-stretch"
                      style={{ background: colorOption.hex }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-800 leading-tight">{ev.title}</p>
                        <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold
                                         bg-blue-50 text-blue-400 px-2 py-0.5 rounded-full">
                          <CalendarDays size={9} />
                          Event
                        </span>
                      </div>
                      {ev.date && (
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <CalendarDays size={10} />
                          {format(parseISO(ev.date), 'MMM d, yyyy')}
                          {ev.startTime && ` · ${formatTime(ev.startTime)}`}
                        </p>
                      )}
                      {ev.notes && (
                        <p className="text-xs text-gray-400 mt-1 truncate">{ev.notes}</p>
                      )}
                    </div>
                  </motion.button>
                )
              }

              // todo
              const todo = item.data
              const isExpanded = expandedTodo === todo.id
              return (
                <motion.div
                  key={todo.id}
                  layout
                  className="bg-gray-50 rounded-2xl overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedTodo(isExpanded ? null : todo.id)}
                    className="w-full text-left p-3.5 flex gap-3"
                  >
                    <div
                      className="w-1 rounded-full shrink-0 self-stretch"
                      style={{ background: colorOption.hex }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          'text-sm font-semibold leading-tight',
                          todo.isCompleted ? 'line-through text-gray-300' : 'text-gray-800'
                        )}>
                          {todo.title}
                        </p>
                        <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold
                                         bg-purple-50 text-purple-400 px-2 py-0.5 rounded-full">
                          <CheckSquare size={9} />
                          Task
                        </span>
                      </div>
                      {todo.date && (
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <CalendarDays size={10} />
                          {format(parseISO(todo.date), 'MMM d, yyyy')}
                        </p>
                      )}
                      {!isExpanded && todo.notes && (
                        <p className="text-xs text-gray-400 mt-1 truncate">{todo.notes}</p>
                      )}
                    </div>
                  </button>

                  {/* Expanded todo detail */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-3 border-t border-gray-100 pt-2 space-y-2">
                          {todo.items && todo.items.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                Sub-items
                              </p>
                              {todo.items.map((it, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <div
                                    className="w-1.5 h-1.5 rounded-full shrink-0 opacity-40"
                                    style={{ background: colorOption.hex }}
                                  />
                                  <span className="text-xs text-gray-500">{it}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {todo.notes && (
                            <div className="flex gap-2 bg-white rounded-xl px-3 py-2">
                              <FileText size={12} className="text-gray-300 shrink-0 mt-0.5" />
                              <p className="text-xs text-gray-500 leading-relaxed">{todo.notes}</p>
                            </div>
                          )}
                          <p className="text-[10px] text-gray-300 pt-1">
                            Open Together Plans to edit this plan
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-8 pt-3 shrink-0 border-t border-gray-100">
          <button
            onClick={onAddEvent}
            className="w-full py-3.5 rounded-2xl text-white text-sm font-semibold
                       flex items-center justify-center gap-2 active:opacity-80 transition-opacity"
            style={{ background: colorOption.hex }}
          >
            <Plus size={16} strokeWidth={2.5} />
            Plan a moment in {colorOption.label}
          </button>
        </div>
      </motion.div>
    </>
  )
}
