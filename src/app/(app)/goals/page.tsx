'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Pencil, Trash2, Check, ChevronUp, Target, CalendarDays, type LucideIcon, Globe, Coins, Dumbbell, Leaf, BookOpen, Palette, Trophy, PartyPopper } from '@/design/iconSystem'
import { format, parseISO } from 'date-fns'
import { useAppStore } from '@/store/useAppStore'
import { type Goal, type GoalCategory } from '@/types'
import { cn } from '@/lib/utils'
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet'
import { EmptyState, Progress, C2SheetHeader, C2SheetBody, C2SheetFooter } from '@/components/ui'
import { DatePicker } from '@/components/ui/DatePicker'

/* ─── Category config ─────────────────────────────────────────────────────────── */
const GOAL_CATEGORIES: Record<GoalCategory, {
  icon: LucideIcon
  label: string
  gradient: string
  lightBg: string
  accent: string
}> = {
  travel:     { icon: Globe,    label: 'Travel',            gradient: 'from-sky-400 to-blue-500',       lightBg: 'bg-sky-50',    accent: '#0ea5e9' },
  money:      { icon: Coins,    label: 'Money',             gradient: 'from-emerald-400 to-green-500',  lightBg: 'bg-emerald-50',accent: '#10b981' },
  fitness:    { icon: Dumbbell, label: 'Fitness',           gradient: 'from-orange-400 to-red-500',     lightBg: 'bg-orange-50', accent: '#f97316' },
  life:       { icon: Leaf,     label: 'Life',              gradient: 'from-violet-400 to-purple-500',  lightBg: 'bg-violet-50', accent: '#8b5cf6' },
  learning:   { icon: BookOpen, label: 'Learning & Growth', gradient: 'from-yellow-400 to-amber-500',   lightBg: 'bg-yellow-50', accent: '#f59e0b' },
  hobbies:    { icon: Palette,  label: 'Hobbies',           gradient: 'from-pink-400 to-rose-500',      lightBg: 'bg-pink-50',   accent: '#ec4899' },
  challenges: { icon: Trophy,   label: 'Fun Challenges',    gradient: 'from-teal-400 to-cyan-500',      lightBg: 'bg-teal-50',   accent: '#14b8a6' },
}

const CATEGORY_ORDER: GoalCategory[] = [
  'travel', 'money', 'fitness', 'life', 'learning', 'hobbies', 'challenges',
]

const CONFETTI_COLORS = [
  '#8b5cf6', '#14b8a6', '#f59e0b', '#ec4899',
  '#10b981', '#f97316', '#3b82f6', '#ef4444', '#a78bfa', '#34d399',
]

