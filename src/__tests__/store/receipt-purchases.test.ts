import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store/useAppStore'
import { selectSharedState } from '@/lib/shared-state'
import { rebaseSharedState } from '@/lib/sync-merge'
import type { ReceiptResult } from '@/types'
const receipt: ReceiptResult = { store: 'Lidl', date: '2026-10-31', currency: 'EUR', items: [{ id: 'milk', name: 'Milk', quantity: 2, unitPrice: 2, lineTotal: 4 }], subtotal: 4, tax: 0, grandTotal: 3.5 }
const fingerprint = 'a'.repeat(64)
const snapshot = () => JSON.parse(JSON.stringify(selectSharedState(useAppStore.getState())))
const category = () => useAppStore.getState().financeMonths[0].budgetItems.find(b => b.category === 'Shopping')!
beforeEach(() => useAppStore.setState({ currentUser: 'mateo', shoppingLists: [], financeMonths: [] }))
describe('confirmed receipt purchases', () => {
  it('atomically saves purchased items and the confirmed total in the purchase month', () => {
    useAppStore.getState().confirmReceipt(receipt, fingerprint)
    const state = useAppStore.getState()
    expect(state.shoppingLists[0]).toMatchObject({ isCompleted: true, date: '2026-10-31', receipt: { fingerprint } })
    expect(state.shoppingLists[0].items[0]).toMatchObject({ name: 'Milk', isChecked: true, quantity: 2 })
    expect(state.financeMonths[0].key).toBe('2026-10')
    expect(category().actual).toBe(3.5)
    expect(category().items).toHaveLength(1)
    expect(category().items![0].unitPrice).toBe(3.5)
  })
  it('rejects repeated saves, including after remote snapshot hydration', () => {
    useAppStore.getState().confirmReceipt(receipt, fingerprint)
    const shared = snapshot()
    useAppStore.setState({ ...shared, currentUser: 'seval' })
    expect(() => useAppStore.getState().confirmReceipt(receipt, fingerprint)).toThrow('already')
    expect(category().items).toHaveLength(1)
    expect(category().actual).toBe(3.5)
  })
  it('does not save invalid input or touch any collection', () => {
    const before = snapshot()
    expect(() => useAppStore.getState().confirmReceipt({ ...receipt, grandTotal: NaN }, fingerprint)).toThrow()
    expect(snapshot()).toEqual(before)
  })
  it('preserves existing manual spending and can remove only the linked contribution', () => {
    useAppStore.getState().createFinanceMonth('2026-10')
    const month = useAppStore.getState().financeMonths[0]
    useAppStore.getState().updateFinanceMonth(month.key, { budgetItems: month.budgetItems.map(b => b.category === 'Shopping' ? { ...b, actual: 17 } : b) })
    const id = useAppStore.getState().confirmReceipt(receipt, fingerprint)
    expect(category().actual).toBe(20.5)
    useAppStore.getState().deleteShoppingList(id)
    expect(category().actual).toBe(17)
  })
  it('restores missing Shopping category in an existing month', () => {
    useAppStore.getState().createFinanceMonth('2026-10')
    useAppStore.getState().updateFinanceMonth('2026-10', { budgetItems: [] })
    useAppStore.getState().confirmReceipt(receipt, fingerprint)
    expect(category().actual).toBe(3.5)
  })
  it('keeps receipt spending separate from personal spending with the same bag icon', () => {
    useAppStore.getState().createFinanceMonth('2026-10')
    const personal = { id: 'personal', category: 'Other / Personal', emoji: '🛍️', planned: 200, actual: 130 }
    useAppStore.getState().updateFinanceMonth('2026-10', { budgetItems: [personal] })
    useAppStore.getState().confirmReceipt(receipt, fingerprint)
    expect(category().actual).toBe(3.5)
    expect(useAppStore.getState().financeMonths[0].budgetItems[0]).toEqual(personal)
  })
  it('merges equal-price concurrent receipts without losing their spending', () => {
    useAppStore.getState().createFinanceMonth('2026-10')
    const base = snapshot()
    useAppStore.getState().confirmReceipt(receipt, fingerprint)
    const local = snapshot()
    useAppStore.setState({ ...base, currentUser: 'seval' })
    useAppStore.getState().confirmReceipt({ ...receipt, store: 'Aldi' }, 'b'.repeat(64))
    const remote = snapshot()
    const merged = rebaseSharedState(base, local, remote, new Set(['shoppingLists', 'financeMonths']))
    expect(merged.conflicts).toEqual([])
    expect(merged.state.shoppingLists).toHaveLength(2)
    expect(merged.state.financeMonths![0].budgetItems.find(b => b.category === 'Shopping')!.actual).toBe(7)
  })
  it('concurrent identical receipt imports never produce two finance entries', () => {
    const base = snapshot()
    useAppStore.getState().confirmReceipt(receipt, fingerprint)
    const local = snapshot()
    useAppStore.setState({ ...base, currentUser: 'seval' })
    useAppStore.getState().confirmReceipt(receipt, fingerprint)
    const remote = snapshot()
    const merged = rebaseSharedState(base, local, remote, new Set(['shoppingLists', 'financeMonths']))
    expect(merged.state.shoppingLists).toHaveLength(1)
    expect(merged.state.financeMonths![0].budgetItems.find(b => b.category === 'Shopping')!.items).toHaveLength(1)
    // Existing conflict review must keep receipt and finance records together.
    expect(merged.groups[0].members.map(m => m.key)).toEqual(expect.arrayContaining(['shoppingLists', 'financeMonths']))
  })
})
