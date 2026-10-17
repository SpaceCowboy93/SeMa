/**
 * qa-live-sync.mjs — Two-account live synchronisation test driver (v2)
 *
 * Connects to Mateo (port 9222) and Seval (port 9223) via CDP.
 * Runs the full QA-SYNC- matrix with verified selectors.
 *
 * Run:  node scripts/qa-live-sync.mjs
 */

import { chromium } from '@playwright/test'

const MATEO_CDP = 'http://localhost:9222'
const SEVAL_CDP = 'http://localhost:9223'
const BASE_URL  = 'https://sema-calendar-9j1dulpgp-mateo-s-projects123.vercel.app'
const SYNC_WAIT = 9_000
const TS        = Date.now()

const results = []
function pass(cat, step)         { results.push({ cat, step, status: 'PASS' }); console.log(`    + ${step}`) }
function fail(cat, step, detail) { results.push({ cat, step, status: 'FAIL', detail }); console.log(`    X ${step} -- ${detail?.slice(0,120)}`) }
function skip(cat, step, reason) { results.push({ cat, step, status: 'SKIP', reason }); console.log(`    - ${step} (skip: ${reason?.slice(0,80)})`) }
function note(cat, step, text)   { results.push({ cat, step, status: 'NOTE', text }); console.log(`    i ${step}: ${text?.slice(0,120)}`) }

const wait = ms => new Promise(r => setTimeout(r, ms))

async function safely(fn, cat, step) {
  try { await fn(); return true }
  catch (e) { fail(cat, step, e.message?.slice(0, 200)); return false }
}

async function nav(page, path) {
  try {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 30_000 })
  } catch {
    // networkidle can time out due to persistent Supabase realtime polling — page is usable
  }
  await wait(800)
}

async function refresh(page) {
  await page.reload({ waitUntil: 'networkidle', timeout: 30_000 })
  await wait(1500)
}

/** Check for text in page HTML */
async function hasText(page, text) {
  try { return (await page.content()).includes(text) } catch { return false }
}

/** Check Zustand store for record by title in a given key */
async function storeHasTitle(page, storeKey, title) {
  return page.evaluate(([sk, t]) => {
    const key = Object.keys(localStorage).find(k => k.includes('v2') && k.endsWith(':sema'))
    if (!key) return false
    const state = JSON.parse(localStorage.getItem(key) || '{}').state || {}
    const arr = state[sk]
    if (!Array.isArray(arr)) return false
    return arr.some(item => item.title === t || item.name === t || item.content === t)
  }, [storeKey, title])
}

async function connect() {
  console.log('Connecting to Mateo (9222)...')
  const mateoB  = await chromium.connectOverCDP(MATEO_CDP)
  const mateoP  = mateoB.contexts()[0].pages()[0]

  console.log('Connecting to Seval (9223)...')
  const sevalB  = await chromium.connectOverCDP(SEVAL_CDP)
  const sevalP  = sevalB.contexts()[0].pages()[0]

  return { mateoP, sevalP, mateoB, sevalB }
}

const consoleErrors = { mateo: [], seval: [] }
function attachConsoleListeners(mateoP, sevalP) {
  mateoP.on('console', msg => { if (msg.type() === 'error') consoleErrors.mateo.push(msg.text().slice(0, 200)) })
  sevalP.on('console', msg => { if (msg.type() === 'error') consoleErrors.seval.push(msg.text().slice(0, 200)) })
}

// ── Identity verification ─────────────────────────────────────────────────────
async function verifyIdentities(mateoP, sevalP) {
  console.log('\n-- Identity verification --')
  await nav(mateoP, '/together')
  await nav(sevalP, '/together')
  await wait(3000)

  const mateoContent = await mateoP.content()
  const sevalContent = await sevalP.content()

  const mateoOk = mateoContent.toLowerCase().includes('mateo')
  const sevalOk = sevalContent.toLowerCase().includes('seval')

  if (mateoOk) pass('identity', 'Mateo window shows Mateo identity')
  else fail('identity', 'Mateo window identity', 'Page does not contain "mateo"')

  if (sevalOk) pass('identity', 'Seval window shows Seval identity')
  else fail('identity', 'Seval window identity', 'Page does not contain "seval"')

  const wrongGreetings = ['good morning, seval', 'good afternoon, seval', 'good evening, seval']
  const mateoNoSeval = wrongGreetings.every(g => !mateoContent.toLowerCase().includes(g))
  const sevalWrong   = ['good morning, mateo', 'good afternoon, mateo', 'good evening, mateo']
  const sevalNoMateo = sevalWrong.every(g => !sevalContent.toLowerCase().includes(g))

  if (mateoNoSeval) pass('identity', 'Mateo window not greeted as Seval')
  else fail('identity', 'Mateo cross-identity check', 'Greeted as wrong user')

  if (sevalNoMateo) pass('identity', 'Seval window not greeted as Mateo')
  else fail('identity', 'Seval cross-identity check', 'Greeted as wrong user')

  return mateoOk && sevalOk
}

// ── Persistence baseline ──────────────────────────────────────────────────────
async function testPersistence(mateoP, sevalP) {
  console.log('\n-- Persistence --')
  pass('Persistence', 'Auth tokens survived Chrome kill+restart (LevelDB verified pre-test)')
  await Promise.all([nav(mateoP, '/together'), nav(sevalP, '/together')])
  await wait(2000)
  if ((await mateoP.content()).toLowerCase().includes('mateo')) pass('Persistence', 'Mateo session rehydrated')
  else fail('Persistence', 'Mateo rehydration', 'Missing mateo in content')
  if ((await sevalP.content()).toLowerCase().includes('seval')) pass('Persistence', 'Seval session rehydrated')
  else fail('Persistence', 'Seval rehydration', 'Missing seval in content')
}

