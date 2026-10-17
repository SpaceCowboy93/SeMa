# Supabase Egress Audit

**Date**: 2026-10-05
**Branch**: security/phase-1-auth-foundation
**Auditor**: code review — no live Supabase calls made

---

## Summary

The SeMa Supabase project (`neyhoodxeumpbxekskej`) hit the free-tier 5 GB/month
egress quota around 2026-09-26, ~8.6 days into the billing cycle. The Supabase
dashboard showed **14.15 GB** consumed. This audit identifies the confirmed root
cause, the mathematics behind the number, and the fix applied.

---

## Confirmed Root Cause — Unguarded Background-Tab Polling

### Where

`src/hooks/useSupabaseSync.ts`, line 244 (pre-fix):

```ts
// BEFORE (defective):
const timer = setInterval(() => { void pull() }, POLL_MS)

// AFTER (fixed):
const timer = setInterval(() => { if (document.visibilityState !== 'hidden') void pull() }, POLL_MS)
```

### What it does

`pull()` downloads the full `couple_state` row — a JSONB object containing all
18 shared keys (events, todos, goals, countdowns, wishlistItems, memories,
shopping lists, etc.) serialised together. Each read is approximately **20–30 KB**.

`POLL_MS = 5_000` (5 seconds). The interval fires 12 times per minute.

### Why it blew the quota

The interval had **no `document.visibilityState` check**. Every open browser tab
— whether the user was actively using it or had left it open in the background —
polled Supabase at the same rate. A typical session for two users (Seval and
Mateo each with a phone and a laptop tab) has **4 concurrent polling contexts**.

**Egress estimate:**

```
4 sessions
× 12 polls/min
× 30 KB/poll
× 1,440 min/day
× 8.6 days
= ~17.9 GB read egress
```

The 14.15 GB observed is consistent with ~3 sessions active on average (e.g.
laptop tabs closed overnight, phone browsers sleeping but waking periodically).

---

## Secondary Egress Sources (Contributing, Not Root Cause)

These were confirmed by reading source code. None is large enough on its own to
explain the quota breach, but each adds to the baseline.

### 1. Realtime channel + polling overlap

`useSupabaseSync.ts` lines 247–249 subscribe to a Postgres change channel AND
run the `setInterval`. When the Realtime event fires it calls `pull()` without
resetting the interval timer. A partner's write therefore generates:

- 1 Realtime download (~1 KB notification payload)
- 1 immediate `pull()` read (~30 KB)
- 1 interval `pull()` read seconds later (double-read within one POLL window)

Fix: the visibility guard reduces the background portion. A full fix would reset
the interval on each successful Realtime-triggered pull — deferred to a
follow-on change because it requires careful timer lifecycle handling.

### 2. Initial-load validation sequence

`getVerifiedAccess()` (called on every page load from `useAuthSession`) makes
**4 serial Supabase requests**: `auth.getUser`, `profiles`, `couple_members`,
`couple_state`. The last request duplicates the first `pull()` in
`useSupabaseSync`. This is a minor contributor (~120 KB/page-load) and is not
worth removing until the auth flow is refactored.

### 3. Push-sync reminders on every page load

`usePushNotifications.ts` calls `syncBothUsers()` automatically when
`status === 'subscribed' && serverSaved === true`. This makes 2 POSTs to
`/api/push/sync-reminders`, each of which reads and writes to `push_sync_log`
and `push_reminders`. With the service worker `updateViaCache: 'none'`, a SW
version check also fires on each page load. Low individual cost, but adds up
across navigations.

### 4. `couple_state` JSONB architecture

All 18 shared keys live in one wide JSONB column. Every poll — even when only
`todos` changed — downloads the full object including events, memories,
shopping lists, and journey data. A partial-columns approach would reduce
per-poll egress by 80–90%, but would require a significant schema migration.

---

## Egress Formula

All polling estimates use this formula explicitly:

```
daily egress = response_size × polls_per_minute × 1,440 min/day × visible_clients
```

