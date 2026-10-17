'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, isSameMonth, isToday, parseISO, differenceInCalendarDays } from 'date-fns'
import { ChevronLeft, ChevronRight, Clock, Search, X, Send, Sun } from '@/design/iconSystem'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store/useAppStore'
import {
  USERS, OTHER_USER, type UserName, type CalendarEvent, type Countdown,
} from '@/types'
import { EventModal } from '@/components/calendar/EventModal'
import {
  getCalendarDays, toDateString, formatTime,
  getTodayString, cn, EVENT_COLOR_CLASS,
} from '@/lib/utils'
import { FullCreateSheet } from '@/components/ui/FullCreateSheet'
import { AnniversarySheet } from '@/components/ui/AnniversarySheet'
import {
  CATEGORY_DEFS, type CategoryType,
  CategoryHubSheet,
} from '@/components/ui/CategoryHub'
import { C2PageBackground } from '@/components/ui/C2PageBackground'
import { NotificationPromptCard } from '@/components/NotificationPromptCard'
import { SeMaRoomHeader } from '@/components/ui/SeMaRoomHeader'
import { C2_ROOM_HEADERS } from '@/lib/c2RoomHeaders'
import { useDailyGreeting } from '@/hooks/useDailyGreeting'
import { DailyBriefingSheet } from '@/components/DailyBriefingSheet'
import { briefingStorageKey, type BriefingItem } from '@/lib/briefing'
import { getLivingMoment } from '@/lib/livingMoment'
import { C2SectionLabel } from '@/components/ui/C2SectionLabel'

const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

type HomeSearchHit = {
  id: string
  typeLabel: string
  hex: string
  title: string
  sub: string
  onOpen: () => void
}