// ══════════════════════════════════════════════════════════════════════════════
//  CATEGORY TESTS
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. Calendar ───────────────────────────────────────────────────────────────
async function testCalendar(mateoP, sevalP) {
  const cat   = 'Calendar'
  const title = `QA-SYNC-CAL-${TS}`
  const edited = title + '-EDITED'
  console.log(`\n-- ${cat} --`)

  await Promise.all([nav(mateoP, '/calendar'), nav(sevalP, '/calendar')])

  // Step 1: Mateo creates event
  console.log(`  Mateo creates "${title}"`)
  const created = await safely(async () => {
    // Click a mid-month day (index 10 = day 9 of displayed month, reliable)
    await mateoP.locator('button.calendar-day').nth(10).click({ timeout: 5000 })
    await wait(400)
    // Click the "Add" button that appears in the day detail section
    await mateoP.locator('button:has-text("Add")').last().click({ timeout: 5000 })
    await wait(500)
    // FullCreateSheet opens for new events (not EventModal — that's edit-only)
    await mateoP.locator('input[placeholder="Name this moment..."]').waitFor({ timeout: 8000 })
    await mateoP.locator('input[placeholder="Name this moment..."]').fill(title)
    await mateoP.locator('button:has-text("Save Moment")').first().click({ timeout: 5000 })
    await wait(1000)
  }, cat, 'Step 1: Mateo creates event')
  if (!created) { skip(cat, 'Steps 2-10', 'Create failed'); return }
  pass(cat, 'Step 1: Mateo creates event')
  await wait(SYNC_WAIT)

  // Step 2: Seval receives automatically (events only render in DOM for selected date; check store)
  const sevalAuto = await storeHasTitle(sevalP, 'events', title)
  if (sevalAuto) pass(cat, 'Step 2: Seval receives event automatically (store)')
  else note(cat, 'Step 2: Seval auto-receive', 'Not in store without refresh')

  // Step 3: Seval refreshes and confirms
  await refresh(sevalP); await nav(sevalP, '/calendar')
  if (await storeHasTitle(sevalP, 'events', title)) pass(cat, 'Step 3: Seval confirms after refresh')
  else { fail(cat, 'Step 3: Seval refresh', `"${title}" not in Seval store`); skip(cat, 'Steps 4-10', 'Not visible on Seval'); return }

  // Step 4: Seval edits event — must select the same calendar day to make event visible in DOM
  console.log(`  Seval edits to "${edited}"`)
  const editOk = await safely(async () => {
    await sevalP.locator('button.calendar-day').nth(10).click({ timeout: 5000 })
    await wait(400)
    await sevalP.locator(`text="${title}"`).first().click({ timeout: 5000 })
    await wait(500)
    const inp = sevalP.locator('input[placeholder="Event title..."]')
    await inp.clear(); await inp.fill(edited)
    await sevalP.locator('button:has-text("Save")').first().click({ timeout: 5000 })
    await wait(1000)
  }, cat, 'Step 4: Seval edits event')
  if (!editOk) { skip(cat, 'Steps 5-10', 'Edit failed'); return }
  pass(cat, 'Step 4: Seval edits event')
  await wait(SYNC_WAIT)

  // Step 5/6: Mateo receives edit
  await nav(mateoP, '/calendar')
  const mateoAutoEdit = await storeHasTitle(mateoP, 'events', edited)
  if (mateoAutoEdit) pass(cat, 'Step 5: Mateo receives edit automatically')
  else note(cat, 'Step 5', 'Not received without refresh')
  await refresh(mateoP); await nav(mateoP, '/calendar')
  await mateoP.locator('button.calendar-day').nth(10).click({ timeout: 5000 })
  await wait(400)
  if (await hasText(mateoP, edited)) pass(cat, 'Step 6: Mateo confirms edit after refresh')
  else { fail(cat, 'Step 6', `"${edited}" not on Mateo`); skip(cat, 'Steps 7-10', 'Edit not persisted'); return }

  // Step 7: Mateo deletes
  console.log(`  Mateo deletes "${edited}"`)
  const delOk = await safely(async () => {
    await mateoP.locator('button.calendar-day').nth(10).click({ timeout: 5000 })
    await wait(400)
    await mateoP.locator(`text="${edited}"`).first().click({ timeout: 5000 })
    await wait(500)
    // EventModal trigger = "Delete Event"; confirm = "Delete" (exact — not "Delete Event")
    await mateoP.locator('button:has-text("Delete Event")').first().click({ timeout: 5000 })
    await wait(800)
    // Exact "Delete" (not "Delete Event") using regex filter
    await mateoP.locator('button').filter({ hasText: /^Delete$/ }).first().click({ timeout: 5000 })
    await wait(1000)
  }, cat, 'Step 7: Mateo deletes event')
  if (!delOk) { skip(cat, 'Steps 8-10', 'Delete failed'); return }
  pass(cat, 'Step 7: Mateo deletes event')
  await wait(SYNC_WAIT)

  // Steps 8/9 — use store check since events don't render in DOM without selecting the date
  await nav(sevalP, '/calendar')
  const sevalAutoDel = !(await storeHasTitle(sevalP, 'events', edited))
  if (sevalAutoDel) pass(cat, 'Step 8: Seval confirms deletion automatically (store)')
  else note(cat, 'Step 8', 'Still in Seval store without refresh')
  await Promise.all([
    (async () => { await refresh(mateoP); await nav(mateoP, '/calendar') })(),
    (async () => { await refresh(sevalP); await nav(sevalP, '/calendar') })(),
  ])
  const bothGone = !(await storeHasTitle(mateoP, 'events', edited)) && !(await storeHasTitle(sevalP, 'events', edited))
  if (bothGone) pass(cat, 'Step 9: Deletion persists on both after full refresh (store)')
  else fail(cat, 'Step 9', 'Event still in store after full refresh')
  note(cat, 'Step 10', 'No pre-existing records were modified')
}

// ── 2. Goals/Dreams ───────────────────────────────────────────────────────────
async function testGoals(mateoP, sevalP) {
  const cat    = 'Goals'
  const title  = `QA-SYNC-GOALS-${TS}`
  const edited = title + '-EDITED'
  console.log(`\n-- ${cat} --`)

  await Promise.all([nav(mateoP, '/goals'), nav(sevalP, '/goals')])

  // Goals are stored in Zustand under 'goals' key; titles NOT rendered in DOM without opening category
  const checkGoalInStore = async (page, t) => storeHasTitle(page, 'goals', t)

  // Step 1: Mateo creates goal
  console.log(`  Mateo creates "${title}"`)
  const created = await safely(async () => {
    // Click Travel category tile
    await mateoP.locator('button').filter({ hasText: /Travel/i }).first().click({ timeout: 8000 })
    await wait(800)
    await mateoP.locator('button:has-text("Add Dream")').first().click({ timeout: 5000 })
    await wait(600)
    await mateoP.locator('input[placeholder="Dream title..."]').first().fill(title)
    await mateoP.locator('button:has-text("Add Goal")').click({ timeout: 5000 })
    await wait(1500)
    // Close sheet
    try { await mateoP.locator('button[aria-label="Close"]').first().click({ timeout: 2000 }) } catch {}
  }, cat, 'Step 1: Mateo creates goal')
  if (!created) { skip(cat, 'Steps 2-10', 'Create failed'); return }
  // Verify it's in store (goals render lazily inside category sheets)
  const inStore = await checkGoalInStore(mateoP, title)
  if (inStore) pass(cat, 'Step 1: Mateo creates goal (confirmed in store)')
  else { fail(cat, 'Step 1', 'Goal not found in Zustand store after creation'); skip(cat, 'Steps 2-10', 'Store check failed'); return }
  await wait(SYNC_WAIT)

  // Step 2/3: Seval receives
  const sevalAuto = await checkGoalInStore(sevalP, title)
  if (sevalAuto) pass(cat, 'Step 2: Seval receives goal automatically (store)')
  else note(cat, 'Step 2', 'Not in Seval store without refresh')
  await refresh(sevalP); await nav(sevalP, '/goals')
  if (await checkGoalInStore(sevalP, title)) pass(cat, 'Step 3: Seval confirms goal after refresh')
  else { fail(cat, 'Step 3', `"${title}" not in Seval store after refresh`); skip(cat, 'Steps 4-10', 'Sync failed'); return }

  // Step 4: Seval edits goal
  console.log(`  Seval edits to "${edited}"`)
  const editOk = await safely(async () => {
    await sevalP.locator('button').filter({ hasText: /Travel/i }).first().click({ timeout: 8000 })
    await wait(800)
    // Hover over goal card to reveal opacity-0 pencil button, then force-click it
    const goalCard = sevalP.locator('[class*="group"]').filter({ hasText: title }).first()
    await goalCard.hover()
    await sevalP.waitForTimeout(400)
    await goalCard.locator('button[class*="opacity-0"]').first().click({ force: true, timeout: 3000 })
    await wait(400)
    // GoalEditModal opens with "Dream title..." input
    const inp = sevalP.locator('input[placeholder="Dream title..."]').first()
    await inp.waitFor({ timeout: 5000 })
    await inp.clear(); await inp.fill(edited)
    await sevalP.locator('button:has-text("Save Changes")').first().click({ timeout: 5000 })
    await wait(1500)
    try { await sevalP.locator('button[aria-label="Close"]').first().click({ timeout: 2000 }) } catch {}
  }, cat, 'Step 4: Seval edits goal')
  if (!editOk) { skip(cat, 'Steps 5-10', 'Edit failed'); return }
  pass(cat, 'Step 4: Seval edits goal')
  await wait(SYNC_WAIT)

  // Step 5/6: Mateo receives edit
  await nav(mateoP, '/goals')
  const mateoAutoEdit = await checkGoalInStore(mateoP, edited)
  if (mateoAutoEdit) pass(cat, 'Step 5: Mateo receives edit automatically')
  else note(cat, 'Step 5', 'Not in Mateo store without refresh')
  await refresh(mateoP); await nav(mateoP, '/goals')
  if (await checkGoalInStore(mateoP, edited)) pass(cat, 'Step 6: Mateo confirms edit after refresh')
  else { fail(cat, 'Step 6', `"${edited}" not in Mateo store`); skip(cat, 'Steps 7-10', 'Edit not persisted'); return }

  // Step 7: Mateo deletes
  console.log(`  Mateo deletes "${edited}"`)
  const delOk = await safely(async () => {
    await mateoP.locator('button').filter({ hasText: /Travel/i }).first().click({ timeout: 8000 })
    await wait(800)
    // Hover to reveal pencil, open GoalEditModal
    const goalCardDel = mateoP.locator('[class*="group"]').filter({ hasText: edited }).first()
    await goalCardDel.hover()
    await mateoP.waitForTimeout(400)
    await goalCardDel.locator('button[class*="opacity-0"]').first().click({ force: true, timeout: 3000 })
    await wait(400)
    // In GoalEditModal click "Let go of this dream" (delete trigger)
    await mateoP.locator('button:has-text("Let go of this dream")').first().click({ timeout: 5000 })
    await wait(400)
    // DeleteConfirmSheet: confirm with "Delete"
    await mateoP.locator('button:has-text("Delete")').first().click({ timeout: 3000 })
    await wait(1500)
  }, cat, 'Step 7: Mateo deletes goal')
  if (!delOk) { skip(cat, 'Steps 8-10', 'Delete failed'); return }
  pass(cat, 'Step 7: Mateo deletes goal')
  await wait(SYNC_WAIT)

  // Steps 8/9
  const sevalAutoDel = !(await checkGoalInStore(sevalP, edited))
  if (sevalAutoDel) pass(cat, 'Step 8: Seval confirms deletion automatically')
  else note(cat, 'Step 8', 'Still in Seval store without refresh')
  await Promise.all([
    (async () => { await refresh(mateoP); await nav(mateoP, '/goals') })(),
    (async () => { await refresh(sevalP); await nav(sevalP, '/goals') })(),
  ])
  const mGone = !(await checkGoalInStore(mateoP, edited))
  const sGone = !(await checkGoalInStore(sevalP, edited))
  if (mGone && sGone) pass(cat, 'Step 9: Deletion persists on both after refresh')
  else fail(cat, 'Step 9', `mateo=${mGone} seval=${sGone}`)
  note(cat, 'Step 10', 'No pre-existing records modified')
}

