'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, BellOff, ChevronDown, RefreshCw, Loader2, Smartphone } from '@/design/iconSystem'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useAppStore } from '@/store/useAppStore'
import { USERS } from '@/types'

// ── Platform helpers ──────────────────────────────────────────────────────────

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    'standalone' in window.navigator &&
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

function permissionLabel() {
  if (typeof Notification === 'undefined') return 'unavailable'
  return Notification.permission
}

function pushSupported() {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner({ color = 'white', size = 14 }: { color?: string; size?: number }) {
  return (
    <span
      className="border-2 border-t-transparent rounded-full animate-spin inline-block shrink-0"
      style={{ width: size, height: size, borderColor: `${color}50`, borderTopColor: 'transparent' }}
    />
  )
}

// ── Diagnostics row ───────────────────────────────────────────────────────────
// Shows only safe non-sensitive values. Stays visible until both phones confirmed.

function DiagnosticsRow({
  status, serverSaved, initialized, primary, displayName,
}: {
  status: string
  serverSaved: boolean | null
  initialized: boolean
  primary: string
  displayName: string
}) {
  const [open, setOpen] = useState(false)
  const env        = isStandalone() ? 'Standalone PWA' : 'Browser'
  const perm       = permissionLabel()
  const pushOk     = pushSupported()
  const thisDevice = status === 'subscribed' && serverSaved === true ? 'connected' : 'not connected'

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[10px] text-gray-300 active:text-gray-400"
      >
        <span>diagnostics</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronDown size={10} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 space-y-0.5 text-[10px] text-gray-400 font-mono leading-relaxed">
              <p>Env: {env}</p>
              <p>Permission: {perm}</p>
              <p>Push: {pushOk ? 'supported' : 'not supported'}</p>
              <p>Status: {initialized ? status : 'initializing'}</p>
              <p>Server: {serverSaved === null ? 'checking' : serverSaved ? 'saved' : 'not saved'}</p>
              <p>This device: {thisDevice}</p>
              <p>Profile: {displayName}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── NotificationPromptCard ────────────────────────────────────────────────────
//
// Render logic (in priority order):
//   1. Not yet initialized          → "Checking notification support…"
//   2. subscribed + serverSaved=true → return null (card hidden, device confirmed)
//   3. unsupported + non-iOS        → return null (push simply unavailable, silent)
//   4. unsupported + iOS + no PWA   → iOS install guide
//   5. denied                       → "Notifications are blocked" (no button)
//   6. subscribed + serverSaved≠true → "Connect this device" + Reconnect button
//      (browser has a PushSubscription the server doesn't know about)
//   7. granted (no browser sub)     → "Connect this device" + Connect button
//   8. default                      → "Never miss what matters" + Enable button
//
// KEY FIX (root cause of invisible card):
//   Old code: `if (status === 'subscribed') return null`
//   Hid the card whenever the browser had ANY PushSubscription — including stale
//   ones the server no longer knows about.
//   New code: only hide when status === 'subscribed' AND serverSaved === true.

export function NotificationPromptCard({ primary }: { primary: string }) {
  const {
    status, swError, loading, serverSaved, initialized,
    enable, reconnect,
  } = usePushNotifications()

  const currentUser = useAppStore(s => s.currentUser)
  const displayName = currentUser ? USERS[currentUser].displayName : ''

  const [showSteps,   setShowSteps]   = useState(false)
  const [actionError, setActionError] = useState('')

  async function handleEnable() {
    setActionError('')
    try { await enable() }
    catch (err) { setActionError(String(err)) }
  }

  async function handleReconnect() {
    setActionError('')
    try { await reconnect() }
    catch (err) { setActionError(String(err)) }
  }

  // ── 1. Not yet initialized: checking state ──────────────────────────────────
  if (!initialized) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="mb-3 rounded-2xl px-4 py-3 flex items-center gap-3"
        style={{ background: `${primary}08`, border: `1px solid ${primary}18` }}
      >
        <Loader2 size={15} style={{ color: `${primary}80` }} className="animate-spin shrink-0" />
        <p className="text-xs text-gray-400">Checking notification support…</p>
      </motion.div>
    )
  }

  // ── 2. Fully confirmed on this device: hide ─────────────────────────────────
  if (status === 'subscribed' && serverSaved === true) return null

  // ── 3. Unsupported on non-iOS: silent (push simply not available) ───────────
  if (status === 'unsupported' && !isIOS()) return null

  // ── 4. iOS Safari, not installed as PWA: install guide ─────────────────────
  if (status === 'unsupported' && isIOS() && !isStandalone()) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mb-3 rounded-2xl overflow-hidden"
        style={{ border: `1px solid ${primary}22` }}
      >
        <button
          onClick={() => setShowSteps(v => !v)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left"
          style={{ background: `${primary}08` }}
        >
          <Smartphone size={18} strokeWidth={1.75} className="shrink-0 text-gray-500" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-800">Add to Home Screen for notifications</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Share → Add to Home Screen, then open SeMa</p>
          </div>
          <motion.div
            animate={{ rotate: showSteps ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0"
          >
            <ChevronDown size={14} className="text-gray-300" />
          </motion.div>
        </button>

        <AnimatePresence>
          {showSteps && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden bg-white"
            >
              <div className="px-4 py-3 space-y-2.5">
                {[
                  'Open SeMa in Safari (not Chrome or Firefox)',
                  'Tap the Share button at the bottom of the screen',
                  'Tap "Add to Home Screen"',
                  'Open SeMa from your Home Screen icon and return here',
                ].map((text, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span
                      className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 text-white"
                      style={{ background: primary }}
                    >
                      {i + 1}
                    </span>
                    <p className="text-[11px] text-gray-600 leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <DiagnosticsRow status={status} serverSaved={serverSaved} initialized={initialized} primary={primary} displayName={displayName} />
      </motion.div>
    )
  }

  // ── 5. Permission denied: blocked message, no button ───────────────────────
  if (status === 'denied') {
    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mb-3 rounded-2xl px-4 py-3 bg-gray-50"
        style={{ border: '1px solid #e5e7eb' }}
      >
        <div className="flex items-center gap-3">
          <BellOff size={15} className="text-gray-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-700">Notifications are blocked</p>
            <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">
              Enable in your phone or browser Settings → Notifications.
            </p>
          </div>
        </div>
        <DiagnosticsRow status={status} serverSaved={serverSaved} initialized={initialized} primary={primary} displayName={displayName} />
      </motion.div>
    )
  }

  // ── 6 & 7. Connect states (subscribed-but-not-saved, or granted-no-sub) ─────
  //
  // Case 6: status='subscribed', serverSaved=false|null
  //   The browser has a PushSubscription this server doesn't recognise.
  //   This is the most common "invisible card" failure mode: stale subscription.
  //   Action: reconnect() re-saves the existing endpoint under the current user.
  //
  // Case 7: status='granted', no browser subscription
  //   Permission is on but no PushSubscription exists.
  //   Action: enable() creates a new subscription.
  //
  const isStaleSubscription = status === 'subscribed' && serverSaved !== true
  const isGrantedNoSub      = status === 'granted'

  if (isStaleSubscription || isGrantedNoSub) {
    const isMaybeChecking = status === 'subscribed' && serverSaved === null
    const subLabel = isMaybeChecking
      ? 'Verifying with server…'
      : serverSaved === false
        ? `This phone isn't connected as ${displayName}.`
        : `Notifications are on but this phone isn't connected yet.`

    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mb-3 rounded-2xl px-4 py-3"
        style={{
          background: `${primary}0c`,
          border:     `1px solid ${primary}25`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${primary}18` }}
          >
            <Bell size={15} style={{ color: primary }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-800 leading-tight">Connect this device</p>
            <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{subLabel}</p>
            {(swError || actionError) && (
              <p className="text-[10px] text-red-400 mt-1 leading-relaxed">{swError ?? actionError}</p>
            )}
          </div>
          {!isMaybeChecking && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={isStaleSubscription ? handleReconnect : handleEnable}
              disabled={loading}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-white disabled:opacity-50"
              style={{ background: primary, boxShadow: `0 2px 10px ${primary}30` }}
            >
              {loading ? <Spinner size={12} /> : <RefreshCw size={11} />}
              {loading ? '' : 'Connect Device'}
            </motion.button>
          )}
          {isMaybeChecking && <Spinner color={primary} size={14} />}
        </div>
        <DiagnosticsRow status={status} serverSaved={serverSaved} initialized={initialized} primary={primary} displayName={displayName} />
      </motion.div>
    )
  }

  // ── 8. Default: permission not yet requested ────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mb-3 rounded-2xl px-4 py-3"
      style={{
        background: `${primary}0c`,
        border:     `1px solid ${primary}22`,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${primary}18` }}
        >
          <Bell size={15} style={{ color: primary }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-800 leading-tight">Never miss what matters</p>
          <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">
            Enable reminders for events, activities and special dates.
          </p>
          {(swError || actionError) && (
            <p className="text-[10px] text-red-400 mt-1 leading-relaxed">{swError ?? actionError}</p>
          )}
        </div>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={handleEnable}
          disabled={loading}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-white disabled:opacity-50"
          style={{ background: primary, boxShadow: `0 2px 10px ${primary}30` }}
        >
          {loading ? <Spinner size={12} /> : <Bell size={11} />}
          {loading ? '' : 'Enable Notifications'}
        </motion.button>
      </div>
      <DiagnosticsRow status={status} serverSaved={serverSaved} initialized={initialized} primary={primary} displayName={displayName} />
    </motion.div>
  )
}
