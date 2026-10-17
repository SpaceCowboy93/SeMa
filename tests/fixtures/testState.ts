/**
 * E2E test state fixture.
 *
 * Provides a minimal, deterministic app state that can be injected into
 * the browser's localStorage before each test run.
 *
 * This fixture:
 *   - Does NOT use real user credentials.
 *   - Does NOT connect to the production Supabase database.
 *   - Uses a fixed test user ("mateo") to satisfy the auth gate.
 *   - Provides just enough data to exercise navigation flows.
 *
 * The Zustand persist key is "semacalendar-v1".
 * currentUser is excluded from persist (transient) and must be set
 * via a separate sessionStorage key or directly onto the store via
 * a script injected before page load.
 */

export const PERSIST_KEY = 'semacalendar-v1'

/** The test user identity. Not a real account credential. */
export const TEST_USER = 'mateo' as const

/**
 * Minimal persisted state that lets the app past the auth redirect.
 * The app layout redirects to "/" when currentUser is null; we rely on
 * the store reading from localStorage on hydration.
 *
 * NOTE: currentUser is excluded from the persisted store.
 * We inject it via the init script below.
 */
export const MINIMAL_STATE = {
  events:             [],
  todos:              [],
  moods:              [],
  loveNotes:          [],
  wishlistItems:      [],
  countdowns:         [],
  memories:           [],
  boomBoomCount:      0,
  goals:              [],
  partnerNotes:       [],
  shoppingLists:      [],
  monthlyIncome:      0,
  budgetItems:        [],
  savingsGoals:       [],
  financeMonths:      [],
  savingsTransactions:[],
  focusActivities:    [],
  focusCarryOver:     false,
}

/**
 * Returns a script string that can be injected via page.addInitScript.
 * Sets the persisted store AND forces currentUser into the Zustand store
 * as soon as the page scripts run (before React hydrates).
 */
export function buildInitScript(user: string = TEST_USER): string {
  const state = JSON.stringify({ state: MINIMAL_STATE, version: 0 })
  return `
    // Inject persisted Zustand store
    try {
      window.localStorage.setItem(${JSON.stringify(PERSIST_KEY)}, ${JSON.stringify(state)});
    } catch (e) {}

    // Force currentUser so the app does not redirect
    // We patch the global Zustand store setter right after first render
    // by intercepting the zustand-persist rehydration hook.
    Object.defineProperty(window, '__SEMA_TEST_USER__', {
      value: ${JSON.stringify(user)},
      writable: false,
    });

    // Patch sessionStorage as a fallback for any session-based auth check
    try {
      window.sessionStorage.setItem('sema-test-user', ${JSON.stringify(user)});
    } catch (e) {}
  `
}