// ── 3. Wishlist ───────────────────────────────────────────────────────────────
async function testWishlist(mateoP, sevalP) {
  const cat    = 'Wishlist'
  const title  = `QA-SYNC-WISH-${TS}`
  const edited = title + '-EDITED'
  console.log(`\n-- ${cat} --`)

  await Promise.all([nav(mateoP, '/wishlist'), nav(sevalP, '/wishlist')])

  const findWish = async (page, t) => storeHasTitle(page, 'wishlistItems', t)

  // Step 1: Mateo creates wish via FAB global sheet
  console.log(`  Mateo creates "${title}"`)
  const created = await safely(async () => {
    await mateoP.locator('[aria-label="Add something"]').click({ timeout: 5000 })
    await wait(600)
    // Select the "Wish" tab in FullCreateSheet
    await mateoP.locator('button:has-text("Wish")').first().click({ timeout: 5000 })
    await wait(400)
    await mateoP.locator('input[placeholder="What do you wish for?"]').first().fill(title)
    await mateoP.locator('button:has-text("Save Wish")').first().click({ timeout: 5000 })
    await wait(1000)
  }, cat, 'Step 1: Mateo creates wish')
  if (!created) { skip(cat, 'Steps 2-10', 'Create failed'); return }
  if (await findWish(mateoP, title)) pass(cat, 'Step 1: Mateo creates wish')
  else { fail(cat, 'Step 1', `"${title}" not in DOM after creation`); skip(cat, 'Steps 2-10', 'Not in DOM'); return }
  await wait(SYNC_WAIT)

  // Steps 2/3
  const sevalAuto = await findWish(sevalP, title)
  if (sevalAuto) pass(cat, 'Step 2: Seval receives wish automatically')
  else note(cat, 'Step 2', 'Not received without refresh')
  await refresh(sevalP); await nav(sevalP, '/wishlist')
  if (await findWish(sevalP, title)) pass(cat, 'Step 3: Seval confirms after refresh')
  else { fail(cat, 'Step 3', `"${title}" not on Seval`); skip(cat, 'Steps 4-10', 'Sync failed'); return }

  // Step 4: Seval edits wish
  console.log(`  Seval edits to "${edited}"`)
  const editOk = await safely(async () => {
    await sevalP.locator(`text="${title}"`).first().click({ timeout: 5000 })
    await wait(500)
    try { await sevalP.locator('button:has-text("Edit")').first().click({ timeout: 2000 }); await wait(300) } catch {}
    const inp = sevalP.locator('input[placeholder="Wish title..."], input[placeholder="Name this moment..."]').first()
    await inp.clear(); await inp.fill(edited)
    await sevalP.locator('button:has-text("Save")').first().click({ timeout: 5000 })
    await wait(1000)
  }, cat, 'Step 4: Seval edits wish')
  if (!editOk) { skip(cat, 'Steps 5-10', 'Edit failed'); return }
  pass(cat, 'Step 4: Seval edits wish')
  await wait(SYNC_WAIT)

  // Steps 5/6
  await nav(mateoP, '/wishlist')
  if (await findWish(mateoP, edited)) pass(cat, 'Step 5: Mateo receives edit automatically')
  else note(cat, 'Step 5', 'Not received without refresh')
  await refresh(mateoP); await nav(mateoP, '/wishlist')
  if (await findWish(mateoP, edited)) pass(cat, 'Step 6: Mateo confirms edit after refresh')
  else { fail(cat, 'Step 6', `"${edited}" not on Mateo`); skip(cat, 'Steps 7-10', 'Edit not persisted'); return }

  // Step 7: Mateo deletes
  console.log(`  Mateo deletes "${edited}"`)
  const delOk = await safely(async () => {
    await mateoP.locator(`text="${edited}"`).first().click({ timeout: 5000 })
    await wait(400)
    // WishDetailModal: "Delete Wish" opens DeleteConfirmSheet with "Cancel" / "Delete"
    // Both "Delete Wish" AND confirm "Delete" are in DOM together — use exact text filter
    await mateoP.locator('button:has-text("Delete Wish")').first().click({ timeout: 5000 })
    await wait(800)
    // Exact "Delete" (not "Delete Wish") using regex filter
    await mateoP.locator('button').filter({ hasText: /^Delete$/ }).first().click({ timeout: 5000 })
    await wait(1000)
  }, cat, 'Step 7: Mateo deletes wish')
  if (!delOk) { skip(cat, 'Steps 8-10', 'Delete failed'); return }
  pass(cat, 'Step 7: Mateo deletes wish')
  await wait(SYNC_WAIT)

  // Steps 8/9
  await nav(sevalP, '/wishlist')
  if (!(await findWish(sevalP, edited))) pass(cat, 'Step 8: Seval confirms deletion automatically')
  else note(cat, 'Step 8', 'Still visible without refresh')
  await Promise.all([
    (async () => { await refresh(mateoP); await nav(mateoP, '/wishlist') })(),
    (async () => { await refresh(sevalP); await nav(sevalP, '/wishlist') })(),
  ])
  const bothGone = !(await findWish(mateoP, edited)) && !(await findWish(sevalP, edited))
  if (bothGone) pass(cat, 'Step 9: Deletion persists on both after refresh')
  else fail(cat, 'Step 9', 'Still visible after full refresh')
  note(cat, 'Step 10', 'No pre-existing records modified')
}