/* ─── Celebration overlay ─────────────────────────────────────────────────────── */
function CelebrationOverlay({ active, onDone }: { active: boolean; onDone: () => void }) {
  const particles = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      angle: (i / 20) * 360 + (i % 2 === 0 ? 9 : -9),
      distance: 55 + (i % 5) * 18,
      size: 5 + (i % 4),
      duration: 0.55 + (i % 3) * 0.12,
      delay: (i % 5) * 0.03,
      isRound: i % 3 === 0,
    })),
  [])

  useEffect(() => {
    if (!active) return
    const t = setTimeout(onDone, 2400)
    return () => clearTimeout(t)
  }, [active, onDone])

  return (
    <AnimatePresence>
      {active && (
        <div className="fixed inset-0 z-[90] pointer-events-none flex items-center justify-center">
          {/* Confetti burst from center */}
          {particles.map(p => (
            <motion.div
              key={p.id}
              initial={{ opacity: 1, scale: 1, x: 0, y: 0 }}
              animate={{
                opacity: 0,
                scale: 0.4,
                x: Math.cos((p.angle * Math.PI) / 180) * p.distance,
                y: Math.sin((p.angle * Math.PI) / 180) * p.distance - 30,
              }}
              transition={{ duration: p.duration, delay: p.delay, ease: 'easeOut' }}
              className="absolute"
              style={{
                width: p.size,
                height: p.size,
                background: p.color,
                borderRadius: p.isRound ? '50%' : '2px',
              }}
            />
          ))}

          {/* Toast card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -12 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="absolute bg-white rounded-2xl px-6 py-4 shadow-modal
                       flex items-center gap-3 mx-6"
            style={{ top: '38%' }}
          >
            <motion.div
              animate={{ rotate: [0, -15, 15, -10, 10, 0] }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(158,201,179,0.2)', color: '#7BBBA5' }}
            >
              <PartyPopper size={22} strokeWidth={1.5} />
            </motion.div>
            <div>
              <p className="font-bold text-gray-800 text-sm">Goal Completed!</p>
              <p className="text-xs text-gray-400 mt-0.5">Amazing work together</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/* ─── Main page ─────────────────────────────────────────────────────────────── */
export default function GoalsPage() {
  const currentUser = useAppStore(s => s.currentUser)!
  const goals       = useAppStore(s => s.goals)

  const isSeval      = currentUser === 'seval'
  const primaryColor = isSeval ? '#8b5cf6' : '#14b8a6'

  const [openCategory, setOpenCategory] = useState<GoalCategory | null>(null)

  const totalGoals     = goals.length
  const completedGoals = goals.filter(g => g.isCompleted).length

  return (
    <div className="min-h-screen px-4 pt-14 pb-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Our Dreams</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {totalGoals === 0
            ? 'Set your first dream together 🌟'
            : `${completedGoals}/${totalGoals} dreams achieved`}
        </p>
        {totalGoals > 0 && (
          <Progress value={(completedGoals / totalGoals) * 100} color={primaryColor} className="mt-3" />
        )}
      </div>

      {/* Category grid — 2 cols, last card spans full width if odd count */}
      <div className="grid grid-cols-2 gap-3">
        {CATEGORY_ORDER.map((catId, idx) => {
          const cfg       = GOAL_CATEGORIES[catId]
          const catGoals  = goals.filter(g => g.categoryId === catId)
          const done      = catGoals.filter(g => g.isCompleted).length
          const isLastOdd = idx === CATEGORY_ORDER.length - 1 && CATEGORY_ORDER.length % 2 !== 0

          return (
            <motion.button
              key={catId}
              whileTap={{ scale: 0.96 }}
              onClick={() => setOpenCategory(catId)}
              className={cn(
                'relative rounded-3xl p-4 text-left overflow-hidden shadow-card',
                isLastOdd && 'col-span-2'
              )}
            >
              <div className={cn('absolute inset-0 bg-gradient-to-br', cfg.gradient)} />
              <div className="absolute inset-0 bg-white/10 rounded-3xl" />

              <div className="relative z-10">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center mb-1">
                  <cfg.icon size={20} strokeWidth={1.75} className="text-white" />
                </div>
                <p className="text-white font-bold text-sm mt-2 leading-tight">{cfg.label}</p>
                {catGoals.length > 0 ? (
                  <p className="text-white/70 text-xs mt-1">{done}/{catGoals.length} done</p>
                ) : (
                  <p className="text-white/60 text-xs mt-1">No dreams yet</p>
                )}
                {catGoals.length > 0 && (
                  <div className="mt-3 h-1 bg-white/30 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white/80 rounded-full transition-all duration-500"
                      style={{ width: `${(done / catGoals.length) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </motion.button>
          )
        })}
      </div>

      {/* Category modal */}
      <AnimatePresence>
        {openCategory && (
          <CategoryModal
            categoryId={openCategory}
            goals={goals.filter(g => g.categoryId === openCategory)}
            primaryColor={primaryColor}
            onClose={() => setOpenCategory(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Category modal ─────────────────────────────────────────────────────────── */
function CategoryModal({
  categoryId, goals, primaryColor, onClose,
}: {
  categoryId: GoalCategory
  goals: Goal[]
  primaryColor: string
  onClose: () => void
}) {
  const addGoal               = useAppStore(s => s.addGoal)
  const updateGoal            = useAppStore(s => s.updateGoal)
  const deleteGoal            = useAppStore(s => s.deleteGoal)
  const incrementGoalProgress = useAppStore(s => s.incrementGoalProgress)

  const cfg     = GOAL_CATEGORIES[categoryId]
  const pending = goals.filter(g => !g.isCompleted)
  const done    = goals.filter(g => g.isCompleted)

  const [showForm, setShowForm]       = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [celebration, setCelebration] = useState(false)

  const handleToggleDone = useCallback((goal: Goal) => {
    if (!goal.isCompleted) setCelebration(true)
    updateGoal(goal.id, { isCompleted: !goal.isCompleted })
  }, [updateGoal])

  const handleIncrement = useCallback((goal: Goal) => {
    const next = goal.progressCurrent + 1
    if (goal.progressTarget > 0 && next >= goal.progressTarget) setCelebration(true)
    incrementGoalProgress(goal.id)
  }, [incrementGoalProgress])

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
        className="fixed bottom-0 left-0 right-0 z-50 c2-sheet-bg rounded-t-[2rem] shadow-modal max-w-lg mx-auto flex flex-col"
        style={{ maxHeight: 'calc(100dvh - 48px)' }}
      >
        {/* Gradient header */}
        <div className={cn('rounded-t-[2rem] px-5 pt-4 pb-5 bg-gradient-to-br shrink-0', cfg.gradient)}>
          <div className="drag-handle mb-3 bg-white/40" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center">
                <cfg.icon size={22} strokeWidth={1.75} className="text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{cfg.label}</h2>
                <p className="text-white/70 text-xs">
                  {goals.length === 0
                    ? 'No dreams yet — add one!'
                    : `${done.length}/${goals.length} achieved`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white"
            >
              <X size={16} />
            </button>
          </div>

          {goals.length > 0 && (
            <div className="mt-4 h-1.5 bg-white/30 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(done.length / goals.length) * 100}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="h-full bg-white/80 rounded-full"
              />
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          <AnimatePresence>
            {showForm && (
              <GoalForm
                accent={cfg.accent}
                lightBg={cfg.lightBg}
                onSave={(title, notes, targetDate, progressTarget) => {
                  addGoal(categoryId, title, notes, targetDate, progressTarget)
                  setShowForm(false)
                }}
                onCancel={() => setShowForm(false)}
              />
            )}
          </AnimatePresence>

          {pending.length === 0 && done.length === 0 && !showForm && (
            <EmptyState
              icon={Target}
              title="No dreams here yet"
              description="Tap + to add your first dream"
              className="py-10"
            />
          )}

          <AnimatePresence mode="popLayout">
            {pending.map(goal => (
              <GoalCard
                key={goal.id}
                goal={goal}
                accent={cfg.accent}
                lightBg={cfg.lightBg}
                onEdit={() => setEditingGoal(goal)}
                onToggleDone={() => handleToggleDone(goal)}
                onIncrement={() => handleIncrement(goal)}
                onDelete={() => deleteGoal(goal.id)}
              />
            ))}
          </AnimatePresence>

          {done.length > 0 && (
            <div className="pt-2">
              <p className="text-[10px] font-bold text-gray-300 uppercase tracking-wider mb-2">
                Completed ({done.length})
              </p>
              <AnimatePresence mode="popLayout">
                {done.map(goal => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    accent={cfg.accent}
                    lightBg={cfg.lightBg}
                    isDone
                    onEdit={() => setEditingGoal(goal)}
                    onToggleDone={() => handleToggleDone(goal)}
                    onIncrement={() => handleIncrement(goal)}
                    onDelete={() => deleteGoal(goal.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Footer */}
        {!showForm && (
          <div className="px-5 pb-sheet-footer pt-3 shrink-0 border-t border-gray-100">
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-3.5 rounded-2xl text-white text-sm font-semibold
                         flex items-center justify-center gap-2 active:opacity-80 transition-opacity"
              style={{ background: cfg.accent }}
            >
              <Plus size={16} strokeWidth={2.5} />
              Add Dream
            </button>
          </div>
        )}
      </motion.div>

      {/* Edit modal */}
      <AnimatePresence>
        {editingGoal && (
          <GoalEditModal
            goal={editingGoal}
            accent={cfg.accent}
            lightBg={cfg.lightBg}
            onClose={() => setEditingGoal(null)}
            onSave={updates => {
              updateGoal(editingGoal.id, updates)
              setEditingGoal(null)
            }}
            onDelete={() => {
              deleteGoal(editingGoal.id)
              setEditingGoal(null)
            }}
          />
        )}
      </AnimatePresence>

      {/* Celebration */}
      <CelebrationOverlay
        active={celebration}
        onDone={() => setCelebration(false)}
      />
    </>
  )
}

/* ─── Goal card ─────────────────────────────────────────────────────────────── */
function GoalCard({
  goal, accent, lightBg, isDone, onEdit, onToggleDone, onIncrement, onDelete,
}: {
  goal: Goal
  accent: string
  lightBg: string
  isDone?: boolean
  onEdit: () => void
  onToggleDone: () => void
  onIncrement: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const hasCounter = goal.progressTarget > 0
  const pct        = hasCounter
    ? Math.min((goal.progressCurrent / goal.progressTarget) * 100, 100)
    : 0
  const isMaxed    = hasCounter && goal.progressCurrent >= goal.progressTarget

  return (
    <>
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="bg-white rounded-2xl shadow-card overflow-hidden group"
    >
      <div className="flex">
        {/* Left accent bar */}
        <div className="w-1 shrink-0" style={{ background: isDone ? '#d1d5db' : accent }} />

        <div className="flex-1 min-w-0 p-3.5">
          {/* Top row */}
          <div className="flex items-start gap-2">
            {/* Done toggle */}
            <button
              onClick={onToggleDone}
              className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5
                         transition-all active:scale-90"
              style={{
                borderColor: isDone ? accent : '#d1d5db',
                background:  isDone ? accent : 'transparent',
              }}
            >
              {isDone && <Check size={11} color="white" strokeWidth={3} />}
            </button>

            <div className="flex-1 min-w-0">
              <p className={cn(
                'text-sm font-semibold leading-tight',
                isDone ? 'line-through text-gray-300' : 'text-gray-800'
              )}>
                {goal.title}
              </p>

              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {goal.targetDate && !isDone && (
                  <span className="text-[11px] text-gray-400">
                    {format(parseISO(goal.targetDate), 'MMM d, yyyy')}
                  </span>
                )}
                {goal.linkedEventId && (
                  <span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-500">
                    <CalendarDays size={10} />
                    On calendar
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              {(goal.notes || hasCounter) && (
                <button
                  onClick={() => setExpanded(e => !e)}
                  className="text-gray-300 active:text-gray-500 transition-colors p-1"
                >
                  <ChevronUp
                    size={14}
                    className={cn('transition-transform', !expanded && 'rotate-180')}
                  />
                </button>
              )}
              <button
                onClick={onEdit}
                className="opacity-0 group-hover:opacity-100 text-gray-300 active:text-gray-600
                           transition-all p-1"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => setShowConfirm(true)}
                className="opacity-0 group-hover:opacity-100 text-gray-300 active:text-red-400
                           transition-all p-1"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Progress counter */}
          {hasCounter && !isDone && (
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <span className="text-[11px] text-gray-400">Progress</span>
                  <span className="text-[11px] font-bold" style={{ color: accent }}>
                    {goal.progressCurrent}/{goal.progressTarget}
                  </span>
                </div>
                <Progress value={pct} color={accent} />
              </div>
              {!isMaxed && (
                <button
                  onClick={onIncrement}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white
                             text-sm font-bold shrink-0 active:scale-90 transition-transform shadow-sm"
                  style={{ background: accent }}
                >
                  +1
                </button>
              )}
            </div>
          )}

          {/* Expanded notes */}
          <AnimatePresence>
            {expanded && goal.notes && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className={cn('mt-3 rounded-xl px-3 py-2.5 text-xs text-gray-500 leading-relaxed', lightBg)}>
                  {goal.notes}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>

    <DeleteConfirmSheet
      open={showConfirm}
      title="Let go of this dream?"
      message="This dream will be permanently removed."
      onCancel={() => setShowConfirm(false)}
      onConfirm={() => { onDelete(); setShowConfirm(false) }}
    />
    </>
  )
}

/* ─── Add goal form ─────────────────────────────────────────────────────────── */
function GoalForm({
  accent, lightBg, onSave, onCancel,
}: {
  accent: string
  lightBg: string
  onSave: (title: string, notes?: string, targetDate?: string, progressTarget?: number) => void
  onCancel: () => void
}) {
  const [title, setTitle]                   = useState('')
  const [notes, setNotes]                   = useState('')
  const [targetDate, setTargetDate]         = useState('')
  const [useCounter, setUseCounter]         = useState(false)
  const [progressTarget, setProgressTarget] = useState('5')

  function handleSave() {
    if (!title.trim()) return
    onSave(
      title.trim(),
      notes.trim() || undefined,
      targetDate || undefined,
      useCounter ? parseInt(progressTarget, 10) || 0 : 0,
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={cn('rounded-2xl p-4 mb-1 overflow-hidden', lightBg)}
    >
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Dream title..."
        autoFocus
        className="w-full text-sm font-semibold text-gray-800 placeholder:text-gray-400
                   bg-transparent outline-none border-b border-gray-200 pb-2 mb-3"
      />

      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Notes or description (optional)"
        rows={2}
        className="w-full text-sm text-gray-600 placeholder:text-gray-300 bg-white/60
                   rounded-xl px-3 py-2 outline-none resize-none mb-3"
      />

      <div className="mb-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
          <CalendarDays size={10} />
          Target date — adds to calendar
        </p>
        <DatePicker value={targetDate} onChange={setTargetDate} />
      </div>

      {/* Counter toggle */}
      <button
        onClick={() => setUseCounter(v => !v)}
        className="flex items-center gap-2 mb-2"
      >
        <div
          className="w-9 h-5 rounded-full transition-colors relative"
          style={{ background: useCounter ? accent : '#e5e7eb' }}
        >
          <div className={cn(
            'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
            useCounter ? 'translate-x-4' : 'translate-x-0.5'
          )} />
        </div>
        <span className="text-xs text-gray-500">Progress counter (e.g. 3/10)</span>
      </button>

      {useCounter && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-500">Target:</span>
          <input
            type="number"
            min="1"
            max="1000"
            value={progressTarget}
            onChange={e => setProgressTarget(e.target.value)}
            className="w-20 text-sm text-gray-700 bg-white/60 rounded-xl px-3 py-1.5 outline-none text-center"
          />
          <span className="text-xs text-gray-400">steps</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl bg-white text-gray-500 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!title.trim()}
          className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40"
          style={{ background: accent }}
        >
          Add Goal
        </button>
      </div>
    </motion.div>
  )
}

/* ─── Edit goal modal ────────────────────────────────────────────────────────── */
function GoalEditModal({
  goal, accent, lightBg, onClose, onSave, onDelete,
}: {
  goal: Goal
  accent: string
  lightBg: string
  onClose: () => void
  onSave: (updates: Partial<Goal>) => void
  onDelete: () => void
}) {
  const [title, setTitle]                         = useState(goal.title)
  const [notes, setNotes]                         = useState(goal.notes ?? '')
  const [targetDate, setTargetDate]               = useState(goal.targetDate ?? '')
  const [progressCurrent, setProgressCurrent]     = useState(String(goal.progressCurrent))
  const [progressTarget, setProgressTarget]       = useState(String(goal.progressTarget))
  const [showDelete, setShowDelete]               = useState(false)

  const useCounter = goal.progressTarget > 0

  function handleSave() {
    if (!title.trim()) return
    onSave({
      title:           title.trim(),
      notes:           notes.trim() || undefined,
      targetDate:      targetDate || undefined,
      progressCurrent: parseInt(progressCurrent, 10) || 0,
      progressTarget:  parseInt(progressTarget, 10)  || 0,
    })
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[60] c2-backdrop"
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 400 }}
        className="fixed bottom-0 left-0 right-0 z-[60] c2-sheet-bg rounded-t-[2rem] shadow-modal max-w-lg mx-auto flex flex-col"
        style={{ maxHeight: 'calc(100dvh - 48px)' }}
      >
        <C2SheetHeader title="Edit Dream" onClose={onClose} />

        <C2SheetBody className="pb-4">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Dream title..."
            autoFocus
            className="w-full text-xl font-semibold text-gray-800 placeholder:text-gray-300
                       border-b-2 border-gray-100 focus:border-gray-200 pb-3 mb-5 outline-none
                       transition-colors bg-transparent"
          />

          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Notes</p>
          <div className={cn('rounded-2xl p-4 mb-4', lightBg)}>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Write about this dream..."
              rows={4}
              className="w-full text-sm text-gray-700 placeholder:text-gray-300 bg-transparent
                         outline-none resize-none"
            />
          </div>

          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <CalendarDays size={11} className="text-emerald-400" />
            Target date — syncs to calendar
          </p>
          {goal.linkedEventId && !targetDate && (
            <p className="text-[11px] text-amber-500 mb-1">
              Clearing the date will remove this goal from the calendar.
            </p>
          )}
          <DatePicker value={targetDate} onChange={setTargetDate} className="mb-4" />

          {useCounter && (
            <>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Progress</p>
              <div className={cn('rounded-2xl p-4', lightBg)}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1">
                    <p className="text-[10px] text-gray-400 mb-1">Current</p>
                    <input
                      type="number"
                      min="0"
                      value={progressCurrent}
                      onChange={e => setProgressCurrent(e.target.value)}
                      className="w-full text-sm text-gray-700 bg-white/70 rounded-xl px-3 py-2 outline-none text-center"
                    />
                  </div>
                  <span className="text-gray-400 text-lg font-light">/</span>
                  <div className="flex-1">
                    <p className="text-[10px] text-gray-400 mb-1">Target</p>
                    <input
                      type="number"
                      min="1"
                      value={progressTarget}
                      onChange={e => setProgressTarget(e.target.value)}
                      className="w-full text-sm text-gray-700 bg-white/70 rounded-xl px-3 py-2 outline-none text-center"
                    />
                  </div>
                </div>
                <Progress
                  value={Math.min((parseInt(progressCurrent) / (parseInt(progressTarget) || 1)) * 100, 100)}
                  color={accent}
                  trackColor="rgba(255,255,255,0.6)"
                  animated={false}
                />
              </div>
            </>
          )}
        </C2SheetBody>

        <C2SheetFooter>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="w-full py-4 rounded-2xl text-white text-sm font-semibold mb-3 disabled:opacity-40"
            style={{ background: accent }}
          >
            Save Changes
          </button>

          <button
            onClick={() => setShowDelete(true)}
            className="w-full py-3 rounded-2xl text-sm font-medium text-red-400 active:bg-red-50 transition-colors"
          >
            Let go of this dream
          </button>
        </C2SheetFooter>
      </motion.div>

      <DeleteConfirmSheet
        open={showDelete}
        title="Let go of this dream?"
        message="This will also remove any linked calendar event."
        onCancel={() => setShowDelete(false)}
        onConfirm={onDelete}
      />
    </>
  )
}
