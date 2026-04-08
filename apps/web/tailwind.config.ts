import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 原有 warm 色保留，避免遗漏场景
        warm: {
          50: '#fdf8f4',
          100: '#f9ece0',
          200: '#f0d4b8',
          300: '#e0b48a',
          500: '#d39871',
          600: '#b87d56',
          700: '#8c5a36',
        },
        // 主色系：治愈系绿
        primary: {
          50: '#f0faf4',
          100: '#d6f2e0',
          200: '#aee3c0',
          300: '#7dcfa0',
          400: '#4db880',
          500: '#2da066',
          600: '#1f8050',
          700: '#166040',
        },
        // 中性色：暖灰
        neutral: {
          50: '#faf9f7',
          100: '#f0ede8',
          200: '#ddd8d0',
          400: '#a09890',
          600: '#6b6460',
          800: '#3a3530',
          900: '#1e1a18',
        },
        // 辅助色
        accent: {
          warm: '#e8a87c',
          sage: '#8fad9a',
        },
        // 风险提示色（语义化，已软化）
        risk: {
          low: '#2da066',
          medium: '#d4a96a',
          high: '#c17c74',
          critical: '#a05060',
        },
      },
      fontFamily: {
        sans: ['Noto Sans SC', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