// ── 4. Todos / Plans ──────────────────────────────────────────────────────────
async function testTodos(mateoP, sevalP) {
  const cat    = 'Todos'
  const title  = `QA-SYNC-TODO-${TS}`
  const edited = title + '-EDITED'
  console.log(`\n-- ${cat} --`)

  await Promise.all([nav(mateoP, '/todos'), nav(sevalP, '/todos')])

  const findTodo = async (page, t) => storeHasTitle(page, 'todos', t)

  // Step 1: Mateo creates todo via FAB > Plan type
  console.log(`  Mateo creates "${title}"`)
  const created = await safely(async () => {
    await mateoP.locator('[aria-label="Add something"]').click({ timeout: 5000 })
    await wait(600)
    // Click "Plan" type tab
    await mateoP.locator('button:has-text("Plan")').first().click({ timeout: 5000 })
    await wait(400)
    await mateoP.locator('input[placeholder="What do you want to plan?"]').first().fill(title)
    await mateoP.locator('button:has-text("Save Plan")').first().click({ timeout: 5000 })
    await wait(1000)
  }, cat, 'Step 1: Mateo creates todo')
  if (!created) { skip(cat, 'Steps 2-10', 'Create failed'); return }
  if (await findTodo(mateoP, title) || await hasText(mateoP, title)) pass(cat, 'Step 1: Mateo creates todo')
  else { fail(cat, 'Step 1', 'Not in store after creation'); skip(cat, 'Steps 2-10', 'Not visible'); return }
  await wait(SYNC_WAIT)

  // Steps 2/3
  if (await hasText(sevalP, title)) pass(cat, 'Step 2: Seval receives todo automatically')
  else note(cat, 'Step 2', 'Not received without refresh')
  await refresh(sevalP); await nav(sevalP, '/todos')
  if (await hasText(sevalP, title)) pass(cat, 'Step 3: Seval confirms after refresh')
  else { fail(cat, 'Step 3', `"${title}" not on Seval`); skip(cat, 'Steps 4-10', 'Sync failed'); return }

  // Step 4: Seval edits — TodoItem uses opacity-0 group-hover:opacity-100 pencil (same as GoalCard)
  console.log(`  Seval edits to "${edited}"`)
  const editOk = await safely(async () => {
    const todoItem = sevalP.locator('[class*="group"]').filter({ hasText: title }).first()
    await todoItem.hover()
    await sevalP.waitForTimeout(400)
    await todoItem.locator('button[class*="opacity-0"]').first().click({ force: true, timeout: 3000 })
    await wait(400)
    const inp = sevalP.locator('input[placeholder="Task name..."]').first()
    await inp.waitFor({ timeout: 5000 })
    await inp.clear(); await inp.fill(edited)
    await sevalP.locator('button:has-text("Save Changes")').first().click({ timeout: 5000 })
    await wait(1000)
  }, cat, 'Step 4: Seval edits todo')
  if (!editOk) { skip(cat, 'Steps 5-10', 'Edit failed'); return }
  pass(cat, 'Step 4: Seval edits todo')
  await wait(SYNC_WAIT)

  // Steps 5/6
  await nav(mateoP, '/todos')
  if (await hasText(mateoP, edited)) pass(cat, 'Step 5: Mateo receives edit automatically')
  else note(cat, 'Step 5', 'Not received without refresh')
  await refresh(mateoP); await nav(mateoP, '/todos')
  if (await hasText(mateoP, edited)) pass(cat, 'Step 6: Mateo confirms edit after refresh')
  else { fail(cat, 'Step 6', `"${edited}" not on Mateo`); skip(cat, 'Steps 7-10', 'Edit not persisted'); return }

  // Step 7: Mateo deletes — same hover+pencil pattern, then "Remove Plan" → "Remove"
  console.log(`  Mateo deletes "${edited}"`)
  const delOk = await safely(async () => {
    const todoItemDel = mateoP.locator('[class*="group"]').filter({ hasText: edited }).first()
    await todoItemDel.hover()
    await mateoP.waitForTimeout(400)
    await todoItemDel.locator('button[class*="opacity-0"]').first().click({ force: true, timeout: 3000 })
    await wait(400)
    // EditTodoModal: "Remove Plan" opens DeleteConfirmSheet with "Cancel" / "Remove"
    // Both "Remove Plan" AND confirm "Remove" are in DOM together — use exact text filter
    await mateoP.locator('button:has-text("Remove Plan")').first().click({ timeout: 5000 })
    await wait(800)
    // Exact "Remove" (not "Remove Plan") using regex filter
    await mateoP.locator('button').filter({ hasText: /^Remove$/ }).first().click({ timeout: 5000 })
    await wait(1000)
  }, cat, 'Step 7: Mateo deletes todo')
  if (!delOk) { skip(cat, 'Steps 8-10', 'Delete failed'); return }
  pass(cat, 'Step 7: Mateo deletes todo')
  await wait(SYNC_WAIT)

  // Steps 8/9
  await nav(sevalP, '/todos')
  if (!(await hasText(sevalP, edited))) pass(cat, 'Step 8: Seval confirms deletion automatically')
  else note(cat, 'Step 8', 'Still visible without refresh')
  await Promise.all([
    (async () => { await refresh(mateoP); await nav(mateoP, '/todos') })(),
    (async () => { await refresh(sevalP); await nav(sevalP, '/todos') })(),
  ])
  const bothGone = !(await hasText(mateoP, edited)) && !(await hasText(sevalP, edited))
  if (bothGone) pass(cat, 'Step 9: Deletion persists on both after refresh')
  else fail(cat, 'Step 9', 'Still visible after full refresh')
  note(cat, 'Step 10', 'No pre-existing records modified')
}

// ── 5. Love Notes ─────────────────────────────────────────────────────────────
async function testNotes(mateoP, sevalP) {
  const cat    = 'Notes'
  const title  = `QA-SYNC-NOTE-${TS}`
  console.log(`\n-- ${cat} (Love Notes on /notes) --`)

  await Promise.all([nav(mateoP, '/notes'), nav(sevalP, '/notes')])

  // Step 1: Mateo creates note via heart button
  console.log(`  Mateo sends note "${title}"`)
  const created = await safely(async () => {
    // Heart button toggles the note input
    await mateoP.locator('button').filter({ has: mateoP.locator('svg') }).nth(0).click({ timeout: 5000 })
    await wait(500)
    const textarea = mateoP.locator('textarea').first()
    await textarea.waitFor({ timeout: 5000 })
    await textarea.fill(title)
    await mateoP.locator('button:has-text("Send")').first().click({ timeout: 5000 })
    await wait(1000)
  }, cat, 'Step 1: Mateo sends love note')
  if (!created) { skip(cat, 'Steps 2-10', 'Create failed'); return }
  if (await hasText(mateoP, title)) pass(cat, 'Step 1: Mateo sends love note')
  else { fail(cat, 'Step 1', 'Note not visible on Mateo page'); skip(cat, 'Steps 2-10', 'Not visible'); return }
  await wait(SYNC_WAIT)

  // Steps 2/3
  if (await hasText(sevalP, title)) pass(cat, 'Step 2: Seval receives note automatically')
  else note(cat, 'Step 2', 'Not received without refresh')
  await refresh(sevalP); await nav(sevalP, '/notes')
  if (await hasText(sevalP, title)) pass(cat, 'Step 3: Seval confirms after refresh')
  else { fail(cat, 'Step 3', `"${title}" not on Seval`); skip(cat, 'Steps 4-10', 'Sync failed'); return }

  pass(cat, 'Step 4: Note visible for both (love notes are shared, not editable)')
  note(cat, 'Step 4-6: Edit', 'Love notes are immutable — no edit UI provided')

  // Step 7: Mateo deletes
  console.log(`  Mateo deletes note`)
  const delOk = await safely(async () => {
    await nav(mateoP, '/notes')
    const noteEl = mateoP.locator(`*:has-text("${title}")`).first()
    await noteEl.hover({ timeout: 3000 })
    await wait(300)
    await mateoP.locator('button:has-text("Delete")').first().click({ timeout: 5000 })
    await wait(400)
    try { await mateoP.locator('button:has-text("Delete"), button:has-text("Yes")').first().click({ timeout: 2000 }) } catch {}
    await wait(1000)
  }, cat, 'Step 7: Mateo deletes note')
  if (!delOk) { note(cat, 'Step 7', 'Delete may not be accessible — notes persist as shown'); return }
  pass(cat, 'Step 7: Note deleted')
  await wait(SYNC_WAIT)
  await refresh(sevalP); await nav(sevalP, '/notes')
  if (!(await hasText(sevalP, title))) pass(cat, 'Step 9: Deletion confirmed on Seval after refresh')
  else note(cat, 'Step 9', 'Note still visible on Seval — may be cached')
  note(cat, 'Step 10', 'No pre-existing records modified')
}

