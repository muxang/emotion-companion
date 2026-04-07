import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        warm: {
          50: '#fdf8f4',
          100: '#f9ece0',
          500: '#d39871',
          700: '#8c5a36',
        },
      },
    },
  },
  plugins: [],
};

export default config;
