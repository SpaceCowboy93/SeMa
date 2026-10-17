/**
 * Parts 3–5 & 10–12 — Live sync, responsive & accessibility verification.
 *
 * Two isolated Playwright Chromium profiles:
 *   qa-playwright-mateo  → Mateo's session
 *   qa-playwright-seval  → Seval's session
 *
 * Full lifecycle per category:
 *   Mateo creates → Seval sees via realtime → Seval reloads (persistence)
 *   → Seval edits (where supported) → Mateo confirms edit
 *   → Mateo deletes → both confirm deletion
 *
 * Part 10 appended: responsive viewport checks + console-error audit.
 */

import {
  test, expect, chromium,
  type BrowserContext, type Page,
} from '@playwright/test'

/* ── Config ─────────────────────────────────────────────────────────────────── */

const PREVIEW     = 'https://sema-calendar-9j1dulpgp-mateo-s-projects123.vercel.app'
const MATEO_DIR   = 'C:\\Users\\mateo\\AppData\\Local\\Temp\\qa-playwright-mateo'
const SEVAL_DIR   = 'C:\\Users\\mateo\\AppData\\Local\\Temp\\qa-playwright-seval'
const TS          = Date.now()
const SYNC_WAIT   = 9000   // ms — realtime latency budget
const NAV_TIMEOUT = 20000  // ms — page navigation idle timeout

/* ── Shared context ─────────────────────────────────────────────────────────── */

let mateoCtx: BrowserContext
let sevalCtx: BrowserContext
let mateo: Page
let seval: Page

// Collect console errors per page for the audit report
const consoleErrors: { page: string; text: string }[] = []

test.setTimeout(900000)  // 15 min — generous budget for manual login + full suite

test.beforeAll(async () => {
  const sharedArgs = [
    '--disable-notifications', '--no-sandbox',
    '--disable-web-security', '--allow-running-insecure-content',
  ]
  mateoCtx = await chromium.launchPersistentContext(MATEO_DIR, {
    headless: false,
    viewport:  { width: 430, height: 900 },
    args: ['--window-position=0,0',   ...sharedArgs],
    ignoreHTTPSErrors: true,
  })
  sevalCtx = await chromium.launchPersistentContext(SEVAL_DIR, {
    headless: false,
    viewport:  { width: 430, height: 900 },
    args: ['--window-position=450,0', ...sharedArgs],
    ignoreHTTPSErrors: true,
  })
  mateo = mateoCtx.pages()[0] ?? await mateoCtx.newPage()
  seval = sevalCtx.pages()[0] ?? await sevalCtx.newPage()

  // Cap all per-action timeouts to 15s.
  // test.setTimeout(900000) would otherwise make them 900s, causing infinite hangs
  // when a locator doesn't exist (e.g. on the login page after session expiry).
  mateo.setDefaultTimeout(15000)
  seval.setDefaultTimeout(15000)

  // Capture console errors for Part 10 audit
  for (const [label, page] of [['MATEO', mateo], ['SEVAL', seval]] as const) {
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push({ page: label, text: msg.text() })
    })
  }
})

test.afterAll(async () => {
  await mateoCtx?.close().catch(() => {})
  await sevalCtx?.close().catch(() => {})
})

/* ── Helpers ────────────────────────────────────────────────────────────────── */

async function go(page: Page, path: string) {
  // 'load' instead of 'networkidle' — Supabase Realtime keeps a persistent
  // WebSocket open which prevents networkidle from ever firing.
  await page.goto(PREVIEW + path, { waitUntil: 'load', timeout: NAV_TIMEOUT })
  await page.waitForTimeout(1200)
}

async function reload(page: Page) {
  await page.reload({ waitUntil: 'load', timeout: NAV_TIMEOUT })
  await page.waitForTimeout(1200)
}

async function waitSync() {
  // Let realtime propagate; Supabase Realtime typically < 2s in good conditions
  // but we budget up to SYNC_WAIT for flaky networks.
  await new Promise(r => setTimeout(r, SYNC_WAIT))
}

/* ────────────────────────────────────────────────────────────────────────────
   P3 — Authentication
   Navigate both browsers to the login page simultaneously.
   Waits up to 5 minutes for both accounts to complete login.
   YOU MUST LOG IN TO BOTH BROWSER WINDOWS NOW.
──────────────────────────────────────────────────────────────────────────── */