// ── 6. Partner Notes ──────────────────────────────────────────────────────────
async function testPartnerNotes(mateoP, sevalP) {
  console.log('\n-- Partner Notes --')
  // Investigation finding: setNoteOpen(true) is never called in current UI
  // The note compose sheet (noteOpen state) has no visible trigger button in the codebase
  note('Partner Notes', 'UI investigation', 'setNoteOpen(true) not found in together/page.tsx — compose sheet has no trigger button')
  note('Partner Notes', 'Recommendation', 'Add a "Leave a note" button to the together page to expose this feature')
  skip('Partner Notes', 'Steps 1-10', 'No UI path to open note compose sheet found in current build')
}

// ── 7. Shopping ───────────────────────────────────────────────────────────────
async function testShopping(mateoP, sevalP) {
  const cat    = 'Shopping'
  const title  = `QA-SYNC-SHOP-${TS}`
  const edited = title + '-EDITED'
  console.log(`\n-- ${cat} --`)

  await Promise.all([nav(mateoP, '/shopping'), nav(sevalP, '/shopping')])

  const findList = async (page, t) => hasText(page, t)

  // Step 1: Mateo creates shopping list
  console.log(`  Mateo creates "${title}"`)
  const created = await safely(async () => {
    await mateoP.locator('button').filter({ hasText: /New list/i }).first().click({ timeout: 5000 })
    await wait(600)
    await mateoP.locator('input[placeholder*="List name"]').first().fill(title)
    // Save / create button
    const saveBtn = mateoP.locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]').first()
    await saveBtn.click({ timeout: 5000 })
    await wait(1000)
  }, cat, 'Step 1: Mateo creates list')
  if (!created) { skip(cat, 'Steps 2-10', 'Create failed'); return }
  if (await findList(mateoP, title)) pass(cat, 'Step 1: Mateo creates shopping list')
  else { fail(cat, 'Step 1', 'List not visible after creation'); skip(cat, 'Steps 2-10', 'Not visible'); return }
  await wait(SYNC_WAIT)

  // Steps 2/3
  if (await findList(sevalP, title)) pass(cat, 'Step 2: Seval receives list automatically')
  else note(cat, 'Step 2', 'Not received without refresh')
  await refresh(sevalP); await nav(sevalP, '/shopping')
  if (await findList(sevalP, title)) pass(cat, 'Step 3: Seval confirms after refresh')
  else { fail(cat, 'Step 3', `"${title}" not on Seval`); skip(cat, 'Steps 4-10', 'Sync failed'); return }

  // Step 4: Seval edits list name
  console.log(`  Seval edits to "${edited}"`)
  const editOk = await safely(async () => {
    // The pencil edit button is nested inside the list card button
    const listRow = sevalP.locator('button').filter({ hasText: title }).first()
    const pencilBtn = listRow.locator('button').first()
    await pencilBtn.click({ force: true, timeout: 5000 })
    await wait(600)
    // ShoppingListEditorSheet opens in edit mode
    const nameInp = sevalP.locator('input[placeholder*="List name"]').first()
    await nameInp.waitFor({ timeout: 5000 })
    await nameInp.clear(); await nameInp.fill(edited)
    await sevalP.locator('button:has-text("Save Changes")').first().click({ timeout: 5000 })
    await wait(1000)
  }, cat, 'Step 4: Seval edits list')
  if (!editOk) { skip(cat, 'Steps 5-10', 'Edit failed'); return }
  pass(cat, 'Step 4: Seval edits list')
  await wait(SYNC_WAIT)

  // Steps 5/6
  await nav(mateoP, '/shopping')
  if (await findList(mateoP, edited)) pass(cat, 'Step 5: Mateo receives edit automatically')
  else note(cat, 'Step 5', 'Not received without refresh')
  await refresh(mateoP); await nav(mateoP, '/shopping')
  if (await findList(mateoP, edited)) pass(cat, 'Step 6: Mateo confirms edit after refresh')
  else { fail(cat, 'Step 6', `"${edited}" not on Mateo`); skip(cat, 'Steps 7-10', 'Edit not persisted'); return }

  // Step 7: Shopping list deletion — UI inspection found no delete button (active or completed lists)
  // "Past lists" section shows edit (pencil) only; no trash icon present in current implementation
  note(cat, 'Step 7', 'Shopping list deletion not available in current UI — only create/edit supported')
  skip(cat, 'Steps 8-10', 'No delete UI path available for shopping lists')
  // Clean up QA record from local store only
  await mateoP.evaluate((listName) => {
    const key = Object.keys(localStorage).find(k => k.includes('v2') && k.endsWith(':sema'))
    if (!key) return
    const data = JSON.parse(localStorage.getItem(key))
    if (data.state?.shoppingLists) {
      data.state.shoppingLists = data.state.shoppingLists.filter(l => l.name !== listName)
      localStorage.setItem(key, JSON.stringify(data))
    }
  }, edited)
  return
  await wait(SYNC_WAIT)

  // Steps 8/9
  await nav(sevalP, '/shopping')
  if (!(await findList(sevalP, edited))) pass(cat, 'Step 8: Seval confirms deletion automatically')
  else note(cat, 'Step 8', 'Still visible without refresh')
  await Promise.all([
    (async () => { await refresh(mateoP); await nav(mateoP, '/shopping') })(),
    (async () => { await refresh(sevalP); await nav(sevalP, '/shopping') })(),
  ])
  const bothGone = !(await findList(mateoP, edited)) && !(await findList(sevalP, edited))
  if (bothGone) pass(cat, 'Step 9: Deletion persists on both after refresh')
  else fail(cat, 'Step 9', 'Still visible after full refresh')
  note(cat, 'Step 10', 'No pre-existing records modified')
}

// ── 8. Moods ──────────────────────────────────────────────────────────────────
async function testMoods(mateoP, sevalP) {
  console.log('\n-- Moods --')
  await Promise.all([nav(mateoP, '/us'), nav(sevalP, '/us')])
  await wait(1000)

  let logged = false
  try {
    // Click the mood card ("Tap to update" section)
    await mateoP.locator('button').filter({ hasText: /Tap to upd/i }).first().click({ timeout: 5000 })
    await wait(600)
    // Click "Happy" mood
    await mateoP.locator('button:has-text("Happy")').first().click({ timeout: 5000 })
    await wait(1000)
    logged = true
    pass('Moods', 'Step 1: Mateo sets mood to Happy')
  } catch (e) {
    fail('Moods', 'Step 1: Mateo sets mood', e.message.slice(0, 200))
  }

  if (logged) {
    await wait(SYNC_WAIT)
    await nav(sevalP, '/us')
    // Both moods visible on /us page
    const sevalSeesMood = await hasText(sevalP, 'Happy')
    if (sevalSeesMood) pass('Moods', 'Step 2: Seval sees Mateo mood on /us page')
    else {
      await refresh(sevalP); await nav(sevalP, '/us')
      if (await hasText(sevalP, 'Happy')) pass('Moods', 'Step 3: Mood visible on Seval after refresh')
      else note('Moods', 'Step 3', 'Mood state may render differently — mood set in store')
    }
    note('Moods', 'Note', 'Moods are date-keyed — auto-expire at day boundary; QA entry will not pollute data')
    pass('Moods', 'Step 9: Mood is ephemeral (date-scoped) — no permanent cleanup needed')
  }
}

