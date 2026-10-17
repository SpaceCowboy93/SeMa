'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Mail, type LucideIcon, CalendarCheck2, Sparkles, Gift, Heart, FileText } from '@/design/iconSystem'
import { useAppStore } from '@/store/useAppStore'
import type { EventColor } from '@/types'
import { COLOR_HEX } from '@/lib/utils'
import { Chip, C2Sheet, C2SheetHeader, C2SheetBody } from '@/components/ui'
import { DatePicker } from '@/components/ui/DatePicker'
import { TimePicker } from '@/components/ui/TimePicker'

type QuickType = 'plan' | 'dream' | 'wish' | 'moment' | 'note'

const TYPES: { id: QuickType; icon: LucideIcon; label: string }[] = [
  { id: 'plan',   icon: CalendarCheck2, label: 'Plan'   },
  { id: 'dream',  icon: Sparkles,       label: 'Dream'  },
  { id: 'wish',   icon: Gift,           label: 'Wish'   },
  { id: 'moment', icon: Heart,          label: 'Moment' },
  { id: 'note',   icon: Mail,           label: 'Note'   },
]


interface Props {
  open: boolean
  onClose: () => void
  primary: string
}

export function QuickAddSheet({ open, onClose, primary }: Props) {
  const currentUser     = useAppStore(s => s.currentUser)!
  const addTodo         = useAppStore(s => s.addTodo)
  const addGoal         = useAppStore(s => s.addGoal)
  const addWishlistItem = useAppStore(s => s.addWishlistItem)
  const addEvent        = useAppStore(s => s.addEvent)
  const sendNote        = useAppStore(s => s.sendPartnerNote)

  const TYPE_COLOR: Record<QuickType, EventColor> = {
    plan: 'green', dream: 'blue', wish: 'seval', moment: 'yellow', note: 'seval',
  }

  const [type, setType]   = useState<QuickType>('plan')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate]   = useState('')
  const [time, setTime]   = useState('')
  const [color, setColor] = useState<EventColor>('green')
  const [sent, setSent]   = useState(false)

  function reset() {
    setTitle(''); setNotes(''); setDate(''); setTime(''); setSent(false)
    setColor(TYPE_COLOR[type])
  }

  function close() { reset(); onClose() }

  function handleSubmit() {
    switch (type) {
      case 'plan':
        if (!title.trim()) return
        addTodo(title.trim(), undefined, date || undefined, undefined, notes.trim() || undefined, time || undefined)
        break
      case 'dream':
        if (!title.trim()) return
        addGoal('life', title.trim(), notes.trim() || undefined, date || undefined, 0, time || undefined)
        break
      case 'wish':
        if (!title.trim()) return
        addWishlistItem(title.trim(), 'plan', notes.trim() || undefined)
        break
      case 'moment':
        if (!title.trim() || !date) return
        addEvent({ title: title.trim(), date, startTime: time || undefined, notes: notes.trim() || undefined, color, createdBy: currentUser })
        break
      case 'note':
        if (!title.trim()) return
        sendNote(title.trim())
        setSent(true)
        setTimeout(() => close(), 1800)
        return
    }
    close()
  }

  const canSubmit = type === 'moment' ? !!(title.trim() && date) : !!title.trim()
  const showDatetime = type === 'plan' || type === 'dream' || type === 'moment'

  return (
    <C2Sheet open={open} onClose={close} aria-label="Add something">
      <C2SheetHeader title="Add something" onClose={close} />

      {/* Type chips — full-bleed horizontal scroll */}
      <div className="pb-3 shrink-0 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="flex gap-2 px-5 pb-1 min-w-max">
          {TYPES.map(t => (
            <Chip
              key={t.id}
              icon={t.icon}
              label={t.label}
              selected={type === t.id}
              activeColor={COLOR_HEX[TYPE_COLOR[t.id]]}
              onClick={() => { setType(t.id); setColor(TYPE_COLOR[t.id]); setTitle(''); setNotes('') }}
            />
          ))}
        </div>
      </div>

      <C2SheetBody className="pb-8">

        <AnimatePresence mode="wait">
          {sent ? (
            <motion.div
              key="sent"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center py-8 text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: 2, duration: 0.4 }}
                className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
                style={{ background: 'rgba(158,201,179,0.18)', color: '#7BBBA5' }}
              >
                <Mail size={32} strokeWidth={1.5} />
              </motion.div>
              <p className="font-bold text-gray-800">Sent with love</p>
            </motion.div>
          ) : (
            <motion.div
              key={type}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="space-y-3"
            >
              {/* Main title / message input */}
              <div className="c2-sheet-section p-4">
                {type === 'note' ? (
                  <textarea
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Write something from the heart..."
                    rows={4}
                    autoFocus
                    className="w-full text-sm text-gray-700 placeholder:text-gray-300
                               bg-transparent outline-none resize-none leading-relaxed"
                  />
                ) : (
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder={
                      type === 'plan'   ? 'What do you want to plan?' :
                      type === 'dream'  ? 'What do you dream of?' :
                      type === 'wish'   ? 'What do you wish for?' :
                      'Name this moment...'
                    }
                    autoFocus
                    className="w-full text-sm text-gray-700 placeholder:text-gray-300
                               bg-transparent outline-none"
                  />
                )}
              </div>

              {/* Notes field (all types except note) */}
              {type !== 'note' && (
                <div className="c2-sheet-section px-4 py-3">
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Notes (optional)..."
                    rows={2}
                    className="w-full text-sm text-gray-500 placeholder:text-gray-300
                               bg-transparent outline-none resize-none"
                  />
                </div>
              )}

              {/* Date + time */}
              {showDatetime && (
                <div className="flex gap-2">
                  <DatePicker value={date} onChange={setDate} className="flex-1" />
                  <TimePicker
                    value={time}
                    onChange={setTime}
                    className="w-28"
                    triggerClassName="c2-sheet-section px-3 py-3"
                  />
                </div>
              )}

              {/* Submit */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full py-4 rounded-2xl text-white text-sm font-semibold
                           disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: primary }}
              >
                <Plus size={16} />
                {type === 'note' ? 'Send with love' : 'Save'}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </C2SheetBody>
    </C2Sheet>
  )
}
