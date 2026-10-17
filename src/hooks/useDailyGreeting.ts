'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { useAppStore } from '@/store/useAppStore'
import { USERS } from '@/types'
import { getDailyGreeting, msToNextPeriodBoundary } from '@/lib/greeting'
import { getTodayString } from '@/lib/utils'

export interface DailyGreetingResult {
  /** Personalized greeting string — null before first render to avoid flash. */
  greeting: string | null
  /** Formatted date label, e.g. "Monday, July 28". */
  dateLabel: string
}

/**
 * Derives a deterministic personalized greeting for the current profile.
 *
 * Greeting updates automatically at morning/afternoon/evening period
 * boundaries without a full page re-mount.
 *
 * This hook is intentionally separated from SeMaRoomHeader so the header
 * component remains a pure presentational element with no store access.
 */
export function useDailyGreeting(): DailyGreetingResult {
  const currentUser = useAppStore(s => s.currentUser)!

  const [greeting,  setGreeting]  = useState<string | null>(null)
  const [dateLabel, setDateLabel] = useState('')

  useEffect(() => {
    function update() {
      const now  = new Date()
      const name = USERS[currentUser].displayName

      setDateLabel(format(now, 'EEEE, MMMM d'))
      setGreeting(getDailyGreeting(name, getTodayString(), now))

      // Schedule next update at the period boundary (morning/afternoon/evening)
      return msToNextPeriodBoundary(now)
    }

    const ms    = update()
    const timer = setTimeout(update, ms)
    return () => clearTimeout(timer)
  }, [currentUser])

  return { greeting, dateLabel }
}
