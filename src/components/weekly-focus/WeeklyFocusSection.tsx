'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence, useMotionValue, animate as animateX } from 'framer-motion'
import { ChevronLeft, ChevronRight, ChevronDown, History, Check, Plus, Pencil, Trash2 } from '@/design/iconSystem'
import { format, addWeeks, subWeeks } from 'date-fns'
import { useAppStore } from '@/store/useAppStore'
import { USERS, type UserName, type FocusActivity } from '@/types'
import {
  cn, formatTime, getTodayString,
  getWeekKey, getWeekStartDate, getWeekLabel,
} from '@/lib/utils'
import { FocusActivitySheet } from './FocusActivitySheet'
import { WeekBrowserSheet } from './WeekBrowserSheet'
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
type FilterUser = 'both' | UserName

const PRIORITY_MARKS: Record<string, string> = {
  low: '!',
  medium: '!!',
  high: '!!!',
}

const PRIORITY_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

const SWIPE_HINT_KEY = 'sema-swipe-hint-dismissed'

// ── Swipeable activity row ────────────────────────────────────────────────────

function SwipeableRow({
  activity,
  primary,
  onToggle,
  onEdit,
  onRequestDelete,
}: {
  activity: FocusActivity
  primary: string
  onToggle: (id: string) => void
  onEdit: (a: FocusActivity) => void
  onRequestDelete: (id: string) => void
}) {
  const x = useMotionValue(0)

  function handleDragEnd(_: unknown, info: { offset: { x: number } }) {
    if (info.offset.x < -50) {
      animateX(x, -110, { type: 'spring', stiffness: 400, damping: 38 })
    } else {
      animateX(x, 0, { type: 'spring', stiffness: 400, damping: 38 })
    }
  }

  function closeSwipe() {
    animateX(x, 0, { type: 'spring', stiffness: 400, damping: 38 })
  }

  const mark = activity.priority ? PRIORITY_MARKS[activity.priority] : ''

  return (
    <div className="relative overflow-hidden">
      {/* Action buttons behind */}
      <div className="absolute right-0 top-0 bottom-0 flex">
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => { closeSwipe(); onEdit(activity) }}
          className="w-14 flex items-center justify-center text-white"
          style={{ background: '#4a7c5e' }}
        >
          <Pencil size={14} />
        </button>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => { closeSwipe(); onRequestDelete(activity.id) }}
          className="w-14 flex items-center justify-center bg-red-500 text-white"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Draggable row */}
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -110, right: 0 }}
        dragElastic={{ left: 0.05, right: 0 }}
        style={{ x, background: 'var(--bj-cream)' }}
        onDragEnd={handleDragEnd}
        className="relative flex items-center gap-3 py-2.5"
      >
        {/* Checkbox */}
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={() => onToggle(activity.id)}
          className="shrink-0 w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center transition-colors"
          style={{
            borderColor: activity.isCompleted ? primary : '#d1d5db',
            background: activity.isCompleted ? primary : 'transparent',
          }}
        >
          <AnimatePresence>
            {activity.isCompleted && (
              <motion.div
                key="chk"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                <Check size={9} strokeWidth={2.8} className="text-white" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>

        {/* Title + time */}
        <button
          onClick={() => onEdit(activity)}
          className="flex-1 flex items-center justify-between gap-2 text-left min-w-0"
        >
          <span
            className={cn(
              'text-sm leading-snug truncate',
              activity.isCompleted ? 'line-through text-gray-400' : 'text-gray-800',
            )}
          >
            {activity.title}
            {mark && (
              <span
                className="ml-2 text-[10px] font-semibold tracking-wide"
                style={{ color: activity.isCompleted ? '#d1d5db' : `${primary}90` }}
              >
                {mark}
              </span>
            )}
          </span>
          {activity.time && (
            <span className="text-xs text-gray-400 shrink-0">{formatTime(activity.time)}</span>
          )}
        </button>
      </motion.div>
    </div>
  )
}

// ── Day card ──────────────────────────────────────────────────────────────────

