import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:     ['var(--font-inter)', 'system-ui', 'sans-serif'],
        playfair: ['var(--font-playfair)', 'Georgia', 'serif'],
      },
      colors: {
        seval: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
        },
        mateo: {
          50:  '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
        },
        // ── Botanical Journal palette ──────────────────────────────────────
        cream:   '#FDFAF5',
        sage: {
          50:  '#F2F5F1',
          100: '#DCE6DB',
          200: '#C5D5C3',
          300: '#A8C5A0',
          400: '#8FA68D',
          500: '#6B8A6B',
          600: '#527052',
        },
        olive: {
          50:  '#F4F5EF',
          100: '#E3E6D6',
          200: '#B5C299',
          300: '#93AE90',
          400: '#7A8C60',
          500: '#5E6B47',
        },
        blush: {
          50:  '#FDF7F5',
          100: '#F7EAE5',
          200: '#EED5CB',
          300: '#E8C4B8',
          400: '#D9A896',
        },
        charcoal: {
          DEFAULT: '#2D2926',
          warm:    '#4A4540',
        },
      },
      boxShadow: {
        // Warm charcoal shadows — aligned with --c2-shadow-* tokens
        xs:    '0 1px 4px rgba(45,41,38,0.04)',
        sm:    '0 1px 6px rgba(45,41,38,0.05)',
        card:  '0 1px 6px rgba(45,41,38,0.05)',   // alias
        md:    '0 2px 12px rgba(45,41,38,0.06)',
        soft:  '0 4px 24px rgba(45,41,38,0.07)',
        lg:    '0 2px 16px rgba(45,41,38,0.08)',
        warm:  '0 4px 28px rgba(45,41,38,0.08)',
        modal: '0 -4px 40px rgba(45,41,38,0.13)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
  safelist: [
    // Seval theme classes
    'bg-seval-50', 'bg-seval-100', 'bg-seval-200', 'bg-seval-400', 'bg-seval-500', 'bg-seval-600',
    'text-seval-500', 'text-seval-600', 'text-seval-700',
    'border-seval-200', 'border-seval-300', 'border-seval-400',
    'ring-seval-400',
    // Mateo theme classes
    'bg-mateo-50', 'bg-mateo-100', 'bg-mateo-200', 'bg-mateo-400', 'bg-mateo-500', 'bg-mateo-600',
    'text-mateo-500', 'text-mateo-600', 'text-mateo-700',
    'border-mateo-200', 'border-mateo-300', 'border-mateo-400',
    'ring-mateo-400',
    // Gradients
    'from-seval-400', 'to-seval-500', 'from-mateo-400', 'to-mateo-500',
    'from-seval-50', 'to-mateo-50',
    // Event colors (used dynamically via EVENT_COLOR_CLASS)
    'bg-blue-400', 'bg-yellow-400', 'bg-emerald-400',
    // Legacy event colors (backward compat for old saved data)
    'bg-violet-300',
  ],
}

export default config
