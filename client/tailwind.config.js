/** @type {import('tailwindcss').Config} */
// Tema disesuaikan dengan logo Palm Village:
//  - forest: hijau gelap (#1a3d2e) -> background & elemen utama
//  - gold:    emas (#d4af37)        -> aksen, CTA, highlight
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palet utama logo
        forest: {
          50: '#f1f6f3',
          100: '#dde9e2',
          200: '#bcd3c5',
          300: '#8eb39d',
          400: '#5e8c70',
          500: '#3d6e51',
          600: '#2c5640',
          700: '#234534',
          800: '#1a3d2e', // warna dominan logo
          900: '#13291f',
          950: '#0a1813',
        },
        gold: {
          50: '#fbf7ec',
          100: '#f5ecd0',
          200: '#ecd89e',
          300: '#e2c462',
          400: '#d9b244',
          500: '#d4af37', // warna emas logo
          600: '#b8922c',
          700: '#937024',
          800: '#7a5a24',
          900: '#684b23',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(10,24,19,0.08), 0 1px 2px rgba(10,24,19,0.04)',
        elevated: '0 10px 30px -10px rgba(10,24,19,0.25)',
      },
    },
  },
  plugins: [],
};
