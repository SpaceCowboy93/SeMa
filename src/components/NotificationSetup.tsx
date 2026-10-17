'use client'

import { authenticatedFetch } from '@/lib/authenticated-fetch'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, BellOff, BellRing, ChevronDown, RefreshCw, Check, X, Wifi, Smartphone } from '@/design/iconSystem'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useAppStore } from '@/store/useAppStore'
import { USERS, OTHER_USER } from '@/types'
import type { UserName } from '@/types'

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isInStandaloneMode() {
  if (typeof window === 'undefined') return false
  return (
    'standalone' in window.navigator &&
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

// ── Tiny status pill ──────────────────────────────────────────────────────────
function StatusPill({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) {
    return <span className="text-gray-400 italic">checking…</span>
  }
  return (
    <span className={`font-semibold flex items-center gap-0.5 ${ok ? 'text-emerald-500' : 'text-red-400'}`}>
      {ok ? <Check size={9} strokeWidth={3} /> : <X size={9} strokeWidth={3} />}
      {label}
    </span>
  )
}

// ── Spinner helper ─────────────────────────────────────────────────────────────
function Spinner({ color = 'white' }: { color?: string }) {
  return (
    <span
      className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin inline-block"
      style={{ borderColor: `${color}60`, borderTopColor: 'transparent' }}
    />
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function NotificationSetup({ primary }: { primary: string }) {
  const {
    status, swError, loading, serverSaved, endpoint,
    enable, disable, reconnect, syncReminders,
  } = usePushNotifications()

  const currentUser = useAppStore(s => s.currentUser)
  const displayName = currentUser ? USERS[currentUser].displayName : ''

  const [testState,   setTestState]   = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')
  const [testDetail,  setTestDetail]  = useState('')
  const [syncState,   setSyncState]   = useState<'idle' | 'syncing' | 'ok' | 'err'>('idle')
  const [lastSync,    setLastSync]    = useState<Date | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showIOSHelp, setShowIOSHelp] = useState(false)

  // ── Actions ──────────────────────────────────────────────────────────────

  async function sendTestPush() {
    if (!currentUser || !endpoint) return
    setTestState('sending')
    setTestDetail('')
    try {
      const res  = await authenticatedFetch('/api/push/test', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ endpoint, userName: currentUser }),
      })
      const data = await res.json()
      if (data.ok && data.sent > 0) {
        setTestState('ok')
        setTestDetail('Delivered! Background the app to see it.')
      } else {
        setTestState('err')
        setTestDetail(data.error ?? `sent=${data.sent ?? 0}`)
      }
    } catch (err) {
      setTestState('err')
      setTestDetail(String(err))
    }
    setTimeout(() => { setTestState('idle'); setTestDetail('') }, 8000)
  }

  async function handleSync() {
    if (!currentUser) return
    setSyncState('syncing')
    try {
      await syncReminders(currentUser as UserName)
      await syncReminders(OTHER_USER[currentUser as UserName])
      setLastSync(new Date())
      setSyncState('ok')
    } catch {
      setSyncState('err')
    }
    setTimeout(() => setSyncState('idle'), 3000)
  }

  // ── iOS not installed as PWA ──────────────────────────────────────────────

  if (status === 'unsupported') {
    if (isIOS() && !isInStandaloneMode()) {
      return (
        <div
          className="rounded-3xl overflow-hidden"
          style={{ border: `1.5px solid ${primary}20` }}
        >
          <motion.button
            whileTap={{ scale: 0.99 }}
            onClick={() => setShowIOSHelp(v => !v)}
            className="w-full flex items-center gap-3 px-4 py-4 text-left"
            style={{ background: `${primary}08` }}
          >
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl shrink-0"
              style={{ background: `${primary}15` }}
            >
              <Smartphone size={22} strokeWidth={1.75} style={{ color: primary }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800">Install app for notifications</p>
              <p className="text-xs text-gray-500 mt-0.5">Requires Home Screen install on iPhone</p>
            </div>
            <motion.div
              animate={{ rotate: showIOSHelp ? 180 : 0 }}
              transition={{ duration: 0.25 }}
            >
              <ChevronDown size={16} className="text-gray-300" />
            </motion.div>
          </motion.button>

          <AnimatePresence>
            {showIOSHelp && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden bg-white"
              >
                <div className="px-5 py-4 space-y-3">
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Push notifications on iPhone require the app to be added as a Home Screen shortcut in Safari.
                  </p>
                  {[
                    'Open SeMa in Safari (not Chrome or Firefox)',
                    'Tap the Share button at the bottom of the screen',
                    'Scroll down and tap "Add to Home Screen"',
                    'Open SeMa from your Home Screen icon',
                    'Return here and tap Enable Notifications',
                  ].map((text, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span
                        className="w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 text-white"
                        style={{ background: primary }}
                      >
                        {i + 1}
                      </span>
                      <p className="text-xs text-gray-600 leading-relaxed">{text}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )
    }
    return null
  }

  // ── Denied ────────────────────────────────────────────────────────────────

  if (status === 'denied') {
    return (
      <div
        className="rounded-3xl px-4 py-4 flex items-start gap-3 bg-red-50"
        style={{ border: '1.5px solid #fecaca' }}
      >
        <div className="w-11 h-11 rounded-2xl bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
          <BellOff size={19} className="text-red-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-800">Notifications blocked</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            You blocked notifications for this site. To re-enable, open your browser Settings → Notifications → allow SeMa.
          </p>
        </div>
      </div>
    )
  }

  // ── Subscribed ────────────────────────────────────────────────────────────

  if (status === 'subscribed') {
    const serverMissing = serverSaved === false
    const permGranted   = typeof Notification !== 'undefined' && Notification.permission === 'granted'
    const accent        = serverMissing ? '#f97316' : '#10b981'
    const accentLight   = serverMissing ? '#fff7ed' : '#f0fdf4'
    const accentBorder  = serverMissing ? '#fed7aa' : '#d1fae5'
    const accentBg      = serverMissing ? '#ffedd5' : '#d1fae5'

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="rounded-3xl overflow-hidden bg-white"
        style={{ border: `1.5px solid ${accentBorder}`, boxShadow: `0 4px 20px ${accent}10` }}
      >
        {/* Header */}
        <div className="px-4 py-4 flex items-center gap-3" style={{ background: accentLight }}>
          <motion.div
            initial={{ scale: 0.7, rotate: -15 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
            className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: accentBg }}
          >
            <BellRing size={20} style={{ color: accent }} />
          </motion.div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800">
              {serverMissing ? 'Device not connected' : 'Notifications active'}
            </p>
            <p className="text-xs mt-0.5 font-medium" style={{ color: accent }}>
              {serverMissing ? `Re-save as ${displayName}` : `Connected as ${displayName}`}
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={disable}
            disabled={loading}
            className="text-[10px] font-semibold text-gray-400 px-2.5 py-1.5 rounded-xl bg-white/70 border border-gray-100"
          >
            Turn off
          </motion.button>
        </div>

        {/* Collapsible status detail */}
        <button
          onClick={() => setShowDetails(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 border-t"
          style={{ borderColor: `${accentBorder}60` }}
        >
          <div className="flex items-center gap-3 text-[11px] text-gray-400">
            <span className="flex items-center gap-1">
              Permission:{' '}
              <StatusPill ok={permGranted} label={permGranted ? 'granted' : 'not granted'} />
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              Server:{' '}
              <StatusPill ok={serverSaved} label={serverSaved ? 'saved' : 'not saved'} />
            </span>
          </div>
          <motion.div animate={{ rotate: showDetails ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={13} className="text-gray-300" />
          </motion.div>
        </button>

        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t"
              style={{ borderColor: `${accentBorder}40` }}
            >
              <div className="px-4 py-3 space-y-1.5 bg-gray-50/50">
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400">Active profile</span>
                  <span className="font-semibold text-gray-700">{displayName}</span>
                </div>
                {lastSync && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-gray-400">Last reminder sync</span>
                    <span className="font-semibold text-gray-700">
                      {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                {swError && (
                  <p className="text-[10px] text-red-400 leading-relaxed pt-1">{swError}</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="px-4 pb-4 pt-3 space-y-2">

          {/* Urgent reconnect */}
          {serverMissing && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={reconnect}
              disabled={loading}
              className="w-full py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 text-white"
              style={{ background: accent, boxShadow: `0 4px 14px ${accent}35` }}
            >
              {loading ? <Spinner /> : <Wifi size={15} />}
              {loading ? 'Reconnecting…' : `Reconnect as ${displayName}`}
            </motion.button>
          )}

          {/* Test + Sync side by side */}
          <div className="grid grid-cols-2 gap-2">
            {/* Test notification */}
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={sendTestPush}
              disabled={testState === 'sending' || loading}
              className="py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors"
              style={{
                borderColor: testState === 'ok'  ? '#d1fae5'
                           : testState === 'err' ? '#fecaca'
                           : '#e5e7eb',
                background:  testState === 'ok'  ? '#f0fdf4'
                           : testState === 'err' ? '#fef2f2'
                           : 'white',
                color:       testState === 'ok'  ? '#059669'
                           : testState === 'err' ? '#dc2626'
                           : '#374151',
              }}
            >
              {testState === 'sending' && <Spinner color="#6b7280" />}
              {testState === 'ok'      && <Check size={12} strokeWidth={2.5} />}
              {testState === 'err'     && <X size={12} />}
              {testState === 'idle'    && <Bell size={12} />}
              {testState === 'sending' ? 'Sending…'
               : testState === 'ok'   ? 'Delivered!'
               : testState === 'err'  ? 'Failed'
               : 'Test push'}
            </motion.button>

            {/* Sync reminders */}
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={handleSync}
              disabled={syncState === 'syncing' || loading}
              className="py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors"
              style={{
                borderColor: syncState === 'ok' ? '#d1fae5' : '#e5e7eb',
                background:  syncState === 'ok' ? '#f0fdf4' : 'white',
                color:       syncState === 'ok' ? '#059669' : '#374151',
              }}
            >
              {syncState === 'syncing' && <Spinner color="#6b7280" />}
              {syncState === 'ok'      && <Check size={12} strokeWidth={2.5} />}
              {syncState !== 'syncing' && syncState !== 'ok' && (
                <motion.div
                  animate={{ rotate: 0 }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                >
                  <RefreshCw size={12} />
                </motion.div>
              )}
              {syncState === 'syncing' ? 'Syncing…' : syncState === 'ok' ? 'Synced!' : 'Sync'}
            </motion.button>
          </div>

          {/* Non-urgent reconnect */}
          {!serverMissing && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={reconnect}
              disabled={loading}
              className="w-full py-2.5 rounded-2xl text-xs font-semibold text-gray-500 border border-gray-200 bg-white flex items-center justify-center gap-1.5"
            >
              {loading ? <Spinner color="#9ca3af" /> : <RefreshCw size={11} />}
              Reconnect this device
            </motion.button>
          )}

          {/* Test result detail */}
          <AnimatePresence>
            {testDetail && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className={`text-[10px] text-center leading-relaxed ${
                  testState === 'ok' ? 'text-emerald-500' : 'text-red-400'
                }`}
              >
                {testDetail}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    )
  }

  // ── Granted (permission OK, no subscription yet) ──────────────────────────

  if (status === 'granted') {
    return (
      <div
        className="rounded-3xl overflow-hidden"
        style={{ border: `1.5px solid ${primary}25` }}
      >
        <div className="px-4 py-5" style={{ background: `${primary}06` }}>
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: `${primary}15` }}
            >
              <Bell size={20} style={{ color: primary }} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Permission granted</p>
              <p className="text-xs text-gray-500">One more step to connect this device</p>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={enable}
            disabled={loading}
            className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2"
            style={{ background: primary, boxShadow: `0 4px 16px ${primary}35` }}
          >
            {loading ? <Spinner /> : <Wifi size={15} />}
            {loading ? 'Connecting…' : `Connect as ${displayName}`}
          </motion.button>
          {swError && <p className="text-[10px] text-red-400 mt-2 text-center">{swError}</p>}
        </div>
      </div>
    )
  }

  // ── Default — first time ──────────────────────────────────────────────────

  return (
    <div
      className="rounded-3xl overflow-hidden"
      style={{ border: `1.5px solid ${primary}18` }}
    >
      {/* Hero area */}
      <div
        className="px-5 pt-7 pb-5 text-center"
        style={{
          background: `linear-gradient(160deg, ${primary}10 0%, ${primary}03 100%)`,
        }}
      >
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 360, damping: 22, delay: 0.08 }}
          className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{
            background: `${primary}18`,
            boxShadow: `0 8px 28px ${primary}28`,
          }}
        >
          <Bell size={28} style={{ color: primary }} />
        </motion.div>

        <motion.h3
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="text-base font-bold text-gray-800 mb-2"
        >
          Stay reminded together
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="text-xs text-gray-500 leading-relaxed"
        >
          Receive push notifications for your shared events, todos, and special moments — even when the app is closed.
        </motion.p>
      </div>

      {/* CTA */}
      <div className="px-4 pb-5 pt-4 bg-white">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={enable}
          disabled={loading}
          className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2"
          style={{
            background: `linear-gradient(135deg, ${primary}, ${primary}cc)`,
            boxShadow:  `0 4px 18px ${primary}38`,
          }}
        >
          {loading ? <Spinner /> : <Bell size={16} />}
          {loading ? 'Setting up…' : 'Enable Notifications'}
        </motion.button>
        {swError && <p className="text-[10px] text-red-400 mt-2 text-center">{swError}</p>}
        <p className="text-[10px] text-gray-300 text-center mt-3 leading-relaxed">
          Reminders at 5 min · 1 hour · 1 day before events
        </p>
      </div>
    </div>
  )
}
