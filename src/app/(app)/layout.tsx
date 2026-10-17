'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, MotionConfig } from 'framer-motion'
import { Plus } from '@/design/iconSystem'
import { useAppStore } from '@/store/useAppStore'
import { BottomNav } from '@/components/layout/BottomNav'
import { PartnerNoteNotification } from '@/components/PartnerNoteNotification'
import { useSupabaseSync } from '@/hooks/useSupabaseSync'
import { SyncSafetyWarning } from '@/components/SyncSafetyWarning'
import { SyncConflictPanel } from '@/components/SyncConflictPanel'
import { useNotifications } from '@/hooks/useNotifications'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { FullCreateSheet } from '@/components/ui/FullCreateSheet'
import { GlobalImageLightbox } from '@/components/ui/GlobalImageLightbox'
import { C2ToastRegion } from '@/components/ui/C2Toast'
import { useAuthSession } from '@/hooks/useAuthSession'
import { ActivityCentreBell } from '@/components/ActivityCentre'
import { useActivityCachePersistence } from '@/hooks/useActivityCachePersistence'
import { useActivityFeed } from '@/hooks/useActivityFeed'
import { useActivityOutboxFlush } from '@/hooks/useActivityOutboxFlush'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router      = useRouter()
  const currentUser  = useAppStore(s => s.currentUser)
  const overlayCount = useAppStore(s => s.overlayCount)
  const isSeval      = currentUser === 'seval'
  const primary      = isSeval ? '#8b5cf6' : '#14b8a6'

  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [scrolling, setScrolling]       = useState(false)
  const { context, error: authError, signedOut } = useAuthSession()
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mainRef        = useRef<HTMLElement | null>(null)

  useSupabaseSync(context)
  useNotifications(context !== null)
  usePushNotifications()
  useActivityCachePersistence()
  useActivityFeed(context)
  useActivityOutboxFlush(context)

  const handleScroll = useCallback(() => {
    setScrolling(true)
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(() => setScrolling(false), 600)
  }, [])

  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', handleScroll)
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    }
  }, [handleScroll])

  useEffect(() => {
    if (signedOut) router.replace('/')
  }, [signedOut, router])

  if (authError) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
      <p role="alert">{authError}</p>
      <button onClick={() => window.location.reload()}>Try again</button>
      <button onClick={() => router.replace('/')}>Back to sign in</button>
    </div>
  )

  if (!context || currentUser === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="h-dvh overflow-hidden">
      <main ref={mainRef} className="h-full overflow-y-auto overscroll-none pb-24">
        {children}
      </main>

      <BottomNav />

      {/* Floating action button */}
      <motion.button
        whileTap={overlayCount > 0 ? undefined : { scale: 0.88 }}
        animate={{
          opacity: overlayCount > 0 ? 0 : scrolling ? 0.35 : 1,
          scale:   overlayCount > 0 ? 0.85 : 1,
          rotate:  quickAddOpen ? 45 : 0,
        }}
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        onClick={() => { if (overlayCount === 0) setQuickAddOpen(true) }}
        aria-label="Add something"
        aria-hidden={overlayCount > 0}
        tabIndex={overlayCount > 0 ? -1 : undefined}
        className="fixed bottom-[74px] right-5 z-30 w-[46px] h-[46px] rounded-full
                   flex items-center justify-center text-white backdrop-blur-sm"
        style={{
          background:    primary,
          boxShadow:     `0 2px 10px ${primary}28`,
          pointerEvents: overlayCount > 0 ? 'none' : 'auto',
        }}
      >
        <Plus size={20} strokeWidth={2} />
      </motion.button>

      <ActivityCentreBell />

      <PartnerNoteNotification />

      <GlobalImageLightbox />

      <C2ToastRegion />
      <SyncSafetyWarning />
      <SyncConflictPanel />

      <FullCreateSheet
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        primary={primary}
      />
    </div>
    </MotionConfig>
  )
}