function DayCard({
  dayName,
  dateStr,
  activities,
  primary,
  isToday,
  isExpanded,
  onToggleExpand,
  onToggle,
  onEdit,
  onAdd,
  onRequestDelete,
  showHint,
  onHintDismiss,
}: {
  dayName: string
  dateStr: string
  activities: FocusActivity[]
  primary: string
  isToday: boolean
  isExpanded: boolean
  onToggleExpand: () => void
  onToggle: (id: string) => void
  onEdit: (a: FocusActivity) => void
  onAdd: () => void
  onRequestDelete: (id: string) => void
  showHint: boolean
  onHintDismiss: () => void
}) {
  const completed = activities.filter(a => a.isCompleted).length
  const total = activities.length
  const allDone = total > 0 && completed === total

  // Priority first, then time, completed last
  const sorted = useMemo(() => {
    const incomplete = activities
      .filter(a => !a.isCompleted)
      .sort((a, b) => {
        const pa = PRIORITY_RANK[a.priority ?? ''] ?? 3
        const pb = PRIORITY_RANK[b.priority ?? ''] ?? 3
        if (pa !== pb) return pa - pb
        if (a.time && b.time) return a.time.localeCompare(b.time)
        if (a.time) return -1
        if (b.time) return 1
        return a.createdAt.localeCompare(b.createdAt)
      })
    const done = activities
      .filter(a => a.isCompleted)
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    return [...incomplete, ...done]
  }, [activities])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={cn(
        'mb-1.5 overflow-hidden',
        isToday
          ? 'rounded-2xl shadow-[0_1px_8px_rgba(45,41,38,0.06)]'
          : 'rounded-xl',
      )}
      style={isToday
        ? { background: 'rgba(253,250,245,0.95)', border: '1px solid rgba(45,41,38,0.06)' }
        : { background: 'transparent' }
      }
    >
      {/* Card header */}
      <div
        className={cn(
          'flex items-center justify-between',
          isToday ? 'px-4 pt-4 pb-3' : 'px-2 pt-2.5 pb-2',
          !isToday && 'cursor-pointer active:opacity-60 transition-opacity',
        )}
        onClick={isToday ? undefined : onToggleExpand}
      >
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              'font-bold tracking-widest uppercase',
              isToday ? 'text-[12px] text-gray-900' : 'text-[11px] text-gray-500',
            )}
          >
            {dayName}
          </span>
          <span className={cn('text-[11px]', isToday ? 'text-gray-500' : 'text-gray-300')}>
            {format(new Date(dateStr + 'T00:00:00'), 'MMM d')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isToday && (
            <span
              className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full text-white"
              style={{ background: primary }}
            >
              Today
            </span>
          )}
          {!isToday && (
            <>
              {total > 0 && (
                <span className="text-[11px] text-gray-400">
                  {total} {total === 1 ? 'task' : 'tasks'}
                </span>
              )}
              <motion.div
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown size={14} className="text-gray-300" />
              </motion.div>
            </>
          )}
          {/* Small + for non-today when collapsed */}
          {!isToday && !isExpanded && (
            <button
              onClick={e => { e.stopPropagation(); onAdd() }}
              className="w-6 h-6 flex items-center justify-center text-lg font-light active:opacity-50"
              style={{ color: `${primary}99` }}
            >
              +
            </button>
          )}
        </div>
      </div>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-4 pb-1">

              {/* Progress bar — today only */}
              {isToday && total > 0 && (
                <div className="mb-4">
                  <p className="text-[11px] text-gray-400 mb-1.5">
                    {completed} of {total} done
                  </p>
                  <div className="h-[3px] bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: primary }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(completed / total) * 100}%` }}
                      transition={{ duration: 0.45, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              )}

              {/* One-time swipe hint */}
              <AnimatePresence>
                {showHint && total > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center justify-between mb-2.5 px-3 py-2 rounded-xl bg-gray-50"
                  >
                    <span className="text-[10px] text-gray-400">
                      Swipe an activity left to edit or delete
                    </span>
                    <button
                      onClick={onHintDismiss}
                      className="text-[10px] text-gray-300 ml-2 active:text-gray-500 shrink-0"
                    >
                      ✕
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Activities */}
              {total === 0 ? (
                <p className="text-xs text-gray-400 pb-3">Nothing planned.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {sorted.map((a, i) => (
                    <motion.div
                      key={a.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: i * 0.04, ease: 'easeOut' }}
                    >
                      <SwipeableRow
                        activity={a}
                        primary={primary}
                        onToggle={onToggle}
                        onEdit={onEdit}
                        onRequestDelete={onRequestDelete}
                      />
                    </motion.div>
                  ))}
                </div>
              )}

              {/* All-done message */}
              <AnimatePresence>
                {allDone && (
                  <motion.p
                    key="done"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-gray-400 text-center py-2"
                  >
                    {isToday ? 'Everything for today is done ❤️' : 'All done!'}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Add activity */}
              <button
                onClick={onAdd}
                className="w-full flex items-center gap-2 py-2.5 mt-1 border-t border-gray-50 active:opacity-60 transition-opacity"
              >
                <Plus size={14} strokeWidth={2} style={{ color: primary }} />
                <span className="text-sm" style={{ color: primary }}>Add activity</span>
              </button>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function WeeklyFocusSection() {
  const currentUser         = useAppStore(s => s.currentUser)!
  const focusActivities     = useAppStore(s => s.focusActivities)
  const focusCarryOver      = useAppStore(s => s.focusCarryOver)
  const toggleFocusActivity = useAppStore(s => s.toggleFocusActivity)
  const deleteFocusActivity = useAppStore(s => s.deleteFocusActivity)
  const carryOverToWeek     = useAppStore(s => s.carryOverToWeek)

  const isSeval = currentUser === 'seval'
  const primary = isSeval ? '#8b5cf6' : '#14b8a6'

  const [filterUser,       setFilterUser]       = useState<FilterUser>('both')
  const [viewWeekKey,      setViewWeekKey]       = useState(() => getWeekKey())
  const [expandedDays,     setExpandedDays]      = useState<Set<number>>(new Set())
  const [sheetOpen,        setSheetOpen]         = useState(false)
  const [editingActivity,  setEditingActivity]   = useState<FocusActivity | null>(null)
  const [addingDayIndex,   setAddingDayIndex]    = useState<number | null>(null)
  const [suggestedTitle,   setSuggestedTitle]    = useState<string | undefined>()
  const [weekBrowserOpen,  setWeekBrowserOpen]   = useState(false)
  const [deleteTarget,     setDeleteTarget]      = useState<string | null>(null)
  const [hintDismissed,    setHintDismissed]     = useState(false)

  const carriedOverRef = useRef<Set<string>>(new Set())

  const today          = getTodayString()
  const currentWeekKey = getWeekKey()
  const weekStartDate  = getWeekStartDate(viewWeekKey)

  // Load hint state from localStorage
  useEffect(() => {
    try {
      if (localStorage.getItem(SWIPE_HINT_KEY)) setHintDismissed(true)
    } catch { /* ignore */ }
  }, [])

  function dismissHint() {
    setHintDismissed(true)
    try { localStorage.setItem(SWIPE_HINT_KEY, '1') } catch { /* ignore */ }
  }

  function getDateForDay(dayIndex: number): string {
    const d = new Date(weekStartDate)
    d.setDate(d.getDate() + dayIndex)
    return format(d, 'yyyy-MM-dd')
  }

  const weekActivities = useMemo(() => {
    return focusActivities.filter(a => {
      if (a.weekKey !== viewWeekKey) return false
      return a.createdBy === filterUser
    })
  }, [focusActivities, viewWeekKey, filterUser])

  const activitiesByDay = useMemo(() => {
    const map: Record<number, FocusActivity[]> = {}
    for (let i = 0; i < 7; i++) map[i] = []
    weekActivities.forEach(a => { map[a.dayIndex].push(a) })
    return map
  }, [weekActivities])

  function navigateWeek(dir: -1 | 1) {
    const base    = getWeekStartDate(viewWeekKey)
    const next    = dir === 1 ? addWeeks(base, 1) : subWeeks(base, 1)
    const nextKey = getWeekKey(next)

    if (
      dir === 1 &&
      nextKey === currentWeekKey &&
      focusCarryOver &&
      !carriedOverRef.current.has(viewWeekKey)
    ) {
      carriedOverRef.current.add(viewWeekKey)
      carryOverToWeek(viewWeekKey, nextKey)
    }

    setViewWeekKey(nextKey)
    setExpandedDays(new Set())
  }

  function openAdd(dayIndex: number, prefilledTitle?: string) {
    setEditingActivity(null)
    setAddingDayIndex(dayIndex)
    setSuggestedTitle(prefilledTitle)
    setSheetOpen(true)
  }

  function openEdit(activity: FocusActivity) {
    setEditingActivity(activity)
    setAddingDayIndex(null)
    setSuggestedTitle(undefined)
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
    setEditingActivity(null)
    setAddingDayIndex(null)
    setSuggestedTitle(undefined)
  }

  function toggleExpanded(dayIndex: number) {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(dayIndex)) next.delete(dayIndex)
      else next.add(dayIndex)
      return next
    })
  }

  function confirmDelete() {
    if (!deleteTarget) return
    deleteFocusActivity(deleteTarget)
    setDeleteTarget(null)
  }

  const isCurrentWeek = viewWeekKey === currentWeekKey

  // Find today's dayIndex in the current week
  const todayDayIndex = useMemo(() => {
    for (let i = 0; i < 7; i++) {
      if (getDateForDay(i) === today) return i
    }
    return -1
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewWeekKey, today])

  return (
    <div className="px-4 pb-6">

      {/* ── Profile filter ── */}
      <div className="flex mb-4 rounded-xl p-1" style={{ background: 'rgba(45,41,38,0.05)' }}>
        {(['both', 'mateo', 'seval'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilterUser(f)}
            className={cn(
              'relative flex-1 py-1.5 rounded-lg text-xs font-semibold z-10 transition-colors duration-150',
              filterUser === f ? 'text-gray-800' : 'text-gray-400',
            )}
          >
            {filterUser === f && (
              <motion.div
                layoutId="filter-pill"
                className="absolute inset-0 rounded-[7px] bg-white"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }}
                transition={{ type: 'spring', stiffness: 500, damping: 42 }}
              />
            )}
            <span className="relative z-10">
              {f === 'both' ? 'Both' : USERS[f as UserName].displayName}
            </span>
          </button>
        ))}
      </div>

      {/* ── Week navigation ── */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => navigateWeek(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-full active:opacity-60 transition-opacity"
          style={{ background: 'rgba(45,41,38,0.05)' }}
        >
          <ChevronLeft size={16} className="text-gray-500" />
        </button>

        <div className="text-center">
          <p className="text-sm font-semibold text-gray-800">{getWeekLabel(viewWeekKey)}</p>
          {isCurrentWeek ? (
            <p className="text-[10px] text-gray-400 mt-0.5">This week</p>
          ) : (
            <button
              onClick={() => setViewWeekKey(currentWeekKey)}
              className="text-[10px] mt-0.5"
              style={{ color: primary }}
            >
              Back to now
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => navigateWeek(1)}
            className="w-8 h-8 flex items-center justify-center rounded-full active:opacity-60 transition-opacity"
            style={{ background: 'rgba(45,41,38,0.05)' }}
          >
            <ChevronRight size={16} className="text-gray-500" />
          </button>
          <button
            onClick={() => setWeekBrowserOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full active:opacity-60 transition-opacity"
            style={{ background: 'rgba(45,41,38,0.05)' }}
          >
            <History size={14} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* ── Day cards ── */}
      <div>
        {DAYS.map((dayName, dayIndex) => {
          const dateStr  = getDateForDay(dayIndex)
          const isToday  = dayIndex === todayDayIndex
          const dayActs  = activitiesByDay[dayIndex] ?? []
          const expanded = isToday || expandedDays.has(dayIndex)

          return (
            <DayCard
              key={dayIndex}
              dayName={dayName}
              dateStr={dateStr}
              activities={dayActs}
              primary={primary}
              isToday={isToday}
              isExpanded={expanded}
              onToggleExpand={() => toggleExpanded(dayIndex)}
              onToggle={toggleFocusActivity}
              onEdit={openEdit}
              onAdd={() => openAdd(dayIndex)}
              onRequestDelete={setDeleteTarget}
              showHint={isToday && !hintDismissed}
              onHintDismiss={dismissHint}
            />
          )
        })}
      </div>

      {/* ── Sheets ── */}
      <FocusActivitySheet
        open={sheetOpen}
        onClose={closeSheet}
        weekKey={viewWeekKey}
        dayIndex={editingActivity?.dayIndex ?? addingDayIndex ?? 0}
        activity={editingActivity ?? undefined}
        suggestedTitle={suggestedTitle}
        primary={primary}
        owner={filterUser}
      />

      <WeekBrowserSheet
        open={weekBrowserOpen}
        onClose={() => setWeekBrowserOpen(false)}
        onSelectWeek={key => { setViewWeekKey(key); setWeekBrowserOpen(false) }}
        currentWeekKey={viewWeekKey}
      />

      <DeleteConfirmSheet
        open={!!deleteTarget}
        title="Delete Activity"
        message="This activity will be permanently removed."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

    </div>
  )
}
