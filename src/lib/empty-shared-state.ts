import type { SharedState } from './shared-state'

/** The V2 clean-start document. No sample content, financial defaults or old cache data. */
export function emptySharedState(): SharedState {
  return { events: [], todos: [], moods: [], loveNotes: [], wishlistItems: [], countdowns: [], memories: [], goals: [], partnerNotes: [],
    shoppingLists: [], monthlyIncome: 0, budgetItems: [], savingsGoals: [], financeMonths: [], savingsTransactions: [], focusActivities: [],
    focusCarryOver: false, boomBoomCount: 0, trips: [] }
}
