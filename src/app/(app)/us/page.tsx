'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  format, parseISO,
  differenceInCalendarDays, differenceInYears, differenceInMonths, differenceInDays,
  addYears, addMonths, startOfDay,
} from 'date-fns'
import {
  Plus, X, Trash2, Check, Camera, LogOut, Pencil, Heart,
  type LucideIcon,
  UserRound, Smile, Moon, CloudRain, Flame, Leaf,
  Gem, CakeSlice, PartyPopper, Waves, TreePine, Drama, Flower2, Star, Sun, Plane,
} from '@/design/iconSystem'
import { SeMaRoomHeader } from '@/components/ui/SeMaRoomHeader'
import { C2_ROOM_HEADERS } from '@/lib/c2RoomHeaders'
import { getLivingMoment } from '@/lib/livingMoment'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store/useAppStore'
import { logout } from '@/lib/logout'
import { toast } from '@/store/useToastStore'
import { NotificationSetup } from '@/components/NotificationSetup'
import { useLightboxStore } from '@/store/useLightboxStore'
import { AnniversarySheet } from '@/components/ui/AnniversarySheet'
import { DatePicker } from '@/components/ui/DatePicker'
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet'
import { C2PageBackground } from '@/components/ui/C2PageBackground'
import { C2SectionLabel } from '@/components/ui/C2SectionLabel'
import {
  USERS, OTHER_USER,
  type Memory, type Countdown, type MoodType, type UserName,
} from '@/types'
import { MOOD_CONFIG, getTodayString, cn } from '@/lib/utils'

/* ── Constants ─────────────────────────────────────────────────────────────── */
const RELATIONSHIP_START = new Date('2025-03-05T21:00:00')

const MILESTONE_OPTIONS: { key: string; icon: LucideIcon; label: string }[] = [
  { key: 'heart',  icon: Heart,        label: 'Heart'     },
  { key: 'gem',    icon: Gem,          label: 'Ring'      },
  { key: 'cake',   icon: CakeSlice,    label: 'Birthday'  },
  { key: 'star',   icon: Star,         label: 'Star'      },
  { key: 'party',  icon: PartyPopper,  label: 'Party'     },
  { key: 'plane',  icon: Plane,        label: 'Travel'    },
  { key: 'flower', icon: Flower2,      label: 'Flower'    },
  { key: 'waves',  icon: Waves,        label: 'Beach'     },
  { key: 'sun',    icon: Sun,          label: 'Sun'       },
  { key: 'tree',   icon: TreePine,     label: 'Christmas' },
  { key: 'drama',  icon: Drama,        label: 'Theatre'   },
]

// Maps legacy emoji strings stored in Countdown.emoji → semantic key
const EMOJI_TO_KEY: Record<string, string> = {
  '💕': 'heart', '💍': 'gem', '🎂': 'cake', '🌟': 'star', '🎉': 'party',
  '✈️': 'plane', '🌸': 'flower', '🌊': 'waves', '🏖️': 'waves',
  '🎊': 'party', '🎄': 'tree', '🎭': 'drama',
}

function getMilestoneIcon(iconKey: string): LucideIcon {
  const resolved = EMOJI_TO_KEY[iconKey] ?? iconKey
  return MILESTONE_OPTIONS.find(o => o.key === resolved)?.icon ?? Heart
}

const MOOD_ICONS: Record<string, LucideIcon> = {
  happy: Smile, relaxed: Leaf, tired: Moon, sad: CloudRain, stressed: Flame,
}
/* ── Helpers ───────────────────────────────────────────────────────────────── */
function calcDuration() {
  const now    = new Date()
  const years  = differenceInYears(now, RELATIONSHIP_START)
  const after1 = addYears(RELATIONSHIP_START, years)
  const months = differenceInMonths(now, after1)
  const after2 = addMonths(after1, months)
  const days   = differenceInDays(now, after2)
  const rem    = Math.floor((now.getTime() - after2.getTime() - days * 86400000) / 1000)
  const hours  = Math.floor(rem / 3600)
  const mins   = Math.floor((rem % 3600) / 60)
  const secs   = rem % 60
  return { years, months, days, hours, mins, secs }
}

async function resizeImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const max   = 800
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w     = Math.round(img.width * scale)
        const h     = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = e.target!.result as string
    }
    reader.readAsDataURL(file)
  })
}

/* ── FloatingHeart ─────────────────────────────────────────────────────────── */
function FloatingHeart({ x, delay, primary }: { x: number; delay: number; primary: string }) {
  return (
    <motion.span
      className="absolute pointer-events-none text-lg select-none"
      style={{ left: `${x}%`, bottom: '10%', color: primary }}
      initial={{ opacity: 0.9, y: 0, scale: 0.7 }}
      animate={{ opacity: 0, y: -80, scale: 1.1 }}
      transition={{ duration: 1.4, delay, ease: 'easeOut' }}
    >
      💕
    </motion.span>
  )
}

