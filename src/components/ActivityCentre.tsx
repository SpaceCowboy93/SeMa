'use client'

/**
 * Activity Centre — bell button + feed sheet + notification preferences.
 *
 * Exports:
 *   ActivityCentreBell    — fixed-position bell icon with unread badge
 *   ActivityCentreSheet   — bottom sheet showing the partner activity feed
 *   NotificationPrefsSheet — nested preferences sheet
 *
 * Data flow:
 *   - Reads activityEntries / notificationPrefs from useAppStore (in-memory)
 *   - Persisted to user-scoped localStorage by useActivityCachePersistence hook
 *   - Deep links navigate via next/navigation router (no external URLs)
 *
 * Security:
 *   - Renders only safeBody (never raw entity content)
 *   - deepLink is validated server-side via SEMA_ALLOWED_PATHS before storage
 */

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { IconBell, IconBellRing, IconClose, IconBellOff } from '@/design/iconSystem'
import { Settings2 } from 'lucide-react'
import {
  C2Sheet,
  C2SheetHeader,
  C2SheetBody,
  C2SheetFooter,
} from '@/components/ui/C2Sheet'
import { useAppStore } from '@/store/useAppStore'
import { ENTITY_COLOURS, type ActivityEntityType } from '@/lib/activity-event'
import type { NotificationPreferences } from '@/lib/notification-preferences'
import { cn } from '@/lib/utils'

// ── Colour chips ──────────────────────────────────────────────────────────────

function EntityChip({ type }: { type: ActivityEntityType }) {
  const colour = ENTITY_COLOURS[type] ?? '#9ca3af'
  return (
    <span
      aria-hidden="true"
      style={{ background: colour + '22', borderColor: colour + '44', color: colour }}
      className="inline-flex items-center text-[9px] font-bold uppercase tracking-widest
                 px-1.5 py-0.5 rounded border shrink-0"
    >
      {type}
    </span>
  )
}

// ── Feed item ─────────────────────────────────────────────────────────────────

interface FeedItemProps {
  id:          string
  actorEmoji:  string
  safeBody:    string
  entityType:  ActivityEntityType
  deepLink:    string
  createdAt:   string
  isRead:      boolean
  groupCount?: number
  onRead:      (id: string) => void
  onNavigate:  (path: string) => void
}

function ActivityFeedItem({
  id, actorEmoji, safeBody, entityType, deepLink, createdAt, isRead, groupCount, onRead, onNavigate,
}: FeedItemProps) {
  const colour = ENTITY_COLOURS[entityType] ?? '#9ca3af'
  const timeAgo = formatDistanceToNow(new Date(createdAt), { addSuffix: true })

  const handleClick = useCallback(() => {
    onRead(id)
    onNavigate(deepLink)
  }, [id, deepLink, onRead, onNavigate])

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`${safeBody} — ${timeAgo}${isRead ? '' : ', unread'}`}
      className={cn(
        'w-full text-left flex items-start gap-3 px-0 py-3',
        'border-b border-[rgba(180,165,140,0.12)] last:border-0',
        'transition-colors active:bg-[rgba(180,165,140,0.08)]',
        !isRead && 'bg-[rgba(180,165,140,0.05)]',
      )}
    >
      {/* Unread dot */}
      <span
        aria-hidden="true"
        className={cn(
          'mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 transition-opacity',
          isRead ? 'opacity-0' : 'opacity-100',
        )}
        style={{ background: colour }}
      />

      {/* Actor emoji */}
      <span aria-hidden="true" className="text-xl leading-none shrink-0 mt-0.5">
        {actorEmoji}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <EntityChip type={entityType} />
          {groupCount && groupCount > 1 && (
            <span className="text-[9px] text-gray-400 font-medium">×{groupCount}</span>
          )}
        </div>
        <p className="text-sm text-gray-700 leading-snug">{safeBody}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo}</p>
      </div>

      {/* Chevron indicator */}
      <span aria-hidden="true" className="text-gray-300 mt-1 shrink-0 text-xs">›</span>
    </button>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function ActivityEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <span aria-hidden="true" className="text-4xl mb-3">🔔</span>
      <p className="text-sm font-medium text-gray-600">No activity yet</p>
      <p className="text-xs text-gray-400 mt-1 max-w-[220px]">
        Your partner&apos;s actions will appear here as they happen.
      </p>
    </div>
  )
}

// ── Notification Preferences Sheet ───────────────────────────────────────────

