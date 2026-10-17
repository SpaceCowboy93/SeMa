'use client'

import { useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence, useDragControls, useReducedMotion } from 'framer-motion'
import {
  X, type LucideIcon,
  Flower2, AlertTriangle, CalendarDays, CheckSquare, Mail, ShoppingCart,
  Smile, Moon, CloudRain, Flame, Leaf,
  Heart, Gem, CakeSlice, PartyPopper, Waves, TreePine, Drama, Star, Sun, Plane,
} from '@/design/iconSystem'
import { EmptyState } from '@/components/ui/EmptyState'

const BRIEFING_ICON_MAP: Record<string, LucideIcon> = {
  // System keys
  warning:   AlertTriangle,
  calendar:  CalendarDays,
  checklist: CheckSquare,
  note:      Mail,
  shopping:  ShoppingCart,
  // Mood keys
  happy:     Smile,
  relaxed:   Leaf,
  tired:     Moon,
  sad:       CloudRain,
  stressed:  Flame,
  // Milestone keys
  heart:     Heart,
  gem:       Gem,
  cake:      CakeSlice,
  star:      Star,
  party:     PartyPopper,
  plane:     Plane,
  flower:    Flower2,
  waves:     Waves,
  sun:       Sun,
  tree:      TreePine,
  drama:     Drama,
}

function BriefingItemIcon({ emoji }: { emoji: string }) {
  const Icon = BRIEFING_ICON_MAP[emoji]
  if (Icon) {
    return (
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'rgba(158,201,179,0.12)', color: '#7BBBA5' }}>
        <Icon size={16} strokeWidth={1.75} />
      </div>
    )
  }
  // Fallback: render as emoji text (user-set event emoji)
  return <span className="text-xl shrink-0 leading-none">{emoji}</span>
}
import { useAppStore } from '@/store/useAppStore'
import { USERS } from '@/types'
import { getTodayString } from '@/lib/utils'
import { getDailyGreeting } from '@/lib/greeting'
import { generateBriefingItems, type BriefingItem } from '@/lib/briefing'

interface Props {
  open: boolean
  onClose: () => void
  onItemPress: (item: BriefingItem) => void
}

export function DailyBriefingSheet({ open, onClose, onItemPress }: Props) {
  const currentUser     = useAppStore(s => s.currentUser)!
  const openOverlay     = useAppStore(s => s.openOverlay)
  const closeOverlay    = useAppStore(s => s.closeOverlay)
  const events          = useAppStore(s => s.events)
  const todos           = useAppStore(s => s.todos)
  const focusActivities = useAppStore(s => s.focusActivities)
  const partnerNotes    = useAppStore(s => s.partnerNotes)
  const moods           = useAppStore(s => s.moods)
  const countdowns      = useAppStore(s => s.countdowns)
  const savingsGoals    = useAppStore(s => s.savingsGoals)
  const shoppingLists   = useAppStore(s => s.shoppingLists)

  const today        = getTodayString()
  const name         = USERS[currentUser].displayName
  const greeting     = getDailyGreeting(name, today)
  const primary      = currentUser === 'seval' ? '#8b5cf6' : '#14b8a6'
  const shouldReduce = useReducedMotion()
  const dragControls = useDragControls()

  const items = useMemo(() =>
    generateBriefingItems(currentUser, {
      events, todos, focusActivities, partnerNotes,
      moods, countdowns, savingsGoals, shoppingLists,
    }, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser, today, events, todos, focusActivities, partnerNotes,
     moods, countdowns, savingsGoals, shoppingLists],
  )

  // Register with the global overlay counter so the layout FAB hides while open.
  // Also push a history entry for Android back-button support.
  useEffect(() => {
    if (!open) return
    openOverlay()
    history.pushState({ semaBriefing: true }, '')
    const onPop = () => onClose()
    window.addEventListener('popstate', onPop)
    return () => {
      closeOverlay()
      window.removeEventListener('popstate', onPop)
    }
  }, [open, onClose, openOverlay, closeOverlay])

  const handleItemPress = useCallback((item: BriefingItem) => {
    onClose()
    // Small delay so the sheet exit animation starts before the target opens
    setTimeout(() => onItemPress(item), 220)
  }, [onClose, onItemPress])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-50 c2-backdrop"
          />

          {/* Sheet */}
          <motion.div
            initial={shouldReduce ? false : { y: '100%' }}
            animate={{ y: 0 }}
            exit={shouldReduce ? { opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 380 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.3 }}
            onDragEnd={(_, info) => { if (info.offset.y > 80) onClose() }}
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col c2-sheet-bg rounded-t-[2.5rem] shadow-modal max-w-lg mx-auto"
            style={{ maxHeight: 'calc(100dvh - 48px)' }}
            role="dialog"
            aria-modal="true"
            aria-label="Daily Briefing"
          >
            {/* Drag handle — drag initiates only from here */}
            <div
              className="shrink-0 pt-3 pb-1 flex justify-center touch-none cursor-grab active:cursor-grabbing"
              onPointerDown={e => dragControls.start(e)}
            >
              <div className="w-10 h-1 rounded-full bg-[rgba(180,165,140,0.4)]" />
            </div>

            {/* Header */}
            <div className="shrink-0 px-6 pt-3 pb-4 flex items-start justify-between">
              <div className="flex-1 min-w-0 pr-3">
                <p className="text-[11px] font-semibold text-gray-400 mb-1 uppercase tracking-widest">
                  Daily Briefing
                </p>
                <h2
                  className="text-[1.6rem] leading-snug text-gray-900"
                  style={{ fontFamily: 'var(--font-playfair)', fontWeight: 600 }}
                >
                  {greeting}
                </h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-8 h-8 flex items-center justify-center rounded-full c2-sheet-x shrink-0 mt-1 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Divider */}
            <div className="shrink-0 mx-6 h-px bg-gray-100" />

            {/* Scrollable body */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-3">
              {items.length === 0 ? (
                <EmptyState
                  icon={Flower2}
                  title="Nothing urgent today."
                  description="Enjoy a calm day together."
                  animate={false}
                />
              ) : (
                <div className="space-y-2 pb-3">
                  {items.map((item, i) => (
                    <motion.button
                      key={item.id}
                      initial={shouldReduce ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: shouldReduce ? 0 : i * 0.06, duration: 0.22, ease: 'easeOut' }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleItemPress(item)}
                      className="w-full c2-sheet-section px-4 py-3.5 flex items-center gap-3 text-left active:opacity-90 transition-colors rounded-2xl"
                    >
                      <BriefingItemIcon emoji={item.emoji} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{item.label}</p>
                        {item.sub && (
                          <p className="text-xs text-gray-400 truncate mt-0.5">{item.sub}</p>
                        )}
                      </div>
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: primary }}
                      />
                    </motion.button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 px-4 pt-3 pb-sheet-footer">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onClose}
                className="w-full py-4 rounded-2xl text-white text-sm font-semibold"
                style={{ background: primary }}
              >
                Start my day ✨
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
