'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Status = 'checking' | 'ok' | 'error'

export function SyncStatusDot() {
  const [status, setStatus] = useState<Status>('checking')
  const [tooltip, setTooltip] = useState('')

  useEffect(() => {
    async function test() {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!url || !key) {
        setStatus('error')
        setTooltip('Env vars missing')
        console.error('[Sync] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is undefined')
        return
      }

      const { error } = await supabase
        .from('couple_state')
        .select('id')
        .eq('id', 'sema')
        .maybeSingle()

      if (error) {
        setStatus('error')
        setTooltip(error.message)
        console.error('[Sync] connection test failed:', error.message)
      } else {
        setStatus('ok')
        setTooltip('Sync connected')
        console.log('[Sync] connection test OK')
      }
    }
    test()
  }, [])

  return (
    <div
      title={`Sync: ${tooltip}`}
      className="fixed top-3 right-3 z-[999] pointer-events-none"
    >
      <div
        className={`w-2.5 h-2.5 rounded-full ${
          status === 'checking' ? 'bg-yellow-400 animate-pulse' :
          status === 'ok'       ? 'bg-emerald-400' :
                                  'bg-red-500 animate-pulse'
        }`}
      />
    </div>
  )
}
