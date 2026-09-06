/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: '#0A2540',
        police: '#2563EB',
        teal: '#0F6E56',
        gold: '#FBBF24',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