**Assumptions for polling-only tables below:**

- `response_size` = **30 KB** — this is an estimate based on code inspection of
  the 18-key JSONB data model. The actual transferred size is unknown until it
  can be measured after Supabase is restored (see "Required Measurements" below).
- `polls_per_minute` = interval frequency (never hidden tabs — visibility guard
  prevents all polling while `document.visibilityState === 'hidden'`).
- `visible_clients` = number of concurrently open, foregrounded tabs.
- These figures cover **fallback polling only**. Realtime traffic, Auth requests,
  push-sync and event-triggered pulls are additional — see secondary sources below.
- **No measured values exist.** All figures are theoretical estimates.

---

## Egress Breakdown — Polling Component at Three Intervals (ESTIMATES)

| Interval | polls/min | 1 visible tab/day | 2 visible tabs/day | 4 visible tabs/day |
|---|---|---|---|---|
| **5 s** (original, no visibility guard) | 12 | 518.4 MB | 1,036.8 MB (1.01 GB) | 2,073.6 MB (2.02 GB) |
| **60 s** (Phase 2, superseded) | 1 | 43.2 MB | 86.4 MB | 172.8 MB |
| **300 s** (current) | 0.2 | 8.64 MB | 17.28 MB | 34.56 MB |

Derivation for **5 s, 1 tab**: 30 KB × 12 × 1,440 = 518,400 KB = 518.4 MB/day

Derivation for **300 s, 1 tab**: 30 KB × 0.2 × 1,440 = 8,640 KB = 8.64 MB/day

**Hidden tabs** (any interval, with visibility guard): **0 MB** — interval skipped.

**30-day monthly projection (polling only):**

| Interval | 1 tab | 2 tabs | 4 tabs | Exceeds 5 GB free tier? |
|---|---|---|---|---|
| 5 s | 15.55 GB | 31.10 GB | 62.21 GB | **YES** (even 1 tab) |
| 60 s | 1.30 GB | 2.59 GB | **5.18 GB** | At 4 tabs: barely yes |
| 300 s | 0.26 GB | 0.52 GB | 1.04 GB | **No** |

The 60-second interval was safe for 1–3 always-visible tabs but would breach the
free tier with 4 continuously open tabs. The 300-second interval stays well under
5 GB even with 4 tabs continuously open (1.04 GB vs 5 GB limit).

---

## Egress Breakdown — Secondary Sources (ESTIMATES, unverified)

These are additional egress sources beyond fallback polling. All figures are
estimates from code inspection; none have been measured.

| Source | Estimated rate | Estimated daily (2 users) | Note |
|--------|---------------|--------------------------|------|
| Realtime subscription | ~1 KB/event × ~20 events/day/user | ~40 KB | Channel overhead; minimal |
| Realtime-triggered pulls | ~20/day/user × 30 KB | ~1.2 MB | Each Realtime event fires `pull()` |
| Page-load auth (4 serial requests) | ~30 loads/day × ~120 KB | ~3.6 MB | ESTIMATE — not measured |
| Push-sync auto-trigger | ~30 navigations/day × ~60 KB | ~1.8 MB | ESTIMATE — not measured |
| Online reconnect pulls | infrequent × 30 KB | < 1 MB | Covered by visibility guard catch-up |

**Why secondary sources were not the root cause:** each secondary source
contributes at most a few MB/day, an order of magnitude below the original
5-second polling rate (518 MB/day/tab).

**Total estimated daily egress at 300 s (2 users, 1 visible tab each):**

```
Polling:    30 KB × 0.2 polls/min × 1,440 min × 2 tabs = 17.28 MB  (ESTIMATE)
Secondary:  ~6.6 MB                                                   (ESTIMATE)
──────────────────────────────────────────────────────────────────────────────
Total:      ~24 MB/day                                                (ESTIMATE)
Monthly:    ~720 MB/month                                             (ESTIMATE)
```

