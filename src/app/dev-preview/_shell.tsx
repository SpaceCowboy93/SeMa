'use client'

/**
 * Dev-preview client shell.
 *
 * Responsibilities:
 *  - Seed the Zustand store with fixture data (or saved preview state) on mount.
 *  - Subscribe to store changes and persist shared state to the isolated
 *    preview localStorage key (never the real couple-scoped keys).
 *  - Render the persistent "Local Preview" banner.
 *  - Render a custom BottomNav using /dev-preview/* hrefs (never real routes).
 *  - Render FullCreateSheet, C2ToastRegion, GlobalImageLightbox,
 *    PartnerNoteNotification — same as the real app layout.
 *
 * Deliberately does NOT call:
 *  useSupabaseSync / useAuthSession / useNotifications / usePushNotifications
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, MotionConfig } from 'framer-motion'
import { useAppStore } from '@/store/useAppStore'
import { selectSharedState } from '@/lib/shared-state'
import {
  loadPreviewState,
  savePreviewState,
  loadPreviewUser,
  getDevPreviewFixtures,
} from '@/lib/dev-preview-fixtures'
import {
  IconNavHome,
  IconNavPlanner,
  IconNavFinances,
  IconNavShopping,
  IconNavUs,
  Plus,
} from '@/design/iconSystem'
import { cn } from '@/lib/utils'
import { Plane } from 'lucide-react'
import { PartnerNoteNotification } from '@/components/PartnerNoteNotification'
import { GlobalImageLightbox } from '@/components/ui/GlobalImageLightbox'
import { C2ToastRegion } from '@/components/ui/C2Toast'
import { FullCreateSheet } from '@/components/ui/FullCreateSheet'
import { ActivityCentreBell } from '@/components/ActivityCentre'
import { useActivityCachePersistence } from '@/hooks/useActivityCachePersistence'

// ── Preview navigation — mirrors BottomNav with /dev-preview/* hrefs ──────────

const PREVIEW_NAV = [
  { href: '/dev-preview/together',  label: 'Home',     Icon: IconNavHome     },
  { href: '/dev-preview/planner',   label: 'Planner',  Icon: IconNavPlanner  },
  { href: '/dev-preview/plans',     label: 'Finances', Icon: IconNavFinances  },
  { href: '/dev-preview/shopping',  label: 'Shopping', Icon: IconNavShopping  },
  { href: '/dev-preview/trips', label: 'Trips', Icon: Plane },
  { href: '/dev-preview/us',        label: 'Us',       Icon: IconNavUs        },
]

function DevPreviewNav({ primary }: { primary: string }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Preview navigation" className="glass-nav fixed bottom-0 left-0 right-0 z-40 pb-safe">
      <div className="flex items-center justify-around px-1 h-16 max-w-lg mx-auto">
        {PREVIEW_NAV.map(({ href, label, Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full
                         relative active:opacity-70 transition-opacity min-w-0"
            >
              {isActive && (
                <motion.div
                  layoutId="preview-nav-indicator"
                  className="absolute top-1.5 w-1 h-1 rounded-full"
                  style={{ background: primary }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <Icon
                size={20}
                strokeWidth={isActive ? 2.2 : 1.7}
                color={isActive ? primary : '#9ca3af'}
                aria-hidden="true"
              />
              <span
                className={cn(
                  'text-[10px] font-medium transition-colors leading-none truncate w-full text-center',
                  { 'font-semibold': isActive },
                )}
                style={{ color: isActive ? primary : '#9ca3af' }}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export function DevPreviewShell({ children }: { children: React.ReactNode }) {
  const currentUser  = useAppStore(s => s.currentUser)
  const overlayCount = useAppStore(s => s.overlayCount)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [seeded, setSeeded]             = useState(false)

  const isSeval = currentUser === 'seval'
  const primary = isSeval ? '#8b5cf6' : '#14b8a6'

  useActivityCachePersistence()

  useEffect(() => {
    // Seed store: saved edits take priority over fixtures; user identity always
    // comes from the dedicated user key (not shared-state).
    const user       = loadPreviewUser()
    const savedState = loadPreviewState()
    const fixtures   = getDevPreviewFixtures(user)
    useAppStore.setState({ ...fixtures, ...(savedState ?? {}) })
    setSeeded(true)

    // Persist shared state on every store change — uses isolated preview key.
    const unsub = useAppStore.subscribe(state => {
      savePreviewState(selectSharedState(state))
    })
    return unsub
  }, [])

  if (!seeded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="h-dvh overflow-hidden flex flex-col">

        {/* Persistent preview banner */}
        <div
          role="status"
          aria-label="Local preview mode active"
          className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-1.5
                     text-xs font-medium text-amber-800 bg-amber-50 border-b border-amber-200"
        >
          <span aria-hidden="true">&#9888;</span>
          <span>Local Preview &mdash; fake data, not synchronized</span>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overscroll-none pb-24">
          {children}
        </main>

        <DevPreviewNav primary={primary} />

        {/* Floating action button */}
        <motion.button
          animate={{
            opacity: overlayCount > 0 ? 0 : 1,
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

        <FullCreateSheet
          open={quickAddOpen}
          onClose={() => setQuickAddOpen(false)}
          primary={primary}
        />
      </div>
    </MotionConfig>
  )
}