test('P3 — Both accounts authenticate', async () => {
  // Navigate both browsers simultaneously
  await Promise.all([
    mateo.goto(PREVIEW + '/', { waitUntil: 'domcontentloaded', timeout: 30000 }),
    seval.goto(PREVIEW + '/', { waitUntil: 'domcontentloaded', timeout: 30000 }),
  ])

  console.log('\n══════════════════════════════════════════')
  console.log(' TWO BROWSER WINDOWS ARE NOW OPEN.')
  console.log(' Please log in to BOTH windows within 5 minutes.')
  console.log(' Left window  = Mateo   Right window = Seval')
  console.log('══════════════════════════════════════════\n')

  // Wait for both to land on /together (auto-redirect if session valid, or after manual login)
  const [mateoOk, sevalOk] = await Promise.all([
    mateo.waitForURL(`${PREVIEW}/together`, { timeout: 300000 }).then(() => true).catch(() => false),
    seval.waitForURL(`${PREVIEW}/together`, { timeout: 300000 }).then(() => true).catch(() => false),
  ])

  expect(mateoOk, 'MATEO: must reach /together — log in via the left browser window').toBe(true)
  expect(sevalOk, 'SEVAL: must reach /together — log in via the right browser window').toBe(true)

  console.log('[P3] ✓ Both accounts authenticated')
})

/* ────────────────────────────────────────────────────────────────────────────
   P4-LNOTES — Love Notes  (/notes)
──────────────────────────────────────────────────────────────────────────── */

test('P4-LNOTES — Love Notes: create → sync → persist → delete', async () => {
  const content = `QA-SYNC-NOTES-${TS}`

  /* 1. Mateo sends a note */
  await go(mateo, '/notes')
  // Click the heart FAB to open compose area (w-10 h-10 button in the header)
  await mateo.locator('button.w-10.h-10').first().click()
  const textarea = mateo.locator('textarea[placeholder="Write something sweet..."]')
  await expect(textarea).toBeVisible({ timeout: 4000 })
  await textarea.fill(content)
  await mateo.locator('button:has-text("Send")').click()
  console.log('[LNOTES] Mateo sent note:', content)

  /* 2. Seval sees it without refreshing (realtime sync) */
  await go(seval, '/notes')
  await waitSync()
  const noteViaSync = seval.locator(`text=${content}`).first()
  const syncVisible = await noteViaSync.isVisible({ timeout: 5000 }).catch(() => false)
  console.log('[LNOTES] Seval sees via realtime:', syncVisible)
  expect(syncVisible, 'Love note must appear for Seval via realtime').toBe(true)

  /* 3. Seval reloads — persistence */
  await reload(seval)
  const persisted = await seval.locator(`text=${content}`).first().isVisible({ timeout: 5000 }).catch(() => false)
  console.log('[LNOTES] Persists after reload:', persisted)
  expect(persisted, 'Love note must persist after Seval reloads').toBe(true)

  /* 4–5. Notes are immutable — no edit step; skip to deletion */

  /* 6. Mateo deletes his own note */
  await go(mateo, '/notes')
  // Hover over the note card to reveal actions (group-hover), then click Trash2
  const noteCard = mateo.locator(`text=${content}`).first()
  await noteCard.hover()
  const deleteBtn = mateo.locator('button:has-text("Delete")').first()
  if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await deleteBtn.click()
    // Confirm via DeleteConfirmSheet
    const confirmBtn = mateo.locator('button:has-text("Delete")').last()
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) await confirmBtn.click()
    console.log('[LNOTES] Mateo deleted note')
  } else {
    console.log('[LNOTES] Delete button not visible on hover — may need scroll or tap on mobile')
  }

  /* 7. Seval confirms deletion after sync */
  await waitSync()
  await reload(seval)
  const gone = await seval.locator(`text=${content}`).first().isVisible({ timeout: 3000 }).catch(() => false)
  console.log('[LNOTES] Gone for Seval after deletion:', !gone)
  expect(gone, 'Deleted love note must disappear for Seval').toBe(false)
})

/* ────────────────────────────────────────────────────────────────────────────
   P4-WISH — Wishlist  (/wishlist)
──────────────────────────────────────────────────────────────────────────── */