This is a theoretical upper bound. Actual usage will be lower (devices sleep,
tabs are closed, users don't navigate 30 times/day). **Do not treat this as a
known quantity until it has been measured.**

---

## Required Post-Restoration Measurements

These measurements must be taken after Supabase is unpaused and the fix is
deployed. Until then, all monthly totals are unknown.

**Measurement 1 — Actual `couple_state` response size**

Method: Open the app, open browser DevTools → Network → filter by `couple_state`
→ observe Response Headers `content-length` (or check the "Size" column).
Record the compressed and uncompressed sizes. Update `response_size` in the
formula above.

**Measurement 2 — Observed requests per minute per visible tab**

Method: Keep the app open in one foregrounded tab for 10 minutes with DevTools
Network tab open. Count GET requests to `couple_state`. Expected: 2 requests
(one per 5 min). If more, file a regression bug.

**Measurement 3 — Supabase dashboard egress after one week**

Method: Supabase Dashboard → Usage → Egress. Record the daily value each day
for the first week. Multiply the 7-day average by 30 to project the monthly
total. Compare to estimates above and update this document.

**Measurement 4 — Additional traffic sources**

Method: Filter DevTools Network by domain during a typical session (open app,
navigate a few times, leave open for 5 min). Record total bytes for `/auth`,
`/rest/v1/couple_state`, `/api/push`, and Realtime WebSocket frames separately.

---

## Fix Applied — Phase 1 (commit 8419371, 2026-10-05)

**File**: `src/hooks/useSupabaseSync.ts`, line 244

```ts
// Before:
const timer = setInterval(() => { void pull() }, POLL_MS)

// After (visibility guard only):
const timer = setInterval(() => { if (document.visibilityState !== 'hidden') void pull() }, POLL_MS)
```

**Regression test**: `src/__tests__/hooks/sync-visibility.test.ts` — 2 tests.

---

## Fix Applied — Phase 2 (commits c1477e6 + follow-on, 2026-10-08)

**File**: `src/hooks/useSupabaseSync.ts`

Three structural changes (c1477e6) plus a one-line interval correction:

### Change 1 — Raise `POLL_MS` from 5 s to 300 s (5 minutes)

```ts
// Before:
const POLL_MS = 5_000

// After:
const POLL_MS = 300_000
```

Realtime delivers partner changes in < 1 s. The interval is a fallback for
Realtime dropout only. 300 s reduces visible-tab poll traffic by 60× (from
12 reads/min to 0.2 reads/min). This keeps monthly egress well below the
5 GB free tier even with 4 concurrently open tabs (1.04 GB/month estimated).

Note: an intermediate value of 60 s was briefly used but corrected to 300 s
after recalculating that 4 continuously visible tabs at 60 s would reach
~5.18 GB/month — just above the free-tier limit.

### Change 2 — Reset poll timer on every event-driven pull

```ts
const pollIfVisible  = () => { if (document.visibilityState !== 'hidden') void pull() }
let   timer          = setInterval(pollIfVisible, POLL_MS)
const resetPollTimer = () => { clearInterval(timer); timer = setInterval(pollIfVisible, POLL_MS) }

const onVisible = () => { if (document.visibilityState === 'visible') { void pull(); resetPollTimer() } }
const onOnline  = () => { void pull(); resetPollTimer() }
```

When `visibilitychange`, `online`, or a Realtime event fires a pull, the
fallback timer is reset to a full `POLL_MS`. This prevents an immediate
double-read within seconds of an event-driven pull.

### Change 3 — Add `window.addEventListener('online', ...)` catch-up pull

When the device reconnects, a single catch-up pull fires immediately.
Previously, a reconnection had to wait up to `POLL_MS` for the interval.

### Cleanup

`window.removeEventListener('online', onOnline)` is added to the effect
cleanup so no listener leaks on unmount, logout, or account switch.

**Why these changes are safe:**

- `reading` flag prevents overlapping in-flight pulls (was already present,
  now covered by regression tests).
- `abort.signal` and `cancelAuth` guards are unchanged — stale pulls after
  logout or account switch are still discarded.
- The `save()` CAS loop and `applyRemote` conflict handling are unchanged.
- The initial `void pull()` still fires unconditionally on mount.

**Regression tests added** (`src/__tests__/hooks/sync-visibility.test.ts`,
10 tests total):

| # | Test |
|---|------|
| 1 | Hidden tabs do not poll |
| 2 | Visible tabs do not poll more than twice in one `visibilitychange` cycle |
| 3 | Visible tab polls at 300 s interval, not faster |
| 4 | Return-to-visible fires exactly one catch-up and resets timer |
| 5 | Online reconnect fires exactly one catch-up pull |
| 6 | Rapid events don't create overlapping in-flight pulls |
| 7 | Unmount removes both `visibilitychange` and `online` listeners |
| 8 | In-flight pull is discarded after unmount (no state clobber) |
| 9 | Realtime partner update applies immediately without waiting for poll |
| 10 | Failed pull preserves last valid local state |

---

## Remaining Recommendations (Future Work)

### R1 — ~~Increase POLL_MS~~ ✓ DONE (300 s / 5 min, 2026-10-08)

### R2 — ~~Reset interval on Realtime pull~~ ✓ DONE (2026-10-08)

### R3 — Throttle push-sync auto-trigger (low risk, low impact)

Gate the `syncBothUsers()` auto-call with a cooldown (e.g. skip if last sync
was within 60 s). Prevents repeated sync on rapid navigations.

### R4 — Partial-column JSONB reads (medium risk, high impact)

Split `couple_state` into per-domain columns or separate rows so polls only
download changed sections. High migration complexity; defer until after the
free-tier quota is no longer a concern or usage scales further.

---

## Seven-Day Monitoring Checklist (Post-Unpausing)

Run these checks in the Supabase dashboard each day for the first week.

**Day 0 (after unpausing):**
- [ ] Confirm project unpaused — REST `/auth/v1/health` returns 200/401, not 402.
- [ ] Push the fix branch to `origin/security/phase-1-auth-foundation` and open PR.
- [ ] Merge and deploy to production.
- [ ] Open the app in one browser tab, leave it open for 10 minutes, reload. Check
      dashboard egress — should be < 5 MB for a 10-minute session.

**Days 1–3:**
- [ ] Perform measurements 1–4 from the "Required Post-Restoration Measurements"
      section above. Update `response_size` in the formula once measured.
- [ ] Check **Supabase Dashboard → Usage → Egress** each morning.
- [ ] Estimated baseline: ≤ 25 MB/day (2 users, casual use). This is an estimate;
      the real number is unknown until measured.
- [ ] Alert threshold: **> 100 MB/day** — investigate immediately (could indicate
      a code regression, QA script, or unusually large `couple_state` payload).
- [ ] If > 100 MB: open DevTools Network, count `/couple_state` GET requests per
      minute. Expected: ≤ 1 request per 5 min per visible tab (0.2/min).

**Days 4–7:**
- [ ] If stable (daily egress tracks with measurements), no action needed.
- [ ] If daily egress is unexpectedly high: check open QA scripts, multiple-tab
      usage. Consider R3 (push-sync throttle) if push traffic is the driver.
- [ ] If > 500 MB/day on any single day: suspect a code regression. Roll back
      the last deploy and file a bug.

**End of first week:**
- [ ] Record the **actual** daily egress for each of the 7 days in this document,
      replacing estimates with measurements.
- [ ] Confirm the monthly trajectory (7-day average × 30) is well under 5 GB.
- [ ] If monthly trajectory > 3 GB, implement R4 (partial-column reads) before
      the next billing cycle.
- [ ] Update the "Required Post-Restoration Measurements" section to mark each
      measurement complete and record its value.

---

## Remaining Uncertainty

The following cannot be measured until Supabase is unpaused and the fix is deployed:

| Item | Status | What to check |
|------|--------|---------------|
| Actual `couple_state` response size | **Unknown** — 30 KB is an estimate | DevTools → Network → couple_state GET → Response size |
| Realtime egress contribution | **Unknown** | Supabase Dashboard → Realtime → Bytes (if exposed) |
| Auth egress per page-load | **Unknown** — 120 KB is an estimate | DevTools → Network → auth endpoints |
| Push-sync egress per navigation | **Unknown** — 60 KB is an estimate | DevTools → Network → /api/push/sync-reminders |
| Offline-reconnect pull frequency | **Unknown** | Test on mobile with airplane mode toggle |
| Multi-tab behaviour in production | **Unknown** | Open app in 3 tabs, check poll count |

No Supabase usage logs were available for inspection during this audit.
All per-request size estimates are based on reading the data model (18 JSONB keys)
and assuming a typical calendar/todo dataset. Actual payloads may be smaller (new
users) or larger (long usage history with many events/goals/memories).

---

## Oct 8 Status Check (2026-10-08 17:13 UTC)

A safe, read-only probe was run on 2026-10-08 using the anon key.

**Result: restriction still active.**

```
HTTP 402
{"message":"Service for this project is restricted due to the following
violations: exceed_egress_quota. The project owner must upgrade their plan
or remove spend caps to restore service."}
```

Both the REST endpoint (`/rest/v1/couple_state?limit=0`) and the Auth health
endpoint (`/auth/v1/health`) return 402.

### Why it did not auto-reset

The error message says **"must upgrade their plan or remove spend caps to
restore service"** — this is Supabase's language for an account where a spend
cap was exhausted, not a simple quota that resets automatically at month-end.
The billing cycle may still require a manual action in the Supabase dashboard
(Billing → Usage → Reset or Upgrade).

### Required manual action (Mateo)

1. Log in to `app.supabase.com` → project `neyhoodxeumpbxekskej`.
2. Go to **Billing** (or **Settings → Billing**).
3. Confirm whether the billing period has reset. If not, either:
   a. Wait for the automatic reset (check the exact reset date shown in the
      dashboard), or
   b. Upgrade the plan, or
   c. Acknowledge / remove the spend-cap violation if that option is shown.
4. Once the project is unpaused, re-run the probe:
   `curl -s -w "\nHTTP %{http_code}" https://neyhoodxeumpbxekskej.supabase.co/auth/v1/health -H "apikey: <anon_key>"`
5. The existing Preview URL should work without redeployment once Supabase
   is restored — no code change is needed on the Preview itself.

### Does the Preview need redeployment?

The Preview URL (`sema-calendar-9j1dulpgp-mateo-s-projects123.vercel.app`)
uses the **main** branch code, which has the old simple-button auth flow
(no Supabase calls on landing). The **security branch** login form does
make Supabase calls. Neither Preview will work until Supabase is unpaused.
After unpausing, the existing Preview deployments will work without
redeployment.

### Post-reset plan

1. Confirm Supabase is unpaused (probe returns 200/401, not 402).
2. Push and merge the fix branch to main (3 local commits + any remote push).
3. Deploy to production — this is the minimum safety step before real use.
4. Monitor the Supabase dashboard daily. Budget: ~150 MB/day (5 GB / 30 days).
5. If daily egress exceeds 150 MB, implement R1 (increase `POLL_MS` to 30 s)
   before end of first week.

---

## Files Audited

| File | Finding |
|------|---------|
| `src/hooks/useSupabaseSync.ts` | **Root cause** — unguarded `setInterval` |
| `src/hooks/useAuthSession.ts` | 4 serial requests on page load (minor) |
| `src/hooks/usePushNotifications.ts` | Auto-sync on every page load (minor) |
| `src/lib/shared-state.ts` | 18 keys in one JSONB column (architecture) |
| `src/app/api/push/sync-reminders/route.ts` | Multiple DB ops per sync call |
| `scripts/qa-live-sync.mjs` | QA script, not production traffic |

No live Supabase requests were made during this audit.