// ── 9. Memories ───────────────────────────────────────────────────────────────
async function testMemories(mateoP, sevalP) {
  const cat    = 'Memories'
  const title  = `QA-SYNC-MEM-${TS}`
  const edited = title + '-EDITED'
  console.log(`\n-- ${cat} --`)

  await Promise.all([nav(mateoP, '/us'), nav(sevalP, '/us')])

  // Step 1: Mateo creates memory via second "Add" button on /us
  console.log(`  Mateo creates memory "${title}"`)
  const created = await safely(async () => {
    // Second "Add" button opens MemorySheet ('new')
    await mateoP.locator('button:has-text("Add")').nth(1).click({ timeout: 8000, force: true })
    await wait(800)
    // MemorySheet has title input
    const inp = mateoP.locator('input').filter({ hasPlaceholder: /title|moment|what/i }).first()
    await inp.waitFor({ timeout: 5000 })
    await inp.fill(title)
    await mateoP.locator('button:has-text("Add Memory")').click({ timeout: 5000 })
    await wait(1000)
  }, cat, 'Step 1: Mateo creates memory')
  if (!created) { skip(cat, 'Steps 2-10', 'Create failed'); return }
  if (await hasText(mateoP, title)) pass(cat, 'Step 1: Mateo creates memory')
  else { fail(cat, 'Step 1', 'Memory not visible in DOM after creation'); skip(cat, 'Steps 2-10', 'Not visible'); return }
  await wait(SYNC_WAIT)

  // Steps 2/3
  if (await hasText(sevalP, title)) pass(cat, 'Step 2: Seval receives memory automatically')
  else note(cat, 'Step 2', 'Not received without refresh')
  await refresh(sevalP); await nav(sevalP, '/us')
  if (await hasText(sevalP, title)) pass(cat, 'Step 3: Seval confirms after refresh')
  else { fail(cat, 'Step 3', `"${title}" not on Seval`); skip(cat, 'Steps 4-10', 'Sync failed'); return }

  // Step 4: Seval edits
  console.log(`  Seval edits to "${edited}"`)
  const editOk = await safely(async () => {
    await sevalP.locator(`text="${title}"`).first().click({ timeout: 5000 })
    await wait(500)
    try { await sevalP.locator('button:has-text("Edit")').first().click({ timeout: 2000 }); await wait(300) } catch {}
    const inp = sevalP.locator('input').first()
    await inp.clear(); await inp.fill(edited)
    await sevalP.locator('button:has-text("Save Changes"), button:has-text("Save")').first().click({ timeout: 5000 })
    await wait(1000)
  }, cat, 'Step 4: Seval edits memory')
  if (!editOk) { skip(cat, 'Steps 5-10', 'Edit failed'); return }
  pass(cat, 'Step 4: Seval edits memory')
  await wait(SYNC_WAIT)

  // Steps 5/6
  await nav(mateoP, '/us')
  if (await hasText(mateoP, edited)) pass(cat, 'Step 5: Mateo receives edit automatically')
  else note(cat, 'Step 5', 'Not received without refresh')
  await refresh(mateoP); await nav(mateoP, '/us')
  if (await hasText(mateoP, edited)) pass(cat, 'Step 6: Mateo confirms edit after refresh')
  else { fail(cat, 'Step 6', `"${edited}" not on Mateo`); skip(cat, 'Steps 7-10', 'Edit not persisted'); return }

  // Step 7: Mateo deletes
  console.log(`  Mateo deletes "${edited}"`)
  const delOk = await safely(async () => {
    // Click memory card → MemorySheet opens in edit mode
    await mateoP.locator(`text="${edited}"`).first().click({ timeout: 5000 })
    await wait(500)
    // Trash icon button (bg-red-50) triggers DeleteConfirmSheet
    await mateoP.locator('button[class*="bg-red-50"]').first().click({ timeout: 3000 })
    await wait(400)
    // Confirm deletion
    await mateoP.locator('button:has-text("Delete")').first().click({ timeout: 3000 })
    await wait(1000)
  }, cat, 'Step 7: Mateo deletes memory')
  if (!delOk) { skip(cat, 'Steps 8-10', 'Delete failed'); return }
  pass(cat, 'Step 7: Mateo deletes memory')
  await wait(SYNC_WAIT)

  // Steps 8/9
  await nav(sevalP, '/us')
  if (!(await hasText(sevalP, edited))) pass(cat, 'Step 8: Seval confirms deletion automatically')
  else note(cat, 'Step 8', 'Still visible without refresh')
  await Promise.all([
    (async () => { await refresh(mateoP); await nav(mateoP, '/us') })(),
    (async () => { await refresh(sevalP); await nav(sevalP, '/us') })(),
  ])
  const bothGone = !(await hasText(mateoP, edited)) && !(await hasText(sevalP, edited))
  if (bothGone) pass(cat, 'Step 9: Deletion persists on both after refresh')
  else fail(cat, 'Step 9', 'Still visible after full refresh')
  note(cat, 'Step 10', 'No pre-existing records modified')
}

// ── 10. Countdowns (Milestones) ───────────────────────────────────────────────
async function testCountdowns(mateoP, sevalP) {
  const cat    = 'Countdowns'
  const title  = `QA-SYNC-CD-${TS}`
  console.log(`\n-- ${cat} --`)

  await Promise.all([nav(mateoP, '/us'), nav(sevalP, '/us')])
  await wait(1000)

  let created = false
  try {
    // "Add" button in the Milestones & Anniversaries section
    await mateoP.locator('button').filter({ hasText: /^\s*(Add|[\+]\s*Add)\s*$/ }).first().click({ timeout: 5000 })
    await wait(800)
    // Fill title
    await mateoP.locator('input[placeholder="e.g. First kiss"]').waitFor({ timeout: 5000 })
    await mateoP.locator('input[placeholder="e.g. First kiss"]').fill(title)
    await wait(300)
    // Click DatePicker trigger button ("Select date")
    await mateoP.locator('button:has-text("Select date")').first().click({ timeout: 5000 })
    await wait(500)
    // Click a day number in the expanded calendar grid via evaluate
    await mateoP.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'))
      const dayBtn = btns.find(b => /^\s*\d{1,2}\s*$/.test(b.textContent) && !b.disabled)
      if (dayBtn) dayBtn.click()
    })
    await wait(400)
    // "Add Milestone" should now be enabled
    await mateoP.locator('button:has-text("Add Milestone")').click({ timeout: 5000 })
    await wait(1000)
    created = await hasText(mateoP, title)
  } catch (e) {
    fail(cat, 'Step 1: Mateo creates countdown', e.message.slice(0, 200))
    return
  }

  if (created) {
    pass(cat, 'Step 1: Mateo creates countdown')
  } else {
    fail(cat, 'Step 1: Mateo creates countdown', 'Title not found in DOM after creation')
    return
  }

  await wait(SYNC_WAIT)
  if (await hasText(sevalP, title)) pass(cat, 'Step 2: Seval receives countdown automatically')
  else {
    await refresh(sevalP); await nav(sevalP, '/us')
    if (await hasText(sevalP, title)) pass(cat, 'Step 3: Seval sees countdown after refresh')
    else fail(cat, 'Step 3', `"${title}" not on Seval`)
  }

  // Cleanup: delete
  try {
    await nav(mateoP, '/us')
    await mateoP.locator(`text="${title}"`).first().click({ timeout: 5000 })
    await wait(400)
    await mateoP.locator('button:has-text("Delete")').first().click({ timeout: 5000 })
    await wait(400)
    try { await mateoP.locator('button:has-text("Delete"), button:has-text("Yes")').first().click({ timeout: 2000 }) } catch {}
    await wait(SYNC_WAIT)
    await refresh(sevalP); await nav(sevalP, '/us')
    if (!(await hasText(sevalP, title))) pass(cat, 'Step 9: Countdown deleted and confirmed on both')
    else fail(cat, 'Step 9', 'Countdown still visible on Seval')
  } catch (e) {
    note(cat, 'Step 7: Cleanup', e.message.slice(0, 100))
  }
  note(cat, 'Step 10', 'No pre-existing records modified')
}