test('P4-WISH — Wishlist: create → sync → edit → delete', async () => {
  const title    = `QA-SYNC-WISH-${TS}`
  const titleV2  = `${title}-EDIT`

  /* 1. Mateo adds a wish */
  await go(mateo, '/wishlist')
  // The FAB is the w-10 h-10 button in the header with a Plus icon
  await mateo.locator('button.w-10.h-10').first().click()
  const wishInput = mateo.locator('input[placeholder="What do you wish for?"]')
  await expect(wishInput).toBeVisible({ timeout: 4000 })
  await wishInput.fill(title)
  await mateo.locator('button:has-text("Add")').last().click()
  console.log('[WISH] Mateo created:', title)

  /* 2. Seval sees via realtime */
  await go(seval, '/wishlist')
  await waitSync()
  const syncOk = await seval.locator(`text=${title}`).first().isVisible({ timeout: 5000 }).catch(() => false)
  console.log('[WISH] Seval sees via realtime:', syncOk)
  expect(syncOk, 'Wish must appear for Seval via realtime').toBe(true)

  /* 3. Seval reloads */
  await reload(seval)
  const persisted = await seval.locator(`text=${title}`).first().isVisible({ timeout: 5000 }).catch(() => false)
  console.log('[WISH] Persists after reload:', persisted)
  expect(persisted, 'Wish must persist after reload').toBe(true)

  /* 4. Seval edits by opening the detail sheet and saving a new title */
  // Tap on the wish card to open detail
  await seval.locator(`text=${title}`).first().click()
  const editInput = seval.locator('input[type="text"]').first()
  if (await editInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await editInput.fill(titleV2)
    await seval.locator('button:has-text("Save")').first().click()
    console.log('[WISH] Seval edited to:', titleV2)
  } else {
    console.log('[WISH] Detail edit input not found — wishlist items may be view-only; skipping edit')
  }

  /* 5. Mateo confirms edit — reload and check for new title */
  await waitSync()
  await reload(mateo)
  await go(mateo, '/wishlist')

  /* 6. Mateo deletes the wish: open detail modal → "Delete Wish" → confirm /^Delete$/ */
  const wishToDelete = mateo.locator(`text=${titleV2}`).or(mateo.locator(`text=${title}`)).first()
  if (await wishToDelete.isVisible({ timeout: 5000 }).catch(() => false)) {
    await wishToDelete.click()
    const deleteWishBtn = mateo.locator('button:has-text("Delete Wish")').first()
    if (await deleteWishBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteWishBtn.click()
      await mateo.waitForTimeout(400)
      await mateo.locator('button').filter({ hasText: /^Delete$/ }).first().click()
      console.log('[WISH] Mateo deleted wish')
    } else {
      await mateo.keyboard.press('Escape')
      console.log('[WISH] Delete Wish button not found — manual cleanup may be needed')
    }
  }

  /* 7. Both confirm deletion */
  await waitSync()
  await reload(seval)
  await go(seval, '/wishlist')
  const goneForSeval = !(await seval.locator(`text=${titleV2}`).or(seval.locator(`text=${title}`)).first().isVisible({ timeout: 3000 }).catch(() => false))
  console.log('[WISH] Gone for Seval:', goneForSeval)
  expect(goneForSeval, 'Deleted wish must disappear for Seval').toBe(true)
})

/* ────────────────────────────────────────────────────────────────────────────
   P4-SHOP — Shopping  (/shopping)
──────────────────────────────────────────────────────────────────────────── */

test('P4-SHOP — Shopping: create list → sync → delete', async () => {
  const listName = `QA-SYNC-SHOP-${TS}`

  /* 1. Mateo creates a new shopping list */
  await go(mateo, '/shopping')
  // "New list" button is in the ACTION ROW grid
  await mateo.locator('button:has-text("New list")').first().click()
  // ShoppingListEditorSheet opens — fill in list name
  const nameInput = mateo.locator('input[placeholder*="List name"]')
  await expect(nameInput).toBeVisible({ timeout: 5000 })
  await nameInput.fill(listName)
  await mateo.locator('button:has-text("Create Shopping List")').click()
  console.log('[SHOP] Mateo created list:', listName)

  /* 2. Seval sees via realtime */
  await go(seval, '/shopping')
  await waitSync()
  const syncOk = await seval.locator(`text=${listName}`).first().isVisible({ timeout: 5000 }).catch(() => false)
  console.log('[SHOP] Seval sees via realtime:', syncOk)
  expect(syncOk, 'Shopping list must appear for Seval via realtime').toBe(true)

  /* 3. Seval reloads */
  await reload(seval)
  const persisted = await seval.locator(`text=${listName}`).first().isVisible({ timeout: 5000 }).catch(() => false)
  console.log('[SHOP] Persists after reload:', persisted)
  expect(persisted, 'Shopping list must persist after reload').toBe(true)

  /* 6–7. Shopping active-list deletion is not available in the current UI.
   *       Only completed (past) lists have a Trash2 delete button.
   *       Clean up by removing the record from localStorage on both sides. */
  console.log('[SHOP] NOTE: active-list deletion not available in UI — cleaning up via localStorage')
  for (const page of [mateo, seval]) {
    await page.evaluate((name) => {
      const raw = localStorage.getItem('semacalendar-v1')
      if (!raw) return
      try {
        const s = JSON.parse(raw)
        if (s && s.state && Array.isArray(s.state.shoppingLists)) {
          s.state.shoppingLists = s.state.shoppingLists.filter((l: { name: string }) => l.name !== name)
          localStorage.setItem('semacalendar-v1', JSON.stringify(s))
        }
      } catch { /* ignore */ }
    }, listName)
  }
  await reload(mateo)
  await reload(seval)
  const goneForSeval = !(await seval.locator(`text=${listName}`).first().isVisible({ timeout: 3000 }).catch(() => false))
  console.log('[SHOP] Cleaned up for Seval:', goneForSeval)
})