export default function TogetherPage() {
  const router          = useRouter()
  const currentUser     = useAppStore(s => s.currentUser)!
  const events          = useAppStore(s => s.events)
  const partnerNotes    = useAppStore(s => s.partnerNotes)
  const markRead        = useAppStore(s => s.markPartnerNoteRead)
  const sendNote        = useAppStore(s => s.sendPartnerNote)
  const todos           = useAppStore(s => s.todos)
  const goals           = useAppStore(s => s.goals)
  const wishlist        = useAppStore(s => s.wishlistItems)
  const shoppingLists   = useAppStore(s => s.shoppingLists)
  const countdowns      = useAppStore(s => s.countdowns)
  const deleteCountdown = useAppStore(s => s.deleteCountdown)

  const partnerUser = OTHER_USER[currentUser]
  const isSeval     = currentUser === 'seval'
  const primary     = isSeval ? '#8b5cf6' : '#14b8a6'

  const living = useMemo(() => getLivingMoment({
    events, countdowns, shoppingLists, todos, partnerNotes, currentUser,
    today: getTodayString(),
  }), [events, countdowns, shoppingLists, todos, partnerNotes, currentUser])

  const { greeting, dateLabel } = useDailyGreeting()

  // Calendar state
  const [viewDate,      setViewDate]      = useState(new Date())
  const [selectedDate,  setSelectedDate]  = useState(getTodayString())
  const [modalOpen,     setModalOpen]     = useState(false)
  const [editingEvent,  setEditingEvent]  = useState<CalendarEvent | null>(null)

  // Double-tap to add event
  const lastTapRef     = useRef(0)
  const lastTapDateRef = useRef('')

  function handleDayTap(dateStr: string) {
    const now     = Date.now()
    const diff    = now - lastTapRef.current
    const dayEvts = eventsByDate[dateStr] ?? []

    if (diff < 300 && diff > 0 && lastTapDateRef.current === dateStr) {
      lastTapRef.current     = 0
      lastTapDateRef.current = ''
      setSelectedDate(dateStr)
      setEditingEvent(null)
      setModalOpen(true)
      return
    }

    lastTapRef.current     = now
    lastTapDateRef.current = dateStr
    setSelectedDate(dateStr)

    if (dayEvts.length === 1) {
      setEditingEvent(dayEvts[0])
      setModalOpen(true)
      lastTapRef.current = 0
    }
  }

  // Daily briefing
  const [briefingOpen,    setBriefingOpen]    = useState(false)
  const [briefingChecked, setBriefingChecked] = useState(false)

  // Auto-show the briefing once per profile per day.
  // Reset both flags first so profile switches are handled cleanly.
  useEffect(() => {
    setBriefingOpen(false)
    setBriefingChecked(false)
    const key = briefingStorageKey(currentUser, getTodayString())
    const alreadySeen = localStorage.getItem(key)
    if (!alreadySeen) {
      localStorage.setItem(key, '1')
      setBriefingOpen(true)
    }
    setBriefingChecked(true)
  }, [currentUser])

  // Route a briefing row to the corresponding in-app destination
  const handleBriefingItem = useCallback((item: BriefingItem) => {
    switch (item.kind) {
      case 'todo_urgent':
        setOpenCategory('plans')
        break
      case 'event': {
        const ev = events.find(e => e.id === item.sourceId)
        if (ev) { setEditingEvent(ev); setModalOpen(true) }
        break
      }
      case 'planner_activity':
        router.push('/planner')
        break
      case 'partner_note':
        setReadingNote(true)
        break
      case 'partner_mood':
        // Partner mood is contextual — just let the briefing close
        break
      case 'countdown': {
        const cd = countdowns.find(c => c.id === item.sourceId)
        if (cd) setSelectedCountdown(cd)
        break
      }
      case 'savings_goal':
        router.push('/plans')
        break
      case 'shopping_list':
        router.push('/shopping')
        break
    }
  }, [events, countdowns, router])

  // Note sheet
  const [noteOpen,    setNoteOpen]    = useState(false)
  const [noteText,    setNoteText]    = useState('')
  const [noteSent,    setNoteSent]    = useState(false)
  const [readingNote, setReadingNote] = useState(false)

  // Search
  const [query,             setQuery]             = useState('')
  const [openCategory,      setOpenCategory]      = useState<CategoryType | null>(null)
  const [selectedCountdown, setSelectedCountdown] = useState<Countdown | null>(null)
  const isSearching = query.trim().length > 0

  const unreadNote = partnerNotes.find(n => n.to === currentUser && !n.isRead) ?? null

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

  const selectedEvents = useMemo(() => {
    const seen = new Set<string>()
    return (eventsByDate[selectedDate] ?? []).filter(ev => {
      if (seen.has(ev.id)) return false
      seen.add(ev.id)
      return true
    })
  }, [eventsByDate, selectedDate])

  /* ── Search across all record types ─────────────────────────────────── */
  const searchResults = useMemo<HomeSearchHit[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const hits: HomeSearchHit[] = []

    const push = (
      id: string, typeLabel: string, hex: string,
      title: string, sub: string, onOpen: () => void,
    ) => {
      if (title.toLowerCase().includes(q) || sub.toLowerCase().includes(q))
        hits.push({ id, typeLabel, hex, title, sub, onOpen })
    }

    events.forEach(e =>
      push(e.id, 'Moment', '#fbbf24', e.title, e.notes ?? e.date,
        () => { setEditingEvent(e); setModalOpen(true) }))
    todos.forEach(t =>
      push(t.id, 'Plan', '#34d399', t.title, t.notes ?? t.date ?? '',
        () => setOpenCategory('plans')))
    goals.forEach(g =>
      push(g.id, 'Dream', '#60a5fa', g.title, g.notes ?? g.targetDate ?? '',
        () => setOpenCategory('dreams')))
    wishlist.forEach(w =>
      push(w.id, 'Wish', '#a78bfa', w.title, w.notes ?? '',
        () => setOpenCategory('wishes')))
    shoppingLists.forEach(l =>
      push(l.id, 'Shopping', '#ef4444', l.name, l.storeName ?? l.notes ?? '',
        () => router.push('/shopping')))
    countdowns.forEach(c =>
      push(c.id, 'Countdown', '#ec4899', c.title, c.notes ?? c.date,
        () => setSelectedCountdown(c)))

    return hits.slice(0, 20)
  }, [query, events, todos, goals, wishlist, shoppingLists, countdowns])

  /* ── Category stats ──────────────────────────────────────────────────── */
  const catStats = useMemo(() => {
    const plansActive    = todos.filter(t => !t.isCompleted).length
    const plansDone      = todos.filter(t => t.isCompleted).length
    const dreamsActive   = goals.filter(g => !g.isCompleted).length
    const dreamsAchieved = goals.filter(g => g.isCompleted).length
    const wishesActive   = wishlist.filter(w => !w.isCompleted).length
    const wishesDone     = wishlist.filter(w => w.isCompleted).length
    const shopActive     = shoppingLists.filter(l => !l.isCompleted).length

    const mm = getTodayString().slice(0, 7)
    const shopMonth = shoppingLists
      .filter(l => (l.completedAt ?? l.updatedAt ?? l.createdAt).slice(0, 7) === mm)
      .reduce((s, l) => s + l.items.reduce((a, i) => a + (i.price ?? 0) * i.quantity, 0), 0)

    let lastMomentLabel: string | null = null
    if (events.length > 0) {
      const lastDate = [...events].sort((a, b) => b.date.localeCompare(a.date))[0].date
      const d = differenceInCalendarDays(new Date(), parseISO(lastDate))
      lastMomentLabel =
        d === 0 ? 'Last: today' :
        d === 1 ? 'Last: yesterday' :
        d > 0 && d <= 30 ? `Last: ${d} days ago` :
        `Last: ${format(parseISO(lastDate), 'MMM d')}`
    }

    return {
      plans:    { line1: `${plansActive} active`,   line2: plansDone > 0 ? `${plansDone} done` : null },
      dreams:   { line1: `${dreamsActive} saved`,   line2: dreamsAchieved > 0 ? `${dreamsAchieved} achieved` : null },
      wishes:   { line1: `${wishesActive} wishes`,  line2: wishesDone > 0 ? `${wishesDone} fulfilled` : null },
      shopping: { line1: `${shopActive} ${shopActive === 1 ? 'list' : 'lists'}`, line2: shopMonth > 0 ? `€${Math.round(shopMonth)} this month` : null },
      moments:  { line1: `${events.length} captured`, line2: lastMomentLabel },
    } as Record<CategoryType, { line1: string; line2: string | null }>
  }, [todos, goals, wishlist, shoppingLists, events])

  function handleSendNote() {
    if (!noteText.trim()) return
    sendNote(noteText.trim())
    setNoteText(''); setNoteSent(true)
    setTimeout(() => { setNoteSent(false); setNoteOpen(false) }, 1800)
  }

  return (
    <div className="min-h-screen relative z-0">

      <C2PageBackground />

      <SeMaRoomHeader
        mode="greeting"
        greeting={greeting ?? undefined}
        subtitle={living.homeSubtitle || undefined}
        dateLabel={dateLabel}
        imageSrc={C2_ROOM_HEADERS.home.src}
        imageObjectPosition={C2_ROOM_HEADERS.home.imageObjectPosition}
      />

      {/* ── Today's Briefing reopen pill ── */}
      {briefingChecked && !briefingOpen && (
        <div className="px-5 pb-1 relative z-10">
          <motion.button
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setBriefingOpen(true)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-gray-500 bg-white shadow-card"
          >
            <Sun size={12} style={{ color: primary }} />
            Today&apos;s Briefing
          </motion.button>
        </div>
      )}

      {/* ── Calendar header ── */}
      <div className="px-5 pb-3 relative z-10">
        {/* Notification prompt — visible only until this device is subscribed */}
        <NotificationPromptCard primary={primary} />

        {/* Month navigation */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1">
            <span className="text-lg font-semibold text-gray-700">{format(viewDate, 'MMMM')}</span>
            <span className="ml-1.5 text-sm font-normal text-gray-400">{format(viewDate, 'yyyy')}</span>
          </div>
          <button
            onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            aria-label="Previous month"
            className="w-8 h-8 rounded-full bg-white shadow-card flex items-center justify-center active:scale-90 transition-transform"
          >
            <ChevronLeft size={16} className="text-gray-500" />
          </button>
          <button
            onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            aria-label="Next month"
            className="w-8 h-8 rounded-full bg-white shadow-card flex items-center justify-center active:scale-90 transition-transform"
          >
            <ChevronRight size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1">
          {DOW_LABELS.map((d, i) => (
            <div key={i} className="text-center text-[11px] font-semibold text-gray-400 py-1">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-y-1 mb-1">
          {calendarDays.map((day, i) => {
            const dateStr        = toDateString(day)
            const isCurrentMonth = isSameMonth(day, viewDate)
            const isSelected     = dateStr === selectedDate
            const isTodayDate    = isToday(day)
            const dayEvents      = eventsByDate[dateStr] ?? []

            return (
              <motion.button
                key={i}
                whileTap={{ scale: 0.88 }}
                onClick={() => handleDayTap(dateStr)}
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
                    className={cn('absolute inset-1 rounded-full', isSelected ? 'opacity-100' : 'opacity-20')}
                    style={{ background: primary }}
                  />
                )}
                <span
                  className={cn(
                    'relative z-10 text-sm font-medium transition-colors',
                    !isCurrentMonth && 'text-gray-300',
                    isCurrentMonth && !isSelected && !isTodayDate && 'text-gray-700',
                    isTodayDate && !isSelected && (isSeval ? 'text-seval-600' : 'text-mateo-600'),
                    isSelected && isTodayDate && 'text-white font-bold',
                    isSelected && !isTodayDate && (isSeval ? 'text-seval-700' : 'text-mateo-700'),
                  )}
                >
                  {day.getDate()}
                </span>
                {dayEvents.length > 0 && (
                  <div className="relative z-10 flex gap-0.5 mt-0.5">
                    {dayEvents.slice(0, 3).map(ev => (
                      <div key={ev.id} className={cn('w-1.5 h-1.5 rounded-full', EVENT_COLOR_CLASS[ev.color])} />
                    ))}
                  </div>
                )}
              </motion.button>
            )
          })}
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* ── Unread partner note banner ── */}
        <AnimatePresence>
          {unreadNote && !readingNote && (
            <motion.button
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              onClick={() => setReadingNote(true)}
              className="w-full rounded-2xl px-4 py-3 text-left"
              style={{ background: `${primary}12`, border: `1.5px solid ${primary}30` }}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-base">💌</span>
                <p className="text-xs font-bold" style={{ color: primary }}>
                  Note from {USERS[partnerUser].displayName}
                </p>
              </div>
              <p className="text-xs text-gray-600 line-clamp-1">{unreadNote.content}</p>
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Leave a note compose trigger ── */}
        <button
          onClick={() => setNoteOpen(true)}
          aria-label={`Leave a note for ${USERS[partnerUser].displayName}`}
          className="w-full rounded-2xl px-4 py-3 flex items-center gap-2 transition-opacity active:opacity-60"
          style={{ background: `${primary}08`, border: `1.5px dashed ${primary}30` }}
        >
          <span className="text-base" aria-hidden="true">💌</span>
          <span className="text-xs font-medium" style={{ color: primary }}>
            Leave a note for {USERS[partnerUser].displayName}
          </span>
        </button>

        {/* ── Calendar events for selected date ── */}
        <div>
          <C2SectionLabel as="h2" className="mb-3">
            {selectedDate === getTodayString()
              ? 'Today'
              : format(parseISO(selectedDate), 'EEEE, MMM d')}
          </C2SectionLabel>

          <AnimatePresence mode="popLayout">
            {selectedEvents.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-3 px-1 text-center"
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
                  onClick={() => { setEditingEvent(ev); setModalOpen(true) }}
                  className="w-full text-left rounded-2xl mb-1.5 shadow-card overflow-hidden relative
                             active:scale-[0.98] transition-transform"
                  style={ev.backgroundPhoto ? {
                    backgroundImage: `url(${ev.backgroundPhoto})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  } : {}}
                >
                  {ev.backgroundPhoto && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none" />
                  )}
                  <div className={cn('relative flex gap-3 p-4', !ev.backgroundPhoto && 'bg-white')}>
                    {!ev.backgroundPhoto && (
                      <div className={cn('w-1 rounded-full shrink-0 self-stretch', EVENT_COLOR_CLASS[ev.color])} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={cn('font-semibold text-sm', ev.backgroundPhoto ? 'text-white drop-shadow-sm' : 'text-gray-800')}>
                        {ev.title}
                      </p>
                      {ev.startTime && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock size={11} className={ev.backgroundPhoto ? 'text-white/70' : 'text-gray-400'} />
                          <p className={cn('text-xs', ev.backgroundPhoto ? 'text-white/80' : 'text-gray-400')}>{formatTime(ev.startTime)}</p>
                        </div>
                      )}
                      {ev.notes && (
                        <p className={cn('text-xs mt-1 truncate', ev.backgroundPhoto ? 'text-white/70' : 'text-gray-400')}>{ev.notes}</p>
                      )}
                      {ev.photos && ev.photos.length > 0 && (
                        <p className={cn('text-xs mt-1', ev.backgroundPhoto ? 'text-white/60' : 'text-gray-300')}>
                          📸 {ev.photos.length} photo{ev.photos.length !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 self-center">
                      <div
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={ev.backgroundPhoto
                          ? { background: 'rgba(255,255,255,0.2)', color: 'white' }
                          : { background: ev.createdBy === 'seval' ? '#ede9fe' : '#ccfbf1', color: ev.createdBy === 'seval' ? '#7c3aed' : '#0d9488' }
                        }
                      >
                        {USERS[ev.createdBy].displayName}
                      </div>
                    </div>
                  </div>
                </motion.button>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* ── Search ── */}
        <div className="pt-1">
          <div className="relative mb-3">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search events, plans, dreams, wishes…"
              className="w-full bg-white rounded-2xl shadow-card pl-9 pr-9 py-3 text-sm text-gray-700
                         placeholder:text-gray-300 outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 active:text-gray-600"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <AnimatePresence>
            {isSearching && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="space-y-2"
              >
                {searchResults.length === 0 ? (
                  <div className="bg-white rounded-2xl shadow-card px-4 py-6 text-center">
                    <p className="text-sm text-gray-400">No results for &ldquo;{query}&rdquo;</p>
                    <p className="text-xs text-gray-300 mt-1">Try a different keyword</p>
                  </div>
                ) : (
                  searchResults.map(hit => (
                    <motion.button
                      key={`${hit.typeLabel}-${hit.id}`}
                      whileTap={{ scale: 0.98 }}
                      onClick={hit.onOpen}
                      className="w-full bg-white rounded-2xl shadow-card px-4 py-3 flex items-center gap-3 text-left"
                    >
                      <div
                        className="w-1 h-8 rounded-full shrink-0"
                        style={{ background: hit.hex }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{hit.title}</p>
                        {hit.sub && (
                          <p className="text-xs text-gray-400 truncate">{hit.sub}</p>
                        )}
                      </div>
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wide shrink-0 px-2 py-0.5 rounded-full"
                        style={{ background: `${hit.hex}18`, color: hit.hex }}
                      >
                        {hit.typeLabel}
                      </span>
                    </motion.button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Category Rooms ── */}
        {!isSearching && (
          <div className="pt-1 pb-2">
            <C2SectionLabel className="mb-4">Rooms</C2SectionLabel>
            <div className="space-y-0.5">
              {CATEGORY_DEFS.map((cat, i) => {
                const st = catStats[cat.id]
                return (
                  <motion.button
                    key={cat.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.22, ease: 'easeOut' }}
                    whileTap={{ scale: 0.985 }}
                    onClick={() => cat.id === 'shopping' ? router.push('/shopping') : setOpenCategory(cat.id)}
                    className="w-full rounded-xl px-4 py-3.5 text-left flex items-center gap-3 active:bg-gray-50/60 transition-colors"
                    style={{ borderLeft: `2px solid ${cat.hex}55` }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 leading-tight">{cat.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5 leading-tight">{st.line1}</p>
                    </div>
                    {st.line2 && (
                      <p className="text-[11px] text-gray-400 shrink-0">{st.line2}</p>
                    )}
                    <ChevronRight size={14} className="text-gray-300 shrink-0" />
                  </motion.button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── EventModal — edit existing calendar event ── */}
      <EventModal
        isOpen={modalOpen && !!editingEvent}
        onClose={() => { setModalOpen(false); setEditingEvent(null) }}
        date={selectedDate}
        event={editingEvent}
      />

      {/* ── FullCreateSheet — create new items ── */}
      <FullCreateSheet
        open={modalOpen && !editingEvent}
        onClose={() => setModalOpen(false)}
        primary={primary}
        initialDate={selectedDate}
      />

      {/* ── Category hub sheets (opened from search) ── */}
      <AnimatePresence>
        {openCategory && (
          <CategoryHubSheet
            key={openCategory}
            type={openCategory as 'wishes' | 'dreams' | 'moments' | 'plans'}
            primary={primary}
            currentUser={currentUser}
            onClose={() => setOpenCategory(null)}
            onEditMoment={ev => { setEditingEvent(ev); setModalOpen(true); setOpenCategory(null) }}
          />
        )}
      </AnimatePresence>

      {/* ── AnniversarySheet (opened from search) ── */}
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

      {/* ── Note compose sheet ── */}
      <AnimatePresence>
        {noteOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { if (!noteSent) { setNoteOpen(false); setNoteText('') } }}
              className="fixed inset-0 z-50 c2-backdrop"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              className="fixed bottom-0 left-0 right-0 z-50 c2-sheet-bg rounded-t-[2rem] shadow-modal max-w-lg mx-auto"
            >
              <div className="px-5 pt-4 pb-10">
                <div className="drag-handle" />
                <AnimatePresence mode="wait">
                  {noteSent ? (
                    <motion.div key="sent" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center py-10 text-center">
                      <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: 2, duration: 0.4 }}
                        className="text-5xl mb-4" aria-hidden="true">💌</motion.div>
                      <p className="font-bold text-gray-800 mb-1">Sent with love</p>
                      <p className="text-sm text-gray-400">{USERS[partnerUser].displayName} will see it when they open the app</p>
                    </motion.div>
                  ) : (
                    <motion.div key="compose" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <div className="flex items-center justify-between mb-5">
                        <div>
                          <h3 className="text-base font-bold text-gray-800">Leave a note</h3>
                          <p className="text-xs text-gray-400 mt-0.5">To {USERS[partnerUser].displayName}</p>
                        </div>
                        <button
                          onClick={() => { setNoteOpen(false); setNoteText('') }}
                          aria-label="Close"
                          className="w-8 h-8 flex items-center justify-center rounded-full c2-sheet-x"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="rounded-2xl p-4 mb-4" style={{ background: `${primary}0d` }}>
                        <textarea
                          value={noteText}
                          onChange={e => setNoteText(e.target.value)}
                          placeholder="Write something from the heart..."
                          rows={5}
                          autoFocus
                          className="w-full text-sm text-gray-700 placeholder:text-gray-300 bg-transparent outline-none resize-none leading-relaxed"
                        />
                      </div>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={handleSendNote}
                        disabled={!noteText.trim()}
                        className="w-full py-4 rounded-2xl text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                        style={{ background: primary }}
                      >
                        <Send size={15} /> Send with love
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Daily Briefing ── */}
      <DailyBriefingSheet
        open={briefingOpen}
        onClose={() => setBriefingOpen(false)}
        onItemPress={handleBriefingItem}
      />

      {/* ── Read note modal ── */}
      <AnimatePresence>
        {readingNote && unreadNote && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { markRead(unreadNote.id); setReadingNote(false) }}
            className="fixed inset-0 z-50 c2-backdrop flex items-center justify-center p-8"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl p-7 w-full max-w-sm shadow-modal"
            >
              <div className="text-center mb-5">
                <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: 2, duration: 0.5 }}
                  className="text-4xl mb-2">💌</motion.div>
                <p className="text-xs font-bold text-gray-400">From {USERS[partnerUser].emoji} {USERS[partnerUser].displayName}</p>
              </div>
              <p className="text-gray-700 text-sm leading-relaxed text-center mb-6">{unreadNote.content}</p>
              <button
                onClick={() => { markRead(unreadNote.id); setReadingNote(false) }}
                className="w-full py-3 rounded-2xl text-white text-sm font-semibold"
                style={{ background: primary }}
              >
                Close with love
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
