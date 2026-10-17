'use client'

import Image from 'next/image'

export type SeMaRoomHeaderProps = {
  /** 'static' — eyebrow + title. 'greeting' — greeting line. */
  mode?: 'static' | 'greeting'
  /** Small-caps eyebrow above title (static mode). */
  eyebrow?: string
  /** Page title (static mode). Accepts ReactNode for line breaks. */
  title?: React.ReactNode
  /** Greeting line (greeting mode). */
  greeting?: string
  /** Muted line below title / greeting. */
  subtitle?: string
  /** Date string below subtitle. */
  dateLabel?: string
  /** Botanical artwork path served from /public. */
  imageSrc?: string
  /** Alt text — pass "" for purely decorative images. */
  imageAlt?: string
  /**
   * CSS object-position for the cover-mode artwork.
   * Tune per room to place text in the natural empty paper area.
   */
  imageObjectPosition?: string
  /**
   * Fine-tune the left readability gradient strength.
   * Positive → stronger (more cream), negative → lighter (more artwork visible).
   * Applied to the middle gradient stops only; fade endpoints stay fixed.
   * Typical range: -0.08 to +0.08.
   */
  imageGradientBoost?: number
  /** Right-aligned slot — e.g. Sign Out button. */
  action?: React.ReactNode
  className?: string
}

/**
 * SeMaRoomHeader — full-canvas botanical journal header.
 *
 * The botanical artwork fills the entire header (object-fit: cover).
 * Text floats above it in the natural cream paper area of each composition.
 * A soft cream gradient from the left protects typography without covering
 * the artwork. A bottom fade blends into the page body below.
 *
 * Pure display component — no store, no SVG, no generated decorations.
 */
export function SeMaRoomHeader({
  mode = 'static',
  eyebrow,
  title,
  greeting,
  subtitle,
  dateLabel,
  imageSrc,
  imageAlt = '',
  imageObjectPosition = 'center center',
  imageGradientBoost = 0,
  action,
  className,
}: SeMaRoomHeaderProps) {
  // Clamp a gradient alpha value with the per-room boost applied
  const ga = (v: number) => Math.min(1, Math.max(0, v + imageGradientBoost)).toFixed(2)

  return (
    <header
      className={['relative overflow-hidden', className].filter(Boolean).join(' ')}
      style={{
        minHeight: 'clamp(210px, 27vh, 250px)',
        background: 'var(--bj-cream)',
      }}
    >

      {/* ── Layer 1: Full-canvas botanical artwork ── */}
      {imageSrc && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none select-none"
          style={{ zIndex: 0 }}
        >
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            sizes="100vw"
            style={{ objectFit: 'cover', objectPosition: imageObjectPosition }}
            priority
          />
        </div>
      )}

      {/* ── Layer 2: Left readability gradient ──
          Cream at the left where text lives, fades to transparent
          toward the botanical artwork on the right.
          No white rectangle. No dark overlay. No harsh edge.
          Middle stops are tuned per room via imageGradientBoost. */}
      {imageSrc && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 1,
            background: `linear-gradient(90deg, rgba(253,250,245,0.98) 0%, rgba(253,250,245,${ga(0.92)}) 35%, rgba(253,250,245,${ga(0.55)}) 58%, rgba(253,250,245,${ga(0.08)}) 78%, rgba(253,250,245,0) 100%)`,
          }}
        />
      )}

      {/* ── Layer 3: Bottom fade into page body ──
          Ensures the header blends seamlessly into the cream journal page. */}
      {imageSrc && (
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{
            zIndex: 1,
            height: '55%',
            background: [
              'linear-gradient(to bottom,',
              'rgba(253,250,245,0) 0%,',
              'rgba(253,250,245,0) 70%,',
              'rgba(253,250,245,0.65) 88%,',
              'var(--bj-cream) 100%)',
            ].join(' '),
          }}
        />
      )}

      {/* ── Layer 4: Content — text floats inside the artwork ── */}
      <div
        className="relative flex items-start justify-between"
        style={{
          zIndex: 2,
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 48,
          paddingBottom: 28,
        }}
      >
        <div style={{ maxWidth: mode === 'greeting' ? '68%' : '64%', minWidth: 0 }}>

          {/* Static mode */}
          {mode === 'static' && (
            <>
              {eyebrow && (
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    color: '#9B9590',
                    marginBottom: 10,
                    lineHeight: 1.4,
                  }}
                >
                  {eyebrow}
                </p>
              )}
              {title && (
                <h1
                  style={{
                    fontFamily: 'var(--font-playfair)',
                    fontWeight: 600,
                    fontSize: 'clamp(2rem, 7.5vw, 2.65rem)',
                    lineHeight: 1.07,
                    color: 'var(--bj-charcoal)',
                    letterSpacing: '-0.015em',
                    marginBottom: subtitle || dateLabel ? 12 : 0,
                  }}
                >
                  {title}
                </h1>
              )}
            </>
          )}

          {/* Greeting mode */}
          {mode === 'greeting' && greeting && (
            <h1
              style={{
                fontFamily: 'var(--font-playfair)',
                fontWeight: 600,
                fontSize: 'clamp(1.85rem, 6.8vw, 2.4rem)',
                lineHeight: 1.05,
                color: 'var(--bj-charcoal)',
                letterSpacing: '-0.015em',
                marginBottom: subtitle || dateLabel ? 10 : 0,
              }}
            >
              {greeting}
            </h1>
          )}

          {subtitle && (
            <p style={{ fontSize: 14, lineHeight: 1.45, color: '#6B6458', marginBottom: dateLabel ? 4 : 0 }}>
              {subtitle}
            </p>
          )}

          {dateLabel && (
            <p style={{ fontSize: 12, color: '#9B9590' }}>
              {dateLabel}
            </p>
          )}
        </div>

        {/* Action slot (sign-out, etc.) — z-index 3 to stay above all layers */}
        {action && (
          <div style={{ marginLeft: 12, flexShrink: 0, position: 'relative', zIndex: 3 }}>
            {action}
          </div>
        )}
      </div>
    </header>
  )
}
