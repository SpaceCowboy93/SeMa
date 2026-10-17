'use client'

/**
 * GlobalError — catches crashes in the root layout (e.g. the HTML shell).
 *
 * This component must include its own <html> and <body> because the
 * normal layout.tsx is unavailable when this triggers.
 *
 * Design: uses inline styles to avoid Tailwind/CSS dependency failures.
 */

import { useEffect } from 'react'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    // Log to console in dev — never log to a production monitoring service here
    if (process.env.NODE_ENV !== 'production') {
      console.error('[SeMa GlobalError]', error)
    }
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin:          0,
          minHeight:       '100vh',
          display:         'flex',
          flexDirection:   'column',
          alignItems:      'center',
          justifyContent:  'center',
          fontFamily:      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          background:      '#FAF8F5',
          padding:         '24px',
          boxSizing:       'border-box',
        }}
      >
        <div
          style={{
            width:           '48px',
            height:          '48px',
            borderRadius:    '50%',
            background:      'rgba(216,138,138,0.12)',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            marginBottom:    '16px',
          }}
        >
          <svg
            width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke="#D88A8A" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h1
          style={{
            fontSize:    '18px',
            fontWeight:  700,
            color:       '#2D2926',
            margin:      '0 0 8px',
            textAlign:   'center',
          }}
        >
          Something went wrong
        </h1>

        <p
          style={{
            fontSize:    '14px',
            color:       '#9B9590',
            margin:      '0 0 24px',
            textAlign:   'center',
            maxWidth:    '280px',
            lineHeight:  1.5,
          }}
        >
          The app encountered an unexpected problem. Please try reloading.
        </p>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={reset}
            autoFocus
            style={{
              background:    '#9EC9B3',
              color:         'white',
              border:        'none',
              borderRadius:  '20px',
              padding:       '12px 24px',
              fontSize:      '14px',
              fontWeight:    600,
              cursor:        'pointer',
            }}
          >
            Try again
          </button>

          <button
            onClick={() => { window.location.href = '/' }}
            style={{
              background:    'rgba(155,149,144,0.12)',
              color:         '#6B6458',
              border:        'none',
              borderRadius:  '20px',
              padding:       '12px 24px',
              fontSize:      '14px',
              fontWeight:    600,
              cursor:        'pointer',
            }}
          >
            Go to home
          </button>
        </div>
      </body>
    </html>
  )
}
