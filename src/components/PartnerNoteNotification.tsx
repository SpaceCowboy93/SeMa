'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '@/store/useAppStore'
import { USERS } from '@/types'
import type { PartnerNote } from '@/types'

// Deterministic burst positions — no Math.random() to avoid hydration issues
const BURST_HEARTS = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2 - Math.PI / 2
  const dist  = 70 + (i % 3) * 28
  return {
    x:     Math.cos(angle) * dist,
    y:     Math.sin(angle) * dist,
    emoji: (['💕', '💗', '❤️', '💖', '✨'] as const)[i % 5],
    delay: (i % 3) * 0.04,
  }
})

export function PartnerNoteNotification() {
  const currentUser         = useAppStore(s => s.currentUser)
  const partnerNotes        = useAppStore(s => s.partnerNotes)
  const markPartnerNoteRead = useAppStore(s => s.markPartnerNoteRead)

  const [readingId,  setReadingId]  = useState<string | null>(null)
  const [showBurst,  setShowBurst]  = useState(false)

  if (!currentUser) return null

  // Oldest unread note addressed to me
  const pending: PartnerNote | undefined = partnerNotes
    .filter(n => n.to === currentUser && !n.isRead)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]

  const readingNote: PartnerNote | undefined = readingId
    ? partnerNotes.find(n => n.id === readingId)
    : undefined

  const bubbleSenderColor  = pending?.from === 'seval' ? '#8b5cf6' : '#14b8a6'
  const bubbleSenderConfig = pending ? USERS[pending.from] : null

  const readSenderColor  = readingNote?.from === 'seval' ? '#8b5cf6' : '#14b8a6'
  const readSenderConfig = readingNote ? USERS[readingNote.from] : null

  function handleOpen() {
    if (!pending) return
    setReadingId(pending.id)
    setShowBurst(true)
    setTimeout(() => setShowBurst(false), 900)
  }

  function handleClose() {
    if (readingId) markPartnerNoteRead(readingId)
    setReadingId(null)
  }

  return (
    <>
      {/* ── Floating bubble ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {pending && !readingId && (
          <motion.button
            key={pending.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, y: [0, -6, 0] }}
            exit={{ scale: 0, opacity: 0, transition: { duration: 0.18 } }}
            transition={{
              scale:   { type: 'spring', stiffness: 420, damping: 22 },
              opacity: { duration: 0.18 },
              y:       { repeat: Infinity, duration: 2.8, ease: 'easeInOut', delay: 0.4 },
            }}
            onClick={handleOpen}
            className="fixed bottom-24 right-4 z-50 flex items-center gap-2 pl-3 pr-4 py-2.5
                       rounded-full shadow-lg active:scale-95 transition-transform max-w-[200px]"
            style={{ background: bubbleSenderColor }}
          >
            <span className="text-xl leading-none shrink-0">{bubbleSenderConfig?.emoji}</span>
            <div className="text-left min-w-0">
              <p className="text-[10px] text-white/75 font-medium leading-none mb-0.5 truncate">
                {bubbleSenderConfig?.displayName} sent you
              </p>
              <p className="text-xs text-white font-bold leading-none">
                a love note 💌
              </p>
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Heart burst particles ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showBurst && (
          <div className="fixed inset-0 z-[70] pointer-events-none flex items-center justify-center">
            {BURST_HEARTS.map((h, i) => (
              <motion.div
                key={i}
                className="absolute text-2xl select-none"
                initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                animate={{ x: h.x, y: h.y, scale: 1, opacity: 0 }}
                transition={{ duration: 0.75, ease: 'easeOut', delay: h.delay }}
              >
                {h.emoji}
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* ── Reading modal ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {readingNote && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] c2-backdrop"
              onClick={handleClose}
            />

            {/* Card */}
            <div className="fixed inset-0 z-[61] flex items-center justify-center p-6 pointer-events-none overflow-y-auto">
              <motion.div
                initial={{ scale: 0.82, opacity: 0, y: 32 }}
                animate={{ scale: 1,    opacity: 1, y: 0  }}
                exit={   { scale: 0.88, opacity: 0, y: 16 }}
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                className="w-full max-w-sm rounded-3xl overflow-hidden shadow-modal pointer-events-auto bg-white my-auto"
              >
                {/* Header */}
                <div
                  className="px-6 pt-8 pb-6 flex flex-col items-center text-center relative overflow-hidden"
                  style={{ background: `linear-gradient(145deg, ${readSenderColor}1a, ${readSenderColor}06)` }}
                >
                  {/* Giant background heart */}
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
                    style={{ fontSize: 200, opacity: 0.04, lineHeight: 1 }}
                  >
                    ❤️
                  </div>

                  {/* Floating decorative hearts */}
                  {([0, 1, 2, 3, 4] as const).map(i => (
                    <motion.span
                      key={i}
                      className="absolute pointer-events-none select-none text-base"
                      style={{
                        left:    `${12 + i * 18}%`,
                        top:     `${8  + (i % 2) * 30}%`,
                        opacity: 0.25,
                      }}
                      animate={{ y: [0, -9, 0], opacity: [0.25, 0.55, 0.25] }}
                      transition={{
                        repeat:   Infinity,
                        duration: 2.2 + i * 0.35,
                        ease:     'easeInOut',
                        delay:    i * 0.28,
                      }}
                    >
                      {i % 2 === 0 ? '💕' : '✨'}
                    </motion.span>
                  ))}

                  {/* Sender emoji */}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.08, stiffness: 420, damping: 18 }}
                    className="text-5xl mb-3 relative z-10"
                  >
                    {readSenderConfig?.emoji}
                  </motion.div>

                  <motion.p
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.18 }}
                    className="text-[10px] font-bold uppercase tracking-widest mb-1 relative z-10"
                    style={{ color: readSenderColor }}
                  >
                    A note from
                  </motion.p>
                  <motion.p
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.24 }}
                    className="text-lg font-bold text-gray-800 relative z-10"
                  >
                    {readSenderConfig?.displayName}
                  </motion.p>
                </div>

                {/* Note content */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="px-6 py-5"
                >
                  <div
                    className="rounded-2xl px-5 py-4 mb-5 overflow-y-auto"
                    style={{ background: `${readSenderColor}0e`, maxHeight: '40vh' }}
                  >
                    <p className="text-sm text-gray-700 leading-relaxed italic text-center break-words">
                      &ldquo;{readingNote.content}&rdquo;
                    </p>
                  </div>

                  <button
                    onClick={handleClose}
                    className="w-full py-3.5 rounded-2xl text-white text-sm font-semibold
                               active:opacity-80 transition-opacity"
                    style={{ background: readSenderColor }}
                  >
                    Close with love
                  </button>
                </motion.div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
