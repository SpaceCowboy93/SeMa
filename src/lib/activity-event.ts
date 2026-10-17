/**
 * Activity notification event catalogue — typed definitions, factory functions
 * and behaviour rules for SeMa partner activity notifications.
 *
 * DESIGN RULES (enforced here):
 *  - Actor never equals recipient.
 *  - Sensitive entity types (partnerNote, finance) get generic push body text
 *    unless the recipient has opted into sensitive previews.
 *  - Deep links are validated against SEMA_ALLOWED_PATHS before use.
 *  - Hydration, sync-merge and Realtime apply must NEVER call createActivityEvent.
 *    Only original authenticated user actions may enter the catalogue.
 *  - Every event carries a stable idempotency key so retrying is safe.
 */

import type { UserName } from '@/types'
import { USERS, OTHER_USER } from '@/types'

// ── Entity types ──────────────────────────────────────────────────────────────

export type ActivityEntityType =
  | 'event'       // CalendarEvent
  | 'todo'        // SharedTodo
  | 'goal'        // Goal / Dream
  | 'wish'        // WishlistItem
  | 'shopping'    // ShoppingList / ShoppingItem
  | 'mood'        // MoodEntry
  | 'memory'      // Memory
  | 'loveNote'    // LoveNote
  | 'partnerNote' // PartnerNote  ← sensitive: body hidden by default
  | 'countdown'   // Countdown
  | 'finance'     // FinanceMonth / BudgetItem / SavingsGoal ← sensitive: amounts hidden
  | 'focus'       // FocusActivity

// ── Action types ──────────────────────────────────────────────────────────────

export type ActivityActionType =
  | 'created'    // brand-new entity
  | 'completed'  // marked done
  | 'achieved'   // goal reached / wish fulfilled
  | 'deleted'    // entity removed / event cancelled
  | 'shared'     // mood shared
  | 'sent'       // partner note sent
  | 'added'      // item added to a collection
  | 'updated'    // significant edit (not routine tweak)

// ── Importance ────────────────────────────────────────────────────────────────

/**
 * immediate  — push notification + Activity feed entry
 * grouped    — push notification for the group + Activity feed entry
 * feed_only  — Activity feed entry only; no phone interruption
 */
export type ActivityImportance = 'immediate' | 'grouped' | 'feed_only'

// ── Deep-link allowlist ───────────────────────────────────────────────────────

export const SEMA_ALLOWED_PATHS = new Set([
  '/together',
  '/planner',
  '/plans',
  '/shopping',
  '/us',
  '/calendar',
  '/goals',
  '/todos',
  '/notes',
  '/wishlist',
  '/journey',
  '/memories',
  '/trips',
])

/** Validate and return an internal SeMa path, falling back to /together. */
export function resolveDeepLink(path: string): string {
  // Strip query-string and fragment before checking
  const clean = path.split('?')[0].split('#')[0]
  if (SEMA_ALLOWED_PATHS.has(clean)) return clean
  // Reject anything not on the allowlist (external URLs, /dev-preview/*, etc.)
  return '/together'
}

// ── Catalogue entry ───────────────────────────────────────────────────────────

interface CatalogueEntry {
  importance: ActivityImportance
  deepLink:   string
  /** True if the notification body should be genericised for privacy. */
  sensitive?: boolean
}

type CatalogueKey = `${ActivityEntityType}:${ActivityActionType}`