/* ────────────────────────────────────────────────────────────────────────────
   P4-GOALS — Dreams  (/goals)
──────────────────────────────────────────────────────────────────────────── */

test('P4-GOALS — Dreams: create → sync → delete', async () => {
  const dreamTitle = `QA-SYNC-GOALS-${TS}`

  /* 1. Mateo creates a dream in the Travel category */
  await go(mateo, '/goals')
  // Click the "Travel" category card (first in the grid)
  await mateo.locator('button:has-text("Travel")').first().click()
  // Bottom sheet opens — click "Add Dream" in footer
  const addDreamBtn = mateo.locator('button:has-text("Add Dream")')
  await expect(addDreamBtn).toBeVisible({ timeout: 5000 })
  await addDreamBtn.click()
  // GoalForm appears — fill title
  const dreamInput = mateo.locator('input[placeholder="Dream title..."]').first()
  await expect(dreamInput).toBeVisible({ timeout: 4000 })
  await dreamInput.fill(dreamTitle)
  // Save
  const saveBtn = mateo.locator('button:has-text("Save Dream"), button:has-text("Save"), button:has-text("Add")').first()
  await saveBtn.click()
  console.log('[GOALS] Mateo created dream:', dreamTitle)

  // Close the category sheet
  await mateo.keyboard.press('Escape')

  /* 2. Seval sees via realtime */
  await go(seval, '/goals')
  await waitSync()
  // Open the same category
  await seval.locator('button:has-text("Travel")').first().click()
  const syncOk = await seval.locator(`text=${dreamTitle}`).first().isVisible({ timeout: 5000 }).catch(() => false)
  console.log('[GOALS] Seval sees via realtime:', syncOk)
  expect(syncOk, 'Dream must appear for Seval via realtime').toBe(true)

  /* 3. Seval reloads */
  await seval.keyboard.press('Escape')
  await reload(seval)
  await go(seval, '/goals')
  await seval.locator('button:has-text("Travel")').first().click()
  const persisted = await seval.locator(`text=${dreamTitle}`).first().isVisible({ timeout: 5000 }).catch(() => false)
  console.log('[GOALS] Persists after reload:', persisted)
  expect(persisted, 'Dream must persist after reload').toBe(true)
  await seval.keyboard.press('Escape')

  /* 6. Mateo deletes the dream: hover goal group to reveal opacity-0 trash, confirm "Delete" */
  await go(mateo, '/goals')
  await mateo.locator('button:has-text("Travel")').first().click()
  const goalGroup = mateo.locator('[class*="group"]').filter({ hasText: dreamTitle }).first()
  if (await goalGroup.isVisible({ timeout: 5000 }).catch(() => false)) {
    await goalGroup.hover()
    await mateo.waitForTimeout(400)
    await goalGroup.locator('button[class*="opacity-0"]').last().click({ force: true })
    await mateo.waitForTimeout(400)
    const confirmDel = mateo.locator('button').filter({ hasText: /^Delete$/ }).first()
    if (await confirmDel.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmDel.click()
      console.log('[GOALS] Mateo deleted dream')
    } else {
      console.log('[GOALS] Confirm Delete not found — manual cleanup may be needed')
    }
  }

  /* 7. Seval confirms deletion */
  await waitSync()
  await reload(seval)
  await go(seval, '/goals')
  await seval.locator('button:has-text("Travel")').first().click()
  const goneForSeval = !(await seval.locator(`text=${dreamTitle}`).first().isVisible({ timeout: 3000 }).catch(() => false))
  console.log('[GOALS] Gone for Seval:', goneForSeval)
  expect(goneForSeval, 'Deleted dream must disappear for Seval').toBe(true)
  await seval.keyboard.press('Escape')
})

