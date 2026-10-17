'use client'

import { useMemo, useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { getWeekKey, getWeekLabel } from '@/lib/utils'
import { C2Sheet, C2SheetHeader, C2SheetBody } from '@/components/ui'

interface Props {
  open: boolean
  onClose: () => void
  onSelectWeek: (weekKey: string) => void
  currentWeekKey: string
}

export function WeekBrowserSheet({ open, onClose, onSelectWeek, currentWeekKey }: Props) {
  const focusActivities = useAppStore(s => s.focusActivities)
  const openOverlay     = useAppStore(s => s.openOverlay)
  const closeOverlay    = useAppStore(s => s.closeOverlay)

  useEffect(() => {
    if (!open) return
    openOverlay()
    return () => closeOverlay()
  }, [open, openOverlay, closeOverlay])
  const thisWeekKey     = getWeekKey()

  // Collect all unique week keys that have activities, sorted newest-first
  const weekKeys = useMemo(() => {
    const keys = new Set<string>()
    focusActivities.forEach(a => keys.add(a.weekKey))
    // Always include current calendar week
    keys.add(thisWeekKey)
    return Array.from(keys).sort((a, b) => b.localeCompare(a))
  }, [focusActivities, thisWeekKey])

  return (
    <C2Sheet open={open} onClose={onClose} aria-label="Week History">
      <C2SheetHeader title="Week History" subtitle="Browse previous weeks" onClose={onClose} />

      <C2SheetBody className="space-y-1 pb-8">
        {weekKeys.map(key => {
          const isActive  = key === currentWeekKey
          const isCurrent = key === thisWeekKey
          const actCount  = focusActivities.filter(a => a.weekKey === key).length

          return (
            <button
              key={key}
              onClick={() => onSelectWeek(key)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-colors active:bg-gray-50"
              style={isActive ? { background: 'rgba(255,255,255,0.55)' } : undefined}
            >
              <div className="text-left">
                <p className="text-sm font-medium text-gray-800">
                  {getWeekLabel(key)}
                  {isCurrent && (
                    <span className="ml-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                      Current
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {actCount === 0
                    ? 'No activities'
                    : `${actCount} activit${actCount !== 1 ? 'ies' : 'y'}`}
                </p>
              </div>
              {isActive && (
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
              )}
            </button>
          )
        })}

        {weekKeys.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">
            No weeks yet.
          </div>
        )}
      </C2SheetBody>
    </C2Sheet>
  )
}