/** Central importance and routing table. */
const ACTIVITY_CATALOGUE: Partial<Record<CatalogueKey, CatalogueEntry>> = {
  'event:created':      { importance: 'immediate', deepLink: '/together' },
  'event:deleted':      { importance: 'immediate', deepLink: '/together' },
  'event:updated':      { importance: 'feed_only', deepLink: '/calendar' },

  'todo:created':       { importance: 'immediate', deepLink: '/planner' },
  'todo:completed':     { importance: 'immediate', deepLink: '/planner' },
  'todo:updated':       { importance: 'feed_only', deepLink: '/todos' },

  'goal:created':       { importance: 'immediate', deepLink: '/goals' },
  'goal:achieved':      { importance: 'immediate', deepLink: '/goals' },
  'goal:updated':       { importance: 'feed_only', deepLink: '/goals' },
  'goal:deleted':       { importance: 'feed_only', deepLink: '/goals' },

  'wish:created':       { importance: 'immediate', deepLink: '/wishlist' },
  'wish:achieved':      { importance: 'immediate', deepLink: '/wishlist' },
  'wish:updated':       { importance: 'feed_only', deepLink: '/wishlist' },

  'shopping:completed': { importance: 'immediate', deepLink: '/shopping' },
  'shopping:added':     { importance: 'grouped',   deepLink: '/shopping' },
  'shopping:created':   { importance: 'immediate', deepLink: '/shopping' },
  'shopping:updated':   { importance: 'feed_only', deepLink: '/shopping' },
  'shopping:deleted':   { importance: 'feed_only', deepLink: '/shopping' },

  'mood:shared':        { importance: 'immediate', deepLink: '/us' },

  'memory:created':     { importance: 'immediate', deepLink: '/memories' },
  'memory:updated':     { importance: 'feed_only', deepLink: '/memories' },

  'loveNote:sent':      { importance: 'immediate', deepLink: '/together' },

  'partnerNote:sent':   { importance: 'immediate', deepLink: '/together', sensitive: true },

  'countdown:created':  { importance: 'immediate', deepLink: '/us' },
  'countdown:updated':  { importance: 'feed_only', deepLink: '/us' },

  'finance:created':    { importance: 'feed_only', deepLink: '/plans', sensitive: true },
  'finance:updated':    { importance: 'feed_only', deepLink: '/plans', sensitive: true },
  'finance:added':      { importance: 'grouped',   deepLink: '/plans', sensitive: true },

  'focus:created':      { importance: 'feed_only', deepLink: '/planner' },
  'focus:completed':    { importance: 'feed_only', deepLink: '/planner' },
  'focus:updated':      { importance: 'feed_only', deepLink: '/planner' },
}

function getCatalogueEntry(
  entityType: ActivityEntityType,
  actionType: ActivityActionType,
): CatalogueEntry {
  const key: CatalogueKey = `${entityType}:${actionType}`
  return ACTIVITY_CATALOGUE[key] ?? { importance: 'feed_only', deepLink: '/together' }
}

// ── Core types ────────────────────────────────────────────────────────────────

/**
 * ActivityEvent — produced by the actor when an action occurs.
 * Queued in the local outbox and eventually sent to the server.
 */
export interface ActivityEvent {
  /** Stable idempotency key — safe to retry without creating duplicates. */
  id:            string
  entityType:    ActivityEntityType
  actionType:    ActivityActionType
  actor:         UserName
  recipient:     UserName
  entityId:      string
  /** Safe display title — must not contain personal data from other users. */
  entityTitle:   string
  importance:    ActivityImportance
  /**
   * Grouping key: groups related events within the deduplication window.
   * Format: `{entityType}:{actor}:{5-minute-bucket}`
   */
  groupingKey:   string
  /** Internal SeMa path for deep-link navigation. Always allowlisted. */
  deepLink:      string
  /**
   * Text shown in the push notification body.
   * Sensitive entities get a generic message unless preview is enabled.
   */
  safeBody:      string
  createdAt:     string  // ISO-8601
}

/**
 * ActivityEntry — what the recipient sees in their Activity Centre.
 * Created server-side from the ActivityEvent; stored in activity_events table.
 * Locally: populated from fixtures in /dev-preview.
 */
export interface ActivityEntry {
  id:          string
  entityType:  ActivityEntityType
  actionType:  ActivityActionType
  actorName:   UserName
  actorEmoji:  string
  /** Safe display text (may be generic for sensitive types). */
  safeBody:    string
  deepLink:    string
  importance:  ActivityImportance
  createdAt:   string  // ISO-8601
  isRead:      boolean
  /** Set for grouped entries (e.g. "4 shopping items added"). */
  groupCount?: number
}

// ── Entity colour chips ───────────────────────────────────────────────────────

export const ENTITY_COLOURS: Record<ActivityEntityType, string> = {
  event:       '#8b5cf6',  // violet
  todo:        '#14b8a6',  // teal
  goal:        '#f59e0b',  // amber
  wish:        '#ec4899',  // pink
  shopping:    '#22c55e',  // green
  mood:        '#06b6d4',  // cyan
  memory:      '#a78bfa',  // light violet
  loveNote:    '#f43f5e',  // rose
  partnerNote: '#7c3aed',  // deep violet
  countdown:   '#f97316',  // orange
  finance:     '#10b981',  // emerald
  focus:       '#6366f1',  // indigo
}

// ── Safe body text ────────────────────────────────────────────────────────────

const SENSITIVE_DEFAULT: Partial<Record<ActivityEntityType, string>> = {
  partnerNote: 'You received a note in SeMa.',
  finance:     'Finance was updated in SeMa.',
}

