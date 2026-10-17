'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Camera, Plus, ChevronDown, ChevronRight, ChevronUp,
  Check, X, Trash2, AlignJustify, ShoppingBag,
  CheckCircle2, Leaf, Pencil,
  Coffee, Milk, Beef, Croissant, Egg, Banana, Apple,
  Wine, Beer, Fish, Citrus, Droplets, Carrot, Cherry,
  Grape, Salad,
  type LucideIcon,
} from '@/design/iconSystem'
import { useAppStore } from '@/store/useAppStore'
import { getLivingMoment } from '@/lib/livingMoment'
import { getTodayString, cn } from '@/lib/utils'
import { C2PageBackground } from '@/components/ui/C2PageBackground'
import { SeMaRoomHeader } from '@/components/ui/SeMaRoomHeader'
import { C2_ROOM_HEADERS } from '@/lib/c2RoomHeaders'
import { ShoppingListEditorSheet } from '@/components/ui/ShoppingListEditorSheet'
import { ReceiptScannerSheet } from '@/components/ui/ReceiptScannerSheet'
import { ReceiptReviewSheet } from '@/components/ui/ReceiptReviewSheet'
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet'
import { type ShoppingItem, type ShoppingList, type ReceiptResult, type ShoppingListReceipt } from '@/types'

/* ─────────────────────────────────────────────────────────────────────────────
   Palette — matches the warm natural reference
───────────────────────────────────────────────────────────────────────────── */
const C = {
  bg:         '#F0EDE2',   // warm cream — matches reference
  card:       'rgba(255,255,255,0.82)',
  cardBorder: 'rgba(0,0,0,0.055)',
  shadow:     '0 1px 6px rgba(30,25,18,0.07)',
  shadowLg:   '0 2px 12px rgba(30,25,18,0.08)',
  textDark:   '#1A1814',   // very dark warm charcoal
  textMid:    '#6B6458',   // warm brown-gray
  textLight:  '#9A9085',   // warm muted
  sage:       '#4E7853',   // primary sage
  sageMid:    '#7A9870',   // mid sage for botanicals
  badgeBg:    '#D6E2D0',   // icon badge background
  badgeFg:    '#4E7853',
  divider:    'rgba(30,25,18,0.07)',
} as const