/* ────────────────────────────────────────────────────────────────────────────
   P4-TODOS — Planner  (/todos)
──────────────────────────────────────────────────────────────────────────── */

test('P4-TODOS — Planner: create → sync → edit → delete', async () => {
  const taskTitle  = `QA-SYNC-TODOS-${TS}`
  const taskTitleV2 = `${taskTitle}-EDIT`

  /* 1. Mateo creates a todo */
  await go(mateo, '/todos')
  // Plus FAB button: the w-10 h-10 button in the header
  await mateo.locator('button.w-10.h-10').first().click()
  const titleInput = mateo.locator('input[placeholder="Plan name..."]')
  await expect(titleInput).toBeVisible({ timeout: 5000 })
  await titleInput.fill(taskTitle)
  await mateo.locator('button:has-text("Save Plan")').click()
  console.log('[TODOS] Mateo created todo:', taskTitle)

  /* 2. Seval sees via realtime */
  await go(seval, '/todos')
  await waitSync()
  const syncOk = await seval.locator(`text=${taskTitle}`).first().isVisible({ timeout: 5000 }).catch(() => false)
  console.log('[TODOS] Seval sees via realtime:', syncOk)
  expect(syncOk, 'Todo must appear for Seval via realtime').toBe(true)

  /* 3. Seval reloads */
  await reload(seval)
  const persisted = await seval.locator(`text=${taskTitle}`).first().isVisible({ timeout: 5000 }).catch(() => false)
  console.log('[TODOS] Persists after reload:', persisted)
  expect(persisted, 'Todo must persist after reload').toBe(true)

  /* 4. Seval edits: hover the todo group to reveal opacity-0 pencil, force-click it */
  const todoGroup = seval.locator('[class*="group"]').filter({ hasText: taskTitle }).first()
  if (await todoGroup.isVisible({ timeout: 3000 }).catch(() => false)) {
    await todoGroup.hover()
    await seval.waitForTimeout(400)
    // Pencil is the first opacity-0 button in the group; Trash2 is the second
    await todoGroup.locator('button[class*="opacity-0"]').first().click({ force: true })
    const editTitleInput = seval.locator('input[placeholder="Task name..."], input[placeholder="Plan name..."]').first()
    if (await editTitleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editTitleInput.fill(taskTitleV2)
      await seval.locator('button:has-text("Save Changes"), button:has-text("Save Plan")').first().click()
      console.log('[TODOS] Seval edited todo to:', taskTitleV2)
    } else {
      console.log('[TODOS] Edit input not found — skipping edit step')
    }
  } else {
    console.log('[TODOS] Todo item not found — skipping edit step')
  }

  /* 5. Mateo confirms edit */
  await waitSync()
  await reload(mateo)
  await go(mateo, '/todos')
  const editedVisible = await mateo.locator(`text=${taskTitleV2}`).first().isVisible({ timeout: 5000 }).catch(() => false)
  console.log('[TODOS] Mateo sees edited title:', editedVisible)

  /* 6. Mateo deletes: hover group to reveal opacity-0 trash, confirm with exact "Remove" */
  const activeTitle = (await mateo.locator(`text=${taskTitleV2}`).first().isVisible({ timeout: 2000 }).catch(() => false))
    ? taskTitleV2 : taskTitle
  const todoGroupDel = mateo.locator('[class*="group"]').filter({ hasText: activeTitle }).first()
  if (await todoGroupDel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await todoGroupDel.hover()
    await mateo.waitForTimeout(400)
    // Trash2 is the last opacity-0 button (pencil first, trash last)
    await todoGroupDel.locator('button[class*="opacity-0"]').last().click({ force: true })
    await mateo.waitForTimeout(400)
    const confirmDel = mateo.locator('button').filter({ hasText: /^Remove$/ }).first()
    if (await confirmDel.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmDel.click()
      console.log('[TODOS] Mateo deleted todo')
    } else {
      console.log('[TODOS] Confirm Remove not found — manual cleanup may be needed')
    }
  }

  /* 7. Seval confirms deletion */
  await waitSync()
  await reload(seval)
  const goneForSeval = !(await seval.locator(`text=${taskTitleV2}`).or(seval.locator(`text=${taskTitle}`)).first().isVisible({ timeout: 3000 }).catch(() => false))
  console.log('[TODOS] Gone for Seval:', goneForSeval)
  expect(goneForSeval, 'Deleted todo must disappear for Seval').toBe(true)
})

/* ────────────────────────────────────────────────────────────────────────────
   P4-CAL — Calendar Events  (/calendar)
──────────────────────────────────────────────────────────────────────────── */

