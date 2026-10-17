'use client'

import { useSyncExternalStore } from 'react'
import { getCacheStorageWarning, subscribeCacheStorage } from '@/lib/couple-cache'
import { triggerPull, useSyncStatus } from '@/hooks/useSupabaseSync'

export function SyncSafetyWarning() {
  const storageWarning = useSyncExternalStore(subscribeCacheStorage, getCacheStorageWarning, () => null)
  const { warning: syncWarning } = useSyncStatus()
  const warning = storageWarning ?? syncWarning
  if (!warning) return null
  return (
    <div role="alert" className="fixed top-3 left-3 right-3 z-[1000] mx-auto max-w-lg rounded-xl bg-amber-50 p-4 text-sm text-amber-950 shadow-lg">
      <p>{warning}</p>
      <button type="button" onClick={triggerPull} className="mt-2 rounded-lg border border-amber-700 px-3 py-1 font-semibold">
        Retry
      </button>
    </div>
  )
}