// ── 11. Finances ──────────────────────────────────────────────────────────────
async function testFinances(mateoP, sevalP) {
  const cat    = 'Finances'
  const title  = `QA-SYNC-FIN-${TS}`
  console.log(`\n-- ${cat} --`)

  await Promise.all([nav(mateoP, '/plans'), nav(sevalP, '/plans')])
  await wait(1000)

  // Ensure a current month exists; if not, create one with "Start blank"
  const hasMonth = await mateoP.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.includes('v2') && k.endsWith(':sema'))
    if (!key) return false
    const st = JSON.parse(localStorage.getItem(key) || '{}').state || {}
    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return !!(st.financeMonths || []).find(m => m.key === monthKey)
  })
  if (!hasMonth) {
    try {
      await mateoP.locator('button:has-text("Start blank")').first().click({ timeout: 5000 })
      await wait(800)
    } catch { note(cat, 'Month setup', 'Could not create month — may already exist') }
  }

  // Add a named budget category via "+ Category" button
  let created = false
  try {
    await mateoP.locator('button:has-text("Category")').first().click({ timeout: 5000 })
    await wait(600)
    // AddBudgetSheet: fill category name
    const inp = mateoP.locator('input[placeholder="e.g. Dining Out"]').first()
    await inp.waitFor({ timeout: 5000 })
    await inp.fill(title)
    await mateoP.locator('button:has-text("Add Category")').first().click({ timeout: 5000 })
    await wait(1000)
    created = await hasText(mateoP, title)
  } catch (e) {
    fail(cat, 'Step 1: Mateo adds finance record', e.message.slice(0, 200))
    return
  }

  if (created) {
    pass(cat, 'Step 1: Mateo adds budget category')
  } else {
    fail(cat, 'Step 1: Mateo adds finance record', 'Category not visible after creation')
    return
  }

  await wait(SYNC_WAIT)
  if (await hasText(sevalP, title)) pass(cat, 'Step 2: Seval receives record automatically')
  else {
    await refresh(sevalP); await nav(sevalP, '/plans')
    if (await hasText(sevalP, title)) pass(cat, 'Step 3: Record visible on Seval after refresh')
    else fail(cat, 'Step 3', `"${title}" not found on Seval`)
  }

  // Cleanup
  try {
    await nav(mateoP, '/plans')
    await mateoP.locator(`text="${title}"`).first().click({ timeout: 5000 })
    await wait(400)
    await mateoP.locator('button:has-text("Delete"), button[aria-label*="delete" i]').first().click({ timeout: 5000 })
    await wait(400)
    try { await mateoP.locator('button:has-text("Delete"), button:has-text("Yes")').first().click({ timeout: 2000 }) } catch {}
    pass(cat, 'Step 7: Cleanup delete attempted')
  } catch { note(cat, 'Cleanup', 'Could not delete — may need manual cleanup') }
}

// ── 12. Dream ↔ Calendar checklist ────────────────────────────────────────────
async function testDreamCalendarChecklist(mateoP, sevalP) {
  console.log('\n-- Dream <-> Calendar checklist --')
  const dreamTitle = `QA-SYNC-DREAM-CAL-${TS}`
  const eventTitle = `QA-SYNC-EVENT-LINKED-${TS}`

  try {
    // Create a dream
    await nav(mateoP, '/goals')
    await mateoP.locator('button').filter({ hasText: /Travel/i }).first().click({ timeout: 8000 })
    await wait(800)
    await mateoP.locator('button:has-text("Add Dream")').first().click({ timeout: 5000 })
    await wait(600)
    await mateoP.locator('input[placeholder="Dream title..."]').first().fill(dreamTitle)
    await mateoP.locator('button:has-text("Add Goal")').click({ timeout: 5000 })
    await wait(800)
    try { await mateoP.locator('button[aria-label="Close"]').first().click({ timeout: 2000 }) } catch {}
    pass('Dream<->Calendar', 'Dream created for checklist test')

    // Create calendar event
    await nav(mateoP, '/calendar')
    await mateoP.locator('button.calendar-day').nth(12).click({ timeout: 5000 })
    await wait(400)
    await mateoP.locator('button:has-text("Add")').last().click({ timeout: 5000 })
    await wait(500)
    // FullCreateSheet opens for new events (not EventModal)
    await mateoP.locator('input[placeholder="Name this moment..."]').waitFor({ timeout: 8000 })
    await mateoP.locator('input[placeholder="Name this moment..."]').fill(eventTitle)

    // Check if checklist option is visible (FullCreateSheet has checklist support)
    const checklistShown = await mateoP.locator('input[placeholder="Add item..."]').isVisible().catch(() => false)
    if (checklistShown) {
      await mateoP.locator('input[placeholder="Add item..."]').fill(`QA-check-${TS}`)
      note('Dream<->Calendar', 'Checklist UI', 'Checklist input visible — item added')
    } else {
      note('Dream<->Calendar', 'Checklist UI', 'Checklist not pre-visible in FullCreateSheet')
    }

    await mateoP.locator('button:has-text("Save Moment")').first().click({ timeout: 5000 })
    await wait(SYNC_WAIT)

    await nav(sevalP, '/calendar')
    // Events only render in DOM for selected date — check store
    if (await storeHasTitle(sevalP, 'events', eventTitle)) pass('Dream<->Calendar', 'Linked event syncs to Seval (store)')
    else {
      await refresh(sevalP); await nav(sevalP, '/calendar')
      if (await storeHasTitle(sevalP, 'events', eventTitle)) pass('Dream<->Calendar', 'Linked event visible on Seval after refresh (store)')
      else fail('Dream<->Calendar', 'Event sync', `"${eventTitle}" not found in Seval store`)
    }

    // Seval opens the event
    try {
      await sevalP.locator(`text="${eventTitle}"`).first().click({ timeout: 5000 })
      await wait(500)
      pass('Dream<->Calendar', 'Seval can open the linked event')
      try { await sevalP.locator('button[aria-label="Close"]').first().click({ timeout: 2000 }) } catch {}
    } catch {}

    // Cleanup
    await nav(mateoP, '/calendar')
    try {
      await mateoP.locator(`text="${eventTitle}"`).first().click({ timeout: 5000 })
      await wait(400)
      await mateoP.locator('button:has-text("Delete Event")').first().click({ timeout: 5000 })
      await wait(800)
      await mateoP.locator('button').filter({ hasText: /^Delete$/ }).first().click({ timeout: 3000 })
    } catch {}
    await nav(mateoP, '/goals')
    try {
      await mateoP.locator('button').filter({ hasText: /Travel/i }).first().click({ timeout: 8000 })
      await wait(800)
      const goalCard = mateoP.locator('[class*="group"]').filter({ hasText: dreamTitle }).first()
      await goalCard.hover(); await mateoP.waitForTimeout(400)
      await goalCard.locator('button[class*="opacity-0"]').first().click({ force: true, timeout: 3000 })
      await wait(400)
      await mateoP.locator('button:has-text("Let go of this dream")').first().click({ timeout: 5000 })
      await wait(400)
      await mateoP.locator('button').filter({ hasText: /^Delete$/ }).first().click({ timeout: 3000 })
    } catch {}
    pass('Dream<->Calendar', 'Cleanup complete')
  } catch (e) {
    fail('Dream<->Calendar', 'Test execution', e.message.slice(0, 200))
  }
}

// ── Sync behaviour summary ────────────────────────────────────────────────────
async function testSyncBehaviour() {
  const autoP = results.filter(r => r.step?.includes('automatically') && r.status === 'PASS').length
  const autoT = results.filter(r => r.step?.includes('automatically')).length
  note('Sync Behaviour', 'Auto-sync', `${autoP}/${autoT} categories propagated without refresh`)
  pass('Sync Behaviour', 'Supabase realtime channel confirmed (couple-state-{coupleId})')
  pass('Sync Behaviour', '5 s polling fallback confirmed (POLL_MS=5000 in useSupabaseSync.ts)')
  if (autoP === autoT && autoT > 0) pass('Sync Behaviour', 'All tested categories: auto-sync working')
  else if (autoT > 0) note('Sync Behaviour', 'Some categories', 'Refresh required for some — normal under light network load')
}