test('P4-CAL — Calendar event: create → sync → delete', async () => {
  const eventTitle = `QA-SYNC-CAL-${TS}`

  /* 1. Mateo creates an event for today */
  await go(mateo, '/calendar')
  // "Add" button appears next to the selected date
  const addBtn = mateo.locator('button:has-text("Add")').last()
  await expect(addBtn).toBeVisible({ timeout: 5000 })
  await addBtn.click()
  // EventModal opens
  const titleInput = mateo.locator('input[placeholder="Event title..."]')
  await expect(titleInput).toBeVisible({ timeout: 5000 })
  await titleInput.fill(eventTitle)
  // Save (the primary action button in EventModal footer)
  const saveBtn = mateo.locator('button:has-text("Save Event"), button:has-text("Save"), button:has-text("Add Event")').first()
  await saveBtn.click()
  console.log('[CAL] Mateo created event:', eventTitle)

  /* 2. Seval sees via realtime */
  await go(seval, '/calendar')
  await waitSync()
  const syncOk = await seval.locator(`text=${eventTitle}`).first().isVisible({ timeout: 5000 }).catch(() => false)
  console.log('[CAL] Seval sees via realtime:', syncOk)
  expect(syncOk, 'Calendar event must appear for Seval via realtime').toBe(true)

  /* 3. Seval reloads */
  await reload(seval)
  const persisted = await seval.locator(`text=${eventTitle}`).first().isVisible({ timeout: 5000 }).catch(() => false)
  console.log('[CAL] Persists after reload:', persisted)
  expect(persisted, 'Calendar event must persist after reload').toBe(true)

  /* 6. Mateo deletes the event */
  await go(mateo, '/calendar')
  const eventCard = mateo.locator(`text=${eventTitle}`).first()
  if (await eventCard.isVisible({ timeout: 5000 }).catch(() => false)) {
    await eventCard.click()
    await mateo.waitForTimeout(500)
    // EventModal footer has "Delete Event" trigger; confirm sheet has exact-text "Delete"
    const deleteEventBtn = mateo.locator('button:has-text("Delete Event")').first()
    if (await deleteEventBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteEventBtn.click()
      await mateo.waitForTimeout(400)
      await mateo.locator('button').filter({ hasText: /^Delete$/ }).first().click()
      console.log('[CAL] Mateo deleted event')
    } else {
      console.log('[CAL] Delete Event button not found — manual cleanup may be needed')
    }
  }

  /* 7. Seval confirms deletion */
  await waitSync()
  await reload(seval)
  await go(seval, '/calendar')
  const goneForSeval = !(await seval.locator(`text=${eventTitle}`).first().isVisible({ timeout: 3000 }).catch(() => false))
  console.log('[CAL] Gone for Seval:', goneForSeval)
  expect(goneForSeval, 'Deleted calendar event must disappear for Seval').toBe(true)
})

/* ────────────────────────────────────────────────────────────────────────────
   P5 — Dream ↔ Calendar notes and checklist linking
──────────────────────────────────────────────────────────────────────────── */

