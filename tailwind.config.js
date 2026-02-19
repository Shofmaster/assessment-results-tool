/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'navy': {
          900: '#0a1628',
          800: '#0f2744',
          700: '#1a3a5c',
          600: '#2d5178',
        },
        'sky': {
          DEFAULT: '#0ea5e9',
          light: '#38bdf8',
          lighter: '#7dd3fc',
        },
        'accent-gold': '#deb83f',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
