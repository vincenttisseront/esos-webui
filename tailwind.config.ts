// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default <Config>{
  content: [
    './components/**/*.{vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './composables/**/*.ts',
    './app.vue',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:       ['Inter', 'system-ui', 'sans-serif'],
        identifier: ['JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        'ui-xs':   ['0.75rem',   { lineHeight: '1rem'    }],
        'ui-sm':   ['0.8125rem', { lineHeight: '1.25rem' }],
        'ui-base': ['0.875rem',  { lineHeight: '1.375rem'}],
      },
      colors: {
        brand: {
          50:  'var(--color-brand-50)',
          100: 'var(--color-brand-100)',
          500: 'var(--color-brand-500)',
          600: 'var(--color-brand-600)',
          700: 'var(--color-brand-700)',
        },
        io: {
          read:  'var(--color-io-read)',
          write: 'var(--color-io-write)',
        },
      },
      borderRadius: {
        DEFAULT: 'var(--radius-md)',
      },
      boxShadow: {
        card: 'var(--shadow-sm)',
        modal: 'var(--shadow-xl)',
      },
    },
  },
}
