import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            '--tw-prose-body': 'var(--text-primary)',
            '--tw-prose-headings': 'var(--text-primary)',
            '--tw-prose-bold': 'var(--text-primary)',
            '--tw-prose-links': 'var(--accent)',
            '--tw-prose-code': 'var(--text-primary)',
            '--tw-prose-bullets': 'var(--text-muted)',
            '--tw-prose-counters': 'var(--text-muted)',
            '--tw-prose-hr': 'var(--border)',
            'h1, h2, h3, h4': {
              color: 'var(--text-primary)',
              fontWeight: '600',
            },
            'strong': {
              color: 'var(--text-primary)',
              fontWeight: '600',
            },
            'code': {
              color: 'var(--text-primary)',
              backgroundColor: 'var(--bg-hover)',
              padding: '0.15em 0.3em',
              borderRadius: '0.25em',
              fontWeight: '400',
            },
            'code::before': { content: 'none' },
            'code::after': { content: 'none' },
            'a': {
              color: 'var(--accent)',
              textDecoration: 'none',
            },
            'blockquote': {
              borderLeftColor: 'var(--border)',
              color: 'var(--text-secondary)',
            },
          },
        },
      },
    },
  },
  plugins: [typography],
} satisfies Config;