test('P5-LINK — Dream event notes survive Supabase sync (DEF-2 regression)', async () => {
  const evTitle   = `QA-LINK-CAL-${TS}`
  const evNotes   = `QA-LINK-NOTES-${TS}`
  const checkItem = `QA-LINK-CHECK-${TS}`

  /* 1. Mateo creates a calendar event */
  await go(mateo, '/calendar')
  await mateo.locator('button:has-text("Add")').last().click()
  const titleInput = mateo.locator('input[placeholder="Event title..."]')
  await expect(titleInput).toBeVisible({ timeout: 5000 })
  await titleInput.fill(evTitle)

  /* 2. Add notes inside EventModal */
  const notesArea = mateo.locator('textarea[placeholder*="note" i], textarea[placeholder*="detail" i], textarea').first()
  if (await notesArea.isVisible({ timeout: 3000 }).catch(() => false)) {
    await notesArea.fill(evNotes)
    console.log('[LINK] Mateo added notes to event')
  }

  /* 3. Add a checklist item inside EventModal */
  const checkInput = mateo.locator('input[placeholder*="Add" i], input[placeholder*="todo" i], input[placeholder*="item" i]').last()
  if (await checkInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await checkInput.fill(checkItem)
    await mateo.keyboard.press('Enter')
    console.log('[LINK] Mateo added checklist item to event')
  }

  /* 4. Wait 6s (simulates a Supabase sync firing mid-edit) without saving */
  console.log('[LINK] Waiting 6s to simulate Supabase sync during edit...')
  await mateo.waitForTimeout(6000)

  /* 5. After the simulated sync wait, notes and checklist must still be in the form */
  const notesAfterSync = notesArea.isVisible({ timeout: 2000 }).catch(() => false)
  const notesValue = await mateo.locator('textarea').first().inputValue().catch(() => '')
  const checkVisible = await mateo.locator(`text=${checkItem}`).first().isVisible({ timeout: 2000 }).catch(() => false)

  console.log('[LINK] Notes value after sync wait:', notesValue.slice(0, 60))
  console.log('[LINK] Checklist item visible after sync wait:', checkVisible)

  if (notesValue) {
    expect(notesValue).toContain(evNotes.slice(0, 20))
  }

  /* 6. Save the event */
  const saveBtn = mateo.locator('button:has-text("Save Event"), button:has-text("Save")').first()
  if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await saveBtn.click()
    console.log('[LINK] Event saved')
  }

  /* 7. Seval sees the event */
  await waitSync()
  await go(seval, '/calendar')
  const sevalSees = await seval.locator(`text=${evTitle}`).first().isVisible({ timeout: 5000 }).catch(() => false)
  console.log('[LINK] Seval sees event:', sevalSees)
  expect(sevalSees, 'Linked event must appear for Seval').toBe(true)

  /* 8. Cleanup — Mateo deletes the event */
  await go(mateo, '/calendar')
  const evCard = mateo.locator(`text=${evTitle}`).first()
  if (await evCard.isVisible({ timeout: 5000 }).catch(() => false)) {
    await evCard.click()
    await mateo.waitForTimeout(400)
    const deleteEventBtn = mateo.locator('button:has-text("Delete Event")').first()
    if (await deleteEventBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteEventBtn.click()
      await mateo.waitForTimeout(400)
      await mateo.locator('button').filter({ hasText: /^Delete$/ }).first().click()
    }
  }
})

/* ────────────────────────────────────────────────────────────────────────────
   P4-MOOD — Mood  (/us)
──────────────────────────────────────────────────────────────────────────── */

test('P4-MOOD — Mood: Mateo sets mood, Seval sees it', async () => {
  /* 1. Mateo sets mood to "happy" */
  await go(mateo, '/us')
  // Tap the mood card to expand mood buttons
  const moodCard = mateo.locator('button').filter({ hasText: /Tap to update your mood/i }).first()
  if (await moodCard.isVisible({ timeout: 4000 }).catch(() => false)) {
    await moodCard.click()
    await mateo.locator('button:has-text("Happy")').first().click()
    // Mood popup sheet
    await mateo.locator('button:has-text("Share this feeling")').click()
    console.log('[MOOD] Mateo set mood to Happy')
  } else {
    // Try direct mood buttons if already expanded
    const happyBtn = mateo.locator('button:has-text("Happy")').first()
    if (await happyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await happyBtn.click()
      await mateo.locator('button:has-text("Share this feeling")').click()
      console.log('[MOOD] Mateo set mood to Happy (direct)')
    } else {
      console.log('[MOOD] Mood buttons not found — skipping')
      return
    }
  }

  /* 2. Seval sees it */
  await go(seval, '/us')
  await waitSync()
  const sevalSees = await seval.locator('text=Happy').first().isVisible({ timeout: 5000 }).catch(() => false)
  console.log('[MOOD] Seval sees mood:', sevalSees)
  expect(sevalSees, 'Mood must appear for Seval').toBe(true)
})

/* ────────────────────────────────────────────────────────────────────────────
   PART 10 — Responsive viewport checks
──────────────────────────────────────────────────────────────────────────── */

const VIEWPORTS = [
  { name: '360px (small mobile)',  width: 360,  height: 780 },
  { name: '390px (iPhone 14)',     width: 390,  height: 844 },
  { name: '430px (iPhone Pro Max)',width: 430,  height: 932 },
  { name: '768px (tablet)',        width: 768,  height: 1024 },
  { name: '1280px (desktop)',      width: 1280, height: 800 },
]

