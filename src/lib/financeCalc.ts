/**
 * Finance calculation — single source of truth.
 *
 * All derived finance values (expenses, remaining, savings rate, report) must
 * be computed through these functions. Nothing in the UI should reimplement
 * these formulas.
 */

import type { BudgetItem, FinanceMonth, FinanceMonthReport, SavingsTransaction } from '@/types'

// ── Primitives ────────────────────────────────────────────────────────────────

/** Total cost of a list of items (quantity × unit price). */
export function listCost(items: Array<{ price?: number; quantity: number }>): number {
  return items.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0)
}

/** Running balance of ALL savings transactions across all months. */
export function totalSavingsBalance(transactions: SavingsTransaction[]): number {
  return transactions.reduce((s, t) => s + t.amount, 0)
}

/** Savings total for a specific month key ('YYYY-MM'). */
export function monthSavings(transactions: SavingsTransaction[], monthKey: string): number {
  return transactions
    .filter(t => t.monthKey === monthKey)
    .reduce((s, t) => s + t.amount, 0)
}

/** Sum of actual spending across all budget categories. */
export function totalExpenses(budgetItems: BudgetItem[]): number {
  return budgetItems.reduce((s, b) => s + b.actual, 0)
}

/** Sum of planned budget across all budget categories. */
export function totalPlanned(budgetItems: BudgetItem[]): number {
  return budgetItems.reduce((s, b) => s + b.planned, 0)
}

/**
 * Normalise a user-typed monetary string to a non-negative number.
 * Returns 0 for empty, NaN, Infinity, or negative values.
 */
export function parseAmount(raw: string): number {
  const n = parseFloat(raw.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

// ── Derived month view ────────────────────────────────────────────────────────

export interface MonthCalc {
  income: number
  expenses: number
  planned: number
  saved: number
  remaining: number
  /** Percentage, rounded to one decimal place. */
  savingsRate: number
  topCategory: string | undefined
  overBudgetCategories: string[]
}

/**
 * Compute all derived values for a finance month.
 *
 * This is the canonical source used by both the dashboard summary rows and the
 * month-end report generator. Update this function when the business rules change;
 * all consumers update automatically.
 */
export function calcMonth(
  month: FinanceMonth,
  transactions: SavingsTransaction[],
): MonthCalc {
  const expenses = totalExpenses(month.budgetItems)
  const planned  = totalPlanned(month.budgetItems)
  const saved    = monthSavings(transactions, month.key)
  const remaining = month.income - expenses
  const savingsRate =
    month.income > 0 ? Math.round((saved / month.income) * 1000) / 10 : 0

  const sorted   = [...month.budgetItems].sort((a, b) => b.actual - a.actual)
  const topItem  = sorted.find(b => b.actual > 0)
  const overBudget = month.budgetItems.filter(
    b => b.planned > 0 && b.actual > b.planned,
  )

  return {
    income: month.income,
    expenses,
    planned,
    saved,
    remaining,
    savingsRate,
    topCategory: topItem ? `${topItem.emoji} ${topItem.category}` : undefined,
    overBudgetCategories: overBudget.map(b => `${b.emoji} ${b.category}`),
  }
}

// ── Month-end report ──────────────────────────────────────────────────────────

/**
 * Build an immutable month-end report snapshot.
 *
 * Reports are snapshots — they do not change after finalization even if new
 * transactions are added later. Use `calcMonth()` for live dashboard figures.
 */
export function buildReport(
  month: FinanceMonth,
  transactions: SavingsTransaction[],
): FinanceMonthReport {
  const c = calcMonth(month, transactions)
  return {
    generatedAt:          new Date().toISOString(),
    totalIncome:          c.income,
    totalExpenses:        c.expenses,
    totalSaved:           c.saved,
    remaining:            c.remaining,
    savingsRate:          c.savingsRate,
    topCategory:          c.topCategory,
    overBudgetCategories: c.overBudgetCategories,
  }
}
