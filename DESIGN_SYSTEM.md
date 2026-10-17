# SeMa Design Language — Botanical Journal

Visual source of truth for all SeMa design decisions.
Read this before making any visual change.

---

## Concept — C2 Botanical Journal (Final Phase 1 Specification)

The C2 Botanical Journal is the official, final visual specification for SeMa Phase 1.
All visual decisions must align with this system. Do not mix styles from C1, C3, or C4.

The Botanical Journal concept treats SeMa as a warm, handcrafted record of two people's shared life.

Not a productivity app. Not a dashboard. A living journal.

Every visual element should feel like it belongs in a high-quality, personal notebook — calm, intentional, modern, and emotionally warm.

Modern, not vintage. Botanical, not decorative. Warm, not kitsch.

---

## Typography

### Playfair Display — Premium editorial headings only

Use for:
- Home greeting (`<PageHeader />` in greeting mode)
- Static page titles: Planner, Our Finances, Us
- Daily Briefing header
- Emotional or editorial headings in special contexts

Do NOT use for:
- Body text
- List rows
- Controls, buttons, forms
- Navigation labels
- Metadata or compact labels
- Section headers

### Inter — Everything else

Used for all body text, controls, list rows, navigation, metadata, section labels, buttons, and compact UI text.

### Scale

| Use | Size | Weight | Notes |
|-----|------|--------|-------|
| Page title (Playfair) | 1.5rem / text-2xl | 600 | In PageHeader |
| Daily Briefing greeting (Playfair) | 1.6rem | 600 | In DailyBriefingSheet |
| Section label | 11px | 500 | tracking-widest, uppercase, gray-400 |
| Card title | 14px / text-sm | 600 | gray-800 |
| Body / row label | 14px / text-sm | 400–500 | gray-700 |
| Metadata / sub | 12px / text-xs | 400 | gray-400 |
| Micro label | 10–11px | 500 | gray-400 or accent color |

### Section label pattern (editorial standard)

```
text-[11px] font-medium text-gray-400 tracking-widest uppercase
```

Use consistently across all section headers on all pages.
Replace any `text-sm font-semibold text-gray-500` section labels with this.

---

## Color Palette

### Botanical Journal Base Tokens

| Token | Value | Use |
|-------|-------|-----|
| `--bj-cream` | `#FDFAF5` | Page background |
| `--bj-ivory` | `#FAF7F0` | Card tints, subtle fills |
| `--bj-warm-white` | `#FFFEF9` | Input backgrounds, lightest fills |
| `--bj-sage` | `#8FA68D` | Neutral botanical accent |
| `--bj-sage-dark` | `#527052` | Mateo icon badge, emphasis |
| `--bj-olive` | `#7A8C60` | Finances, structured sections |
| `--bj-blush` | `#E8C4B8` | Seval/Us soft accent |
| `--bj-lavender` | `#C4BAD4` | Seval muted accent, Us page |
| `--bj-gold` | `#C9A96E` | Finances highlight, goal achieved |
| `--bj-charcoal` | `#2D2926` | Primary text (warm charcoal) |
| `--bj-warm-gray` | `#9B9590` | Metadata, secondary text |

### Profile Accent Colors (Primary — unchanged)

These drive buttons, highlights, selected state, active controls.

| Profile | Hex | Tailwind |
|---------|-----|---------|
| Seval | `#8b5cf6` | seval-500 |
| Mateo | `#14b8a6` | mateo-500 |

### Profile Botanical Accents (Secondary — for icon badges and subtle decorations)

These are softer, botanical alternatives used only for:
- PageHeader icon badge background and icon color
- Subtle page decorations
- Low-emphasis contextual accents

| Profile | Badge bg | Badge icon |
|---------|---------|-----------|
| Seval | `rgba(196,186,212,0.15)` | `#9B8CAE` (muted lavender) |
| Mateo | `rgba(107,138,107,0.12)` | `#527052` (forest sage) |

Do NOT recolor buttons, tab bars, or form controls with botanical accents.

### Page Background Blobs (AnimatedBackground)

Each page has a distinct botanical personality conveyed through its animated background blobs.
Blobs render at `opacity: 0.28` with heavy blur.

**Home — Botanical Sunrise**
```
#A8C5A0  (warm sage)
#F0DEC8  (cream/warm sand)
#C5D5C3  (light sage)
```

