'use client'

import { authenticatedFetch } from '@/lib/authenticated-fetch'

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, X, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, Wallet, Trash2, Sparkles, Pencil, Leaf,
  Home, Car, Zap, Play, Gift, Plane, ShoppingCart, ShoppingBag, Heart,
  MapPin, BarChart2,
  type LucideIcon,
} from '@/design/iconSystem'
import { SeMaRoomHeader } from '@/components/ui/SeMaRoomHeader'
import { C2_ROOM_HEADERS } from '@/lib/c2RoomHeaders'
import { getLivingMoment } from '@/lib/livingMoment'
import { C2SectionLabel } from '@/components/ui/C2SectionLabel'
import { useAppStore } from '@/store/useAppStore'
import { cn, generateId, getTodayString } from '@/lib/utils'
import type { BudgetItem, FinanceMonth, FinanceMonthReport, FinanceCategoryItem } from '@/types'
import { calcMonth, buildReport, totalSavingsBalance, listCost } from '@/lib/financeCalc'
import { PhotoGallery } from '@/components/ui/PhotoGallery'
import { ShoppingListEditorSheet } from '@/components/ui/ShoppingListEditorSheet'
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet'
import { C2PageBackground } from '@/components/ui/C2PageBackground'
import { Badge } from '@/components/ui'

const CURRENCY = '€'

/* ── helpers ─────────────────────────────────────────────────────────────────── */
function fmt(n: number) {
  const abs  = Math.abs(n)
  const opts = Number.isInteger(abs)
    ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  return `${CURRENCY}${abs.toLocaleString('de-DE', opts)}`
}
function fmtSigned(n: number) {
  return `${n >= 0 ? '+' : '-'}${fmt(n)}`
}

function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function prevKey(key: string) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function nextKey(key: string) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}
function shortMonthLabel(key: string) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}
function lastDayOf(key: string) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m, 0)
}
function canFinalize(key: string) {
  const now = new Date()
  const ck  = currentMonthKey()
  if (key < ck) return true
  if (key > ck) return false
  return now.getDate() >= lastDayOf(key).getDate() - 2
}
function pctColor(pct: number) {
  if (pct > 100) return '#D88A8A'
  if (pct > 80)  return '#E7B77C'
  return '#9EC9B3'
}
// buildReport and related calculations live in src/lib/financeCalc.ts (single source of truth)

async function scheduleMonthEndPush(monthKey: string) {
  try {
    const last = lastDayOf(monthKey)
    last.setHours(22, 0, 0, 0)
    await authenticatedFetch('/api/push/finance-month-end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthKey, fireAt: last.toISOString() }),
    })
  } catch { /* non-fatal */ }
}

