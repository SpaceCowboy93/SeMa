'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import type { ShoppingList } from '@/types'
import { isValidRemoteSharedState, selectSharedState, type SharedState } from '@/lib/shared-state'
import { pendingKeys, readSyncBase, readSyncArchives, readSyncUnbased, persistSyncCheckpoint, hasCacheStorageError } from '@/lib/durable-cache'
import { rebaseSharedState, resolveConflictGroup, sameValue, type SyncConflictGroup, type SyncResolutionArchive } from '@/lib/sync-merge'
import { isCurrentAuth, subscribeAuth, type AuthContext } from '@/lib/auth-session'

const DEBOUNCE_MS = 800
const POLL_MS     = 300_000

// ── Sync status (module-level pub/sub) ──────────────────────────────────────
export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error'
let _status: SyncStatus = 'idle'
let _warning: string | null = null
const INVALID_REMOTE_WARNING = 'Shared data could not be read safely. Saving is paused to protect your data. Keep this tab open and retry.'
const _listeners = new Set<(s: { status: SyncStatus; warning: string | null }) => void>()
function setStatus(s: SyncStatus, warning: string | null = null) {
  _status = s
  _warning = warning
  _listeners.forEach(fn => fn({ status: s, warning }))
}

export function useSyncStatus() {
  const [snapshot, setLocal] = useState({ status: _status, warning: _warning })
  useEffect(() => {
    _listeners.add(setLocal)
    setLocal({ status: _status, warning: _warning })
    return () => { _listeners.delete(setLocal) }
  }, [])
  return snapshot
}

// ── Manual pull trigger ──────────────────────────────────────────────────────
let _pullFn: (() => Promise<void>) | null = null
export function triggerPull() { _pullFn?.() }

interface SyncReview { groups: SyncConflictGroup[]; archives: SyncResolutionArchive[]; busy: boolean; message: string | null }
let _review: SyncReview = { groups: [], archives: [], busy: false, message: null }
const reviewListeners = new Set<(review: SyncReview) => void>()
function publishReview(next: Partial<SyncReview>) {
  _review = { ..._review, ...next }
  reviewListeners.forEach(listener => listener(_review))
}
let _resolveFn: ((group: SyncConflictGroup, choice: 'local' | 'remote') => Promise<void>) | null = null
export function resolveBackgroundConflict(group: SyncConflictGroup, choice: 'local' | 'remote') { return _resolveFn?.(group, choice) }
export function useSyncConflicts() {
  const [review, setReview] = useState(_review)
  useEffect(() => {
    reviewListeners.add(setReview); setReview(_review)
    return () => { reviewListeners.delete(setReview) }
  }, [])
  return review
}

// ── Helpers ──────────────────────────────────────────────────────────────────
// Robust timestamp comparison — handles "Z" vs "+00:00" format differences
function sameTimestamp(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return new Date(a).getTime() === new Date(b).getTime()
}

// Deep merge shopping lists: union by list ID, union items by ID, prefer checked state
function mergeShoppingLists(remote: ShoppingList[], local: ShoppingList[]): ShoppingList[] {
  const remoteMap = new Map(remote.map(l => [l.id, l]))
  const localMap  = new Map(local.map(l => [l.id, l]))
  const result    = new Map<string, ShoppingList>()

  remoteMap.forEach((list, id) => result.set(id, list))

  localMap.forEach((localList, id) => {
    const remoteList = remoteMap.get(id)
    if (!remoteList) {
      result.set(id, localList)
    } else {
      const itemMap = new Map(remoteList.items.map(i => [i.id, i]))
      localList.items.forEach(item => {
        if (!itemMap.has(item.id)) {
          itemMap.set(item.id, item)
        } else {
          const remoteItem = itemMap.get(item.id)!
          if (item.isChecked && !remoteItem.isChecked) itemMap.set(item.id, item)
        }
      })
      const newerAt = remoteList.updatedAt > localList.updatedAt ? remoteList.updatedAt : localList.updatedAt
      const mergedItems: ShoppingList['items'] = []
      itemMap.forEach(item => mergedItems.push(item))
      result.set(id, { ...remoteList, items: mergedItems, updatedAt: newerAt })
    }
  })

  const lists: ShoppingList[] = []
  result.forEach(list => lists.push(list))
  return lists
}

// Union merge for simple arrays: local first, remote overwrites conflicts
function mergeArrayById(remote: unknown[], local: unknown[], idKey = 'id'): unknown[] {
  const map = new Map<string, unknown>()
  for (const item of local)  map.set((item as Record<string, string>)[idKey], item)
  for (const item of remote) map.set((item as Record<string, string>)[idKey], item)
  return Array.from(map.values())
}