function buildActionText(
  actor: UserName,
  entityType: ActivityEntityType,
  actionType: ActivityActionType,
  entityTitle: string,
): string {
  const name = USERS[actor].displayName
  const titleShort = entityTitle.length > 40
    ? entityTitle.slice(0, 37) + '…'
    : entityTitle

  switch (actionType) {
    case 'created':   return `${name} added "${titleShort}"`
    case 'completed': return `${name} completed "${titleShort}"`
    case 'achieved':  return `${name} achieved "${titleShort}"`
    case 'deleted':   return `${name} removed "${titleShort}"`
    case 'shared':    return `${name} shared their mood`
    case 'sent':
      if (entityType === 'loveNote') return `${name} sent you a love note`
      return `${name} sent you something`
    case 'added':     return `${name} added to ${entityType}`
    case 'updated':   return `${name} updated "${titleShort}"`
    default:          return `${name} made a change`
  }
}

/**
 * Build the safe push notification body.
 * Sensitive types return a generic message unless sensitivePreview is enabled.
 */
export function buildSafePayload(
  actor: UserName,
  entityType: ActivityEntityType,
  actionType: ActivityActionType,
  entityTitle: string,
  sensitivePreview = false,
): string {
  const sensitiveDefault = SENSITIVE_DEFAULT[entityType]
  if (sensitiveDefault && !sensitivePreview) return sensitiveDefault
  return buildActionText(actor, entityType, actionType, entityTitle)
}

// ── Idempotency key ───────────────────────────────────────────────────────────

/** Stable key: same action within the same minute = same key. */
export function buildIdempotencyKey(
  actor: UserName,
  entityType: ActivityEntityType,
  actionType: ActivityActionType,
  entityId: string,
  nowMs = Date.now(),
): string {
  // Round to nearest minute bucket
  const minuteBucket = Math.floor(nowMs / 60_000)
  return `${entityType}:${actionType}:${entityId}:${actor}:${minuteBucket}`
}

// ── Grouping key ─────────────────────────────────────────────────────────────

/** Groups related events from the same actor within a 5-minute window. */
export function buildGroupingKey(
  actor: UserName,
  entityType: ActivityEntityType,
  nowMs = Date.now(),
): string {
  const fiveMinBucket = Math.floor(nowMs / (5 * 60_000))
  return `${entityType}:${actor}:${fiveMinBucket}`
}

// ── Factory ───────────────────────────────────────────────────────────────────

export interface CreateActivityEventParams {
  actor:       UserName
  entityType:  ActivityEntityType
  actionType:  ActivityActionType
  entityId:    string
  entityTitle: string
  sensitivePreview?: boolean
  /** Override timestamp — used in tests. */
  nowMs?:      number
}

/**
 * Create a validated ActivityEvent.
 *
 * Returns null if actor === recipient (self-notification suppressed).
 * The actor's partner is always the recipient — no caller-controlled recipient.
 */
export function createActivityEvent(
  params: CreateActivityEventParams,
): ActivityEvent | null {
  const {
    actor, entityType, actionType, entityId, entityTitle,
    sensitivePreview = false, nowMs = Date.now(),
  } = params

  const recipient = OTHER_USER[actor]

  // Rule: actor must not be the recipient
  if (actor === recipient) return null

  const entry     = getCatalogueEntry(entityType, actionType)
  const id        = buildIdempotencyKey(actor, entityType, actionType, entityId, nowMs)
  const groupingKey = buildGroupingKey(actor, entityType, nowMs)
  const safeBody  = buildSafePayload(actor, entityType, actionType, entityTitle, sensitivePreview)

  return {
    id,
    entityType,
    actionType,
    actor,
    recipient,
    entityId,
    entityTitle: entry.sensitive && !sensitivePreview ? '[hidden]' : entityTitle,
    importance:  entry.importance,
    groupingKey,
    deepLink:    resolveDeepLink(entry.deepLink),
    safeBody,
    createdAt:   new Date(nowMs).toISOString(),
  }
}

/**
 * Convert an ActivityEvent (actor side) into an ActivityEntry (recipient side).
 * Used by the server after storing the event; also used in tests and dev-preview.
 */
export function eventToEntry(event: ActivityEvent): ActivityEntry {
  return {
    id:         event.id,
    entityType: event.entityType,
    actionType: event.actionType,
    actorName:  event.actor,
    actorEmoji: USERS[event.actor].emoji,
    safeBody:   event.safeBody,
    deepLink:   event.deepLink,
    importance: event.importance,
    createdAt:  event.createdAt,
    isRead:     false,
  }
}
