/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          950: '#030712',
          900: '#090d16',
          800: '#0e131f',
          700: '#1c2333',
          600: '#2b354a',
          500: '#3b4966'
        },
        mule: {
          400: '#33b5e5',
          500: '#00a2df',
          600: '#0082b3',
          accent: '#00a2df'
        },
        aws: {
          400: '#ffa726',
          500: '#ff9900',
          600: '#e68a00',
          accent: '#ff9900'
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      boxShadow: {
        'glow-mule': '0 0 20px rgba(0, 162, 223, 0.35)',
        'glow-aws': '0 0 20px rgba(255, 153, 0, 0.35)',
        'glow-neon': '0 0 25px rgba(99, 102, 241, 0.3)'
      }
    },
  },
  plugins: [],
};
