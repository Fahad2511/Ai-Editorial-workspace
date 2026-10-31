/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1d2028',
        muted: '#818590',
        line: '#e9e9ed',
        paper: '#fafaf9',
        violet: '#7663e8',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'Inter', 'ui-sans-serif', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 10px rgba(24, 24, 33, 0.035), 0 1px 2px rgba(24, 24, 33, 0.025)',
      },
    },
  },
  plugins: [],
}