/* ── RelationshipHero ──────────────────────────────────────────────────────── */
function RelationshipHero({ primary }: { primary: string }) {
  const prefersReduced = useReducedMotion()
  const [mounted, setMounted]  = useState(false)
  const [dur,     setDur]      = useState(calcDuration)
  const [hearts,  setHearts]   = useState<{ id: number; x: number; delay: number }[]>([])
  const [pulse,   setPulse]    = useState(false)
  const heartId = useRef(0)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const id = setInterval(() => setDur(calcDuration()), 1000)
    return () => clearInterval(id)
  }, [])

  function handleTap() {
    if (prefersReduced) return
    setPulse(true)
    setTimeout(() => setPulse(false), 600)
    const newHearts = Array.from({ length: 5 }, (_, i) => ({
      id: heartId.current++, x: 15 + i * 17, delay: i * 0.08,
    }))
    setHearts(h => [...h, ...newHearts])
    setTimeout(() => setHearts(h => h.slice(5)), 1800)
  }

  const pad = (n: number) => String(n).padStart(2, '0')

  if (!mounted) return (
    <div className="rounded-3xl h-44 mb-2 animate-pulse"
      style={{ background: `${primary}08`, border: `1px solid ${primary}15` }} />
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      onClick={handleTap}
      className="relative overflow-hidden rounded-3xl cursor-pointer select-none"
      style={{
        background: 'rgba(255,255,255,0.72)',
        border: '1px solid rgba(45,41,38,0.07)',
        boxShadow: '0 2px 16px rgba(45,41,38,0.06)',
      }}
    >
      <div className="px-5 pt-5 pb-4 relative z-10">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-medium tracking-widest uppercase" style={{ color: '#9B9590' }}>
            Seval &amp; Mateo
          </span>
          <div className="flex-1 h-px" style={{ background: 'rgba(45,41,38,0.07)' }} />
          <motion.span
            animate={pulse && !prefersReduced ? { scale: [1, 1.5, 1] } : {}}
            transition={{ duration: 0.5 }}
            className="text-sm"
          >
            ♾️
          </motion.span>
        </div>
        <p className="text-[11px] text-gray-400 mb-0.5">Our story began</p>
        <p className="text-base font-bold text-gray-800 mb-1">March 5, 2025 · 9:00 PM</p>
        <p className="text-[11px] text-gray-400 italic mb-4 leading-snug">
          Every second since then has been part of us.
        </p>
        <div className="flex items-end gap-3 mb-3">
          {[
            { value: dur.years,  label: dur.years  === 1 ? 'year'  : 'years'  },
            { value: dur.months, label: dur.months === 1 ? 'month' : 'months' },
            { value: dur.days,   label: dur.days   === 1 ? 'day'   : 'days'   },
          ].map(({ value, label }) => (
            <div key={label} className="flex-1 text-center">
              <div className="rounded-2xl py-3" style={{ background: 'rgba(45,41,38,0.04)' }}>
                <motion.p
                  key={value}
                  initial={prefersReduced ? {} : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 30 }}
                  className="text-2xl font-bold tabular-nums leading-none"
                  style={{ color: '#2D2926' }}
                >
                  {value}
                </motion.p>
              </div>
              <p className="text-[10px] text-gray-400 mt-1 font-medium">{label}</p>
            </div>
          ))}
        </div>
        <div
          className="flex items-center justify-center gap-0.5 rounded-2xl py-2 px-4"
          style={{ background: 'rgba(45,41,38,0.03)' }}
        >
          {[
            { value: pad(dur.hours), label: 'h' },
            { value: pad(dur.mins),  label: 'm' },
            { value: pad(dur.secs),  label: 's' },
          ].map(({ value, label }, i) => (
            <span key={label} className="flex items-baseline gap-0.5">
              {i > 0 && <span className="text-gray-300 text-xs mx-1">·</span>}
              <motion.span
                key={value}
                initial={prefersReduced ? {} : { opacity: 0.4, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.15 }}
                className="text-sm font-bold tabular-nums"
                style={{ color: '#6B6458' }}
              >
                {value}
              </motion.span>
              <span className="text-[10px] text-gray-400">{label}</span>
            </span>
          ))}
        </div>
      </div>
      <AnimatePresence>
        {hearts.map(h => (
          <FloatingHeart key={h.id} x={h.x} delay={h.delay} primary={primary} />
        ))}
      </AnimatePresence>
    </motion.div>
  )
}

