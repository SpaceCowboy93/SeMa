# SeMaCalendar — Design Exploration

> No code changes. Pure thinking. Working through what a redesigned version of the app could look like.

---

## Current State (what we have)

### Navigation — 3 tabs
| Tab | Icon | Content |
|---|---|---|
| Planner | Heart | Calendar grid + category hub (5 small tiles) + selected day events |
| Finance | Wallet | Financial planning |
| Us | User | Relationship story: timer, mood, dates, milestones, timeline, highlights, stats |

### Key observations
- **Planner** is doing three jobs at once: it's a calendar, a hub for 5 different content types, AND shows day-specific events. It feels crowded.
- The **5 category tiles** (Plans, Dreams, Wishes, Shopping, Moments) are tiny — 8px font, small emoji icons. They're the heart of the app's content but visually treated as secondary.
- The **Us page scrolls forever** — 7 distinct sections (hero, mood, upcoming dates, milestones, timeline, highlights, stats). A lot to take in.
- **Partner notes** appear as a banner on the Planner page — easy to miss.
- The **FAB (+)** requires picking a category from a sheet before you can actually add something. One extra step every time.
- There is no "today at a glance" view. You open the app and land in a calendar.

---

## Design Problems to Solve

1. **No home/landing screen** — the calendar is not the right entry point every day. Most sessions aren't about planning, they're about checking in.
2. **Category hub is under-developed** — 5 things that matter (dreams, wishes, plans, shopping, moments) are shown as tiny tiles, hidden under a calendar.
3. **Us page is too tall** — everything dumped in one vertical scroll. Hard to navigate back to a specific section.
4. **Partner communication is secondary** — the note system is buried. Two people using this app together should feel connected on every screen.
5. **Mood and connection feel bolted on** — mood lives in the Us tab, but it's relevant everywhere. It should be ambient.

---

## Concept A: "Today" as Home Tab

**Idea:** Add a 4th tab — "Today" — that becomes the default landing screen.

```
TABS: Today  |  Together  |  Us  |  Finance
```

### Today tab content (top to bottom)

**Greeting block**
- "Good evening, Mateo" (time-aware)
- Shows both user avatars + current moods side by side as small pills (e.g. "Seval: loved up / Mateo: tired")
- One tap on your avatar to update mood inline
- If there is an unread partner note — it appears here prominently, not as a tiny banner

**Today's events** (from calendar)
- Simple vertical list of today's events with time + color bar
- Empty state: "A quiet day — maybe a good one for a date?" with a quick-add button

**Upcoming (next 3 things)**
- Small cards: next countdown, next calendar event
- Keeps you aware without going to Planner

**Quick-add strip**
- Horizontal scrollable row of pill buttons, each pre-set to a category:
  - "+ Plan" / "+ Dream" / "+ Wish" / "+ Moment" / "+ Shopping"
- Tapping one opens the add sheet with category already selected — no extra step

**Why this works:**
- Gives the app a natural daily ritual. Open → see both moods → see what's happening → quick-add if needed.
- Partner note is impossible to miss here.
- Calendar is still accessible in "Together" tab for planning sessions.

---

## Concept B: Redesigned "Together / Planner" Page

**Problem:** Calendar + tiny category hub + day events is too much. The calendar dominates but isn't always needed.

**Idea:** Keep calendar but make the category content feel like a real section, not an afterthought.

### New layout

```
[ Month nav + mini calendar (compact, 5-row grid) ]
  — tap a day to see its events in a bottom sheet, not inline
  — keeps calendar visible but doesn't dominate

[ SECTION: "Our Stuff" ]
  — horizontal scroll of category cards, taller (not 5 tiny tiles)
  — each card: emoji, label, count badge, preview of 1-2 items
  — feels like a content feed entry point, not a nav button

[ SECTION: "Recent Moments" ]
  — last 3 calendar events with their color bars
  — "See all" → full calendar
```

### Category card example (bigger, preview-oriented)
```
+---------------------------+
| 💜 Wishes          14 >   |
|                           |
| "Weekend at the sea"      |
| "New camera"              |
|                           |
+---------------------------+
```
vs current tiny tile:
```
+-------+
|  💜   |
| Wishes|
|  14   |
+-------+
```

**The payoff:** Wishes/Dreams/Plans become content you can read at a glance, not just a doorway to a list.

---