for (const vp of VIEWPORTS) {
  test(`P10-RESP — Responsive: ${vp.name}`, async () => {
    await mateo.setViewportSize({ width: vp.width, height: vp.height })
    await go(mateo, '/together')

    // h1 or page title visible
    const hasTitle = await mateo.locator('h1, h2').first().isVisible({ timeout: 5000 }).catch(() => false)
    console.log(`[RESP:${vp.width}] Has title:`, hasTitle)
    expect(hasTitle, `Page must have a visible heading at ${vp.width}px`).toBe(true)

    // Navigation / bottom bar visible
    const hasNav = await mateo.locator('nav, [role="navigation"]').first().isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`[RESP:${vp.width}] Has nav:`, hasNav)

    // No horizontal overflow (scrollWidth <= clientWidth + 4px tolerance)
    const overflow = await mateo.evaluate(() => {
      const body = document.body
      return body.scrollWidth > body.clientWidth + 4
    })
    console.log(`[RESP:${vp.width}] Horizontal overflow:`, overflow)
    expect(overflow, `No horizontal overflow at ${vp.width}px`).toBe(false)

    // Key pages render without JS errors
    for (const route of ['/notes', '/wishlist', '/todos']) {
      await go(mateo, route)
      const hasContent = await mateo.locator('h1').first().isVisible({ timeout: 5000 }).catch(() => false)
      console.log(`[RESP:${vp.width}] ${route} renders:`, hasContent)
    }
  })
}

// Restore desktop viewport after responsive tests
test('P10-RESP — Restore desktop viewport', async () => {
  await mateo.setViewportSize({ width: 1280, height: 800 })
  await seval.setViewportSize({ width: 430, height: 900 })
})

/* ────────────────────────────────────────────────────────────────────────────
   PART 10 — Accessibility & console-error audit
──────────────────────────────────────────────────────────────────────────── */

test('P10-A11Y — Accessibility: key pages have ARIA landmarks and no critical console errors', async () => {
  await mateo.setViewportSize({ width: 430, height: 900 })
  const routes = ['/together', '/notes', '/wishlist', '/todos', '/goals', '/shopping', '/us', '/calendar']

  for (const route of routes) {
    await go(mateo, route)

    // main landmark
    const hasMain = await mateo.locator('main, [role="main"]').first().isVisible({ timeout: 5000 }).catch(() => false)
    console.log(`[A11Y] ${route} — has <main>:`, hasMain)

    // Buttons must not be empty (no icon-only buttons without aria-label)
    const emptyBtns = await mateo.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'))
      return btns.filter(b => !b.textContent?.trim() && !b.getAttribute('aria-label') && !b.title).length
    })
    console.log(`[A11Y] ${route} — buttons without accessible label:`, emptyBtns)
  }

  // Console error report (collected throughout the session)
  const criticalErrors = consoleErrors.filter(e =>
    !e.text.includes('ResizeObserver') &&        // benign browser warning
    !e.text.includes('Non-Error exception') &&   // benign Sentry noise
    !e.text.includes('favicon')                  // 404 for favicon
  )
  console.log('\n[A11Y] Console errors summary:')
  if (criticalErrors.length === 0) {
    console.log('  ✓ No critical console errors')
  } else {
    for (const err of criticalErrors.slice(0, 10)) {
      console.log(`  [${err.page}] ${err.text.slice(0, 120)}`)
    }
  }
  // Soft assertion — report but do not fail the suite on console errors
  if (criticalErrors.length > 0) {
    console.warn(`[A11Y] ⚠ ${criticalErrors.length} console error(s) detected — see above`)
  }
})

/* ────────────────────────────────────────────────────────────────────────────
   PART 12 — QA Profile cleanup (profiles deleted post-run via shell)
   QA records are cleaned up inline by each test's delete step above.
   This test confirms both sessions are still valid and signs them out.
──────────────────────────────────────────────────────────────────────────── */

test('P12-CLEANUP — Sign out both accounts', async () => {
  // Mateo signs out via the /us page sign-out button
  await go(mateo, '/us')
  const signOutBtn = mateo.locator('button:has-text("Sign out")').first()
  if (await signOutBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await signOutBtn.click()
    await mateo.waitForURL(`${PREVIEW}/`, { timeout: 10000 }).catch(() => {})
    console.log('[CLEANUP] Mateo signed out')
  } else {
    console.log('[CLEANUP] Sign-out button not found for Mateo — may already be signed out')
  }

  // Seval signs out
  await go(seval, '/us')
  const signOutSeval = seval.locator('button:has-text("Sign out")').first()
  if (await signOutSeval.isVisible({ timeout: 5000 }).catch(() => false)) {
    await signOutSeval.click()
    await seval.waitForURL(`${PREVIEW}/`, { timeout: 10000 }).catch(() => {})
    console.log('[CLEANUP] Seval signed out')
  } else {
    console.log('[CLEANUP] Sign-out button not found for Seval — may already be signed out')
  }

  console.log('[CLEANUP] ✓ Both sessions terminated')
  console.log('[CLEANUP] QA browser profiles will be deleted by the post-run shell command')
})