const CATEGORY_LABELS: Record<ActivityEntityType, string> = {
  event:       'Calendar events',
  todo:        'Todos & tasks',
  goal:        'Goals',
  wish:        'Wishlist',
  shopping:    'Shopping',
  mood:        'Mood sharing',
  memory:      'Memories',
  loveNote:    'Love notes',
  partnerNote: 'Partner notes',
  countdown:   'Countdowns',
  finance:     'Finances',
  focus:       'Focus sessions',
}

interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  id: string
}

function Toggle({ checked, onChange, label, id }: ToggleProps) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-3 cursor-pointer select-none">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
          checked ? 'bg-teal-500' : 'bg-gray-200',
        )}
      >
        <span
          className={cn(
            'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
          )}
        />
      </button>
    </label>
  )
}

interface NotificationPrefsSheetProps {
  open:    boolean
  onClose: () => void
}

export function NotificationPrefsSheet({ open, onClose }: NotificationPrefsSheetProps) {
  const prefs       = useAppStore(s => s.notificationPrefs)
  const updatePrefs = useAppStore(s => s.updateNotificationPrefs)

  const setCategory = useCallback((cat: ActivityEntityType, key: 'feedEnabled' | 'pushEnabled', value: boolean) => {
    updatePrefs({
      categories: {
        ...prefs.categories,
        [cat]: { ...prefs.categories[cat], [key]: value },
      },
    })
  }, [prefs, updatePrefs])

  return (
    <C2Sheet open={open} onClose={onClose} aria-label="Notification preferences" zIndex={60}>
      <C2SheetHeader title="Notification preferences" onClose={onClose} />
      <C2SheetBody className="py-4">

        {/* Global switch */}
        <div className="mb-5 bg-[rgba(180,165,140,0.08)] rounded-xl p-4">
          <Toggle
            id="notif-global"
            label="Notifications enabled"
            checked={prefs.globalEnabled}
            onChange={v => updatePrefs({ globalEnabled: v })}
          />
          <p className="text-[10px] text-gray-400 mt-1.5">
            When off, no feed entries or push alerts are created.
          </p>
        </div>

        {/* Sensitive preview */}
        <div className="mb-5 bg-[rgba(180,165,140,0.08)] rounded-xl p-4">
          <Toggle
            id="notif-sensitive"
            label="Sensitive content preview"
            checked={prefs.sensitivePreview}
            onChange={v => updatePrefs({ sensitivePreview: v })}
          />
          <p className="text-[10px] text-gray-400 mt-1.5">
            Show note body and finance amounts in push notifications.
          </p>
        </div>

        {/* Quiet hours */}
        <div className="mb-5 bg-[rgba(180,165,140,0.08)] rounded-xl p-4">
          <Toggle
            id="notif-quiet"
            label="Quiet hours"
            checked={prefs.quietHours.enabled}
            onChange={v => updatePrefs({ quietHours: { ...prefs.quietHours, enabled: v } })}
          />
          {prefs.quietHours.enabled && (
            <div className="mt-3 flex items-center gap-3 text-sm text-gray-600">
              <label className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">From</span>
                <select
                  aria-label="Quiet hours start"
                  value={prefs.quietHours.startHour}
                  onChange={e => updatePrefs({ quietHours: { ...prefs.quietHours, startHour: Number(e.target.value) } })}
                  className="text-sm border border-gray-200 rounded px-1 py-0.5 bg-white"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">to</span>
                <select
                  aria-label="Quiet hours end"
                  value={prefs.quietHours.endHour}
                  onChange={e => updatePrefs({ quietHours: { ...prefs.quietHours, endHour: Number(e.target.value) } })}
                  className="text-sm border border-gray-200 rounded px-1 py-0.5 bg-white"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <p className="text-[10px] text-gray-400 mt-1.5">
            Push alerts are suppressed during quiet hours. Feed entries are still created.
          </p>
        </div>

        {/* Per-category */}
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 px-1">
          Categories
        </p>
        <div className="bg-[rgba(180,165,140,0.08)] rounded-xl overflow-hidden">
          {(Object.keys(CATEGORY_LABELS) as ActivityEntityType[]).map((cat, idx, arr) => (
            <div
              key={cat}
              className={cn(
                'px-4 py-3',
                idx < arr.length - 1 && 'border-b border-[rgba(180,165,140,0.12)]',
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: ENTITY_COLOURS[cat] }}
                />
                <span className="text-sm font-medium text-gray-700">{CATEGORY_LABELS[cat]}</span>
              </div>
              <div className="flex gap-6">
                <Toggle
                  id={`notif-${cat}-feed`}
                  label="Feed"
                  checked={prefs.categories[cat]?.feedEnabled ?? true}
                  onChange={v => setCategory(cat, 'feedEnabled', v)}
                />
                <Toggle
                  id={`notif-${cat}-push`}
                  label="Push"
                  checked={prefs.categories[cat]?.pushEnabled ?? false}
                  onChange={v => setCategory(cat, 'pushEnabled', v)}
                />
              </div>
            </div>
          ))}
        </div>

      </C2SheetBody>
    </C2Sheet>
  )
}

// ── Activity Centre Sheet ─────────────────────────────────────────────────────

interface ActivityCentreSheetProps {
  open:    boolean
  onClose: () => void
}

export function ActivityCentreSheet({ open, onClose }: ActivityCentreSheetProps) {
  const router              = useRouter()
  const entries             = useAppStore(s => s.activityEntries)
  const markRead            = useAppStore(s => s.markActivityRead)
  const markAllRead         = useAppStore(s => s.markAllActivitiesRead)
  const clearRead           = useAppStore(s => s.clearReadActivities)
  const [prefsOpen, setPrefsOpen] = useState(false)

  const unreadCount = entries.filter(e => !e.isRead).length

  const handleNavigate = useCallback((path: string) => {
    onClose()
    router.push(path)
  }, [onClose, router])

  return (
    <>
      <C2Sheet open={open} onClose={onClose} aria-label="Activity Centre">
        <C2SheetHeader>
          <div className="flex items-center justify-between mt-3 mb-2">
            <div>
              <h2 className="text-base font-bold text-gray-800 leading-snug flex items-center gap-2">
                Activity Centre
                {unreadCount > 0 && (
                  <span
                    aria-label={`${unreadCount} unread`}
                    className="inline-flex items-center justify-center
                               text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px]"
                    style={{ background: '#14b8a6' }}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Your partner&apos;s recent actions</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Notification preferences"
                onClick={() => setPrefsOpen(true)}
                className="w-8 h-8 flex items-center justify-center rounded-full
                           text-gray-400 transition-opacity active:opacity-60"
              >
                <Settings2 size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Close Activity Centre"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full c2-sheet-x
                           transition-opacity active:opacity-70"
              >
                <IconClose size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </div>
        </C2SheetHeader>

        <C2SheetBody>
          {entries.length === 0 ? (
            <ActivityEmptyState />
          ) : (
            <div role="list" aria-label="Activity feed">
              {entries.map(entry => (
                <ActivityFeedItem
                  key={entry.id}
                  {...entry}
                  onRead={markRead}
                  onNavigate={handleNavigate}
                />
              ))}
            </div>
          )}
        </C2SheetBody>

        {entries.length > 0 && (
          <C2SheetFooter withDivider>
            <div className="flex gap-3">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="flex-1 text-xs font-medium text-teal-600 py-2
                             rounded-lg bg-teal-50 active:bg-teal-100 transition-colors"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={clearRead}
                className="flex-1 text-xs font-medium text-gray-500 py-2
                           rounded-lg bg-gray-50 active:bg-gray-100 transition-colors"
              >
                Clear read
              </button>
            </div>
          </C2SheetFooter>
        )}
      </C2Sheet>

      <NotificationPrefsSheet
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
      />
    </>
  )
}

// ── Activity Centre Bell ──────────────────────────────────────────────────────

interface ActivityCentreBellProps {
  /** Tailwind class(es) for positioning. Default: fixed top-3 right-4 z-30 */
  className?: string
}

export function ActivityCentreBell({ className }: ActivityCentreBellProps) {
  const [open, setOpen] = useState(false)
  const entries    = useAppStore(s => s.activityEntries)
  const unreadCount = entries.filter(e => !e.isRead).length
  const hasUnread   = unreadCount > 0

  return (
    <>
      <button
        type="button"
        aria-label={
          hasUnread
            ? `Open Activity Centre — ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
            : 'Open Activity Centre'
        }
        onClick={() => setOpen(true)}
        className={cn(
          'fixed top-3 right-4 z-30',
          'w-9 h-9 flex items-center justify-center rounded-full',
          'bg-white/80 backdrop-blur-sm shadow-sm',
          'transition-opacity active:opacity-70',
          className,
        )}
      >
        {hasUnread ? (
          <IconBellRing size={18} strokeWidth={1.75} className="text-teal-600" aria-hidden="true" />
        ) : (
          <IconBell size={18} strokeWidth={1.75} className="text-gray-500" aria-hidden="true" />
        )}
        {hasUnread && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 w-2 h-2 rounded-full bg-teal-500 ring-1 ring-white"
          />
        )}
      </button>

      <ActivityCentreSheet
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