/* ── main page ───────────────────────────────────────────────────────────────── */
export default function FinancePage() {
  const currentUser        = useAppStore(s => s.currentUser)!
  const isSeval            = currentUser === 'seval'
  const primary            = isSeval ? '#8b5cf6' : '#14b8a6'
  const financeMonths      = useAppStore(s => s.financeMonths)
  const savingsTransactions = useAppStore(s => s.savingsTransactions)
  const shoppingLists      = useAppStore(s => s.shoppingLists)
  const events             = useAppStore(s => s.events)
  const countdowns         = useAppStore(s => s.countdowns)
  const todos              = useAppStore(s => s.todos)
  const partnerNotes       = useAppStore(s => s.partnerNotes)
  const createFinanceMonth = useAppStore(s => s.createFinanceMonth)
  const updateFinanceMonth = useAppStore(s => s.updateFinanceMonth)
  const deleteFinanceMonth = useAppStore(s => s.deleteFinanceMonth)
  const addSavingsTransaction    = useAppStore(s => s.addSavingsTransaction)
  const deleteSavingsTransaction = useAppStore(s => s.deleteSavingsTransaction)
  const migrateFinanceData = useAppStore(s => s.migrateFinanceData)
  const migrateCategories  = useAppStore(s => s.migrateCategories)

  const living = useMemo(() => getLivingMoment({
    events, countdowns, shoppingLists, todos, partnerNotes, currentUser,
    today: getTodayString(),
  }), [events, countdowns, shoppingLists, todos, partnerNotes, currentUser])

  const [monthKey, setMonthKey]           = useState(currentMonthKey)
  const [editingBudget, setEditingBudget] = useState<BudgetItem | null>(null)
  const [addBudgetOpen, setAddBudgetOpen] = useState(false)
  const [savingsOpen, setSavingsOpen]     = useState(false)
  const [incomeEditing, setIncomeEditing] = useState(false)
  const [incomeInput, setIncomeInput]     = useState('')
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [deleteTxId, setDeleteTxId]       = useState<string | null>(null)
  const [deleteMonthConfirm, setDeleteMonthConfirm] = useState(false)
  const [editShoppingId, setEditShoppingId] = useState<string | null>(null)

  const editShoppingList = editShoppingId
    ? shoppingLists.find(l => l.id === editShoppingId) ?? null
    : null

  // One-time migrations
  useEffect(() => { migrateFinanceData() }, [migrateFinanceData])
  useEffect(() => { migrateCategories() }, [migrateCategories])

  const currentMonth = useMemo(
    () => financeMonths.find(m => m.key === monthKey) ?? null,
    [financeMonths, monthKey],
  )

  const totalSavings = useMemo(
    () => totalSavingsBalance(savingsTransactions),
    [savingsTransactions],
  )
  // All derived values for the current month via shared calculation function
  const monthCalc = useMemo(
    () => currentMonth ? calcMonth(currentMonth, savingsTransactions) : null,
    [currentMonth, savingsTransactions],
  )
  const thisMonthSavings = monthCalc?.saved ?? 0
  const thisMonthTx = useMemo(
    () => [...savingsTransactions.filter(t => t.monthKey === monthKey)].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
    [savingsTransactions, monthKey],
  )

  // Shopping lists completed in this month
  const monthShoppingLists = useMemo(
    () => shoppingLists.filter(l => l.isCompleted && l.completedAt?.startsWith(monthKey)),
    [shoppingLists, monthKey],
  )
  const monthShoppingTotal = useMemo(
    () => monthShoppingLists.reduce((s, l) => s + listCost(l.items), 0),
    [monthShoppingLists],
  )

  const prevMonthKey = prevKey(monthKey)
  const prevMonth    = financeMonths.find(m => m.key === prevMonthKey) ?? null

  function handleStartBlank() {
    createFinanceMonth(monthKey)
    scheduleMonthEndPush(monthKey)
  }
  function handleCopyPrev() {
    createFinanceMonth(monthKey, prevMonthKey)
    scheduleMonthEndPush(monthKey)
  }

  function saveIncome() {
    if (!currentMonth) return
    const v = parseFloat(incomeInput.replace(',', '.'))
    if (!isNaN(v) && v >= 0) updateFinanceMonth(monthKey, { income: v })
    setIncomeEditing(false)
  }

  function handleFinalize() {
    if (!currentMonth) return
    const report = buildReport(currentMonth, savingsTransactions)
    updateFinanceMonth(monthKey, { isFinalized: true, report })
    setConfirmFinalize(false)
  }

  const totalExpenses = monthCalc?.expenses ?? 0
  const remaining     = monthCalc?.remaining ?? 0

  return (
    <div className="min-h-screen pb-32 relative z-0">

      <C2PageBackground />

      <div className="relative z-10">

        <SeMaRoomHeader
          eyebrow="Our money"
          title="Our Finances"
          subtitle={living.financeSubtitle || 'Planning our future together.'}
          imageSrc={C2_ROOM_HEADERS.finances.src}
          imageObjectPosition={C2_ROOM_HEADERS.finances.imageObjectPosition}
          imageGradientBoost={C2_ROOM_HEADERS.finances.gradientBoost}
        />

        {/* ── Month Selector ── */}
        <div className="c2-card mx-4 mb-4 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setMonthKey(prevKey(monthKey))}
            className="w-9 h-9 flex items-center justify-center rounded-xl active:bg-gray-100"
          >
            <ChevronLeft size={18} className="text-gray-500" />
          </button>
          <div className="text-center">
            <p className="font-bold text-gray-800 text-base">{monthLabel(monthKey)}</p>
            {currentMonth && (
              <span
                className={cn(
                  'text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 inline-block',
                  currentMonth.isFinalized
                    ? 'bg-purple-100 text-purple-600'
                    : monthKey === currentMonthKey()
                      ? 'bg-[rgba(158,201,179,0.18)] text-[#5B9A85]'
                      : 'bg-gray-100 text-gray-500'
                )}
              >
                {currentMonth.isFinalized ? 'Finalized' : monthKey === currentMonthKey() ? 'Active' : 'Past'}
              </span>
            )}
          </div>
          <button
            onClick={() => setMonthKey(nextKey(monthKey))}
            className="w-9 h-9 flex items-center justify-center rounded-xl active:bg-gray-100"
          >
            <ChevronRight size={18} className="text-gray-500" />
          </button>
        </div>

        {/* ── Total Savings Banner ── */}
        <div className="c2-card mx-4 mb-4 px-4 py-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(158,201,179,0.12)' }}>
            <TrendingUp size={16} style={{ color: '#9EC9B3' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="c2-label">Total Savings</p>
            <p className="text-2xl font-bold mt-0.5" style={{ color: '#1a1f18', fontFamily: 'var(--font-playfair)' }}>{fmt(totalSavings)}</p>
          </div>
          {thisMonthSavings !== 0 && (
            <div className="shrink-0 text-right">
              <p className="text-[10px]" style={{ color: '#a8b0a0' }}>This month</p>
              <p className="text-sm font-bold" style={{ color: thisMonthSavings > 0 ? '#9EC9B3' : '#D88A8A' }}>
                {fmtSigned(thisMonthSavings)}
              </p>
            </div>
          )}
        </div>

        {/* ── Content ── */}
        {!currentMonth ? (
          <EmptyMonthState
            monthKey={monthKey}
            prevMonth={prevMonth}
            prevMonthKey={prevMonthKey}
            onStartBlank={handleStartBlank}
            onCopyPrev={handleCopyPrev}
          />
        ) : (
          <>
            {/* Month-end report (if finalized) */}
            {currentMonth.isFinalized && currentMonth.report && (
              <ReportCard report={currentMonth.report} />
            )}

            {/* Summary — hero remaining + flat secondary rows */}
            <div className="px-4 mb-4">
              {/* Hero card: Remaining */}
              <div
                className="rounded-2xl px-5 py-5 mb-3"
                style={{
                  background: remaining >= 0 ? 'rgba(158,201,179,0.08)' : 'rgba(216,138,138,0.07)',
                  boxShadow: '0 2px 16px rgba(45,41,38,0.06)',
                }}
              >
                <p className="text-[11px] font-medium tracking-widest uppercase mb-3" style={{ color: '#9B9590' }}>
                  Remaining this month
                </p>
                <p
                  className="text-4xl font-bold leading-none"
                  style={{ fontFamily: 'var(--font-playfair)', color: remaining >= 0 ? '#1a1f18' : '#D88A8A' }}
                >
                  {remaining < 0 ? '-' : ''}{fmt(remaining)}
                </p>
                <p className="text-xs mt-2" style={{ color: '#9B9590' }}>
                  {remaining >= 0 ? 'of budget still available' : 'over budget'}
                </p>
              </div>

              {/* Secondary flat rows */}
              <div className="c2-card-muted overflow-hidden">

                <motion.button
                  whileTap={{ scale: 0.99 }}
                  onClick={() => { setIncomeInput(currentMonth.income > 0 ? String(currentMonth.income) : ''); setIncomeEditing(true) }}
                  className="w-full px-4 py-3.5 flex items-center gap-3 text-left"
                >
                  <TrendingUp size={15} style={{ color: '#9EC9B3', flexShrink: 0 }} />
                  <span className="flex-1 text-sm text-gray-600">Income</span>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-semibold text-gray-800">{fmt(currentMonth.income)}</span>
                  </div>
                </motion.button>

                <div style={{ height: 1, background: 'rgba(45,41,38,0.05)', margin: '0 16px' }} />

                <div className="px-4 py-3.5 flex items-center gap-3">
                  <TrendingDown size={15} style={{ color: '#D88A8A', flexShrink: 0 }} />
                  <span className="flex-1 text-sm text-gray-600 min-w-0 truncate">Expenses</span>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-semibold" style={{ color: '#D88A8A' }}>{fmt(totalExpenses)}</span>
                    <span className="block text-[10px] text-gray-400">of {fmt(currentMonth.budgetItems.reduce((a, b) => a + b.planned, 0))}</span>
                  </div>
                </div>

                <div style={{ height: 1, background: 'rgba(45,41,38,0.05)', margin: '0 16px' }} />

                <motion.button
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setSavingsOpen(true)}
                  className="w-full px-4 py-3.5 flex items-center gap-3 text-left"
                >
                  <Sparkles size={15} style={{ color: '#C9A96E', flexShrink: 0 }} />
                  <span className="flex-1 text-sm text-gray-600">Saved this month</span>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-semibold" style={{ color: thisMonthSavings >= 0 ? '#9EC9B3' : '#D88A8A' }}>
                      {thisMonthSavings >= 0 ? '' : '-'}{fmt(thisMonthSavings)}
                    </span>
                  </div>
                </motion.button>
              </div>
            </div>

            {/* Budget categories */}
            <div className="px-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <C2SectionLabel>Budget categories</C2SectionLabel>
                <button
                  onClick={() => setAddBudgetOpen(true)}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(158,201,179,0.12)', color: '#9EC9B3' }}
                >
                  <Plus size={11} /> Category
                </button>
              </div>
              <div className="space-y-2">
                {currentMonth.budgetItems.map((item, idx) => {
                  const pct   = item.planned > 0 ? Math.min((item.actual / item.planned) * 100, 100) : 0
                  const color = pctColor(item.planned > 0 ? (item.actual / item.planned) * 100 : 0)
                  const over  = item.planned > 0 && item.actual > item.planned
                  return (
                    <motion.button
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setEditingBudget(item)}
                      className="c2-card w-full p-3.5 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <FinanceCategoryIcon category={item.category} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-sm font-medium text-gray-700 truncate">{item.category}</p>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              <span className="text-[11px] font-semibold" style={{ color }}>{fmt(item.actual)}</span>
                              <span className="text-[10px] text-gray-300">/</span>
                              <span className="text-[10px] text-gray-400">{fmt(item.planned)}</span>
                              {over && <Badge variant="danger">OVER</Badge>}
                            </div>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: color }}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ type: 'spring', stiffness: 100, damping: 20, delay: idx * 0.02 }}
                            />
                          </div>
                          {item.note && <p className="text-[10px] text-gray-400 mt-1 truncate">{item.note}</p>}
                        </div>
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            </div>

            {/* Savings transactions this month */}
            {thisMonthTx.length > 0 && (
              <div className="px-4 mb-5">
                <C2SectionLabel className="mb-3">Savings this month</C2SectionLabel>
                <div className="space-y-2">
                  {thisMonthTx.map(t => (
                    <motion.div
                      key={t.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="c2-card px-4 py-3 flex items-center gap-3"
                    >
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0',
                      )} style={{ background: t.amount > 0 ? 'rgba(158,201,179,0.12)' : 'rgba(216,138,138,0.12)' }}>
                        {t.amount > 0
                          ? <TrendingUp size={15} strokeWidth={1.75} style={{ color: '#9EC9B3' }} />
                          : <TrendingDown size={15} strokeWidth={1.75} style={{ color: '#D88A8A' }} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">
                          {t.note || (t.amount > 0 ? 'Contribution' : 'Withdrawal')}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(t.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          {' · '}{t.createdBy}
                        </p>
                      </div>
                      <p className="text-sm font-bold shrink-0 mr-1" style={{ color: t.amount > 0 ? '#9EC9B3' : '#D88A8A' }}>
                        {t.amount > 0 ? '+' : ''}{fmt(t.amount)}
                      </p>
                      <button
                        onClick={() => setDeleteTxId(t.id)}
                        className="w-6 h-6 flex items-center justify-center rounded-full text-gray-300 active:text-red-400"
                      >
                        <Trash2 size={13} />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Shopping completed this month */}
            {monthShoppingLists.length > 0 && (
              <div className="px-4 mb-5">
                <div className="flex items-center justify-between mb-3">
                  <C2SectionLabel>Shopping this month</C2SectionLabel>
                  {monthShoppingTotal > 0 && (
                    <span className="text-[11px] font-semibold" style={{ color: '#7a8570' }}>{fmt(monthShoppingTotal)} total</span>
                  )}
                </div>
                <div className="space-y-2">
                  {monthShoppingLists.map((list, idx) => {
                    const cost = list.items.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0)
                    return (
                      <motion.button
                        key={list.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setEditShoppingId(list.id)}
                        className="c2-card w-full px-4 py-3 flex items-center gap-3 text-left"
                      >
                        {list.coverPhoto ? (
                          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0">
                            <img src={list.coverPhoto} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: 'rgba(158,201,179,0.10)' }}>
                            <Sparkles size={16} style={{ color: '#9EC9B3' }} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-700 truncate">{list.name}</p>
                          <p className="text-[10px] text-gray-400">
                            {list.storeName ? <><MapPin size={10} className="inline-block mr-0.5" />{list.storeName} · </> : ''}
                            {list.items.length} item{list.items.length !== 1 ? 's' : ''}
                            {list.completedAt ? ` · ${new Date(list.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                          </p>
                        </div>
                        {cost > 0 && <p className="text-sm font-bold text-gray-700 shrink-0">{fmt(cost)}</p>}
                      </motion.button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Finalize button */}
            {!currentMonth.isFinalized && canFinalize(monthKey) && (
              <div className="px-4 mb-5">
                <button
                  onClick={() => setConfirmFinalize(true)}
                  className="w-full py-3.5 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-2"
                  style={{ background: '#9EC9B3' }}
                >
                  <Sparkles size={16} />
                  Generate Month-End Report
                </button>
              </div>
            )}

            {/* Delete month */}
            <div className="px-4 mb-5">
              <button
                onClick={() => setDeleteMonthConfirm(true)}
                className="w-full py-2.5 rounded-2xl text-sm flex items-center justify-center gap-1.5"
                style={{ background: 'rgba(255,255,255,0.7)', color: '#a8b0a0', boxShadow: '0 1px 4px rgba(45,41,38,0.04)' }}
              >
                <Trash2 size={13} /> Delete This Month
              </button>
            </div>

            {/* Closing copy */}
            <div className="px-4 pb-4 flex items-center justify-center gap-2" style={{ color: '#c8cfbf' }}>
              <Leaf size={12} />
              <p className="text-xs italic">Clarity brings confidence.</p>
              <Leaf size={12} />
            </div>
          </>
        )}
      </div>

      {/* ── Shopping list editor (from Shopping This Month) ── */}
      <AnimatePresence>
        {editShoppingList && (
          <ShoppingListEditorSheet
            mode="edit"
            list={editShoppingList}
            onSave={() => setEditShoppingId(null)}
            onClose={() => setEditShoppingId(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Income edit modal ── */}
      <AnimatePresence>
        {incomeEditing && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIncomeEditing(false)}
              className="fixed inset-0 z-50 c2-backdrop"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-6"
            >
              <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-modal">
                <h3 className="font-bold text-gray-800 mb-1">Monthly Income</h3>
                <p className="text-xs text-gray-400 mb-4">Combined household income for {shortMonthLabel(monthKey)}</p>
                <div className="flex items-center gap-2 bg-gray-50 rounded-2xl px-4 py-3 mb-4">
                  <span className="text-gray-400 font-semibold">{CURRENCY}</span>
                  <input
                    type="number"
                    value={incomeInput}
                    onChange={e => setIncomeInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveIncome()}
                    autoFocus
                    className="flex-1 text-lg font-bold text-gray-800 bg-transparent outline-none"
                    placeholder="0"
                  />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setIncomeEditing(false)} className="flex-1 py-3 rounded-2xl c2-sheet-cancel font-medium text-sm">Cancel</button>
                  <button onClick={saveIncome} className="flex-1 py-3 rounded-2xl text-white font-medium text-sm" style={{ background: '#9EC9B3' }}>Save</button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Budget edit sheet ── */}
      <AnimatePresence>
        {editingBudget && currentMonth && (
          <FinanceCategoryEditorSheet
            item={editingBudget}
            onSave={updates => {
              updateFinanceMonth(monthKey, {
                budgetItems: currentMonth.budgetItems.map(b =>
                  b.id === editingBudget.id ? { ...b, ...updates } : b
                ),
              })
              setEditingBudget(null)
            }}
            onDelete={() => {
              updateFinanceMonth(monthKey, {
                budgetItems: currentMonth.budgetItems.filter(b => b.id !== editingBudget.id),
              })
              setEditingBudget(null)
            }}
            onClose={() => setEditingBudget(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Add budget category sheet ── */}

      <AnimatePresence>
        {addBudgetOpen && currentMonth && (
          <AddBudgetSheet
            onSave={item => {
              updateFinanceMonth(monthKey, {
                budgetItems: [...currentMonth.budgetItems, { ...item, id: generateId() }],
              })
              setAddBudgetOpen(false)
            }}
            onClose={() => setAddBudgetOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Savings sheet ── */}
      <AnimatePresence>
        {savingsOpen && (
          <SavingsSheet
            monthKey={monthKey}
            monthLabel={shortMonthLabel(monthKey)}
            onSave={(amount, note) => { addSavingsTransaction(monthKey, amount, note); setSavingsOpen(false) }}
            onClose={() => setSavingsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Finalize confirm ── */}
      <AnimatePresence>
        {confirmFinalize && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setConfirmFinalize(false)}
              className="fixed inset-0 z-50 c2-backdrop"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-6"
            >
              <div className="c2-sheet-bg rounded-3xl p-6 w-full max-w-sm shadow-modal">
                <div className="text-center mb-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-2 mx-auto"
                    style={{ background: 'rgba(158,201,179,0.18)', color: '#7BBBA5' }}>
                    <BarChart2 size={28} strokeWidth={1.5} />
                  </div>
                  <h3 className="font-bold" style={{ color: '#2D2926' }}>Generate Report?</h3>
                  <p className="text-xs mt-1" style={{ color: '#9B9590' }}>
                    This will finalize {shortMonthLabel(monthKey)} and generate your month-end report. You can still edit entries after.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmFinalize(false)} className="flex-1 py-3 rounded-2xl c2-sheet-cancel font-medium text-sm">Cancel</button>
                  <button onClick={handleFinalize} className="flex-1 py-3 rounded-2xl text-white font-medium text-sm" style={{ background: '#9EC9B3' }}>
                    Generate
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Delete month confirm ── */}
      <DeleteConfirmSheet
        open={deleteMonthConfirm}
        title="Delete this month?"
        message={`${monthLabel(monthKey)} and all its budget data will be permanently removed.`}
        onCancel={() => setDeleteMonthConfirm(false)}
        onConfirm={() => { deleteFinanceMonth(monthKey); setDeleteMonthConfirm(false) }}
      />

      {/* ── Delete savings transaction confirm ── */}
      <AnimatePresence>
        {deleteTxId && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDeleteTxId(null)}
              className="fixed inset-0 z-50 c2-backdrop"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-6"
            >
              <div className="c2-sheet-bg rounded-3xl p-6 w-full max-w-sm shadow-modal">
                <h3 className="font-bold mb-3 text-center" style={{ color: '#2D2926' }}>Remove transaction?</h3>
                <div className="flex gap-3">
                  <button onClick={() => setDeleteTxId(null)} className="flex-1 py-3 rounded-2xl c2-sheet-cancel font-medium text-sm">Cancel</button>
                  <button onClick={() => { deleteSavingsTransaction(deleteTxId!); setDeleteTxId(null) }}
                    className="flex-1 py-3 rounded-2xl c2-sheet-danger font-medium text-sm">Delete</button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Empty Month State ────────────────────────────────────────────────────────── */
function EmptyMonthState({
  monthKey, prevMonth, prevMonthKey, onStartBlank, onCopyPrev,
}: {
  monthKey: string
  prevMonth: FinanceMonth | null
  prevMonthKey: string
  onStartBlank: () => void
  onCopyPrev: () => void
}) {
  return (
    <div className="px-4">
      <div className="c2-card-lg p-6 text-center">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'rgba(158,201,179,0.10)' }}>
          <Wallet size={20} style={{ color: '#9EC9B3' }} />
        </div>
        <h3 className="font-bold text-base mb-1" style={{ color: '#1a1f18' }}>No budget for {monthLabel(monthKey)}</h3>
        <p className="text-xs mb-5" style={{ color: '#a8b0a0' }}>Start tracking your finances for this month.</p>
        <div className="space-y-2">
          <button
            onClick={onStartBlank}
            className="w-full py-3.5 rounded-2xl text-white text-sm font-semibold"
            style={{ background: '#9EC9B3' }}
          >
            Start blank
          </button>
          {prevMonth && (
            <button
              onClick={onCopyPrev}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold"
              style={{ background: 'rgba(45,41,38,0.05)', color: '#1a1f18' }}
            >
              Copy from {shortMonthLabel(prevMonthKey)}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Report Card ─────────────────────────────────────────────────────────────── */
function ReportCard({ report }: { report: FinanceMonthReport }) {
  const fmt2 = (n: number) => `€${Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  return (
    <div className="c2-card mx-4 mb-4 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(158,201,179,0.12)' }}>
          <Sparkles size={14} style={{ color: '#9EC9B3' }} />
        </div>
        <h3 className="font-bold text-sm" style={{ color: '#1a1f18' }}>Month-End Report</h3>
        <span className="ml-auto text-[10px] text-gray-400">
          {new Date(report.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { label: 'Income',    value: fmt2(report.totalIncome),    color: '#9EC9B3' },
          { label: 'Expenses',  value: fmt2(report.totalExpenses),  color: '#D88A8A' },
          { label: 'Saved',     value: fmt2(report.totalSaved),     color: '#E7B77C' },
          { label: 'Remaining', value: `${report.remaining < 0 ? '-' : ''}${fmt2(report.remaining)}`, color: report.remaining >= 0 ? '#9EC9B3' : '#D88A8A' },
        ].map(row => (
          <div key={row.label} className="bg-white/70 rounded-xl px-3 py-2">
            <p className="text-[10px] text-gray-400 mb-0.5">{row.label}</p>
            <p className="text-sm font-bold" style={{ color: row.color }}>{row.value}</p>
          </div>
        ))}
      </div>
      <div className="bg-white/70 rounded-xl px-3 py-2 mb-2">
        <p className="text-[10px] text-gray-400 mb-0.5">Savings Rate</p>
        <p className="text-sm font-bold" style={{ color: '#9EC9B3' }}>{report.savingsRate.toFixed(1)}%</p>
      </div>
      {report.topCategory && (
        <p className="text-xs text-gray-500">Top category: <span className="font-semibold">{report.topCategory}</span></p>
      )}
      {report.overBudgetCategories.length > 0 && (
        <p className="text-xs mt-1" style={{ color: '#D88A8A' }}>Over budget: {report.overBudgetCategories.join(', ')}</p>
      )}
    </div>
  )
}

/* ── Finance Category Editor Sheet ──────────────────────────────────────────── */
function FinanceCategoryEditorSheet({
  item, onSave, onDelete, onClose,
}: {
  item: BudgetItem
  onSave: (updates: Partial<Omit<BudgetItem, 'id'>>) => void
  onDelete: () => void
  onClose: () => void
}) {
  const uploadPhoto = useAppStore(s => s.uploadPhoto)

  const [planned,     setPlanned]     = useState(item.planned > 0 ? String(item.planned) : '')
  const [actual,      setActual]      = useState(item.actual > 0 ? String(item.actual) : '')
  const [note,        setNote]        = useState(item.note ?? '')
  const [photos,      setPhotos]      = useState<string[]>(item.photos ?? [])
  const [catItems,    setCatItems]    = useState<FinanceCategoryItem[]>(item.items ?? [])
  const [uploading,   setUploading]   = useState(false)
  const [editingItem, setEditingItem] = useState<FinanceCategoryItem | null>(null)
  const [confirmDel,  setConfirmDel]  = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Always-visible add-item row state
  const [newName,  setNewName]  = useState('')
  const [newQty,   setNewQty]   = useState('1')
  const [newPrice, setNewPrice] = useState('')

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    const url = await uploadPhoto(`finance-categories/${item.id}`, file)
    if (url) setPhotos(p => [...p, url])
    setUploading(false)
  }

  function addCatItem() {
    if (!newName.trim()) return
    const now = new Date().toISOString()
    setCatItems(p => [...p, {
      id: generateId(), createdAt: now, updatedAt: now,
      name: newName.trim(),
      quantity: parseFloat(newQty) || 1,
      unitPrice: parseFloat(newPrice.replace(',', '.')) || 0,
    }])
    setNewName(''); setNewQty('1'); setNewPrice('')
  }

  function updateCatItem(id: string, data: Partial<FinanceCategoryItem>) {
    const now = new Date().toISOString()
    setCatItems(p => p.map(i => i.id === id ? { ...i, ...data, updatedAt: now } : i))
    setEditingItem(null)
  }

  function deleteCatItem(id: string) {
    setCatItems(p => p.filter(i => i.id !== id))
    setEditingItem(null)
  }

  function save() {
    // If expense line items are present, auto-compute actual spending from them
    const itemsTotal = catItems.reduce((sum, ci) => sum + ci.quantity * ci.unitPrice, 0)
    const actualValue = catItems.length > 0 && itemsTotal > 0
      ? itemsTotal
      : parseFloat(actual.replace(',', '.')) || 0
    onSave({
      planned: parseFloat(planned.replace(',', '.')) || 0,
      actual:  actualValue,
      note:    note.trim() || undefined,
      photos:  photos.length > 0 ? photos : undefined,
      items:   catItems.length > 0 ? catItems : undefined,
    })
  }

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-50 c2-backdrop" />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 380 }}
        className="fixed bottom-0 left-0 right-0 z-50 c2-sheet-bg rounded-t-[2rem] shadow-modal max-w-lg mx-auto flex flex-col"
        style={{ maxHeight: 'calc(100dvh - 48px)' }}
      >
        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />

          {/* Fixed header */}
          <div className="px-5 pt-4 pb-3 shrink-0">
            <div className="drag-handle mb-4" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FinanceCategoryIcon category={item.category} size={18} />
                <h3 className="text-base font-bold text-gray-800">{item.category}</h3>
              </div>
              <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-full c2-sheet-x">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-2 space-y-3">

            {/* Planned Budget */}
            <div className="bg-gray-50 rounded-2xl px-4 py-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Planned Budget</p>
              <div className="flex items-center gap-1">
                <span className="text-gray-400 font-semibold">{CURRENCY}</span>
                <input type="number" value={planned} onChange={e => setPlanned(e.target.value)}
                  placeholder="0" min="0" step="any" inputMode="decimal"
                  className="flex-1 text-base font-semibold text-gray-800 bg-transparent outline-none" />
              </div>
            </div>

            {/* Actual Spending */}
            {(() => {
              const itemsTotal = catItems.reduce((sum, ci) => sum + ci.quantity * ci.unitPrice, 0)
              const autoSum = catItems.length > 0 && itemsTotal > 0
              return (
                <div className="bg-gray-50 rounded-2xl px-4 py-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    Actual Spending{autoSum ? ' · auto from items' : ''}
                  </p>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400 font-semibold">{CURRENCY}</span>
                    {autoSum ? (
                      <span className="flex-1 text-base font-semibold text-gray-800">
                        {itemsTotal.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    ) : (
                      <input type="number" value={actual} onChange={e => setActual(e.target.value)}
                        placeholder="0" min="0" step="any" inputMode="decimal"
                        className="flex-1 text-base font-semibold text-gray-800 bg-transparent outline-none" />
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Note */}
            <div className="bg-gray-50 rounded-2xl px-4 py-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Note (optional)</p>
              <input type="text" value={note} onChange={e => setNote(e.target.value)}
                placeholder="e.g. includes electricity and water"
                className="w-full text-sm text-gray-700 bg-transparent outline-none" />
            </div>

            {/* Photos */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Photos</p>
              <PhotoGallery
                photos={photos}
                size="sm"
                onRemove={idx => setPhotos(p => p.filter((_, i) => i !== idx))}
                onAddClick={() => photoInputRef.current?.click()}
                uploading={uploading}
              />
            </div>

            {/* Expense Items */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                Expense Items{catItems.length > 0 ? ` (${catItems.length})` : ''}
              </p>

              {/* Always-visible add row */}
              <div className="flex items-center gap-1.5 mb-2">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCatItem()}
                  placeholder="Item name…"
                  className="flex-1 text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2 outline-none border border-gray-100 min-w-0"
                />
                <input
                  type="number" value={newQty} onChange={e => setNewQty(e.target.value)}
                  min="0" step="any" inputMode="decimal"
                  className="w-10 text-xs text-center bg-gray-50 rounded-xl px-1 py-2 outline-none border border-gray-100 shrink-0"
                />
                <input
                  type="number" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="€"
                  min="0" step="any" inputMode="decimal"
                  className="w-14 text-xs bg-gray-50 rounded-xl px-2 py-2 outline-none border border-gray-100 shrink-0"
                />
                <button
                  onClick={addCatItem} disabled={!newName.trim()}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white disabled:opacity-40 shrink-0"
                  style={{ background: '#9EC9B3' }}
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Existing items */}
              <div className="space-y-2">
                {catItems.map(ci => (
                  editingItem?.id === ci.id ? (
                    <ItemForm
                      key={ci.id}
                      item={ci}
                      onSave={data => updateCatItem(ci.id, data)}
                      onCancel={() => setEditingItem(null)}
                      onDelete={() => deleteCatItem(ci.id)}
                    />
                  ) : (
                    <ItemRow
                      key={ci.id}
                      item={ci}
                      onEdit={() => setEditingItem(ci)}
                      onDelete={() => deleteCatItem(ci.id)}
                    />
                  )
                ))}
              </div>
            </div>

          </div>

          {/* Fixed footer */}
          <div className="px-5 pt-3 pb-sheet-footer border-t border-gray-100 shrink-0">
            <button
              onClick={save}
              className="w-full py-3.5 rounded-2xl text-white text-sm font-semibold mb-3"
              style={{ background: '#9EC9B3' }}
            >
              Save Changes
            </button>
            <button onClick={() => setConfirmDel(true)}
              className="w-full py-2 flex items-center justify-center gap-1.5 text-red-400 text-sm">
              <Trash2 size={13} /> Remove Category
            </button>
          </div>
      </motion.div>

      <DeleteConfirmSheet
        open={confirmDel}
        title="Remove this category?"
        message="This budget category and its data will be permanently removed."
        confirmLabel="Remove"
        onCancel={() => setConfirmDel(false)}
        onConfirm={() => { onDelete(); setConfirmDel(false) }}
      />
    </>
  )
}

/* ── Item Row ─────────────────────────────────────────────────────────────────── */
function ItemRow({ item, onEdit, onDelete }: { item: FinanceCategoryItem; onEdit: () => void; onDelete: () => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-3 border border-gray-100"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {item.isPaid && (
            <span className="text-[9px] font-bold px-1.5 rounded-full" style={{ color: '#5B9A85', background: 'rgba(158,201,179,0.2)' }}>PAID</span>
          )}
          <p className="text-sm font-medium text-gray-700 truncate">{item.name}</p>
        </div>
        <p className="text-[10px] text-gray-400">
          {item.quantity} × {fmt(item.unitPrice)}
          {item.note ? ` · ${item.note}` : ''}
        </p>
      </div>
      <p className="text-sm font-bold text-gray-700 shrink-0">{fmt(item.quantity * item.unitPrice)}</p>
      <button
        onClick={onEdit}
        className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-50 text-gray-400 active:bg-gray-100 shrink-0"
      >
        <Pencil size={12} />
      </button>
      <button
        onClick={onDelete}
        className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-50 text-red-300 active:bg-red-50 shrink-0"
      >
        <Trash2 size={12} />
      </button>
    </motion.div>
  )
}

/* ── Item Form ────────────────────────────────────────────────────────────────── */
function ItemForm({
  item, onSave, onCancel, onDelete,
}: {
  item?: FinanceCategoryItem
  onSave: (data: Omit<FinanceCategoryItem, 'id' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [name,      setName]      = useState(item?.name ?? '')
  const [quantity,  setQuantity]  = useState(String(item?.quantity ?? 1))
  const [unitPrice, setUnitPrice] = useState(item?.unitPrice != null ? String(item.unitPrice) : '')
  const [note,      setNote]      = useState(item?.note ?? '')
  const [isPaid,    setIsPaid]    = useState(item?.isPaid ?? false)

  const lineTotal = (parseFloat(quantity) || 0) * (parseFloat(unitPrice.replace(',', '.')) || 0)
  const canSave   = name.trim().length > 0

  function save() {
    if (!canSave) return
    onSave({
      name:      name.trim(),
      quantity:  parseFloat(quantity) || 1,
      unitPrice: parseFloat(unitPrice.replace(',', '.')) || 0,
      note:      note.trim() || undefined,
      isPaid,
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-3 space-y-2"
      style={{ background: 'rgba(158,201,179,0.08)' }}
    >
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Item name"
        autoFocus
        onKeyDown={e => e.key === 'Enter' && save()}
        className="w-full text-sm font-semibold text-gray-800 bg-white/80 rounded-xl px-3 py-2 outline-none"
      />
      <div className="flex gap-2">
        <div className="bg-white/80 rounded-xl px-3 py-2 w-24 flex items-center gap-1">
          <span className="text-[10px] text-gray-400 shrink-0">Qty</span>
          <input
            type="number"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            min="0"
            step="any"
            inputMode="decimal"
            className="w-0 flex-1 text-sm font-semibold text-gray-800 bg-transparent outline-none"
          />
        </div>
        <div className="flex-1 bg-white/80 rounded-xl px-3 py-2 flex items-center gap-1">
          <span className="text-gray-400 text-sm shrink-0">{CURRENCY}</span>
          <input
            type="number"
            value={unitPrice}
            onChange={e => setUnitPrice(e.target.value)}
            placeholder="Unit price"
            min="0" step="any" inputMode="decimal"
            className="flex-1 text-sm font-semibold text-gray-800 bg-transparent outline-none"
          />
        </div>
        {lineTotal > 0 && (
          <div className="bg-white/80 rounded-xl px-3 py-2 flex items-center shrink-0">
            <span className="text-sm font-bold" style={{ color: '#9EC9B3' }}>{fmt(lineTotal)}</span>
          </div>
        )}
      </div>
      <input
        type="text"
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="w-full text-xs text-gray-600 bg-white/80 rounded-xl px-3 py-2 outline-none"
      />
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setIsPaid(p => !p)}
          className={cn(
            'text-[11px] font-semibold px-3 py-1.5 rounded-full transition-all',
            isPaid ? 'bg-white/80' : 'bg-white/80 text-gray-500',
          )}
        >
          <span style={isPaid ? { color: '#5B9A85' } : undefined}>{isPaid ? '✓ Paid' : 'Mark as paid'}</span>
        </button>
        <div className="flex gap-1.5">
          <button onClick={onCancel}
            className="px-3 py-1.5 rounded-xl bg-white/80 text-gray-600 text-[11px] font-medium">
            Cancel
          </button>
          {onDelete && (
            <button onClick={onDelete}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/80 text-red-400">
              <Trash2 size={13} />
            </button>
          )}
          <button
            onClick={save}
            disabled={!canSave}
            className="px-3 py-1.5 rounded-xl text-white text-[11px] font-semibold disabled:opacity-40"
            style={{ background: '#9EC9B3' }}
          >
            {item ? 'Update' : 'Add'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

/* ── Add Budget Category Sheet ───────────────────────────────────────────────── */
function AddBudgetSheet({
  onSave, onClose,
}: {
  onSave: (item: Omit<BudgetItem, 'id'>) => void
  onClose: () => void
}) {
  const [emoji,    setEmoji]    = useState('📌')
  const [category, setCategory] = useState('')
  const [planned,  setPlanned]  = useState('')

  function save() {
    if (!category.trim()) return
    onSave({ emoji, category: category.trim(), planned: parseFloat(planned) || 0, actual: 0 })
  }

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-50 c2-backdrop" />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 380 }}
        className="fixed bottom-0 left-0 right-0 z-50 c2-sheet-bg rounded-t-[2rem] shadow-modal max-w-lg mx-auto"
      >
        <div className="px-5 pt-4 pb-sheet-footer">
          <div className="drag-handle mb-5" />
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-gray-800">New Budget Category</h3>
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-full c2-sheet-x">
              <X size={16} />
            </button>
          </div>
          <div className="space-y-3 mb-5">
            <div className="flex gap-2">
              <div className="bg-gray-50 rounded-2xl px-3 py-3 w-16 text-center">
                <input type="text" value={emoji} onChange={e => setEmoji(e.target.value)}
                  className="w-full text-xl text-center bg-transparent outline-none" maxLength={2} />
              </div>
              <div className="flex-1 bg-gray-50 rounded-2xl px-4 py-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Category Name</p>
                <input type="text" value={category} onChange={e => setCategory(e.target.value)} autoFocus
                  placeholder="e.g. Dining Out"
                  className="w-full text-sm font-semibold text-gray-800 bg-transparent outline-none" />
              </div>
            </div>
            <div className="bg-gray-50 rounded-2xl px-4 py-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Planned Budget</p>
              <div className="flex items-center gap-1">
                <span className="text-gray-400 font-semibold">{CURRENCY}</span>
                <input type="number" value={planned} onChange={e => setPlanned(e.target.value)}
                  placeholder="0"
                  className="flex-1 text-base font-semibold text-gray-800 bg-transparent outline-none" />
              </div>
            </div>
          </div>
          <button onClick={save} disabled={!category.trim()}
            className="w-full py-3.5 rounded-2xl text-white text-sm font-semibold disabled:opacity-40"
            style={{ background: '#9EC9B3' }}
          >
            Add Category
          </button>
        </div>
      </motion.div>
    </>
  )
}

/* ── Savings Sheet ────────────────────────────────────────────────────────────── */
function SavingsSheet({
  monthKey: _monthKey, monthLabel: label, onSave, onClose,
}: {
  monthKey: string
  monthLabel: string
  onSave: (amount: number, note?: string) => void
  onClose: () => void
}) {
  const [type,   setType]   = useState<'add' | 'withdraw'>('add')
  const [amount, setAmount] = useState('')
  const [note,   setNote]   = useState('')

  function save() {
    const v = parseFloat(amount.replace(',', '.'))
    if (isNaN(v) || v <= 0) return
    onSave(type === 'add' ? v : -v, note.trim() || undefined)
  }

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-50 c2-backdrop" />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 380 }}
        className="fixed bottom-0 left-0 right-0 z-50 c2-sheet-bg rounded-t-[2rem] shadow-modal max-w-lg mx-auto"
      >
        <div className="px-5 pt-4 pb-sheet-footer">
          <div className="drag-handle mb-5" />
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-bold text-gray-800">Savings Entry</h3>
              <p className="text-xs text-gray-400">{label}</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-full c2-sheet-x">
              <X size={16} />
            </button>
          </div>

          {/* Type toggle */}
          <div className="flex gap-2 mb-4 bg-gray-100 rounded-2xl p-1">
            <button
              onClick={() => setType('add')}
              className={cn('flex-1 py-2 rounded-xl text-sm font-semibold transition-all', type === 'add' ? 'bg-white shadow-sm' : 'text-gray-500')}
              style={type === 'add' ? { color: '#5B9A85' } : undefined}
            >
              + Contribute
            </button>
            <button
              onClick={() => setType('withdraw')}
              className={cn('flex-1 py-2 rounded-xl text-sm font-semibold transition-all', type === 'withdraw' ? 'bg-white shadow-sm' : 'text-gray-500')}
              style={type === 'withdraw' ? { color: '#D88A8A' } : undefined}
            >
              - Withdraw
            </button>
          </div>

          <div className="space-y-3 mb-5">
            <div className="bg-gray-50 rounded-2xl px-4 py-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Amount</p>
              <div className="flex items-center gap-1">
                <span className="text-gray-400 font-semibold">{CURRENCY}</span>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && save()}
                  autoFocus
                  placeholder="0"
                  className="flex-1 text-base font-semibold text-gray-800 bg-transparent outline-none"
                />
              </div>
            </div>
            <div className="bg-gray-50 rounded-2xl px-4 py-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Note (optional)</p>
              <input type="text" value={note} onChange={e => setNote(e.target.value)}
                placeholder="e.g. Monthly transfer"
                className="w-full text-sm text-gray-700 bg-transparent outline-none" />
            </div>
          </div>

          <button
            onClick={save}
            disabled={!amount || parseFloat(amount) <= 0}
            className="w-full py-3.5 rounded-2xl text-white text-sm font-semibold disabled:opacity-40"
            style={{ background: type === 'add' ? '#9EC9B3' : '#D88A8A' }}
          >
            {type === 'add' ? 'Add Contribution' : 'Record Withdrawal'}
          </button>
        </div>
      </motion.div>
    </>
  )
}

/* ── Finance Category Icon ───────────────────────────────────────────────────── */
function getCategoryIcon(category: string): LucideIcon {
  const c = category.toLowerCase()
  if (c.includes('hous') || c.includes('rent') || c.includes('apartment')) return Home
  if (c.includes('car') || c.includes('transport') || c.includes('fuel') || c.includes('auto') || c.includes('bus') || c.includes('metro')) return Car
  if (c.includes('util') || c.includes('electric') || c.includes('gas') || c.includes('water') || c.includes('power') || c.includes('energy')) return Zap
  if (c.includes('subscri') || c.includes('netflix') || c.includes('spotify') || c.includes('stream') || c.includes('media')) return Play
  if (c.includes('gift') || c.includes('present')) return Gift
  if (c.includes('date') || c.includes('dining') || c.includes('dinner') || c.includes('restaurant') || c.includes('night')) return Heart
  if (c.includes('travel') || c.includes('flight') || c.includes('hotel') || c.includes('holiday') || c.includes('vacation') || c.includes('trip') || c.includes('plane')) return Plane
  if (c.includes('shop') || c.includes('cloth') || c.includes('fashion') || c.includes('wear')) return ShoppingBag
  if (c.includes('grocer') || c.includes('food') || c.includes('supermark') || c.includes('market') || c.includes('cart')) return ShoppingCart
  if (c.includes('weed') || c.includes('herb') || c.includes('plant')) return Leaf
  return Heart // default / other
}

function FinanceCategoryIcon({ category, size = 17 }: { category: string; size?: number }) {
  const Icon = getCategoryIcon(category)
  return (
    <div
      className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
      style={{ background: 'rgba(158,201,179,0.13)', color: '#7BBBA5' }}
    >
      <Icon size={size} strokeWidth={1.75} />
    </div>
  )
}
