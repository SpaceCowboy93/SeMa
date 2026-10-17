'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { CalendarClock, Leaf, AlertCircle } from '@/design/iconSystem'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store/useAppStore'
import { type Countdown, type CalendarEvent, USERS } from '@/types'
import { getTodayString } from '@/lib/utils'
import { getLivingMoment } from '@/lib/livingMoment'
import { EventModal } from '@/components/calendar/EventModal'
import { AnniversarySheet } from '@/components/ui/AnniversarySheet'
import { type CategoryType, CategoryHubSheet } from '@/components/ui/CategoryHub'
import { C2PageBackground } from '@/components/ui/C2PageBackground'
import { WeeklyFocusSection } from '@/components/weekly-focus/WeeklyFocusSection'
import { SeMaRoomHeader } from '@/components/ui/SeMaRoomHeader'
import { C2_ROOM_HEADERS } from '@/lib/c2RoomHeaders'
import { C2SectionLabel } from '@/components/ui/C2SectionLabel'

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function PlannerPage() {
  const router          = useRouter()
  const currentUser     = useAppStore(s => s.currentUser)!
  const countdowns      = useAppStore(s => s.countdowns)
  const events          = useAppStore(s => s.events)
  const todos           = useAppStore(s => s.todos)
  const shoppingLists   = useAppStore(s => s.shoppingLists)
  const partnerNotes    = useAppStore(s => s.partnerNotes)
  const deleteCountdown = useAppStore(s => s.deleteCountdown)

  const primary  = USERS[currentUser].theme === 'seval' ? '#8b5cf6' : '#14b8a6'
  const todayStr = getTodayString()
  const today    = new Date(todayStr)

  const living = useMemo(() => getLivingMoment({
    events, countdowns, shoppingLists, todos, partnerNotes, currentUser, today: todayStr,
  }), [events, countdowns, shoppingLists, todos, partnerNotes, currentUser, todayStr])

  const [openCategory,      setOpenCategory]      = useState<CategoryType | null>(null)
  const [selectedCountdown, setSelectedCountdown] = useState<Countdown | null>(null)
  const [editingEvent,      setEditingEvent]      = useState<CalendarEvent | null>(null)
  const [eventModalOpen,    setEventModalOpen]    = useState(false)
  const [showAllUpcoming,   setShowAllUpcoming]   = useState(false)

  /* ── Upcoming dates ───────────────────────────────────────────────────── */
  const futureCountdowns = useMemo(() =>
    countdowns.filter(c => c.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)),
    [countdowns, todayStr]
  )

  const upcomingEvents = useMemo(() => {
    const seen = new Set<string>()
    return events
      .filter(e => {
        if (e.date < todayStr || seen.has(e.id)) return false
        seen.add(e.id); return true
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [events, todayStr])

  const allUpcomingItems = useMemo(() => {
    type CdItem = (typeof futureCountdowns)[0] & { _kind: 'countdown' }
    type EvItem = (typeof upcomingEvents)[0]   & { _kind: 'event' }
    const cds: CdItem[] = futureCountdowns.map(c => ({ ...c, _kind: 'countdown' as const }))
    const evs: EvItem[] = upcomingEvents.map(e => ({ ...e, _kind: 'event' as const }))
    return [...cds, ...evs].sort((a, b) => a.date.localeCompare(b.date))
  }, [futureCountdowns, upcomingEvents])

  const UPCOMING_LIMIT  = 5
  const visibleUpcoming = showAllUpcoming ? allUpcomingItems : allUpcomingItems.slice(0, UPCOMING_LIMIT)
  const hasMoreUpcoming = allUpcomingItems.length > UPCOMING_LIMIT

  /* ── Needs attention ──────────────────────────────────────────────────── */
  const needsAttention = useMemo(() => {
    const items: { id: string; label: string; sub: string; onOpen: () => void }[] = []

    todos
      .filter(t => !t.isCompleted && t.date && t.date < todayStr)
      .sort((a, b) => a.date!.localeCompare(b.date!))
      .slice(0, 3)
      .forEach(t => {
        const d = differenceInCalendarDays(new Date(todayStr), parseISO(t.date!))
        items.push({
          id:    `od-${t.id}`,
          label: t.title,
          sub:   `Overdue · ${d} day${d !== 1 ? 's' : ''}`,
          onOpen: () => setOpenCategory('plans'),
        })
      })

    shoppingLists
      .filter(l => !l.isCompleted)
      .slice(0, 2)
      .forEach(l => {
        const left = l.items.filter(i => !i.isChecked).length
        items.push({
          id:    `sh-${l.id}`,
          label: l.name,
          sub:   `Shopping · ${left} item${left !== 1 ? 's' : ''} remaining`,
          onOpen: () => router.push('/shopping'),
        })
      })

    return items
  }, [todos, shoppingLists, todayStr, router])

  /* ── Subtitle ─────────────────────────────────────────────────────────── */
  const plannerSubtitle = living.plannerSubtitle || 'Plan your future together.'

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen pb-28">

      <C2PageBackground />

      <SeMaRoomHeader
        eyebrow="Weekly view"
        title="Planner"
        subtitle={plannerSubtitle}
        imageSrc={C2_ROOM_HEADERS.planner.src}
        imageObjectPosition={C2_ROOM_HEADERS.planner.imageObjectPosition}
      />

      <WeeklyFocusSection />

      <div className="px-4 pt-4 pb-10 space-y-6">

        {/* ── Upcoming dates ── */}
        {allUpcomingItems.length > 0 && (
          <section>
            <C2SectionLabel className="mb-3 px-1">Upcoming dates</C2SectionLabel>
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {visibleUpcoming.map(item => {
                  const days = differenceInCalendarDays(parseISO(item.date), today)

                  if (item._kind === 'countdown') {
                    return (
                      <motion.button
                        key={`cd-${item.id}`}
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSelectedCountdown(item)}
                        className="c2-card w-full px-4 py-3.5 flex items-center gap-3 text-left overflow-hidden"
                      >
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl"
                          style={{ background: 'rgba(63,107,79,0.07)' }}
                        >
                          {item.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate" style={{ color: 'var(--c2-text-primary)' }}>{item.title}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--c2-text-faint)' }}>
                            {format(parseISO(item.date), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-lg font-bold tabular-nums" style={{ color: '#4a7c5e' }}>
                            {days === 0 ? 'Today' : days}
                          </p>
                          {days > 0 && <p className="text-[10px]" style={{ color: 'var(--c2-text-faint)' }}>days left</p>}
                        </div>
                      </motion.button>
                    )
                  }

                  return (
                    <motion.button
                      key={`ev-${item.id}`}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => { setEditingEvent(item); setEventModalOpen(true) }}
                      className="c2-card w-full px-4 py-3 flex items-center gap-3 text-left overflow-hidden"
                    >
                      <div className="shrink-0 text-center w-10">
                        {days === 0
                          ? <CalendarClock size={20} style={{ color: '#4a7c5e', margin: '0 auto' }} />
                          : <><p className="text-base font-bold tabular-nums" style={{ color: 'var(--c2-text-primary)' }}>{days}</p>
                             <p className="text-[9px]" style={{ color: 'var(--c2-text-faint)' }}>days</p></>
                        }
                      </div>
                      <div className="w-px h-8 shrink-0" style={{ background: 'var(--c2-divider)' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--c2-text-primary)' }}>{item.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--c2-text-faint)' }}>
                          {format(parseISO(item.date), 'EEE, MMM d')}
                        </p>
                      </div>
                    </motion.button>
                  )
                })}
              </AnimatePresence>

              {hasMoreUpcoming && (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setShowAllUpcoming(v => !v)}
                  className="c2-card w-full py-2.5 text-xs font-semibold"
                  style={{ color: 'var(--c2-text-faint)' }}
                >
                  {showAllUpcoming
                    ? 'Show less'
                    : `Show ${allUpcomingItems.length - UPCOMING_LIMIT} more`}
                </motion.button>
              )}
            </div>
          </section>
        )}

        {/* ── Needs attention ── */}
        {needsAttention.length > 0 && (
          <section>
            <C2SectionLabel className="mb-3 px-1">Needs attention</C2SectionLabel>
            <div className="space-y-2">
              {needsAttention.map((item, i) => (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={item.onOpen}
                  className="c2-card w-full px-4 py-3.5 flex items-center gap-3 text-left"
                >
                  <AlertCircle size={15} style={{ color: 'var(--c2-text-ghost)', flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--c2-text-primary)' }}>{item.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--c2-text-mid)' }}>{item.sub}</p>
                  </div>
                </motion.button>
              ))}
            </div>
          </section>
        )}

        {/* Closing copy */}
        <div className="flex items-center justify-center gap-2 mt-4" style={{ color: 'var(--c2-text-ghost)' }}>
          <Leaf size={12} />
          <p className="text-xs italic">Your plans, your story.</p>
          <Leaf size={12} />
        </div>

      </div>

      {/* ── Sheets ── */}
      <AnimatePresence>
        {openCategory && (
          <CategoryHubSheet
            key={openCategory}
            type={openCategory as 'wishes' | 'dreams' | 'moments' | 'plans'}
            primary={primary}
            currentUser={currentUser}
            onClose={() => setOpenCategory(null)}
            onEditMoment={ev => { setEditingEvent(ev); setEventModalOpen(true) }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedCountdown && (
          <AnniversarySheet
            countdown={selectedCountdown}
            primary={primary}
            onClose={() => setSelectedCountdown(null)}
            onDelete={() => { deleteCountdown(selectedCountdown.id); setSelectedCountdown(null) }}
          />
        )}
      </AnimatePresence>

      <EventModal
        isOpen={eventModalOpen && !!editingEvent}
        onClose={() => { setEventModalOpen(false); setEditingEvent(null) }}
        date={editingEvent?.date ?? todayStr}
        event={editingEvent}
      />
    </div>
  )
}