/* ─────────────────────────────────────────────────────────────────────────────
   Small botanical leaf — used inline in estimated total card
───────────────────────────────────────────────────────────────────────────── */
function BotanicalLeaf({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 130" fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('pointer-events-none', className)}>
      <path d="M68 118 Q72 72 102 16" stroke="#8FA68D" strokeWidth="1.4" strokeLinecap="round" />
      <ellipse cx="90" cy="44" rx="15" ry="8.5" transform="rotate(-42 90 44)" fill="#8FA68D" />
      <ellipse cx="103" cy="23" rx="12" ry="7" transform="rotate(-58 103 23)" fill="#8FA68D" />
      <ellipse cx="79" cy="68" rx="13.5" ry="7.5" transform="rotate(-28 79 68)" fill="#8FA68D" />
      <ellipse cx="70" cy="92" rx="10.5" ry="6" transform="rotate(-16 70 92)" fill="#8FA68D" />
    </svg>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Category icon lookup
───────────────────────────────────────────────────────────────────────────── */
function getCategoryIcon(name: string): LucideIcon {
  const n = name.toLowerCase()
  if (/chicken|turkey|poult|meat|beef|pork|lamb/.test(n)) return Beef
  if (/banana/.test(n))                                    return Banana
  if (/coffee|espresso|cappuc/.test(n))                    return Coffee
  if (/tomato|citrus|lemon|lime/.test(n))                  return Citrus
  if (/olive|oil/.test(n))                                 return Droplets
  if (/milk|lait|cream/.test(n))                           return Milk
  if (/bread|baguette|croissant|toast/.test(n))            return Croissant
  if (/egg/.test(n))                                       return Egg
  if (/apple/.test(n))                                     return Apple
  if (/orange/.test(n))                                    return Citrus
  if (/wine/.test(n))                                      return Wine
  if (/beer/.test(n))                                      return Beer
  if (/fish|salmon|tuna|cod/.test(n))                      return Fish
  if (/carrot/.test(n))                                    return Carrot
  if (/salad|lettuce|greens/.test(n))                      return Salad
  if (/cherry/.test(n))                                    return Cherry
  if (/grape/.test(n))                                     return Grape
  return ShoppingBag
}

function CategoryBadge({ name, dim = false }: { name: string; dim?: boolean }) {
  const Icon = getCategoryIcon(name)
  return (
    <div
      className="shrink-0 flex items-center justify-center"
      style={{
        width: 30, height: 30,
        borderRadius: 8,
        background: dim ? 'rgba(210,210,204,0.45)' : C.badgeBg,
      }}
    >
      <Icon size={14} strokeWidth={1.5} style={{ color: dim ? '#b0a898' : C.badgeFg }} />
    </div>
  )
}

const ACTIVE_LIMIT = 5

/* ─────────────────────────────────────────────────────────────────────────────
   Page
───────────────────────────────────────────────────────────────────────────── */
export default function ShoppingPage() {
  const currentUser  = useAppStore(s => s.currentUser)!
  const lists        = useAppStore(s => s.shoppingLists)
  const events       = useAppStore(s => s.events)
  const countdowns   = useAppStore(s => s.countdowns)
  const todos        = useAppStore(s => s.todos)
  const partnerNotes = useAppStore(s => s.partnerNotes)
  const createList   = useAppStore(s => s.createShoppingList)
  const updateList   = useAppStore(s => s.updateShoppingList)
  const deleteList   = useAppStore(s => s.deleteShoppingList)
  const addItem      = useAppStore(s => s.addShoppingItem)
  const toggleItem   = useAppStore(s => s.toggleShoppingItem)
  const deleteItem   = useAppStore(s => s.deleteShoppingItem)
  const updateItem   = useAppStore(s => s.updateShoppingItem)
  const openOverlay  = useAppStore(s => s.openOverlay)
  const closeOverlay = useAppStore(s => s.closeOverlay)

  const today = getTodayString()

  const living = useMemo(() => getLivingMoment({
    events, countdowns, shoppingLists: lists, todos, partnerNotes, currentUser, today,
  }), [events, countdowns, lists, todos, partnerNotes, currentUser, today])

  /* ── Derived lists ──────────────────────────────────────────────────────── */
  const incompleteLists = useMemo(
    () => [...lists.filter(l => !l.isCompleted)].sort(
      (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    ),
    [lists]
  )
  const completedLists = useMemo(
    () => [...lists.filter(l => l.isCompleted)].sort(
      (a, b) => (b.completedAt ?? b.updatedAt ?? b.createdAt ?? '').localeCompare(
                  a.completedAt ?? a.updatedAt ?? a.createdAt ?? '')
    ),
    [lists]
  )

  const listCount    = incompleteLists.length
  const totalPending = incompleteLists.reduce(
    (acc, l) => acc + l.items.filter(i => !i.isChecked).length, 0
  )

  const eyebrow = living.shoppingTitle || 'Our kitchen'

  const subtitle = listCount === 0
    ? 'Everything is home.'
    : listCount === 1
      ? `${totalPending} thing${totalPending !== 1 ? 's' : ''} left to bring home.`
      : `${totalPending} thing${totalPending !== 1 ? 's' : ''} left altogether.`

  /* ── UI state ───────────────────────────────────────────────────────────── */
  const [expandedListId,   setExpandedListId]   = useState<string | null>(null)
  const [completedSubOpen, setCompletedSubOpen] = useState(false)
  const [pastListsOpen,    setPastListsOpen]    = useState(false)
  const [showAllActive,    setShowAllActive]    = useState(false)

  const listSectionRef = useRef<HTMLDivElement>(null)

  const hasMoreActive = incompleteLists.length > ACTIVE_LIMIT
  const visibleLists  = showAllActive ? incompleteLists : incompleteLists.slice(0, ACTIVE_LIMIT)
  const hiddenCount   = incompleteLists.length - ACTIVE_LIMIT

  function handleCollapseActive() {
    setShowAllActive(false)
    setTimeout(() => {
      const main    = document.querySelector('main')
      const section = listSectionRef.current
      if (!main || !section) return
      const sectionTop = section.getBoundingClientRect().top
                        + main.scrollTop
                        - main.getBoundingClientRect().top
      if (main.scrollTop > sectionTop + 24) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 50)
  }

  const prevExpandedRef = useRef<string | null>(null)
  useEffect(() => {
    if (expandedListId !== prevExpandedRef.current) {
      setCompletedSubOpen(false)
      prevExpandedRef.current = expandedListId
    }
  }, [expandedListId])

  function toggleExpand(id: string) {
    setExpandedListId(prev => prev === id ? null : id)
    setAddFocused(false)
    setAddName('')
    setAddQty('1')
    setEditingItem(null)
  }

  /* ── Sheet state ────────────────────────────────────────────────────────── */
  const [scannerOpen,  setScannerOpen]  = useState(false)
  const [scanResult,   setScanResult]   = useState<ReceiptResult | null>(null)
  const [scanPhotos,   setScanPhotos]   = useState<string[]>([])
  const [editorMode,   setEditorMode]   = useState<'create' | 'edit' | null>(null)
  const [editListId,   setEditListId]   = useState<string | null>(null)
  const [deleteListId, setDeleteListId] = useState<string | null>(null)

  const editList = editListId ? lists.find(l => l.id === editListId) ?? null : null

  const anySheetOpen = scannerOpen || !!scanResult || editorMode !== null || !!deleteListId
  useEffect(() => {
    if (!anySheetOpen) return
    openOverlay()
    return () => closeOverlay()
  }, [anySheetOpen, openOverlay, closeOverlay])

  /* ── Inline add ─────────────────────────────────────────────────────────── */
  const [addFocused,      setAddFocused]      = useState(false)
  const [addTargetListId, setAddTargetListId] = useState<string | null>(null)
  const [addName,         setAddName]         = useState('')
  const [addQty,          setAddQty]          = useState('1')
  const [addPrice,        setAddPrice]        = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)

  function openAdd(listId: string) {
    setExpandedListId(listId)
    setAddTargetListId(listId)
    setAddFocused(true)
    requestAnimationFrame(() => addInputRef.current?.focus())
  }

  function confirmAdd() {
    if (!addName.trim() || !addTargetListId) return
    addItem(addTargetListId, addName.trim(), parseFloat(addQty) || 1, undefined, parseFloat(addPrice) || undefined)
    setAddName('')
    setAddQty('1')
    setAddPrice('')
    requestAnimationFrame(() => addInputRef.current?.focus())
  }

  function cancelAdd() {
    setAddFocused(false)
    setAddName('')
    setAddQty('1')
    setAddPrice('')
  }

  /* ── Inline item edit ───────────────────────────────────────────────────── */
  const [editingItem, setEditingItem] = useState<{ listId: string; itemId: string } | null>(null)
  const [editName,    setEditName]    = useState('')
  const [editQty,     setEditQty]     = useState('1')
  const [editPrice,   setEditPrice]   = useState('')
  const [editNotes,   setEditNotes]   = useState('')

  function startEdit(listId: string, item: ShoppingItem) {
    setEditingItem({ listId, itemId: item.id })
    setEditName(item.name)
    setEditQty(String(item.quantity))
    setEditPrice(item.price != null ? String(item.price) : '')
    setEditNotes(item.notes ?? '')
  }

  function saveEdit() {
    if (!editingItem || !editName.trim()) return
    updateItem(editingItem.listId, editingItem.itemId, {
      name:     editName.trim(),
      quantity: parseFloat(editQty)    || 1,
      price:    parseFloat(editPrice) || undefined,
      notes:    editNotes.trim()      || undefined,
    })
    setEditingItem(null)
  }

  /* ── Receipt ────────────────────────────────────────────────────────────── */
  function handleScanSave(result: ReceiptResult) {
    const name = result.store
      ? `${result.store} receipt`
      : `Receipt ${result.date || new Date().toLocaleDateString()}`
    const receipt: ShoppingListReceipt = {
      ...result,
      photos: scanPhotos.length ? scanPhotos : undefined,
    }
    const newId = createList({ name })
    setTimeout(() => updateList(newId, { receipt }), 0)
    setScanResult(null)
    setScanPhotos([])
    setExpandedListId(newId)
  }

  /* ── Helpers ────────────────────────────────────────────────────────────── */
  function listEstTotal(list: ShoppingList): { total: number; count: number } {
    let total = 0, count = 0
    for (const item of list.items) {
      if (!item.isChecked && item.price != null && item.price > 0) {
        total += item.price * item.quantity
        count++
      }
    }
    return { total, count }
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen pb-44">
      <C2PageBackground />

      <SeMaRoomHeader
        eyebrow={eyebrow}
        title={<>This week&apos;s<br />kitchen</>}
        subtitle={subtitle}
        imageSrc={C2_ROOM_HEADERS.shopping.src}
        imageObjectPosition={C2_ROOM_HEADERS.shopping.imageObjectPosition}
        imageGradientBoost={C2_ROOM_HEADERS.shopping.gradientBoost}
      />

      {/* ══════════════════════════════════════════════════════════════════════
          ACTION ROW — scan / new list
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="px-5 pb-5 grid grid-cols-2 gap-3">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setScannerOpen(true)}
          className="flex items-center gap-3 px-4 rounded-[18px] text-left"
          style={{
            height: 68,
            background: 'rgba(255,255,255,0.68)',
            border: `1px solid ${C.cardBorder}`,
            boxShadow: '0 1px 4px rgba(30,25,18,0.05)',
          }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: C.badgeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Camera size={16} strokeWidth={1.5} style={{ color: C.badgeFg }} />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: C.textDark, lineHeight: 1.3 }}>Scan receipt</p>
            <p style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>Add items in a second</p>
          </div>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => { setEditorMode('create'); setEditListId(null) }}
          className="flex items-center gap-3 px-4 rounded-[18px] text-left"
          style={{
            height: 68,
            background: 'rgba(255,255,255,0.68)',
            border: `1px solid ${C.cardBorder}`,
            boxShadow: '0 1px 4px rgba(30,25,18,0.05)',
          }}
        >
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.sage, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Plus size={16} strokeWidth={2.2} style={{ color: '#fff' }} />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: C.textDark, lineHeight: 1.3 }}>New list</p>
            <p style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>Start another list</p>
          </div>
        </motion.button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ACTIVE LISTS
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="px-5">

        {incompleteLists.length === 0 ? (

          /* ── Editorial empty state ─────────────────────────────────────── */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg aria-hidden="true" viewBox="0 0 120 130" fill="none" xmlns="http://www.w3.org/2000/svg"
              style={{ width: 52, height: 52, marginBottom: 20, opacity: 0.30 }}>
              <path d="M68 118 Q72 72 102 16" stroke="#5A7A5A" strokeWidth="1.8" strokeLinecap="round" />
              <ellipse cx="90" cy="44" rx="15" ry="8.5" transform="rotate(-42 90 44)" fill="#5A7A5A" />
              <ellipse cx="103" cy="23" rx="12" ry="7" transform="rotate(-58 103 23)" fill="#5A7A5A" />
              <ellipse cx="79" cy="68" rx="13.5" ry="7.5" transform="rotate(-28 79 68)" fill="#5A7A5A" />
              <ellipse cx="70" cy="92" rx="10.5" ry="6" transform="rotate(-16 70 92)" fill="#5A7A5A" />
            </svg>
            <p style={{ fontFamily: 'var(--font-playfair)', fontSize: 22, fontWeight: 600, color: C.textDark, marginBottom: 10, lineHeight: 1.25 }}>
              Everything is home.
            </p>
            <p style={{ fontSize: 13, color: C.textLight, marginBottom: 28, lineHeight: 1.65, maxWidth: 210 }}>
              Your kitchen is ready for the week.<br />Start a new list when you need it.
            </p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { setEditorMode('create'); setEditListId(null) }}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl text-white"
              style={{ background: C.sage, fontSize: 13, fontWeight: 600 }}
            >
              <Plus size={14} strokeWidth={2} /> New list
            </motion.button>
          </div>

        ) : (
          <>
            {/* ── Section header ─────────────────────────────────────────── */}
            <div ref={listSectionRef} className="flex items-center gap-2.5 mb-4">
              <AlignJustify size={14} strokeWidth={1.6} style={{ color: C.sage, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.textDark }}>Active list</span>
              <div className="flex-1 h-px" style={{ background: C.divider }} />
              <span style={{
                fontSize: 11, fontWeight: 600,
                background: C.badgeBg, color: C.badgeFg,
                padding: '2px 9px', borderRadius: 20,
              }}>
                {listCount}
              </span>
            </div>

            {/* ── List rows ──────────────────────────────────────────────── */}
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {visibleLists.map(list => {
                  const isExpanded   = expandedListId === list.id
                  const pending      = list.items.filter(i => !i.isChecked)
                  const done         = list.items.filter(i =>  i.isChecked)
                  const pendingCount = pending.length
                  const totalItems   = list.items.length
                  const pct          = totalItems > 0 ? ((totalItems - pendingCount) / totalItems) * 100 : 0
                  const { total: est, count: pricedCount } = listEstTotal(list)

                  return (
                    <motion.div
                      key={list.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    >
                      {/* List header row */}
                      <motion.button
                        whileTap={{ scale: 0.99 }}
                        onClick={() => toggleExpand(list.id)}
                        className="w-full flex items-center justify-between px-4 text-left"
                        style={{
                          minHeight: 72,
                          background: isExpanded ? 'rgba(255,255,255,0.92)' : C.card,
                          boxShadow: isExpanded ? C.shadowLg : C.shadow,
                          border: `1px solid ${C.cardBorder}`,
                          borderRadius: isExpanded ? '16px 16px 0 0' : 16,
                          paddingTop: 16,
                          paddingBottom: 16,
                          display: 'flex',
                          alignItems: 'center',
                          borderBottom: isExpanded ? 'none' : undefined,
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p style={{ fontSize: 15, fontWeight: 600, color: C.textDark, lineHeight: 1.3, marginBottom: 2 }} className="truncate">
                            {list.name}
                          </p>
                          <p style={{ fontSize: 11, color: C.textLight }}>
                            {list.storeName ? `${list.storeName} · ` : ''}
                            {pendingCount === 0
                              ? 'All done'
                              : `${pendingCount} item${pendingCount !== 1 ? 's' : ''} remaining`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <button
                            onClick={e => { e.stopPropagation(); setEditListId(list.id); setEditorMode('edit') }}
                            aria-label={`Edit ${list.name}`}
                            className="p-1.5 active:opacity-60 transition-opacity"
                          >
                            <Pencil size={13} strokeWidth={1.5} style={{ color: '#c8c0b4' }} />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteListId(list.id) }}
                            aria-label={`Delete ${list.name}`}
                            className="p-1.5 active:opacity-60 transition-opacity"
                          >
                            <Trash2 size={13} strokeWidth={1.5} style={{ color: '#c8c0b4' }} />
                          </button>
                          {isExpanded
                            ? <ChevronUp   size={16} strokeWidth={1.8} style={{ color: C.textLight }} />
                            : <ChevronRight size={16} strokeWidth={1.8} style={{ color: C.textLight }} />
                          }
                        </div>
                      </motion.button>

                      {/* Expanded content */}
                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                            style={{ overflow: 'hidden' }}
                          >
                            <div style={{
                              background: 'rgba(255,255,255,0.92)',
                              borderRadius: '0 0 16px 16px',
                              boxShadow: C.shadowLg,
                              border: `1px solid ${C.cardBorder}`,
                              borderTop: `1px solid rgba(30,25,18,0.05)`,
                            }}>

                              {/* Progress bar */}
                              {totalItems > 0 && (
                                <div className="mx-4 pt-2.5 pb-1">
                                  <div className="h-[2px] rounded-full overflow-hidden" style={{ background: 'rgba(30,25,18,0.06)' }}>
                                    <motion.div
                                      className="h-full rounded-full"
                                      style={{ background: '#C8D8C4' }}
                                      animate={{ width: `${pct}%` }}
                                      transition={{ duration: 0.4, ease: 'easeOut' }}
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Pending items */}
                              <AnimatePresence initial={false}>
                                {pending.map(item => {
                                  const isEditing =
                                    editingItem?.listId === list.id && editingItem.itemId === item.id
                                  return (
                                    <motion.div
                                      key={item.id}
                                      layout
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      exit={{ opacity: 0, height: 0 }}
                                      transition={{ duration: 0.14 }}
                                      className="border-b"
                                      style={{ borderColor: 'rgba(30,25,18,0.05)' }}
                                    >
                                      {isEditing ? (
                                        <div className="px-4 py-3 space-y-2">
                                          <div className="flex gap-2">
                                            <input
                                              value={editName}
                                              onChange={e => setEditName(e.target.value)}
                                              autoFocus
                                              onKeyDown={e => { if (e.key === 'Enter') saveEdit() }}
                                              className="flex-1 text-sm rounded-xl px-3 py-2.5 outline-none"
                                              style={{ background: 'rgba(30,25,18,0.04)', color: C.textDark }}
                                              placeholder="Item name"
                                            />
                                            <input
                                              type="number" min="0" step="any" inputMode="decimal"
                                              value={editQty}
                                              onChange={e => setEditQty(e.target.value)}
                                              className="w-12 text-sm text-center rounded-xl px-2 py-2.5 outline-none"
                                              style={{ background: 'rgba(30,25,18,0.04)', color: C.textDark }}
                                            />
                                            <input
                                              type="number" min="0" step="any" inputMode="decimal"
                                              value={editPrice}
                                              onChange={e => setEditPrice(e.target.value)}
                                              placeholder="€"
                                              className="w-16 text-sm text-right rounded-xl px-2 py-2.5 outline-none"
                                              style={{ background: 'rgba(30,25,18,0.04)', color: C.textDark }}
                                            />
                                          </div>
                                          <input
                                            value={editNotes}
                                            onChange={e => setEditNotes(e.target.value)}
                                            placeholder="Note (optional)"
                                            className="w-full text-xs rounded-xl px-3 py-2 outline-none"
                                            style={{ background: 'rgba(30,25,18,0.04)', color: C.textMid }}
                                          />
                                          <div className="flex gap-2">
                                            <button
                                              onClick={saveEdit}
                                              disabled={!editName.trim()}
                                              className="flex-1 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-40"
                                              style={{ background: C.sage }}
                                            >
                                              Save
                                            </button>
                                            <button
                                              onClick={() => setEditingItem(null)}
                                              className="flex-1 py-2 rounded-xl text-xs font-semibold"
                                              style={{ background: 'rgba(30,25,18,0.07)', color: C.textMid }}
                                            >
                                              Cancel
                                            </button>
                                            <button
                                              onClick={() => { deleteItem(list.id, item.id); setEditingItem(null) }}
                                              className="w-10 py-2 rounded-xl flex items-center justify-center"
                                              style={{ background: 'rgba(200,60,60,0.07)', color: '#c84040' }}
                                            >
                                              <Trash2 size={13} />
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-3 px-4" style={{ height: 62 }}>
                                          <motion.button
                                            whileTap={{ scale: 0.82 }}
                                            onClick={() => toggleItem(list.id, item.id)}
                                            aria-label={`Mark ${item.name} as done`}
                                            className="shrink-0 rounded-full border-[1.5px] flex items-center justify-center"
                                            style={{ width: 20, height: 20, borderColor: '#C8D8C4' }}
                                          />
                                          <CategoryBadge name={item.name} />
                                          <div className="flex-1 min-w-0">
                                            <p className="truncate" style={{ fontSize: 14, fontWeight: 500, color: C.textDark, lineHeight: 1.3 }}>
                                              {item.name}
                                            </p>
                                            {item.notes && (
                                              <p className="truncate mt-0.5" style={{ fontSize: 11, color: C.textLight }}>
                                                {item.notes}
                                              </p>
                                            )}
                                          </div>
                                          <span className="shrink-0 tabular-nums" style={{ fontSize: 13, color: C.textMid, minWidth: 24, textAlign: 'right' }}>
                                            {item.quantity}
                                          </span>
                                          <button
                                            onClick={() => startEdit(list.id, item)}
                                            aria-label={`Edit ${item.name}`}
                                            className="shrink-0 -mr-1 p-1 active:opacity-60"
                                          >
                                            <AlignJustify size={14} strokeWidth={1.5} style={{ color: '#c8c0b4' }} />
                                          </button>
                                        </div>
                                      )}
                                    </motion.div>
                                  )
                                })}
                              </AnimatePresence>

                              {/* Add item row */}
                              {addFocused && addTargetListId === list.id ? (
                                <div className="border-b" style={{ borderColor: 'rgba(30,25,18,0.05)' }}>
                                  {/* Row 1: name + qty + actions */}
                                  <div className="flex items-center gap-3 px-4" style={{ height: 56 }}>
                                    <div className="shrink-0 rounded-full border-[1.5px] border-dashed" style={{ width: 20, height: 20, borderColor: '#c8c0b4' }} />
                                    <div className="w-7 h-7 shrink-0" />
                                    <input
                                      ref={addInputRef}
                                      value={addName}
                                      onChange={e => setAddName(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') confirmAdd()
                                        if (e.key === 'Escape') cancelAdd()
                                      }}
                                      onBlur={() => { if (!addName.trim() && !addPrice) cancelAdd() }}
                                      placeholder="Item name…"
                                      className="flex-1 outline-none bg-transparent"
                                      style={{ fontSize: 14, color: C.textDark }}
                                    />
                                    <input
                                      type="number" min="0" step="any" inputMode="decimal"
                                      value={addQty}
                                      onChange={e => setAddQty(e.target.value)}
                                      className="w-8 text-center bg-transparent outline-none tabular-nums"
                                      style={{ fontSize: 13, color: C.textMid }}
                                    />
                                    <motion.button
                                      whileTap={{ scale: 0.9 }}
                                      onClick={confirmAdd}
                                      disabled={!addName.trim()}
                                      className="w-6 h-6 rounded-full flex items-center justify-center text-white disabled:opacity-30 shrink-0"
                                      style={{ background: C.sage }}
                                    >
                                      <Plus size={12} strokeWidth={2.5} />
                                    </motion.button>
                                    <button onClick={cancelAdd} className="shrink-0 active:opacity-60">
                                      <X size={14} strokeWidth={1.5} style={{ color: '#c8c0b4' }} />
                                    </button>
                                  </div>
                                  {/* Row 2: price + live line total */}
                                  <div className="flex items-center gap-3 px-4 pb-2.5">
                                    <div className="shrink-0" style={{ width: 47 }} />
                                    <input
                                      type="number" min="0" step="any" inputMode="decimal"
                                      value={addPrice}
                                      onChange={e => setAddPrice(e.target.value)}
                                      placeholder="Unit price €"
                                      className="flex-1 outline-none bg-transparent"
                                      style={{ fontSize: 13, color: C.textMid }}
                                    />
                                    {parseFloat(addPrice) > 0 && parseFloat(addQty) > 0 && (
                                      <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: C.sage }}>
                                        €{(parseFloat(addPrice) * (parseFloat(addQty) || 1)).toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => openAdd(list.id)}
                                  className="flex items-center gap-3 px-4 w-full border-b active:opacity-60 transition-opacity"
                                  style={{ height: 52, borderColor: 'rgba(30,25,18,0.05)' }}
                                >
                                  {/* Sage + icon, matching the reference */}
                                  <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                                    <Plus size={14} strokeWidth={2} style={{ color: C.sage }} />
                                  </div>
                                  <div className="w-7 shrink-0" />
                                  <span style={{ fontSize: 13, color: C.sage, fontWeight: 500 }}>Add item</span>
                                </button>
                              )}

                              {/* Estimated total — inside the list card */}
                              {pricedCount > 0 && (
                                <div
                                  className="mx-4 my-3 rounded-xl px-4 py-3 flex items-center gap-3 relative overflow-hidden"
                                  style={{ background: '#E8F0E4' }}
                                >
                                  <BotanicalLeaf className="absolute right-0 bottom-0 w-14 h-14 opacity-[0.12]" />
                                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                    style={{ background: 'rgba(255,255,255,0.7)' }}>
                                    <ShoppingBag size={14} strokeWidth={1.5} style={{ color: C.sage }} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p style={{ fontSize: 12, fontWeight: 600, color: C.textDark }}>Estimated total</p>
                                    <p style={{ fontSize: 10, color: C.textMid, marginTop: 1 }}>Based on your list</p>
                                  </div>
                                  <p className="tabular-nums shrink-0" style={{ fontSize: 16, fontWeight: 700, color: C.textDark }}>
                                    €{est.toFixed(2)}
                                  </p>
                                </div>
                              )}

                              {/* Completed sub-section */}
                              {done.length > 0 && (
                                <div className="border-t" style={{ borderColor: 'rgba(30,25,18,0.05)' }}>
                                  <button
                                    onClick={() => setCompletedSubOpen(v => !v)}
                                    className="flex items-center gap-3 px-4 w-full active:opacity-70"
                                    style={{ height: 50 }}
                                  >
                                    <CheckCircle2 size={14} strokeWidth={1.5} style={{ color: C.sageMid }} />
                                    <span className="flex-1 text-left" style={{ fontSize: 13, color: C.textMid, fontWeight: 500 }}>Completed</span>
                                    <span className="tabular-nums px-2 py-0.5 rounded-full shrink-0"
                                      style={{ fontSize: 10, fontWeight: 600, background: C.badgeBg, color: C.badgeFg }}>
                                      {done.length}
                                    </span>
                                    {completedSubOpen
                                      ? <ChevronDown  size={13} strokeWidth={1.8} style={{ color: C.textLight }} />
                                      : <ChevronRight size={13} strokeWidth={1.8} style={{ color: C.textLight }} />
                                    }
                                  </button>

                                  <AnimatePresence initial={false}>
                                    {completedSubOpen && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                                        style={{ overflow: 'hidden' }}
                                      >
                                        {done.map(item => (
                                          <div
                                            key={item.id}
                                            className="flex items-center gap-3 px-4 border-t"
                                            style={{ height: 56, opacity: 0.5, borderColor: 'rgba(30,25,18,0.05)' }}
                                          >
                                            <motion.button
                                              whileTap={{ scale: 0.85 }}
                                              onClick={() => toggleItem(list.id, item.id)}
                                              aria-label={`Mark ${item.name} as not done`}
                                              className="shrink-0 rounded-full flex items-center justify-center"
                                              style={{ width: 20, height: 20, background: '#C8D8C4' }}
                                            >
                                              <Check size={9} strokeWidth={2.5} style={{ color: C.sage }} />
                                            </motion.button>
                                            <CategoryBadge name={item.name} dim />
                                            <p className="flex-1 line-through truncate" style={{ fontSize: 13, color: C.textMid }}>
                                              {item.name}
                                            </p>
                                            {item.quantity > 1 && (
                                              <span className="shrink-0 tabular-nums" style={{ fontSize: 12, color: C.textLight }}>
                                                {item.quantity}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}
              </AnimatePresence>

              {/* Show more / show less */}
              {hasMoreActive && (
                <motion.button
                  layout
                  whileTap={{ scale: 0.98 }}
                  onClick={showAllActive ? handleCollapseActive : () => setShowAllActive(true)}
                  className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-1.5"
                  style={{ background: 'rgba(255,255,255,0.48)', border: `1px solid ${C.cardBorder}`, marginTop: 4 }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.textLight }}>
                    {showAllActive ? 'Show less' : `Show ${hiddenCount} more`}
                  </span>
                  <motion.div
                    animate={{ rotate: showAllActive ? 180 : 0 }}
                    transition={{ duration: 0.22 }}
                    style={{ display: 'flex', alignItems: 'center' }}
                  >
                    <ChevronDown size={13} strokeWidth={2} style={{ color: C.textLight }} />
                  </motion.div>
                </motion.button>
              )}
            </div>
          </>
        )}

        {/* ── Past lists ────────────────────────────────────────────────── */}
        {completedLists.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setPastListsOpen(v => !v)}
              className="flex items-center justify-between w-full mb-2 py-1"
            >
              <span style={{ fontSize: 11, fontWeight: 600, color: C.textLight, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Past lists
              </span>
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: 12, color: C.textLight }}>{completedLists.length}</span>
                {pastListsOpen
                  ? <ChevronDown  size={13} strokeWidth={1.8} style={{ color: C.textLight }} />
                  : <ChevronRight size={13} strokeWidth={1.8} style={{ color: C.textLight }} />
                }
              </div>
            </button>

            <AnimatePresence initial={false}>
              {pastListsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="space-y-1.5">
                    {completedLists.map(list => {
                      const checked = list.items.filter(i => i.isChecked).length
                      return (
                        <div
                          key={list.id}
                          className="flex items-center gap-3 px-4 rounded-2xl"
                          style={{ height: 56, background: 'rgba(255,255,255,0.44)', opacity: 0.65 }}
                        >
                          <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center"
                            style={{ background: C.badgeBg }}>
                            <Check size={9} strokeWidth={2.5} style={{ color: C.sage }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="line-through truncate" style={{ fontSize: 13, color: C.textMid }}>{list.name}</p>
                            <p style={{ fontSize: 10, color: C.textLight, marginTop: 1 }}>{checked}/{list.items.length} items</p>
                          </div>
                          <button onClick={() => setDeleteListId(list.id)} aria-label={`Delete ${list.name}`} className="p-1 active:opacity-60">
                            <Trash2 size={13} strokeWidth={1.5} style={{ color: '#c8c0b4' }} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ── Closing copy ──────────────────────────────────────────────── */}
        {lists.length > 0 && (
          <div className="flex items-start justify-center gap-2.5 mt-10 mb-2 px-8">
            <Leaf size={14} strokeWidth={1.4} style={{ color: C.sageMid, flexShrink: 0, marginTop: 1 }} />
            <p className="italic leading-relaxed" style={{ fontSize: 13, color: C.textLight }}>
              Good food, good mood,<br />better together. ♡
            </p>
          </div>
        )}

      </div>

      {/* ── Sheets ── */}
      <AnimatePresence>
        {scannerOpen && !scanResult && (
          <ReceiptScannerSheet
            onClose={() => setScannerOpen(false)}
            onResultReady={(result, photos) => {
              setScanResult(result)
              setScanPhotos(photos)
              setScannerOpen(false)
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {scanResult && (
          <ReceiptReviewSheet
            result={scanResult}
            photos={scanPhotos}
            onClose={() => { setScanResult(null); setScanPhotos([]) }}
            onSave={handleScanSave}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editorMode === 'create' && (
          <ShoppingListEditorSheet
            mode="create"
            onSave={id => { setEditorMode(null); setExpandedListId(id) }}
            onClose={() => setEditorMode(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editorMode === 'edit' && editList && (
          <ShoppingListEditorSheet
            mode="edit"
            list={editList}
            onSave={() => setEditorMode(null)}
            onClose={() => setEditorMode(null)}
          />
        )}
      </AnimatePresence>

      <DeleteConfirmSheet
        open={!!deleteListId}
        title={`Delete "${lists.find(l => l.id === deleteListId)?.name ?? 'this list'}"?`}
        message="This shopping list and all its items will be permanently removed."
        onCancel={() => setDeleteListId(null)}
        onConfirm={() => { deleteList(deleteListId!); setDeleteListId(null) }}
      />

    </div>
  )
}
