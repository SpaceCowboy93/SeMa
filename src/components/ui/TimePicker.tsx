'use client'

/**
 * TimePicker — SeMa-styled inline scroll-wheel time picker (24-hour).
 *
 * Two-column drum-roller UI: Hours (0–23) | Minutes (0–59).
 * - Touch-friendly snapping scroll on mobile.
 * - Keyboard accessible on desktop (arrow keys, Enter, Escape).
 * - Renders inline — no absolute/fixed positioning, safe inside bottom sheets.
 *
 * Usage:
 *   <TimePicker value={time} onChange={setTime} />
 *   <TimePicker value={time} onChange={setTime} accentColor="#9EC9B3" allowClear={false} />
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'

const ITEM_H = 40   // px — height of each drum item
const VISIBLE = 5   // odd number of visible rows (selected is the middle)
const HALF = Math.floor(VISIBLE / 2)

const HOURS   = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)

function pad(n: number) { return String(n).padStart(2, '0') }

function parseTime(value: string): { hour: number; minute: number } {
  if (!value) return { hour: 8, minute: 0 }
  const [h, m] = value.split(':').map(Number)
  return {
    hour:   Number.isFinite(h) ? h : 8,
    minute: Number.isFinite(m) ? m : 0,
  }
}

// ── DrumColumn ─────────────────────────────────────────────────────────────────

interface DrumProps {
  items:       number[]
  selected:    number
  onSelect:    (v: number) => void
  accentColor: string
  label:       string
}

function DrumColumn({ items, selected, onSelect, accentColor, label }: DrumProps) {
  const listRef      = useRef<HTMLDivElement>(null)
  const snapTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const programmatic = useRef(false)

  // Scroll the drum to center the selected item
  const scrollTo = useCallback((index: number, smooth = false) => {
    const el = listRef.current
    if (!el) return
    const target = index * ITEM_H
    programmatic.current = true
    el.scrollTo({ top: target, behavior: smooth ? 'smooth' : 'instant' })
    // Reset flag after animation settles
    setTimeout(() => { programmatic.current = false }, smooth ? 350 : 50)
  }, [])

  // Initial paint and whenever selected changes externally
  useEffect(() => {
    scrollTo(selected)
  }, [selected, scrollTo])

  // Snap after user stops scrolling (debounced)
  function handleScroll() {
    if (programmatic.current) return
    if (snapTimer.current) clearTimeout(snapTimer.current)
    snapTimer.current = setTimeout(() => {
      const el = listRef.current
      if (!el) return
      const idx     = Math.round(el.scrollTop / ITEM_H)
      const clamped = Math.max(0, Math.min(idx, items.length - 1))
      scrollTo(clamped, true)
      if (clamped !== selected) onSelect(items[clamped])
    }, 80)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const idx = items.indexOf(selected)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(idx + 1, items.length - 1)
      onSelect(items[next])
      scrollTo(next, true)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = Math.max(idx - 1, 0)
      onSelect(items[prev])
      scrollTo(prev, true)
    }
  }

  const containerH = VISIBLE * ITEM_H

  return (
    <div className="flex flex-col items-center flex-1" aria-label={label}>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <div
        className="relative overflow-hidden rounded-xl"
        style={{ height: containerH }}
      >
        {/* Selected-row highlight */}
        <div
          className="absolute inset-x-0 pointer-events-none z-10 rounded-lg"
          style={{
            top:    HALF * ITEM_H,
            height: ITEM_H,
            background: `${accentColor}22`,
            borderTop:    `1px solid ${accentColor}44`,
            borderBottom: `1px solid ${accentColor}44`,
          }}
        />

        {/* Scroll container */}
        <div
          ref={listRef}
          role="listbox"
          aria-label={label}
          tabIndex={0}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          className="h-full overflow-y-scroll outline-none"
          style={{
            scrollSnapType:   'y mandatory',
            scrollbarWidth:   'none',
            // Padding pushes content so first/last items can be centered
            paddingTop:    HALF * ITEM_H,
            paddingBottom: HALF * ITEM_H,
          }}
        >
          {items.map(v => (
            <div
              key={v}
              role="option"
              aria-selected={v === selected}
              onClick={() => { onSelect(v); scrollTo(items.indexOf(v), true) }}
              style={{
                height:          ITEM_H,
                scrollSnapAlign: 'center',
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                cursor:          'pointer',
                fontVariantNumeric: 'tabular-nums',
                fontSize:        '1.125rem',
                fontWeight:      v === selected ? 700 : 400,
                color:           v === selected ? accentColor : '#6B7280',
                transition:      'color 120ms, font-weight 120ms',
              }}
            >
              {pad(v)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── TimePicker ─────────────────────────────────────────────────────────────────

interface Props {
  value:           string           // "HH:MM" or ''
  onChange:        (v: string) => void
  placeholder?:    string
  accentColor?:    string
  className?:      string
  triggerClassName?: string
  allowClear?:     boolean
}

export function TimePicker({
  value,
  onChange,
  placeholder   = 'Select time',
  accentColor   = '#8FA68D',
  className,
  triggerClassName,
  allowClear    = true,
}: Props) {
  const [open, setOpen] = useState(false)
  const { hour, minute } = parseTime(value)

  const [pendingH, setPendingH] = useState(hour)
  const [pendingM, setPendingM] = useState(minute)

  // Sync local state when the picker opens
  function handleOpen() {
    const { hour: h, minute: m } = parseTime(value)
    setPendingH(h)
    setPendingM(m)
    setOpen(v => !v)
  }

  function handleConfirm() {
    onChange(`${pad(pendingH)}:${pad(pendingM)}`)
    setOpen(false)
  }

  function handleClear() {
    onChange('')
    setOpen(false)
  }

  // Close on Escape
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    if (e.key === 'Enter')  { e.preventDefault(); handleConfirm() }
  }

  const displayH = value ? parseTime(value).hour   : null
  const displayM = value ? parseTime(value).minute  : null

  return (
    <div className={cn('w-full', className)} onKeyDown={handleKeyDown}>
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          'w-full text-left text-sm rounded-2xl px-4 py-3 outline-none transition-colors',
          'bg-gray-50 active:bg-gray-100',
          triggerClassName,
        )}
        style={{ color: value ? '#374151' : '#9CA3AF' }}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {value && displayH !== null && displayM !== null
          ? `${pad(displayH)}:${pad(displayM)}`
          : placeholder}
      </button>

      {/* Inline drum panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Time picker"
          className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 select-none"
        >
          <div className="flex gap-4 items-start">
            <DrumColumn
              items={HOURS}
              selected={pendingH}
              onSelect={setPendingH}
              accentColor={accentColor}
              label="Hour"
            />

            {/* Separator */}
            <div className="flex items-center justify-center" style={{ paddingTop: HALF * ITEM_H + 18 }}>
              <span className="text-xl font-bold text-gray-400">:</span>
            </div>

            <DrumColumn
              items={MINUTES}
              selected={pendingM}
              onSelect={setPendingM}
              accentColor={accentColor}
              label="Min"
            />
          </div>

          {/* Actions */}
          <div className="mt-3 flex gap-2">
            {allowClear && value && (
              <button
                type="button"
                onClick={handleClear}
                className="flex-1 text-xs text-gray-400 py-2 rounded-xl bg-gray-50 active:bg-gray-100 transition-colors"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 text-xs font-semibold py-2 rounded-xl text-white transition-colors"
              style={{ background: accentColor }}
            >
              Set {pad(pendingH)}:{pad(pendingM)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
