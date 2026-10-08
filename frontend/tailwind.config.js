/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Near-black neutrals. Existing `surface-*` classes pick these up.
        surface: {
          950: '#080808',
          900: '#0e0e0e',
          850: '#131313',
          800: '#1b1b1b',
        },
        // The accent is a warm ivory (the old `cyan-*` classes now resolve to it),
        // so status colours (green / amber / red) are the only coloured elements.
        cyan: {
          50: '#fbfaf6',
          100: '#f6f3ec',
          200: '#ece8dc',
          300: '#e6e1d1',
          400: '#cfc9b6',
          500: '#b3ad98',
          600: '#8f8a78',
        },
      },
      fontFamily: {
        sans: ['"Inter Tight Variable"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Inter Tight Variable"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'toast-in': { from: { opacity: '0', transform: 'translateY(12px) scale(0.98)' }, to: { opacity: '1', transform: 'translateY(0) scale(1)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'line-up': { from: { transform: 'translateY(105%)' }, to: { transform: 'translateY(0)' } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        curtain: { '0%': { transform: 'translateY(0)' }, '100%': { transform: 'translateY(-101%)' } },
        'intro-out': { '0%': { transform: 'translateY(0)' }, '100%': { transform: 'translateY(-101%)' } },
      },
      animation: {
        'fade-up': 'fade-up 320ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 200ms ease-out both',
        'toast-in': 'toast-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both',
        marquee: 'marquee 40s linear infinite',
      },
    },
  },
  plugins: [],
};