## Concept C: "Us" Page with Inner Tabs

**Problem:** The Us page has 7 sections and scrolls a long way. Hard to jump to a specific thing.

**Idea:** Keep the same content but organise into 3 horizontal tabs within the page.

```
Us                                         [Sign out]
─────────────────────────────────────────────────────
[ Story ] [ Moments ] [ Stats ]
═════════                          ← active tab underline

(content for selected tab)
```

### Story tab
- Relationship hero timer (stays here, it's the identity of this page)
- Mood block
- Upcoming important dates
- Milestones & anniversaries

### Moments tab
- Memory highlights (photo grid, bigger cards)
- Timeline (chronological list of memories)
- Good for browsing your story visually

### Stats tab
- Relationship stats grid
- BoomBoom counter
- Could add more fun stats over time (e.g. "shared shopping trips", "dreams achieved together")

**Why:** Hero timer + mood = daily check-in (Story). Memories/timeline = browsing mode (Moments). Stats = fun/playful (Stats). Three distinct intentions, each deserving its own screen area.

---

## Concept D: Partner Note as Persistent Ambient Element

**Problem:** Partner notes are a banner that appears/disappears on one page. Easy to miss.

**Idea:** Make the note system a persistent icon on every screen — like a little envelope in the top-right of the layout header.

```
[  Title of page         ]   [  💌 (dot if unread)  ]
```

- Always visible
- Dot indicator when there's an unread note
- Tap to open compose or read sheet (same as current)
- Sending notes becomes a lightweight "I'm thinking of you" gesture accessible from anywhere in the app

This keeps the emotional connective tissue of the app alive across all tabs, not just when you happen to be on the Planner page.

---

## Concept E: Mood as Ambient (not a section)

**Current:** Mood lives in a dedicated section of the Us page. You expand it, pick a mood, add a note.

**Idea:** Show both moods as small persistent badges at the top of the Today screen and in the header of the Us page. Tapping your own badge instantly opens the mood picker.

```
[ Seval: loved up 💕 ]   [ Mateo: tired 😴 ]
```

One-tap update. Makes it feel like a daily temperature check, not a form you fill out.

---

## Concept F: Quick-Add Shortcut (removing the extra step)

**Current flow:**
1. Tap FAB
2. FullCreateSheet opens → pick a type (event / todo / goal / wish / shopping)
3. Fill in form

**Proposed flow:**
1. Long-press FAB → shows 5 radial/arc shortcuts around the button (one per category, like a speed dial)
2. Tap the right category icon → goes directly to that add form
3. Regular tap FAB → still opens FullCreateSheet as fallback

OR simpler: replace FAB with a "+" row pinned above the bottom nav, showing 5 category mini-buttons inline. Cheaper to build, same reduction in steps.

---

## Concept G: Calendar Redesign — Week View Default

**Idea:** Instead of showing the full month grid (which is dense on mobile), show a **week strip** by default.

```
< Jul  S  M  T  W  T  F  S  >
         14 15 16 [17] 18 19 20
              •      •
```
- 7 days across, compact height (~60px)
- Swipe left/right to advance weeks
- Dots below dates for events
- Tapping a day shows its events below
- A "Month" toggle expands to the full grid if needed

**Why:** Most planning is within the next 2 weeks. Full month view means small hit targets and lots of empty space. Week strip is faster to navigate and leaves more room for event content.

---

## What to Prioritise

If only picking 1-2 ideas to actually implement:

**High impact / lower effort:**
- Concept D (partner note ambient icon in header) — one layout change, big emotional payoff
- Concept C (inner tabs on Us page) — reduces scroll, makes sections more discoverable, no new content needed

**High impact / medium effort:**
- Concept A (Today tab) — new tab + new page, but content already exists in store
- Concept B (bigger category cards) — redesigns one section of Planner, significant visual upgrade

**Exploratory / later:**
- Concept E (ambient mood)
- Concept F (quick-add shortcut)
- Concept G (week view calendar)

---

## Open Questions

- Should "Finance" stay as a separate tab, or should it live inside a "Plans" category on Together?
- Is there a "Date Night" mode worth exploring? (A full-screen shared view you both look at together)
- Do we want the two users' colour themes to merge/blend somewhere, rather than being purely user-specific?
- Could memory photos become a "shared wall" — a masonry grid that feels like a photo album rather than a timeline?