**Planner — Sage Editorial**
```
#93AE90  (sage)
#B5C299  (olive light)
#7A9478  (sage dark)
```

**Finances — Trustworthy Olive-Gold**
```
#8FA68D  (sage)
#C9A96E  (soft gold)
#7A8C60  (olive)
```

**Us — Intimate Botanical**
```
#E8C4B8  (blush)
#D4C8E0  (muted lavender)
#C5D5C3  (sage light)
```

### Anti-patterns — Colors to avoid

- Neon or saturated gradients
- Purple-blue AI glow gradients (the old blob colors)
- Hard black text (#000 — use charcoal `#2D2926` or gray-900)
- Muddy green-yellow blends (the old Finances blobs)
- Saturated pink
- Strong color tints on every card background

---

## Shadows

Botanical Journal uses warm charcoal shadows rather than pure black, to feel organic rather than clinical.

| Token | Value | Use |
|-------|-------|-----|
| `shadow-card` | `0 2px 12px rgba(45,41,38,0.05)` | Standard cards, list items |
| `shadow-soft` | `0 4px 24px rgba(45,41,38,0.07)` | Floating elements |
| `shadow-warm` | `0 4px 28px rgba(45,41,38,0.08)` | Elevated important cards |
| `shadow-modal` | `0 -4px 40px rgba(45,41,38,0.13)` | Bottom sheets |

---

## Corner Radii

| Context | Radius | Token |
|---------|--------|-------|
| Cards, tiles | 16px | rounded-2xl |
| Hero / premium cards | 20px | rounded-[20px] |
| Sheets, modals | 40px top | rounded-t-[2.5rem] |
| Buttons (primary) | 16px | rounded-2xl |
| Tags, pills | 9999px | rounded-full |
| Icon badges | 12px | rounded-xl |
| Input fields | 12px | rounded-xl |

---

## Card Hierarchy

Three levels. Not everything should be a white card.

### Primary card
- Important daily or emotional content
- White/cream background
- `shadow-warm`
- `rounded-2xl`
- Generous internal padding (px-4 py-4 minimum)

### Secondary card
- Standard sections, standard list items
- White/50–70 or cream background
- `shadow-card`
- `rounded-2xl`
- Moderate padding (px-4 py-3)

### List row (flat)
- Low-priority items, dense lists, sub-rows
- `bg-gray-50/80` or `bg-white/60`
- No shadow, or very subtle
- `rounded-xl`
- Compact padding (px-4 py-2.5–3)
- Use a colored left-border accent instead of colored tint

### Anti-patterns
- Do not nest cards inside cards
- Not every section needs a card
- Prefer flat rows for dense lists
- Avoid equal visual weight across all sections

---

## Spacing System (8pt)

| Token | Value | Use |
|-------|-------|-----|
| 0.5 | 4px | Micro gaps, dots |
| 1 | 8px | Tight inline spacing |
| 2 | 16px | Default gap between inline elements |
| 3 | 24px | Default section row gap |
| 4 | 32px | Section-to-section spacing |
| 5 | 40px | Large section spacing |
| 6 | 48px | Hero spacing |

Page horizontal padding: `px-4` (16px) for content, `px-5` (20px) for headers.

Bottom clearance: `pb-28` minimum to clear FAB + bottom nav.

---

## Icon System

- Use Lucide React icons consistently throughout
- Stroke width: 1.5 (default Lucide) — do not mix stroke widths
- Core icon sizes: 16px (controls), 18px (badges), 20px (primary), 24px (FAB)
- No mixed emoji + vector icon for primary navigation
- Emoji reserved for: emotional content, category labels, Living Moments, list item decoration
- Icon badges in PageHeader: use botanical accent (not primary accent)

---

## Page Personalities

### Home
Warm, alive, welcoming. Botanical sunrise feeling.
- Dynamic greeting is the emotional anchor
- Today's Briefing pill sits close to the greeting
- Category tiles: handcrafted, not dashboard tiles
- Background: sage/cream/warm-sand blobs

### Planner
Focused, calm, organized. Editorial structure.
- Sage/olive background
- Section labels: editorial small caps
- Upcoming dates: clean list, not heavy cards
- Needs attention: flat accent rows, not alarming cards

### Finances
Trustworthy, refined, structured.
- Olive/sage/gold background
- Key financial number is visually dominant
- No romantic or decorative elements
- Clean metric hierarchy: income > expenses > remaining
- Warm but professional

### Us
Emotional, intimate, journal-like.
- Blush/lavender/sage background
- More generous spacing
- Section labels feel personal, not corporate
- Relationship timer is the hero element

---

## Botanical Details

Decorative botanical elements are used rarely and carefully.

### Allowed
- Faint leaf/branch SVG at very low opacity near page headers
- Soft divider lines between major sections
- Botanical color palette (sage, olive, cream, blush) in backgrounds
- Botanical emoji used sparingly in emotional sections

### Not allowed
- Clipart flowers
- Cartoon plants
- Large leaf illustrations behind content
- Botanical details on every card
- Paper/scrapbook texture
- Repeated botanical patterns in list items

Botanical details live outside primary content areas. They never reduce readability.

---

## Motion

All animations should feel calm and handcrafted.

### Allowed
- Soft fade: `opacity 0 → 1`
- Small translate: `y: 8–12px → 0`
- Slight scale: `scale 0.9–0.95 → 1`
- Stagger: max 6 items, 50–80ms per item
- Sheet transitions: spring damping 30, stiffness 380
- Breathing: very subtle scale on blob backgrounds

### Not allowed
- Looping animations on UI elements
- Bouncing
- Spinning (loading spinners are fine)
- Heavy parallax
- Framer Magic Motion between pages (too flashy)
- Decorative animation without purpose

All animations must respect `prefers-reduced-motion`.

---

## Living Moments (Future)

The design system supports Living Moments — subtle contextual visual states that make the app feel alive.

These are NOT themes. They are brief, purposeful visual responses to real life events.

| Moment | Signal | Visual response |
|--------|--------|----------------|
| Birthday | `countdown.date === today` | Soft confetti once, warm greeting |
| Anniversary | `days === 0` for anniversary countdown | Blush overlay, rose-gold accent |
| Trip tomorrow | Event type = travel | Soft airplane accent near header |
| Savings goal reached | `savedAmount >= targetAmount` | Sparkle, gold accent |
| New love note | Unread PartnerNote | Envelope near greeting |
| Christmas | Dec 25 ± 3 days | Warm-light background, pine accent |
| Vacation | Multi-day travel event | Warm sandy tones |

Implementation rules:
- One Living Moment at a time (highest priority wins)
- Never interrupts user flow
- Appears once per qualifying event
- Never on every render

Living Moments use the Botanical Journal palette, not harsh celebratory colors.

---

## Profile-Specific Accents

Subtle differences make each profile feel personal without stereotyping.

Changes are limited to:
- PageHeader icon badge (bg and icon color)
- Animated background blob palette (page-level)
- Selected highlights and active controls (primary color, already exists)

Changes do NOT extend to:
- Card background colors
- Typography
- Layout structure
- Navigation
- Sheet styling

---

## Anti-Patterns (The "No" List)

1. Identical white card stacks on every page
2. Color-tinted backgrounds on every tile (replaces with left-border accent)
3. Purple-blue glowing gradients — use sage/olive instead
4. Oversized icon badges everywhere
5. Generic dashboard tiles for emotional content
6. Too many emojis in UI chrome (reserved for content)
7. Identical header styling on all pages (use page personalities)
8. Decorative motion that serves no UX purpose
9. Fake glassmorphism (heavy blur + opacity everywhere)
10. Card-inside-card layouts
11. Random botanical decorations on every component
12. Equal visual weight across all content (no hierarchy)
13. Blue (#3b82f6 / bg-blue-*) as a decorative color — use sage `#4a7c5e` or olive instead
14. Grain overlays, turbulence SVG filters, or paper texture effects
15. AnimatedBackground blob colors not matching DESIGN_SYSTEM page palette
16. Multiple competing botanical SVG implementations on the same page

---

## Category Rooms

Each category (Shopping, Plans, Dreams, Wishes, Moments) is a "room" inside SeMa —
a distinct space with its own identity, but clearly part of the same shared world.

Category Rooms must not feel like separate apps or generic dashboards.

### Architecture

Category Rooms are bottom sheets (not separate routes) rendered from the Home page.
They follow the shared mobile-safe sheet pattern: flex column, scrollable interior,
fixed header and footer, safe-area padding.

### Room Header Pattern

Every category room uses the same editorial header structure:

```
[drag handle]
[eyebrow — 11px, tracking-widest, uppercase, gray-400]
[title — Playfair Display, text-2xl, gray-900]
[subtitle — text-sm, gray-500]
```

The title is the room's fixed editorial identity. It does not change.
The eyebrow adapts contextually via Living Moments (see getLivingMoment()).
The subtitle adapts to show a dynamic item count or contextual copy.

### Botanical decoration in Room Headers

Each room may use a single, very subtle SVG leaf/branch decoration:
- Positioned near the outer edge of the header (top right corner)
- Opacity: 0.07–0.09
- `aria-hidden="true"`
- Never behind important text
- Never repeated on individual cards within the room

### Shopping Room

Identity: "Home, one item at a time"

```
eyebrow:  Shopping together  (changes via Living Moments)
title:    Home,
          one item at a time
subtitle: N things left to bring home.  (dynamic)
```

Primary actions:
- Scan receipt — opens ReceiptScannerSheet (honest: attaches photo, future: OCR + AI)
- New list — opens ShoppingListEditorSheet

List presentation: flat rows, not card-per-list.
Active lists: white card with thin progress line. No per-item icons.
Completed lists: collapsible section with chevron.
Estimated total: shown only when item prices are set; otherwise omitted.
Closing copy: "Good food, good mood, better together."

Receipt scanning — current vs future:
- Current: photo attachment only. Receipt photos are stored but not parsed.
- Future: OCR + AI item matching. Items identified, matched against shopping list,
  found items marked complete, unplanned items listed separately.
  Total spending recorded in Finances. Partner notified on completion.
  Future copy: "Coffee wasn't found. Keep it on the list?"

### Future Rooms

| Room | Title | Feeling |
|------|-------|---------|
| Plans | What we're building together | Forward-looking, calm |
| Dreams | Someday... | Open, inspiring |
| Wishes | Little wishes | Hopeful, gentle |
| Moments | Moments worth keeping | Nostalgic, warm |
| Notes | Little thoughts | Journal-like, personal |

Do not redesign these during the Shopping pilot.
Prepare the architecture so they can adopt the same room pattern later.

---

## Living Moments System

Living Moments are contextual text adaptations that make SeMa feel quietly aware
of what is happening in the couple's life.

### Source of truth

`src/lib/livingMoment.ts` — `getLivingMoment(input: LivingMomentInput): LivingMoment`

Pure function. Never duplicated into individual pages. Future pages must reuse this.

### LivingMoment shape

```ts
interface LivingMoment {
  homeSubtitle: string      // replaces date below Home greeting
  shoppingTitle: string     // eyebrow above Shopping room title
  shoppingSubtitle: string  // dynamic count / contextual sentence
}
```

### Priority order (first match wins)

1. Birthday today
2. Anniversary today
3. Trip / vacation starts today
4. Trip tomorrow
5. Anniversary tomorrow
6. Birthday tomorrow
7. Christmas week (Dec 22–26)
8. New Year's Eve / Day
9. Dinner event today or tomorrow
10. Picnic today or tomorrow
11. BBQ today or tomorrow
12. Movie night today or tomorrow
13. Busy day (3+ events + todos)
14. Unread partner note
15. Shopping lists pending
16. Quiet day (nothing scheduled)
17. Default (empty string = show date)

### Rules

- Never fake context. Only real app data triggers a moment.
- One moment at a time — first match wins.
- Typography is the hero — only words change, no heavy visual decorations.
- Emoji used only once per moment, in `homeSubtitle` when appropriate.
- `shoppingTitle` / `shoppingSubtitle` change contextually without replacing the main title.

---

## Usage Rules

1. Read SEMA_PHILOSOPHY.md before any design decision.
2. Check DESIGN_SYSTEM.md before adding a new visual component.
3. If a new color is needed, use the botanical palette first.
4. If a new shadow is needed, check existing tokens before inventing one.
5. Section labels use the editorial standard (small caps, tracking-widest).
6. Playfair Display is reserved for premium headings only.
7. Botanical decorations require explicit justification.
8. Every animation must have a UX purpose.
9. Profile personality changes are subtle — do not stereotype.
10. Living Moments follow the documented visual language.
11. Category Rooms follow the Room Header Pattern above.
12. `getLivingMoment()` is the single source of truth for contextual text.