// ── Main hook ────────────────────────────────────────────────────────────────
export function useSupabaseSync(context: AuthContext | null) {
  useEffect(() => {
    if (!context) { setStatus('idle'); publishReview({ groups: [], archives: [], busy: false, message: null }); return }
    let active = true
    let ready = false
    let applying = false
    const pending = pendingKeys(context)
    let base = readSyncBase(context)
    const defaults = selectSharedState(useAppStore.getInitialState())
    let dirty = pending.size > 0
    let saving = false
    let reading = false
    let resolving = false
    let refreshQueued = false
    let replayTimer: ReturnType<typeof setTimeout> | undefined
    let archives = readSyncArchives(context)
    let unbased = readSyncUnbased(context)
    let revision = 0
    let lastAt: string | null = null
    let lastRemote: unknown
    let debounce: ReturnType<typeof setTimeout> | undefined
    const abort = new AbortController()
    const current = () => active && isCurrentAuth(context) && !abort.signal.aborted
    const recoveredGroups = new Map<string, SyncResolutionArchive>()
    archives.forEach(archive => recoveredGroups.set(archive.group.id, archive))
    publishReview({ groups: [...recoveredGroups.values()].filter(archive => archive.choice === 'unresolved').map(archive => archive.group), archives, busy: false, message: null })
    function rememberConflicts(groups: SyncConflictGroup[]) {
      for (const group of groups) {
        if (!archives.some(archive => archive.choice === 'unresolved' && sameValue(archive.group, group))) {
          archives.push({ id: crypto.randomUUID(), at: new Date().toISOString(), choice: 'unresolved', group: structuredClone(group) })
        }
      }
      publishReview({ groups, archives: [...archives] })
    }
    const cancelAuth = subscribeAuth(() => {
      if (!isCurrentAuth(context)) {
        abort.abort(); clearTimeout(debounce); clearTimeout(replayTimer)
        publishReview({ groups: [], archives: [], busy: false, message: null })
      }
    })

    async function acceptCheckpoint(merged: ReturnType<typeof rebaseSharedState>) {
      const capturedRevision = revision
      if (!await persistSyncCheckpoint(context!, merged.visible, merged.base, merged.remaining, archives, merged.unbased)) return false
      // The committed snapshot is recoverable, but edits made while it committed
      // still belong to the open tab. Never replace or acknowledge those edits.
      if (!current() || revision !== capturedRevision) return false
      archives = readSyncArchives(context!)
      publishReview({ archives })
      base = merged.base
      unbased = merged.unbased
      pending.clear()
      merged.remaining.forEach(key => pending.add(key))
      return true
    }

    async function applyRemote(remoteValue: unknown, updatedAt: string) {
      const remote = { ...defaults, ...selectSharedState(remoteValue) }
      const local = selectSharedState(useAppStore.getState())
      const merged = rebaseSharedState(base, local, remote, pending, unbased)
      rememberConflicts(merged.groups)
      const persisted = await acceptCheckpoint(merged)
      if (persisted && current()) {
        applying = true
        try { useAppStore.setState(merged.visible) } finally { applying = false }
      }
      dirty = pending.size > 0
      if (persisted) { lastAt = updatedAt; lastRemote = remoteValue }
      return merged.conflicts.length > 0 || !persisted
    }

    async function save() {
      if (!current() || !ready || reading || saving || resolving || !dirty) return
      saving = true
      publishReview({ busy: true })
      const startingRevision = revision
      setStatus('syncing', _warning)
      try {
        // Do not send or acknowledge work while its local checkpoint is failing.
        if (!await persistSyncCheckpoint(context!, selectSharedState(useAppStore.getState()), base, pending, archives, unbased)) {
          setStatus('error'); return
        }
        if (!current()) return
        // Read/rebase AND condition the write: a read followed by an unconditional
        // update still loses a partner's changes in the gap between requests.
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data: remoteRow, error: readError } = await supabase.from('couple_state')
            .select('state, updated_at').eq('id', context!.stateId).eq('couple_id', context!.coupleId)
            .abortSignal(abort.signal).maybeSingle()
          if (!current()) return
          if (readError || !remoteRow) { setStatus('error'); return }
          if (!isValidRemoteSharedState(remoteRow.state)) { setStatus('error', INVALID_REMOTE_WARNING); return }
          const local = selectSharedState(useAppStore.getState())
          const remote = { ...defaults, ...selectSharedState(remoteRow.state) }
          const merged = rebaseSharedState(base, local, remote, pending, unbased)
          rememberConflicts(merged.groups)
          if (!await persistSyncCheckpoint(context!, local, base, pending, archives, unbased)) { setStatus('error'); return }
          if (!current()) return
          // Conflicting records retain their server versions in the write while
          // independent records, including in the same collection, can proceed.
          const changed = Object.keys(merged.state).some(key => !sameValue(merged.state[key as keyof SharedState], remote[key as keyof SharedState]))
          if (!changed) {
            const failed = await applyRemote(remoteRow.state, remoteRow.updated_at)
            setStatus(failed || dirty ? 'error' : 'ok')
            return
          }
          // Preserve unknown/legacy JSON fields, and always advance the version,
          // even for two saves in one millisecond or a slow local clock.
          const state = { ...remoteRow.state, ...merged.state }
          const updatedAt = new Date(Math.max(Date.now(), Date.parse(remoteRow.updated_at) + 1)).toISOString()
          const { data, error } = await supabase.from('couple_state')
            .update({ state, updated_at: updatedAt })
            .eq('id', context!.stateId).eq('couple_id', context!.coupleId)
            .eq('updated_at', remoteRow.updated_at)
            .select('updated_at').abortSignal(abort.signal).maybeSingle()
          if (!current()) return
          if (error) { setStatus('error'); return }
          if (!data) continue // Another writer won; reread and rebase, bounded above.
          const latest = selectSharedState(useAppStore.getState())
          // Rebase edits made in flight against exactly the local versions sent.
          // Unresolved members keep their original baselines and remain held.
          const acknowledged = rebaseSharedState(merged.acknowledgedBase, latest, merged.state, pending, merged.unbased)
          rememberConflicts(acknowledged.groups)
          if (!await acceptCheckpoint(acknowledged)) {
            dirty = pending.size > 0
            setStatus('error'); return
          }
          if (!current()) return
          applying = true
          try { useAppStore.setState(acknowledged.visible) } finally { applying = false }
          lastAt = data.updated_at
          lastRemote = state
          dirty = pending.size > 0
          setStatus(acknowledged.conflicts.length ? 'error' : dirty ? 'syncing' : 'ok')
          return
        }
        setStatus('error')
      } catch { if (current()) setStatus('error') }
      finally {
        saving = false
        if (current()) publishReview({ busy: resolving || reading })
        // Keep failed work in the scoped cache; retry on the next change/foreground/poll.
        if (current() && dirty && revision !== startingRevision) schedule()
        replayRefresh()
      }
    }
    function schedule() {
      clearTimeout(debounce)
      debounce = setTimeout(() => { void save() }, DEBOUNCE_MS)
    }
    async function pull() {
      if (!current()) return
      if (reading || saving || resolving) { refreshQueued = true; return }
      reading = true
      publishReview({ busy: true })
      try {
        // Retry local persistence even when the network is still unavailable.
        // Pending work is retained; only a successful remote rebase can clear it.
        if (hasCacheStorageError(context!)) {
          await persistSyncCheckpoint(context!, selectSharedState(useAppStore.getState()), base, pending, archives, unbased)
        }
        if (!current()) return
        const { data, error } = await supabase.from('couple_state')
          .select('state, updated_at').eq('id', context!.stateId).eq('couple_id', context!.coupleId)
          .abortSignal(abort.signal).maybeSingle()
        if (!current()) return
        if (error || !data) { setStatus('error'); return }
        if (!isValidRemoteSharedState(data.state)) { setStatus('error', INVALID_REMOTE_WARNING); return }
        // applyRemote preserves pending fields, including edits made during this
        // read, while still loading the other fields before any full-state save.
        const conflicted = (data.updated_at !== lastAt || !sameValue(data.state, lastRemote) || hasCacheStorageError(context!))
          ? await applyRemote(data.state, data.updated_at) : false
        ready = true
        if (dirty) schedule()
        setStatus(conflicted ? 'error' : dirty ? 'syncing' : 'ok')
      } catch { if (current()) setStatus('error') }
      finally {
        reading = false
        if (current()) publishReview({ busy: saving || resolving })
        replayRefresh()
      }
    }
    function replayRefresh() {
      if (!current() || !refreshQueued || reading || saving || resolving || replayTimer) return
      // One follow-up per burst. A new signal during that read queues another.
      replayTimer = setTimeout(() => {
        replayTimer = undefined
        if (!current()) return
        refreshQueued = false
        void pull()
      }, 0)
    }
    async function resolveConflict(reviewed: SyncConflictGroup, choice: 'local' | 'remote') {
      if (!current() || reading || saving || resolving) return
      resolving = true
      publishReview({ busy: true, message: null })
      try {
        const { data, error } = await supabase.from('couple_state').select('state, updated_at')
          .eq('id', context!.stateId).eq('couple_id', context!.coupleId).abortSignal(abort.signal).maybeSingle()
        if (!current()) return
        if (error || !data) { setStatus('error'); publishReview({ message: 'Could not verify the latest version. Keep both versions and retry.' }); return }
        if (!isValidRemoteSharedState(data.state)) { setStatus('error', INVALID_REMOTE_WARNING); return }
        const local = selectSharedState(useAppStore.getState()), remote = { ...defaults, ...selectSharedState(data.state) }
        const fresh = rebaseSharedState(base, local, remote, pending, unbased)
        rememberConflicts(fresh.groups)
        const group = fresh.groups.find(entry => entry.id === reviewed.id)
        if (!group || !sameValue(group, reviewed)) {
          await persistSyncCheckpoint(context!, local, base, pending, archives, unbased)
          publishReview({ message: 'A version changed while you were reviewing. Review the updated versions before choosing again.' }); return
        }
        const resolved = resolveConflictGroup(base, local, group, choice)
        const nextPending = new Set(pending)
        group.members.forEach(member => nextPending.add(member.key))
        const nextUnbased = { ...fresh.unbased }
        for (const member of group.members) {
          if (member.recordId === undefined) delete nextUnbased[member.key]
          else if (nextUnbased[member.key]) nextUnbased[member.key] = nextUnbased[member.key]!.filter(id => id !== member.recordId)
        }
        const rebased = rebaseSharedState(resolved.base, resolved.local, remote, nextPending, nextUnbased)
        const archive: SyncResolutionArchive = { id: crypto.randomUUID(), at: new Date().toISOString(), choice, group: structuredClone(group) }
        const nextArchives = [...archives, archive]
        const capturedRevision = revision
        // Persist both reviewed versions and the resolved pending group before
        // replacing the visible local version or acknowledging a remote choice.
        if (!await persistSyncCheckpoint(context!, rebased.visible, rebased.base, rebased.remaining, nextArchives, rebased.unbased)) {
          setStatus('error'); publishReview({ archives: readSyncArchives(context!), message: 'The choice could not be saved on this device. Both versions are still available. Keep this tab open and retry.' }); return
        }
        if (!current() || revision !== capturedRevision) {
          if (current()) { setStatus('error'); publishReview({ message: 'Local edits changed while saving. Review the latest versions and retry.' }) }
          return
        }
        archives = readSyncArchives(context!); base = rebased.base; unbased = rebased.unbased
        pending.clear(); rebased.remaining.forEach(key => pending.add(key))
        applying = true
        try { useAppStore.setState(rebased.visible) } finally { applying = false }
        dirty = pending.size > 0; revision++
        lastAt = data.updated_at; lastRemote = data.state
        publishReview({ groups: rebased.groups, archives, message: 'Choice saved on this device. Both reviewed versions are retained in recovery history.' })
        setStatus(rebased.conflicts.length ? 'error' : dirty ? 'syncing' : 'ok')
        if (dirty) schedule()
      } catch { if (current()) { setStatus('error'); publishReview({ message: 'Could not save your choice. Keep this tab open and retry.' }) } }
      finally {
        resolving = false
        if (current()) publishReview({ busy: reading || saving })
        replayRefresh()
      }
    }
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (applying || !current()) return
      const next = selectSharedState(state)
      const old = selectSharedState(previous)
      if (Object.keys(next).every(key => next[key as keyof typeof next] === old[key as keyof typeof old])) return
      dirty = true
      for (const key of Object.keys(next) as (keyof typeof next)[]) {
        if (next[key] !== old[key]) {
          if (!pending.has(key)) Object.assign(base, { [key]: old[key] })
          pending.add(key)
        }
      }
      void persistSyncCheckpoint(context!, next, base, pending, archives, unbased).then(ok => { if (current() && !ok) setStatus('error') })
      if (_review.groups.length) publishReview({ message: 'Local edits changed. Verify the latest versions before resolving.' })
      revision++
      if (ready) schedule()
    })
    setStatus('syncing')
    void pull()
    _pullFn = pull
    _resolveFn = resolveConflict
    const pollIfVisible = () => { if (document.visibilityState !== 'hidden') void pull() }
    let timer = setInterval(pollIfVisible, POLL_MS)
    // Reset the interval so a full POLL_MS gap follows each event-driven pull,
    // preventing an immediate double-read from interval + Realtime/visibility/online.
    const resetPollTimer = () => { clearInterval(timer); timer = setInterval(pollIfVisible, POLL_MS) }
    const onVisible = () => { if (document.visibilityState === 'visible') { void pull(); resetPollTimer() } }
    const onOnline  = () => { void pull(); resetPollTimer() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    const channel = supabase.channel('couple-state-' + context.coupleId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'couple_state', filter: 'id=eq.' + context.stateId }, () => { void pull(); resetPollTimer() })
      .subscribe()
    return () => {
      active = false
      abort.abort()
      cancelAuth()
      clearTimeout(debounce)
      clearTimeout(replayTimer)
      clearInterval(timer)
      unsubscribe()
      if (_pullFn === pull) _pullFn = null
      if (_resolveFn === resolveConflict) {
        _resolveFn = null
        publishReview({ groups: [], archives: [], busy: false, message: null })
      }
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      void supabase.removeChannel(channel)
    }
  }, [context])
}
