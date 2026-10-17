'use client'

/**
 * DatePicker — SeMa-styled inline month-grid date picker.
 *
 * Renders as a trigger button that expands into a calendar grid in-place
 * (no absolute/fixed positioning, safe inside bottom sheets on small screens).
 *
 * Usage:
 *   <DatePicker value={date} onChange={setDate} />
 *   <DatePicker value={date} onChange={setDate} accentColor={primary} placeholder="Pick a date" />
 */

import { useState } from 'react'
import {
  format, parseISO,
  startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
  eachDayOfInterval,
  isSameMonth, isSameDay, isToday,
  addMonths, subMonths,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from '@/design/iconSystem'
import { cn } from '@/lib/utils'

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

interface Props {
  value: string              // YYYY-MM-DD or ''
  onChange: (v: string) => void
  placeholder?: string
  accentColor?: string
  className?: string
  /** Additional class for the trigger button */
  triggerClassName?: string
  allowClear?: boolean
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  accentColor = '#9EC9B3',
  className,
  triggerClassName,
  allowClear = true,
}: Props) {
  const selected   = value ? parseISO(value + 'T12:00:00') : null
  const [open, setOpen]         = useState(false)
  const [viewDate, setViewDate] = useState<Date>(selected ?? new Date())

  const monthStart = startOfMonth(viewDate)
  const monthEnd   = endOfMonth(viewDate)
  const calStart   = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd     = endOfWeek(monthEnd,   { weekStartsOn: 1 })
  const days       = eachDayOfInterval({ start: calStart, end: calEnd })

  function pick(day: Date) {
    onChange(format(day, 'yyyy-MM-dd'))
    setOpen(false)
  }

  function clear() {
    onChange('')
    setOpen(false)
  }

  return (
    <div className={cn('w-full', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'w-full text-left text-sm rounded-2xl px-4 py-3 outline-none transition-colors',
          'bg-gray-50 active:bg-gray-100',
          triggerClassName,
        )}
        style={{ color: value ? '#374151' : '#9CA3AF' }}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {value
          ? format(parseISO(value + 'T12:00:00'), 'MMM d, yyyy')
          : placeholder}
      </button>

      {/* Inline calendar — expands below the trigger, no positioning tricks */}
      {open && (
        <div
          role="dialog"
          aria-label="Calendar"
          className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 select-none"
        >
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setViewDate(d => subMonths(d, 1))}
              aria-label="Previous month"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 active:bg-gray-100 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-gray-800">
              {format(viewDate, 'MMMM yyyy')}
            </span>
            <button
              type="button"
              onClick={() => setViewDate(d => addMonths(d, 1))}
              aria-label="Next month"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 active:bg-gray-100 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_LABELS.map(d => (
              <div
                key={d}
                className="text-center text-[10px] font-semibold text-gray-400 py-1"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-1">
            {days.map(day => {
              const inMonth = isSameMonth(day, viewDate)
              const isSel   = selected != null && isSameDay(day, selected)
              const isT     = isToday(day)
              const dayStr  = format(day, 'yyyy-MM-dd')

              return (
                <button
                  key={dayStr}
                  type="button"
                  onClick={() => pick(day)}
                  aria-label={format(day, 'MMMM d, yyyy')}
                  aria-pressed={isSel}
                  className={cn(
                    'h-8 w-full rounded-full text-xs font-medium transition-all',
                    !inMonth && 'text-gray-300 pointer-events-none',
                    inMonth && !isSel && 'text-gray-700 active:bg-gray-100',
                    isT && !isSel && 'font-bold',
                  )}
                  style={{
                    background: isSel
                      ? accentColor
                      : isT && !isSel
                      ? `${accentColor}25`
                      : undefined,
                    color: isSel
                      ? 'white'
                      : isT && !isSel
                      ? accentColor
                      : undefined,
                  }}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>

          {/* Clear */}
          {allowClear && value && (
            <button
              type="button"
              onClick={clear}
              className="w-full mt-3 text-xs text-gray-400 py-1.5 rounded-xl bg-gray-50 active:bg-gray-100 transition-colors"
            >
              Clear date
            </button>
          )}
        </div>
      )}
    </div>
  )
}
