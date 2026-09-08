import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        navy: '#0A365D',
        accent: '#C1571A',
        'accent-deep': '#9C4614',
        'accent-tint': '#FBEAE0',
        'navy-tint': '#E8EEF3',
        paper: '#F7F5F1',
        ink: '#1F2A33',
        'ink-soft': '#6B7680',
        line: '#E4E0D8',
        success: '#2E7D4F',
        'success-tint': '#E4F3E9',
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
};

export default config;