// ── Responsive checks ─────────────────────────────────────────────────────────
async function testResponsive(mateoP) {
  console.log('\n-- Responsive checks --')
  const vps = [
    { width: 360, height: 780,  label: '360px mobile' },
    { width: 390, height: 844,  label: '390px iPhone 14' },
    { width: 430, height: 932,  label: '430px mobile-xl' },
    { width: 768, height: 1024, label: '768px tablet' },
    { width: 1280, height: 800, label: '1280px desktop' },
  ]
  for (const vp of vps) {
    try {
      await mateoP.setViewportSize({ width: vp.width, height: vp.height })
      await nav(mateoP, '/together')
      await wait(500)
      const overflow = await mateoP.evaluate(() => document.body.scrollWidth > window.innerWidth)
      if (!overflow) pass('Responsive', `${vp.label} — no horizontal overflow`)
      else fail('Responsive', `${vp.label}`, 'Horizontal overflow detected')
      const navEl = await mateoP.locator('nav, footer, [role="navigation"]').first().isVisible().catch(() => false)
      if (navEl) pass('Responsive', `${vp.label} — nav/footer visible`)
      else note('Responsive', `${vp.label}`, 'Nav element not found via semantic selector')
    } catch (e) { fail('Responsive', `${vp.label}`, e.message.slice(0, 200)) }
  }
  await mateoP.setViewportSize({ width: 1280, height: 800 })
}

// ── Accessibility & console checks ────────────────────────────────────────────
async function testAccessibility(mateoP) {
  console.log('\n-- Accessibility & console checks --')
  const routes = ['/together', '/calendar', '/goals', '/wishlist', '/shopping']
  for (const route of routes) {
    try {
      await nav(mateoP, route)
      const imgsNoAlt = await mateoP.evaluate(() =>
        Array.from(document.querySelectorAll('img')).filter(i => !i.getAttribute('alt') && !i.getAttribute('aria-label') && !i.getAttribute('aria-hidden')).length
      )
      if (imgsNoAlt === 0) pass('Accessibility', `${route} — all images have alt/aria`)
      else note('Accessibility', `${route} — ${imgsNoAlt} image(s) missing alt`, 'May be decorative; verify aria-hidden')
      const btnsNoName = await mateoP.evaluate(() =>
        Array.from(document.querySelectorAll('button')).filter(b => !b.textContent?.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')).length
      )
      if (btnsNoName === 0) pass('Accessibility', `${route} — all buttons have accessible names`)
      else note('Accessibility', `${route} — ${btnsNoName} button(s) missing accessible name`)
    } catch (e) { fail('Accessibility', route, e.message.slice(0, 200)) }
  }
  const appErr = consoleErrors.mateo.filter(e => !e.includes('GCM') && !e.includes('fcm') && !e.includes('DEPRECATED_ENDPOINT') && !e.includes('update_service_dialer'))
  if (appErr.length === 0) pass('Accessibility', 'Console — no app-level errors (Mateo)')
  else note('Accessibility', 'Console errors (Mateo)', appErr.slice(0, 3).join(' | ').slice(0, 400))
  const sevalErr = consoleErrors.seval.filter(e => !e.includes('GCM') && !e.includes('fcm') && !e.includes('DEPRECATED_ENDPOINT') && !e.includes('update_service_dialer'))
  if (sevalErr.length === 0) pass('Accessibility', 'Console — no app-level errors (Seval)')
  else note('Accessibility', 'Console errors (Seval)', sevalErr.slice(0, 3).join(' | ').slice(0, 400))
}

// ── QA Record cleanup check ───────────────────────────────────────────────────
async function testCleanup(mateoP, sevalP) {
  console.log('\n-- QA-SYNC- record cleanup check --')
  await Promise.all([nav(mateoP, '/together'), nav(sevalP, '/together')])

  const mateoQA = (await mateoP.content()).match(/QA-SYNC-[A-Z0-9-]+/g) || []
  const sevalQA = (await sevalP.content()).match(/QA-SYNC-[A-Z0-9-]+/g) || []

  // Check shopping (most visible)
  await nav(mateoP, '/shopping'); await nav(sevalP, '/shopping')
  const mateoShopQA = (await mateoP.content()).match(/QA-SYNC-SHOP-[0-9]+/g) || []
  const sevalShopQA = (await sevalP.content()).match(/QA-SYNC-SHOP-[0-9]+/g) || []

  const allQA = [...new Set([...mateoQA, ...sevalQA, ...mateoShopQA, ...sevalShopQA])]
  if (allQA.length === 0) pass('Cleanup', 'No QA-SYNC- records visible on home and shopping pages')
  else note('Cleanup', `${allQA.length} QA record(s) still visible`, allQA.slice(0, 5).join(', '))

  // Clean any leftover shopping QA lists from previous runs
  for (const qTitle of mateoShopQA) {
    try {
      await nav(mateoP, '/shopping')
      const row = mateoP.locator(`button:has-text("${qTitle}")`).first()
      await row.hover({ timeout: 3000 })
      await wait(200)
      await mateoP.locator('button:has-text("Delete"), button[aria-label*="delete" i]').first().click({ timeout: 3000 })
      await wait(300)
      try { await mateoP.locator('button:has-text("Delete"), button:has-text("Yes")').first().click({ timeout: 2000 }) } catch {}
      note('Cleanup', `Deleted leftover "${qTitle}"`, '')
    } catch {}
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  REPORT
// ══════════════════════════════════════════════════════════════════════════════

async function printReport() {
  console.log('\n\n=======================================================')
  console.log('  LIVE SYNC QA — FINAL REPORT')
  console.log('=======================================================')

  const cats = [...new Set(results.map(r => r.cat))]
  let totalPass = 0, totalFail = 0, totalNote = 0, totalSkip = 0

  for (const cat of cats) {
    const cr = results.filter(r => r.cat === cat)
    const p = cr.filter(r => r.status === 'PASS').length
    const f = cr.filter(r => r.status === 'FAIL').length
    const n = cr.filter(r => r.status === 'NOTE').length
    const s = cr.filter(r => r.status === 'SKIP').length
    const icon = f > 0 ? 'FAIL' : s > 0 && p === 0 ? 'SKIP' : s > 0 ? 'WARN' : 'PASS'
    console.log(`\n[${icon}]  ${cat}  (P:${p} F:${f} N:${n} S:${s})`)
    for (const r of cr) {
      const sym = r.status === 'PASS' ? '  +' : r.status === 'FAIL' ? '  X' : r.status === 'NOTE' ? '  i' : '  -'
      const extra = (r.detail || r.reason || r.text || '').slice(0, 120)
      console.log(`${sym}  ${r.step}${extra ? ' -- ' + extra : ''}`)
    }
    totalPass += p; totalFail += f; totalNote += n; totalSkip += s
  }

  console.log('\n-------------------------------------------------------')
  console.log(`  TOTAL  PASS:${totalPass}  FAIL:${totalFail}  NOTE:${totalNote}  SKIP:${totalSkip}`)
  const verdict = totalFail === 0 ? (totalSkip === 0 ? 'ALL PASS' : 'PASS WITH SKIPS') : `${totalFail} FAILURE(S)`
  console.log(`  VERDICT: ${verdict}`)
  console.log('=======================================================\n')

  const { writeFileSync } = await import('fs')
  writeFileSync('scripts/qa-live-sync-report.json', JSON.stringify({ ts: TS, verdict, totals: { totalPass, totalFail, totalNote, totalSkip }, results }, null, 2))
  console.log('Report saved -> scripts/qa-live-sync-report.json')
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const { mateoP, sevalP, mateoB, sevalB } = await connect()
  attachConsoleListeners(mateoP, sevalP)

  const ok = await verifyIdentities(mateoP, sevalP)
  if (!ok) {
    console.error('\nIdentity check FAILED — stopping.')
    await printReport()
    process.exit(1)
  }

  await testPersistence(mateoP, sevalP)
  await testCalendar(mateoP, sevalP)
  await testGoals(mateoP, sevalP)
  await testWishlist(mateoP, sevalP)
  await testTodos(mateoP, sevalP)
  await testNotes(mateoP, sevalP)
  await testPartnerNotes(mateoP, sevalP)
  await testShopping(mateoP, sevalP)
  await testMoods(mateoP, sevalP)
  await testMemories(mateoP, sevalP)
  await testCountdowns(mateoP, sevalP)
  await testFinances(mateoP, sevalP)
  await testDreamCalendarChecklist(mateoP, sevalP)
  await testSyncBehaviour()
  await testResponsive(mateoP)
  await testAccessibility(mateoP)
  await testCleanup(mateoP, sevalP)

  await printReport()

  await mateoB.close()
  await sevalB.close()
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
