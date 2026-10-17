import { describe, it, expect } from 'vitest'
import {
  listCost,
  totalSavingsBalance,
  monthSavings,
  totalExpenses,
  totalPlanned,
  parseAmount,
  calcMonth,
  buildReport,
} from '@/lib/financeCalc'
import type { FinanceMonth, SavingsTransaction } from '@/types'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeMonth(overrides: Partial<FinanceMonth> = {}): FinanceMonth {
  return {
    key: '2026-08',
    income: 5000,
    budgetItems: [
      { id: 'b1', category: 'Housing', emoji: '🏠', planned: 1200, actual: 1200 },
      { id: 'b2', category: 'Food',    emoji: '🛒', planned: 400,  actual: 350  },
      { id: 'b3', category: 'Travel',  emoji: '✈️', planned: 300,  actual: 400  }, // over budget
    ],
    isFinalized: false,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

function makeTx(monthKey: string, amount: number, id = 'tx1'): SavingsTransaction {
  return {
    id,
    monthKey,
    amount,
    createdAt: '2026-08-01T00:00:00Z',
    createdBy: 'mateo',
  }
}

// ── listCost ─────────────────────────────────────────────────────────────────

describe('listCost', () => {
  it('returns 0 for empty list', () => {
    expect(listCost([])).toBe(0)
  })

  it('sums quantity × price for each item', () => {
    expect(listCost([
      { quantity: 2, price: 10 },
      { quantity: 3, price: 5  },
    ])).toBe(35)
  })

  it('treats missing price as 0', () => {
    expect(listCost([{ quantity: 5 }])).toBe(0)
    expect(listCost([{ quantity: 2, price: undefined }])).toBe(0)
  })

  it('handles fractional prices', () => {
    expect(listCost([{ quantity: 3, price: 1.5 }])).toBeCloseTo(4.5)
  })

  // ── Shopping regression test ─────────────────────────────────────────────
  // Milk qty 2 × €2.25 = €4.50
  // Apples qty 1.25 × €4 = €5.00
  // Bread qty 1 × €3.20 = €3.20
  // Total = €12.70
  it('regression: decimal quantities and prices compute correct line totals', () => {
    const milk   = { quantity: 2,    price: 2.25 }
    const apples = { quantity: 1.25, price: 4    }
    const bread  = { quantity: 1,    price: 3.20 }

    expect(milk.quantity   * milk.price).toBeCloseTo(4.50)
    expect(apples.quantity * apples.price).toBeCloseTo(5.00)
    expect(bread.quantity  * bread.price).toBeCloseTo(3.20)
    expect(listCost([milk, apples, bread])).toBeCloseTo(12.70)
  })

  it('regression: 0.5 × €4 = €2', () => {
    expect(listCost([{ quantity: 0.5, price: 4 }])).toBeCloseTo(2)
  })

  it('regression: 1.25 × €10 = €12.50', () => {
    expect(listCost([{ quantity: 1.25, price: 10 }])).toBeCloseTo(12.50)
  })

  it('regression: 2 × €2.25 = €4.50', () => {
    expect(listCost([{ quantity: 2, price: 2.25 }])).toBeCloseTo(4.50)
  })
})

// ── totalSavingsBalance ───────────────────────────────────────────────────────

describe('totalSavingsBalance', () => {
  it('returns 0 for no transactions', () => {
    expect(totalSavingsBalance([])).toBe(0)
  })

  it('sums all transactions across all months', () => {
    expect(totalSavingsBalance([
      makeTx('2026-07', 200, 'a'),
      makeTx('2026-08', 300, 'b'),
      makeTx('2026-08', -50, 'c'),
    ])).toBe(450)
  })
})

// ── monthSavings ─────────────────────────────────────────────────────────────

describe('monthSavings', () => {
  const txs = [
    makeTx('2026-07', 100, 'a'),
    makeTx('2026-08', 200, 'b'),
    makeTx('2026-08', 50,  'c'),
    makeTx('2026-09', 300, 'd'),
  ]

  it('sums only transactions matching the month key', () => {
    expect(monthSavings(txs, '2026-08')).toBe(250)
  })

  it('returns 0 for a month with no transactions', () => {
    expect(monthSavings(txs, '2026-06')).toBe(0)
  })
})

// ── totalExpenses / totalPlanned ─────────────────────────────────────────────

describe('totalExpenses', () => {
  it('sums actual spending', () => {
    expect(totalExpenses(makeMonth().budgetItems)).toBe(1200 + 350 + 400)
  })

  it('returns 0 for empty list', () => {
    expect(totalExpenses([])).toBe(0)
  })
})

describe('totalPlanned', () => {
  it('sums planned budgets', () => {
    expect(totalPlanned(makeMonth().budgetItems)).toBe(1200 + 400 + 300)
  })
})

// ── parseAmount ───────────────────────────────────────────────────────────────

describe('parseAmount', () => {
  it('parses normal numbers', () => {
    expect(parseAmount('100')).toBe(100)
    expect(parseAmount('3.14')).toBe(3.14)
  })

  it('treats comma as decimal separator', () => {
    expect(parseAmount('1.234,56')).toBe(1.234) // only last comma matters
    expect(parseAmount('1234,56')).toBeCloseTo(1234.56)
  })

  it('returns 0 for empty string', () => {
    expect(parseAmount('')).toBe(0)
  })

  it('returns 0 for NaN input', () => {
    expect(parseAmount('abc')).toBe(0)
  })

  it('returns 0 for negative values', () => {
    expect(parseAmount('-5')).toBe(0)
    expect(parseAmount('-0.01')).toBe(0)
  })

  it('returns 0 for Infinity', () => {
    expect(parseAmount('Infinity')).toBe(0)
  })

  it('accepts 0', () => {
    expect(parseAmount('0')).toBe(0)
  })
})

// ── calcMonth ─────────────────────────────────────────────────────────────────

describe('calcMonth', () => {
  const month = makeMonth()
  const txs   = [makeTx('2026-08', 500)]

  it('computes expenses as sum of actual', () => {
    const c = calcMonth(month, txs)
    expect(c.expenses).toBe(1200 + 350 + 400) // 1950
  })

  it('computes remaining = income - expenses', () => {
    const c = calcMonth(month, txs)
    expect(c.remaining).toBe(5000 - 1950) // 3050
  })

  it('computes saved from transactions for matching month only', () => {
    const c = calcMonth(month, [
      makeTx('2026-07', 100, 'a'),
      makeTx('2026-08', 500, 'b'),
    ])
    expect(c.saved).toBe(500) // July tx excluded
  })

  it('computes savingsRate as % of income', () => {
    const c = calcMonth(month, txs)
    // 500 / 5000 = 10 %
    expect(c.savingsRate).toBeCloseTo(10)
  })

  it('savingsRate is 0 when income is 0', () => {
    const c = calcMonth(makeMonth({ income: 0 }), txs)
    expect(c.savingsRate).toBe(0)
  })

  it('identifies topCategory as highest actual spender', () => {
    const c = calcMonth(month, txs)
    expect(c.topCategory).toBe('🏠 Housing') // 1200 is highest
  })

  it('identifies overBudgetCategories', () => {
    const c = calcMonth(month, txs)
    expect(c.overBudgetCategories).toEqual(['✈️ Travel']) // actual 400 > planned 300
  })

  it('returns no topCategory when all actual values are 0', () => {
    const zeroMonth = makeMonth({
      budgetItems: [
        { id: 'b1', category: 'Housing', emoji: '🏠', planned: 1200, actual: 0 },
      ],
    })
    const c = calcMonth(zeroMonth, [])
    expect(c.topCategory).toBeUndefined()
  })

  it('returns empty overBudgetCategories when nothing is over', () => {
    const okMonth = makeMonth({
      budgetItems: [
        { id: 'b1', category: 'Housing', emoji: '🏠', planned: 1200, actual: 1000 },
      ],
    })
    expect(calcMonth(okMonth, []).overBudgetCategories).toHaveLength(0)
  })
})

// ── buildReport ───────────────────────────────────────────────────────────────

describe('buildReport', () => {
  const month = makeMonth()
  const txs   = [makeTx('2026-08', 600)]

  it('produces a report consistent with calcMonth', () => {
    const report = buildReport(month, txs)
    const calc   = calcMonth(month, txs)

    expect(report.totalIncome).toBe(calc.income)
    expect(report.totalExpenses).toBe(calc.expenses)
    expect(report.totalSaved).toBe(calc.saved)
    expect(report.remaining).toBe(calc.remaining)
    expect(report.savingsRate).toBeCloseTo(calc.savingsRate)
    expect(report.topCategory).toBe(calc.topCategory)
    expect(report.overBudgetCategories).toEqual(calc.overBudgetCategories)
  })

  it('sets generatedAt to a valid ISO timestamp', () => {
    const report = buildReport(month, txs)
    expect(() => new Date(report.generatedAt)).not.toThrow()
    expect(new Date(report.generatedAt).getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('report matches dashboard values — no divergence between views', () => {
    // This is the key consistency guarantee: dashboard and report must agree.
    const report = buildReport(month, txs)
    const dash   = calcMonth(month, txs)

    expect(report.totalExpenses).toBe(dash.expenses)
    expect(report.remaining).toBe(dash.remaining)
    expect(report.totalSaved).toBe(dash.saved)
  })
})

// ── Finance decimal regression ────────────────────────────────────────────────
// These tests guard against integer-snapping in quantity × price calculations.

describe('Finance decimal regression — quantity × price precision', () => {
  it('1.25 × €1 = €1.25', () => {
    expect(listCost([{ quantity: 1.25, price: 1 }])).toBeCloseTo(1.25)
  })

  it('1.25 × €10 = €12.50', () => {
    expect(listCost([{ quantity: 1.25, price: 10 }])).toBeCloseTo(12.50)
  })

  it('0.25 × €8 = €2.00', () => {
    expect(listCost([{ quantity: 0.25, price: 8 }])).toBeCloseTo(2.00)
  })

  it('0.5 × €3.50 = €1.75', () => {
    expect(listCost([{ quantity: 0.5, price: 3.50 }])).toBeCloseTo(1.75)
  })

  it('2.75 × €4 = €11.00', () => {
    expect(listCost([{ quantity: 2.75, price: 4 }])).toBeCloseTo(11.00)
  })

  it('calcMonth preserves decimal actual spending in remaining', () => {
    const decimalMonth = makeMonth({
      budgetItems: [
        { id: 'b1', category: 'Food', emoji: '🛒', planned: 500, actual: 123.45 },
      ],
    })
    const c = calcMonth(decimalMonth, [])
    expect(c.expenses).toBeCloseTo(123.45)
    expect(c.remaining).toBeCloseTo(5000 - 123.45)
  })
})