/* ── MemorySheet ───────────────────────────────────────────────────────────── */
function MemorySheet({
  memory, categories, primary, onClose, onSave, onDelete,
}: {
  memory: Memory | null
  categories: string[]
  primary: string
  onClose: () => void
  onSave: (data: Partial<Memory>) => void
  onDelete?: () => void
}) {
  const openLightbox = useLightboxStore(s => s.open)
  const openOverlay  = useAppStore(s => s.openOverlay)
  const closeOverlay = useAppStore(s => s.closeOverlay)

  useEffect(() => {
    openOverlay()
    return () => closeOverlay()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [title,      setTitle]      = useState(memory?.title ?? '')
  const [date,       setDate]       = useState(memory?.date ?? getTodayString())
  const [notes,      setNotes]      = useState(memory?.notes ?? '')
  const [category,   setCategory]   = useState(memory?.category ?? '')
  const [newCat,     setNewCat]     = useState('')
  const [addingCat,  setAddingCat]  = useState(false)
  const [checklist,  setChecklist]  = useState<string[]>(memory?.checklist ?? [])
  const [newItem,    setNewItem]    = useState('')
  const [photos,     setPhotos]     = useState<string[]>(memory?.photos ?? [])
  const [processing, setProcessing] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)
  const isEdit   = !!memory

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setProcessing(true)
    const base64 = await resizeImage(file)
    setPhotos(p => [...p, base64])
    setProcessing(false)
  }

  function addCheckItem() {
    if (!newItem.trim()) return
    setChecklist(c => [...c, newItem.trim()])
    setNewItem('')
  }

  function handleSave() {
    if (!title.trim() || !date) return
    onSave({
      title:     title.trim(),
      date,
      notes:     notes.trim() || undefined,
      photos:    photos.length   ? photos    : undefined,
      category:  category.trim() || undefined,
      checklist: checklist.length ? checklist : undefined,
    })
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 c2-backdrop"
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 360 }}
        className="fixed bottom-0 left-0 right-0 z-50 c2-sheet-bg rounded-t-[2rem] shadow-modal max-w-lg mx-auto flex flex-col"
        style={{ maxHeight: 'calc(100dvh - 48px)' }}
      >
        {/* Non-scrolling header */}
        <div className="px-5 pt-4 shrink-0">
          <div className="drag-handle mb-4" />

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-800">
              {isEdit ? 'Edit Memory' : 'New Memory'}
            </h3>
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-full c2-sheet-x">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable form content */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-4">
          {/* Title */}
          <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Title</p>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What happened?"
              autoFocus={!isEdit}
              className="w-full text-sm text-gray-800 bg-transparent outline-none"
            />
          </div>

          {/* Date */}
          <div className="mb-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1">Date</p>
            <DatePicker value={date} onChange={setDate} accentColor={primary} />
          </div>

          {/* Category */}
          <div className="mb-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Category</p>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(category === cat ? '' : cat)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                    category === cat ? 'text-white' : 'bg-gray-100 text-gray-600'
                  )}
                  style={category === cat ? { background: primary } : {}}
                >
                  {cat}
                </button>
              ))}
              {addingCat ? (
                <div className="flex items-center gap-1">
                  <input
                    value={newCat}
                    onChange={e => setNewCat(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newCat.trim()) {
                        setCategory(newCat.trim()); setNewCat(''); setAddingCat(false)
                      }
                      if (e.key === 'Escape') { setNewCat(''); setAddingCat(false) }
                    }}
                    placeholder="New category…"
                    autoFocus
                    className="text-xs bg-gray-50 rounded-full px-3 py-1.5 outline-none w-32 border"
                    style={{ borderColor: `${primary}40` }}
                  />
                  <button
                    onClick={() => {
                      if (newCat.trim()) { setCategory(newCat.trim()); setNewCat('') }
                      setAddingCat(false)
                    }}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs"
                    style={{ background: primary }}
                  >
                    ✓
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingCat(true)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400 flex items-center gap-1"
                >
                  <Plus size={10} /> New
                </button>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Tell the story…"
              rows={3}
              className="w-full text-sm text-gray-700 placeholder:text-gray-300 bg-transparent outline-none resize-none"
            />
          </div>

          {/* Checklist */}
          <div className="mb-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Checklist</p>
            {checklist.map((item, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-100">
                <div className="w-4 h-4 rounded-full border-2 shrink-0" style={{ borderColor: primary }} />
                <span className="flex-1 text-sm text-gray-700">{item}</span>
                <button onClick={() => setChecklist(c => c.filter((_, idx) => idx !== i))} className="text-gray-300 active:text-red-400">
                  <X size={13} />
                </button>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <input
                value={newItem}
                onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCheckItem() } }}
                placeholder="Add item…"
                className="flex-1 text-sm text-gray-700 placeholder:text-gray-300 bg-gray-50 rounded-xl px-3 py-2 outline-none"
              />
              <button
                onClick={addCheckItem}
                disabled={!newItem.trim()}
                className="w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-30 text-white"
                style={{ background: primary }}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Photos */}
          <div className="mb-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Photos</p>
              <button
                onClick={() => photoRef.current?.click()}
                disabled={processing}
                className="flex items-center gap-1 text-xs font-semibold disabled:opacity-40"
                style={{ color: primary }}
              >
                <Camera size={12} /> {processing ? 'Processing…' : 'Add photo'}
              </button>
            </div>
            <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            {photos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {photos.map((src, i) => (
                  <div key={i} className="relative shrink-0">
                    <img src={src} alt="" className="w-24 h-24 object-cover rounded-2xl cursor-pointer"
                      onClick={() => openLightbox(photos, i)} />
                    <button
                      onClick={() => setPhotos(p => p.filter((_, idx) => idx !== i))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pinned action footer */}
        <div className="shrink-0 px-5 pt-3 border-t border-gray-50 pb-sheet-footer">
          <div className="flex gap-2">
            {isEdit && onDelete && (
              <button
                onClick={() => setConfirmDel(true)}
                className="w-12 h-12 flex items-center justify-center rounded-2xl bg-red-50 text-red-400 shrink-0"
              >
                <Trash2 size={16} />
              </button>
            )}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSave}
              disabled={!title.trim() || !date}
              className="flex-1 py-3.5 rounded-2xl text-white text-sm font-semibold disabled:opacity-40"
              style={{ background: primary }}
            >
              {isEdit ? 'Save Changes' : 'Add Memory'}
            </motion.button>
          </div>
        </div>
      </motion.div>

      <DeleteConfirmSheet
        open={confirmDel}
        title="Delete this memory?"
        message="This memory will be permanently removed from your story."
        onCancel={() => setConfirmDel(false)}
        onConfirm={() => { onDelete!(); setConfirmDel(false) }}
      />
    </>
  )
}


/* ── Mood types ────────────────────────────────────────────────────────────── */
const MOOD_TYPES = Object.entries(MOOD_CONFIG) as [
  keyof typeof MOOD_CONFIG,
  { emoji: string; label: string }
][]

/* ── Page ──────────────────────────────────────────────────────────────────── */
export default function UsPage() {
  const router          = useRouter()
  const currentUser     = useAppStore(s => s.currentUser)!
  const setCurrentUser  = useAppStore(s => s.setCurrentUser)
  const getMood         = useAppStore(s => s.getMoodForUser)
  const setMood         = useAppStore(s => s.setMood)
  const countdowns      = useAppStore(s => s.countdowns)
  const addCountdown    = useAppStore(s => s.addCountdown)
  const deleteCountdown = useAppStore(s => s.deleteCountdown)
  const events          = useAppStore(s => s.events)
  const shoppingLists   = useAppStore(s => s.shoppingLists)
  const todos           = useAppStore(s => s.todos)
  const partnerNotes    = useAppStore(s => s.partnerNotes)
  const memories        = useAppStore(s => s.memories)
  const addMemory       = useAppStore(s => s.addMemory)
  const updateMemory    = useAppStore(s => s.updateMemory)
  const deleteMemory    = useAppStore(s => s.deleteMemory)
  const boomBoomCount     = useAppStore(s => s.boomBoomCount)
  const incrementBoomBoom = useAppStore(s => s.incrementBoomBoom)
  const setBoomBoom       = useAppStore(s => s.setBoomBoom)
  const goals             = useAppStore(s => s.goals)
  const loveNotes         = useAppStore(s => s.loveNotes)
  const openOverlay       = useAppStore(s => s.openOverlay)
  const closeOverlay      = useAppStore(s => s.closeOverlay)

  const partnerUser = OTHER_USER[currentUser]
  const isSeval     = currentUser === 'seval'
  const primary     = isSeval ? '#8b5cf6' : '#14b8a6'
  const today       = new Date()
  const todayStr    = getTodayString()

  const living = useMemo(() => getLivingMoment({
    events, countdowns, shoppingLists, todos, partnerNotes, currentUser,
    today: todayStr,
  }), [events, countdowns, shoppingLists, todos, partnerNotes, currentUser, todayStr])

  // Mood state
  const myMood = getMood(currentUser)
  const [moodVisible, setMoodVisible] = useState(false)
  const [moodPopup,   setMoodPopup]   = useState(false)
  const [pendingMood, setPendingMood] = useState<MoodType | null>(null)
  const [moodMessage, setMoodMessage] = useState('')

  function openMoodPopup(mood: MoodType) {
    setPendingMood(mood)
    setMoodMessage(myMood?.note ?? '')
    setMoodPopup(true)
  }
  function saveMood() {
    if (!pendingMood) return
    setMood(pendingMood, moodMessage.trim() || undefined)
    setMoodPopup(false); setMoodVisible(false); setPendingMood(null); setMoodMessage('')
  }

  // Memory sheet state
  const [memorySheet, setMemorySheet] = useState<Memory | 'new' | null>(null)
  const openLightbox = useLightboxStore(s => s.open)

  // Swipe detection for Memory Highlights horizontal scroll
  const highlightDragX      = useRef(0)
  const highlightScrolling  = useRef(false)

  // Countdown state
  const [selectedCountdown, setSelectedCountdown] = useState<Countdown | null>(null)
  const [addCdOpen,  setAddCdOpen]  = useState(false)
  const [newCdTitle, setNewCdTitle] = useState('')
  const [newCdDate,  setNewCdDate]  = useState('')
  const [newCdIconKey, setNewCdIconKey] = useState('heart')

  // Boom Boom sheet + toast
  const [boomBoomSheet,  setBoomBoomSheet]  = useState(false)
  const [boomBoomToast,  setBoomBoomToast]  = useState(false)
  const [boomBoomUndo,   setBoomBoomUndo]   = useState(0)   // previous value for undo
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hide FAB while any inline sheet is open (MemorySheet and AnniversarySheet handle themselves)
  const anyInlineSheetOpen = boomBoomSheet || moodPopup || addCdOpen
  useEffect(() => {
    if (!anyInlineSheetOpen) return
    openOverlay()
    return () => closeOverlay()
  }, [anyInlineSheetOpen, openOverlay, closeOverlay])

  function handleBoomBoom(delta: 1 | -1) {
    const prev = boomBoomCount
    setBoomBoom(boomBoomCount + delta)
    setBoomBoomSheet(false)
    setBoomBoomUndo(prev)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setBoomBoomToast(true)
    toastTimerRef.current = setTimeout(() => setBoomBoomToast(false), 5000)
  }

  function handleBoomBoomUndo() {
    setBoomBoom(boomBoomUndo)
    setBoomBoomToast(false)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }

  // Computed — show all milestones (future + past), newest/soonest first
  const sortedCountdowns = countdowns
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))

  const sortedMemories = useMemo(
    () => [...memories].sort((a, b) => b.date.localeCompare(a.date)),
    [memories]
  )
  const memoriesWithPhotos = useMemo(
    () => sortedMemories.filter(m => m.photos?.length),
    [sortedMemories]
  )
  const categories = useMemo(
    () => Array.from(new Set(memories.map(m => m.category).filter((c): c is string => !!c))),
    [memories]
  )

  // daysTotal is unused — kept as internal reference only
  // const daysTotal = differenceInCalendarDays(today, RELATIONSHIP_START)

  function handleAddCountdown() {
    if (!newCdTitle.trim() || !newCdDate) return
    addCountdown(newCdTitle.trim(), newCdDate, newCdIconKey)
    setNewCdTitle(''); setNewCdDate(''); setNewCdIconKey('heart'); setAddCdOpen(false)
  }

  return (
    <div className="min-h-screen pb-36 relative z-0">

      <C2PageBackground />

      <SeMaRoomHeader
        eyebrow="Our space"
        title="Us"
        subtitle={living.usSubtitle || 'Our story, our space'}
        imageSrc={C2_ROOM_HEADERS.us.src}
        imageObjectPosition={C2_ROOM_HEADERS.us.imageObjectPosition}
        action={
          <div style={{ marginTop: 7, marginRight: 6 }}>
            <button
              onClick={async () => {
                try { await logout(); router.replace('/') }
                catch (error) { toast.error(error instanceof Error ? error.message : 'Could not sign out.') }
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-gray-500 bg-white/50 active:bg-white/70"
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        }
      />

      <div className="px-5 pt-4 space-y-8">

        {/* ── 1. Relationship Hero ── */}
        <RelationshipHero primary={primary} />

        {/* ── 2. Mood ── */}
        <section>
          <C2SectionLabel as="h2" className="mb-4">How we feel today</C2SectionLabel>

          <motion.button
            whileTap={{ scale: 0.985 }}
            onClick={() => setMoodVisible(v => !v)}
            className="c2-card-muted w-full text-left overflow-hidden mb-3"
          >
            <div className="grid grid-cols-2 gap-2 p-3">
              {([currentUser, partnerUser] as UserName[]).map(uid => {
                const u    = USERS[uid]
                const mood = getMood(uid)
                const isMe = uid === currentUser
                return (
                  <div key={uid} className="rounded-xl p-4 text-center" style={{ background: 'rgba(45,41,38,0.03)' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-1"
                      style={{ background: 'rgba(158,201,179,0.18)', color: '#7BBBA5' }}>
                      <UserRound size={16} strokeWidth={1.75} />
                    </div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">{isMe ? 'You' : u.displayName}</p>
                    {mood ? (
                      <div>
                        {(() => { const MIcon = MOOD_ICONS[mood.mood] ?? Smile; return <MIcon size={22} className="mx-auto" style={{ color: '#9B9590' }} /> })()}
                        <p className="text-xs text-gray-500 mt-1">{MOOD_CONFIG[mood.mood].label}</p>
                        {mood.note && (
                          <p className="text-[10px] text-gray-400 italic mt-1 leading-snug line-clamp-2">
                            &ldquo;{mood.note}&rdquo;
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-300 italic">not set yet</p>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-center gap-1 pb-3">
              <Pencil size={11} className="text-gray-400" />
              <span className="text-[11px] text-gray-500 font-medium">Tap to update your mood</span>
            </div>
          </motion.button>

          <AnimatePresence>
            {moodVisible && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="flex gap-2 flex-wrap mb-2"
              >
                {MOOD_TYPES.map(([type, cfg]) => (
                  <motion.button
                    key={type}
                    whileTap={{ scale: 0.88 }}
                    onClick={() => openMoodPopup(type)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all',
                      myMood?.mood === type ? 'text-white shadow-sm' : 'text-gray-600'
                    )}
                    style={myMood?.mood === type ? { background: primary } : {}}
                  >
                    {(() => { const MIcon = MOOD_ICONS[type] ?? Smile; return <MIcon size={15} strokeWidth={1.75} /> })()}
                    {cfg.label}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ── 3. Milestones & Anniversaries ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-medium uppercase tracking-widest" style={{ color: '#9B9590' }}>Milestones & Anniversaries</h2>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => setAddCdOpen(true)}
              className="flex items-center gap-1 text-xs font-semibold rounded-full px-3 py-1.5 text-white"
              style={{ background: primary }}
            >
              <Plus size={12} strokeWidth={2.5} /> Add
            </motion.button>
          </div>

          {sortedCountdowns.length === 0 ? (
            <button
              onClick={() => setAddCdOpen(true)}
              className="w-full rounded-2xl py-8 text-center"
              style={{ border: '1.5px dashed rgba(45,41,38,0.10)', background: 'rgba(255,255,255,0.5)' }}
            >
              <Heart size={24} className="mx-auto mb-2" style={{ color: '#c8cfbf' }} />
              <p className="text-sm" style={{ color: '#a8b0a0' }}>Add your first milestone or anniversary</p>
            </button>
          ) : (
            <div className="space-y-2">
              {sortedCountdowns.map(c => {
                // Two-step anchor:
                //   1. parseISO(date + 'T12:00:00') — noon local time prevents the
                //      "midnight UTC → previous calendar day" shift in UTC+ timezones.
                //   2. startOfDay(...)              — normalise to midnight so
                //      differenceInYears/Months doesn't count partial days as < 1 unit.
                const milestoneDate = startOfDay(parseISO(c.date + 'T12:00:00'))
                const todayStart    = startOfDay(today)
                const isFuture = milestoneDate > todayStart
                let label: string
                if (isFuture) {
                  const daysUntil = differenceInCalendarDays(milestoneDate, todayStart)
                  label = `in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`
                } else {
                  const years  = differenceInYears(todayStart, milestoneDate)
                  const afterY = addYears(milestoneDate, years)
                  const months = differenceInMonths(todayStart, afterY)
                  const afterM = addMonths(afterY, months)
                  const days   = differenceInCalendarDays(todayStart, afterM)
                  label = years >= 1
                    ? `${years} year${years !== 1 ? 's' : ''} together`
                    : months >= 1
                    ? `${months} month${months !== 1 ? 's' : ''} together`
                    : days === 0
                    ? 'today'
                    : `${days} day${days !== 1 ? 's' : ''} together`
                }

                return (
                  <motion.button
                    key={c.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelectedCountdown(c)}
                    className="c2-card w-full px-4 py-4 flex items-center gap-3 text-left relative overflow-hidden"
                  >
                    <div
                      className="absolute right-0 top-0 w-24 h-full opacity-10 pointer-events-none"
                      style={{ background: `radial-gradient(circle at right, ${primary}, transparent)` }}
                    />
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ background: `${primary}18` }}
                    >
                      {(() => { const MIcon = getMilestoneIcon(c.emoji); return <MIcon size={18} strokeWidth={1.75} style={{ color: primary }} /> })()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{c.title}</p>
                      <p className="text-xs font-medium mt-0.5" style={{ color: primary }}>{label}</p>
                      {c.romanticMessage && (
                        <p className="text-[11px] text-gray-400 italic mt-0.5 truncate">
                          &ldquo;{c.romanticMessage}&rdquo;
                        </p>
                      )}
                    </div>
                    <span className="text-gray-300 text-base shrink-0">›</span>
                  </motion.button>
                )
              })}
            </div>
          )}
        </section>

        {/* ── 5. Timeline ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <C2SectionLabel as="h2">Timeline</C2SectionLabel>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => setMemorySheet('new')}
              className="flex items-center gap-1 text-xs font-semibold rounded-full px-3 py-1.5 text-white"
              style={{ background: primary }}
            >
              <Plus size={12} strokeWidth={2.5} /> Add
            </motion.button>
          </div>

          {sortedMemories.length === 0 ? (
            <button
              onClick={() => setMemorySheet('new')}
              className="w-full rounded-2xl py-10 text-center"
              style={{ border: '1.5px dashed rgba(45,41,38,0.10)', background: 'rgba(255,255,255,0.5)' }}
            >
              <Heart size={28} className="mx-auto mb-2" style={{ color: '#c8cfbf' }} />
              <p className="text-sm" style={{ color: '#a8b0a0' }}>Start your story — add your first memory</p>
            </button>
          ) : (
            <div className="relative pl-10">
              {/* Vertical line */}
              <div className="absolute left-[19px] top-2 bottom-2 w-px bg-gray-200" />

              <div className="space-y-4">
                {sortedMemories.map((memory, idx) => {
                  const prevMem  = sortedMemories[idx - 1]
                  const showMonth = !prevMem || prevMem.date.slice(0, 7) !== memory.date.slice(0, 7)
                  return (
                    <div key={memory.id}>
                      {showMonth && (
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 -ml-10 pl-10">
                          {format(parseISO(memory.date + 'T12:00:00'), 'MMMM yyyy')}
                        </p>
                      )}
                      <div className="relative">
                        {/* Dot */}
                        <div
                          className="absolute -left-[29px] top-3.5 w-3 h-3 rounded-full z-10"
                          style={{ background: primary }}
                        />
                        <motion.button
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setMemorySheet(memory)}
                          className="c2-card w-full overflow-hidden text-left"
                        >
                          {memory.photos && memory.photos.length > 0 && (
                            <img
                              src={memory.photos[0]}
                              alt=""
                              className="w-full h-36 object-cover cursor-pointer"
                              onClick={e => { e.stopPropagation(); openLightbox(memory.photos!) }}
                            />
                          )}
                          <div className="p-3">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-[10px] text-gray-400">
                                {format(parseISO(memory.date + 'T12:00:00'), 'MMM d')}
                              </span>
                              {memory.category && (
                                <span
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                  style={{ background: `${primary}15`, color: primary }}
                                >
                                  {memory.category}
                                </span>
                              )}
                            </div>
                            <p className="font-semibold text-gray-800 text-sm">{memory.title}</p>
                            {memory.notes && (
                              <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                                {memory.notes}
                              </p>
                            )}
                            {memory.checklist && memory.checklist.length > 0 && (
                              <p className="text-[10px] text-gray-400 mt-1">
                                {memory.checklist.length} checklist item{memory.checklist.length !== 1 ? 's' : ''}
                              </p>
                            )}
                            {memory.photos && memory.photos.length > 1 && (
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                +{memory.photos.length - 1} more photo{memory.photos.length > 2 ? 's' : ''}
                              </p>
                            )}
                          </div>
                        </motion.button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {/* ── 6. Memory Highlights ── */}
        {memoriesWithPhotos.length > 0 && (
          <section>
            <C2SectionLabel as="h2" className="mb-3">Memory Highlights</C2SectionLabel>
            <div
              className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-5 px-5"
              onPointerDown={e => { highlightDragX.current = e.clientX; highlightScrolling.current = false }}
              onPointerMove={e => { if (Math.abs(e.clientX - highlightDragX.current) > 6) highlightScrolling.current = true }}
            >
              {memoriesWithPhotos.map(m => (
                <button
                  key={m.id}
                  onClick={() => { if (!highlightScrolling.current) openLightbox(m.photos!) }}
                  className="shrink-0 relative rounded-2xl overflow-hidden text-left active:opacity-90"
                  style={{ width: 140, height: 180 }}
                >
                  <img src={m.photos![0]} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <p className="text-white text-xs font-semibold leading-tight line-clamp-2">{m.title}</p>
                    <p className="text-white/60 text-[10px] mt-0.5">
                      {format(parseISO(m.date + 'T12:00:00'), 'MMM d, yyyy')}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── 7. Relationship Stats ── */}
        <section className="pb-8">
          <C2SectionLabel as="h2" className="mb-3">Relationship Stats</C2SectionLabel>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="c2-card p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: primary }}>{sortedCountdowns.length}</p>
              <p className="text-[10px] mt-1" style={{ color: '#a8b0a0' }}>milestones</p>
            </div>
            <div className="c2-card p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: primary }}>{loveNotes.length}</p>
              <p className="text-[10px] mt-1" style={{ color: '#a8b0a0' }}>love notes</p>
            </div>
            <div className="c2-card p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: primary }}>
                {goals.filter(g => g.categoryId === 'travel').length}
              </p>
              <p className="text-[10px] mt-1" style={{ color: '#a8b0a0' }}>trips</p>
            </div>
            <div className="c2-card p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: primary }}>
                {goals.filter(g => g.isCompleted).length}
              </p>
              <p className="text-[10px] mt-1" style={{ color: '#a8b0a0' }}>dreams achieved</p>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setBoomBoomSheet(true)}
            className="c2-card w-full p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                style={{ background: `${primary}12` }}>
                <Heart size={18} style={{ color: primary }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: '#1a1f18' }}>Boom Boom</p>
            </div>
            <p className="text-2xl font-bold" style={{ color: primary }}>{boomBoomCount}</p>
          </motion.button>

          {/* Closing copy */}
          <div className="flex items-center justify-center gap-2 mt-6" style={{ color: '#c8cfbf' }}>
            <Heart size={11} style={{ color: primary, opacity: 0.4 }} />
            <p className="text-xs italic">Every day a little more.</p>
            <Heart size={11} style={{ color: primary, opacity: 0.4 }} />
          </div>
        </section>

        {/* ── 8. Notifications ── */}
        <section className="pb-8">
          <C2SectionLabel as="h2" className="mb-3">Notifications</C2SectionLabel>
          <NotificationSetup primary={primary} />
        </section>

      </div>

      {/* ── Boom Boom Sheet ── */}
      <AnimatePresence>
        {boomBoomSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setBoomBoomSheet(false)}
              className="fixed inset-0 z-50 c2-backdrop"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              className="fixed bottom-0 left-0 right-0 z-50 c2-sheet-bg rounded-t-[2rem] shadow-modal max-w-lg mx-auto"
            >
              <div className="px-5 pt-4 pb-sheet-footer">
                <div className="drag-handle mb-5" />
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-1"
                    style={{ background: `${primary}18`, color: primary }}>
                    <Heart size={28} strokeWidth={1.5} />
                  </div>
                  <h3 className="text-base font-bold text-gray-800 mt-2">Boom Boom</h3>
                  <p className="text-sm text-gray-400 mt-1">Current count: <span className="font-bold text-gray-700">{boomBoomCount}</span></p>
                </div>
                <div className="flex gap-3 mb-4">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleBoomBoom(-1)}
                    disabled={boomBoomCount <= 0}
                    className="flex-1 py-4 rounded-2xl bg-gray-100 text-gray-700 text-xl font-bold disabled:opacity-30"
                  >
                    −1
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleBoomBoom(1)}
                    className="flex-1 py-4 rounded-2xl text-white text-xl font-bold"
                    style={{ background: primary }}
                  >
                    +1
                  </motion.button>
                </div>
                <button
                  onClick={() => setBoomBoomSheet(false)}
                  className="w-full py-3.5 rounded-2xl bg-gray-50 text-gray-500 text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Boom Boom Toast ── */}
      <AnimatePresence>
        {boomBoomToast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-3 bg-gray-800 text-white rounded-2xl shadow-lg whitespace-nowrap"
          >
            <span className="text-sm">Boom Boom updated ❤️</span>
            <button
              onClick={handleBoomBoomUndo}
              className="text-xs font-bold text-amber-300 active:opacity-70"
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mood popup ── */}
      <AnimatePresence>
        {moodPopup && pendingMood && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMoodPopup(false)}
              className="fixed inset-0 z-50 c2-backdrop"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              className="fixed bottom-0 left-0 right-0 z-50 c2-sheet-bg rounded-t-[2rem] shadow-modal max-w-lg mx-auto"
            >
              <div className="px-5 pt-4 pb-sheet-footer">
                <div className="drag-handle" />
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-bold text-gray-800">How are you feeling?</h3>
                  <button
                    onClick={() => setMoodPopup(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-full c2-sheet-x"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="flex justify-around mb-6">
                  {MOOD_TYPES.map(([type, cfg]) => (
                    <motion.button
                      key={type}
                      whileTap={{ scale: 0.88 }}
                      onClick={() => setPendingMood(type)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-2xl transition-all',
                        pendingMood === type ? 'shadow-sm' : ''
                      )}
                      style={pendingMood === type ? { background: `${primary}18` } : {}}
                    >
                      {(() => { const MIcon = MOOD_ICONS[type] ?? Smile; return <MIcon size={26} strokeWidth={1.5} style={{ color: pendingMood === type ? primary : '#9ca3af' }} /> })()}
                      <span
                        className="text-[10px] font-semibold"
                        style={{ color: pendingMood === type ? primary : '#9ca3af' }}
                      >
                        {cfg.label}
                      </span>
                    </motion.button>
                  ))}
                </div>
                <div className={cn('rounded-2xl p-4 mb-5', isSeval ? 'bg-seval-50' : 'bg-mateo-50')}>
                  <p className="text-xs font-semibold text-gray-400 mb-2">
                    {pendingMood === myMood?.mood ? 'Update your message' : 'Add a message'}{' '}
                    <span className="font-normal text-gray-300">(optional)</span>
                  </p>
                  <textarea
                    value={moodMessage}
                    onChange={e => setMoodMessage(e.target.value)}
                    placeholder={`Tell ${USERS[OTHER_USER[currentUser]].displayName} how you're feeling...`}
                    rows={3}
                    className="w-full text-sm text-gray-700 placeholder:text-gray-300 bg-transparent outline-none resize-none"
                  />
                </div>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={saveMood}
                  className="w-full py-4 rounded-2xl text-white text-sm font-semibold"
                  style={{ background: primary }}
                >
                  Share this feeling
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Memory Sheet ── */}
      <AnimatePresence>
        {memorySheet !== null && (
          <MemorySheet
            key={memorySheet === 'new' ? 'new' : (memorySheet as Memory).id}
            memory={memorySheet === 'new' ? null : memorySheet as Memory}
            categories={categories}
            primary={primary}
            onClose={() => setMemorySheet(null)}
            onSave={data => {
              if (memorySheet === 'new') {
                addMemory(data.title!, data.date!, data.notes, data.photos, data.category, data.checklist)
              } else {
                updateMemory((memorySheet as Memory).id, data)
              }
              setMemorySheet(null)
            }}
            onDelete={memorySheet !== 'new' ? () => {
              deleteMemory((memorySheet as Memory).id)
              setMemorySheet(null)
            } : undefined}
          />
        )}
      </AnimatePresence>

      {/* ── Anniversary / Countdown Sheet ── */}
      <AnimatePresence>
        {selectedCountdown && (
          <AnniversarySheet
            key={selectedCountdown.id}
            countdown={selectedCountdown}
            primary={primary}
            onClose={() => setSelectedCountdown(null)}
            onDelete={() => { deleteCountdown(selectedCountdown.id); setSelectedCountdown(null) }}
          />
        )}
      </AnimatePresence>

      {/* ── Add Milestone Sheet ── */}
      <AnimatePresence>
        {addCdOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setAddCdOpen(false)}
              className="fixed inset-0 z-50 c2-backdrop"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 380 }}
              className="fixed bottom-0 left-0 right-0 z-50 c2-sheet-bg rounded-t-[2rem] shadow-modal max-w-lg mx-auto"
            >
              <div className="px-5 pt-4 pb-sheet-footer">
                <div className="drag-handle mb-4" />
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-gray-800">New Milestone</h3>
                  <button
                    onClick={() => setAddCdOpen(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-full c2-sheet-x"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap mb-4">
                  {MILESTONE_OPTIONS.map(({ key, icon: MIcon }) => (
                    <button
                      key={key}
                      onClick={() => setNewCdIconKey(key)}
                      className={cn(
                        'w-11 h-11 rounded-2xl flex items-center justify-center transition-all',
                        newCdIconKey === key ? 'scale-110' : 'bg-gray-50'
                      )}
                      style={newCdIconKey === key
                        ? { background: `${primary}18`, color: primary }
                        : { color: '#9ca3af' }}
                    >
                      <MIcon size={18} strokeWidth={1.75} />
                    </button>
                  ))}
                </div>
                <div className="space-y-3 mb-5">
                  <div className="bg-gray-50 rounded-2xl px-4 py-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Title</p>
                    <input
                      value={newCdTitle}
                      onChange={e => setNewCdTitle(e.target.value)}
                      placeholder="e.g. First kiss"
                      autoFocus
                      className="w-full text-sm text-gray-800 bg-transparent outline-none"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1">Date</p>
                    <DatePicker value={newCdDate} onChange={setNewCdDate} accentColor={primary} allowClear={false} />
                  </div>
                </div>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAddCountdown}
                  disabled={!newCdTitle.trim() || !newCdDate}
                  className="w-full py-3.5 rounded-2xl text-white text-sm font-semibold disabled:opacity-40"
                  style={{ background: primary }}
                >
                  Add Milestone
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  )
}
