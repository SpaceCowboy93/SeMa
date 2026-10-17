# SeMa Project Rules

The permanent reference for all decisions made during SeMa development.
Read this file at the start of every new feature session.

---

## Visual Design Direction

- **C2 — Botanical Journal** is the official SeMa visual direction. All visual changes must align with it.
- Read `DESIGN_SYSTEM.md` before making any visual change.
- Read `SEMA_PHILOSOPHY.md` before proposing any new feature.
- Profile-specific accents are subtle and non-stereotypical (see DESIGN_SYSTEM.md for exact tokens).
- Living Moments follow the documented visual language in DESIGN_SYSTEM.md — never use harsh celebratory colors.
- No visual redesign should ignore the established design system.
- Body background: warm cream `#FDFAF5` (not pure white, not pinkish).
- Shadows: warm charcoal-based (`rgba(45,41,38,...)`) not pure black.
- Section labels: `text-[11px] font-medium text-gray-400 tracking-widest uppercase` (editorial standard).
- Category tiles on Home: left-border accent on cream card, not color-tinted backgrounds.
- Animated background blobs: botanical palette per page (see DESIGN_SYSTEM.md).

## Development Workflow

- **Never commit, push, or deploy** unless the user explicitly says "Deploy".
- Always work locally first. Local → TypeScript check → build → then deploy.
- Run `npx tsc --noEmit` and `npm run build` before every deployment.
- Review `git diff --staged` and confirm only relevant files are staged before every commit.
- Never commit unrelated files (exports, zips, generated files, `.env`).
- Keep commits focused on one feature. One commit per logical change.
- Use the GitHub → Vercel auto-deploy pipeline. Never use `vercel --prod` directly.
- Suggested commit message format: `feat:`, `fix:`, `revert:` followed by a short description.

---

## UI & Design

- SeMa should feel **premium, warm, and personal** — not like a productivity app.
- Prioritize simplicity over visual clutter.
- Premium micro-interactions are preferred over flashy animations.
- **Playfair Display** is used exclusively for premium greetings and special titles (e.g., Daily Briefing header, PageHeader greeting).
- The main UI font is **Inter** (system-clean, not decorative).
- Maintain consistent spacing and rounded design language (rounded-2xl, rounded-3xl).
- Avoid unnecessary gradients or visual noise.
- Bottom sheets follow the established pattern:
  - `flex flex-col` + `maxHeight: calc(100dvh - 48px)`
  - `shrink-0` header, `flex-1 min-h-0 overflow-y-auto overscroll-contain` body
  - `shrink-0 pb-sheet-footer` footer
  - `pb-sheet-footer` = `padding-bottom: max(5.5rem, calc(4rem + env(safe-area-inset-bottom)))`

---

## UX

- **Weekly Planner strict per-owner filtering:**
  - "Both" tab → shows only activities where `createdBy === 'both'`
  - "Mateo" tab → shows only activities where `createdBy === 'mateo'`
  - "Seval" tab → shows only activities where `createdBy === 'seval'`
  - Activities created under "Both" must never appear in personal views.
- Privacy rules must always be respected. Reuse existing ownership fields — do not invent new privacy layers.
- **Daily Briefing** appears once per profile per day. Storage key: `sema-briefing-{userId}-{YYYY-MM-DD}`.
- Features should minimize taps whenever possible.
- Always design mobile-first (375px baseline, test up to 430px).
- Use `100dvh` (not `100vh`) for full-height containers to account for mobile browser chrome.
- Android back button must close sheets before navigating away.
- Drag-to-dismiss is preferred for bottom sheets, but must never be the only close method.

---

## Architecture

- Reuse existing components before creating new ones.
- Avoid duplicated logic — prefer one source of truth.
- Keep business logic separate from UI (e.g., `src/lib/briefing.ts` for the briefing generator).
- The briefing generator (`generateBriefingItems`) is the single source of truth for both in-app briefing and future push notifications.
- Keep TypeScript strict. Run `npx tsc --noEmit` before every commit.
- Do not use `any` types.
- `getWeekKey(date)` returns ISO week key `YYYY-WNN`. Day index: Monday = 0, Sunday = 6.
- `getTodayString()` returns `YYYY-MM-DD` in local time.
- Per-profile daily localStorage keys follow the pattern: `sema-{feature}-{userId}-{YYYY-MM-DD}`.
- Zustand store with `persist` middleware is the state layer.
- Next.js 14 App Router with `'use client'` components and Framer Motion for animations.

---

## Notifications

- Morning push briefing planned for approximately 09:00 local time.
- Push notifications must never duplicate in-app reminders.
- Notification content logic must reuse `generateBriefingItems` from `src/lib/briefing.ts`.
- Android and iPhone notification behavior should remain consistent where possible.
- The notification infrastructure and push backend are already deployed.

---

## Greeting System

- `getDailyGreeting(name, dateStr, now?)` in `src/lib/greeting.ts` provides deterministic daily greetings.
- Greetings are stable for the entire time-of-day period (morning / afternoon / evening).
- Greeting pools include emoji prefixes (☀️ morning, 🌿 afternoon, 🌙 evening).
- The Daily Briefing header uses the same greeting as the Home page header — no mismatches.
- `PageHeader` is self-contained: reads `currentUser` from store, computes greeting internally.

---

## Future Philosophy

> "A premium relationship companion that feels calm, beautiful, personal and effortless — not a productivity app."

The goal is to help couples enjoy life together, not overwhelm them with information. Every feature should pass the question: *does this make their shared life feel easier or more meaningful?*

---

## Session Protocol

At the start of every new feature session:

1. Read `PROJECT_RULES.md` first.
2. Read `ROADMAP.md` second.
3. Use both to guide all decisions.

If a new permanent decision is made during development → add it to `PROJECT_RULES.md`.
If a feature is completed and deployed → update `ROADMAP.md` (move to ✅ Completed).
