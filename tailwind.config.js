/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#071016',
        panel: '#0D1B24',
        cyan: '#35D0FF',
        success: '#42E695',
        warning: '#FFD166',
        danger: '#FF5F73',
        muted: '#8FB0BD',
      },
      fontFamily: {
        display: ['"Rajdhani"', '"Orbitron"', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(53, 208, 255, 0.25)',
      },
    },
  },
  plugins: [],
}
