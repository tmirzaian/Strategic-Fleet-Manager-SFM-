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
        // Quartermaster Gold (docs/UI_ARCHITECTURE.md §4/§37) — the one
        // canonical token for a Quartermaster operational recommendation
        // or an earned certification: procurement/readiness action
        // callouts (e.g. Ship Management's non-zero Decision Summary) and
        // the Quartermaster Completion Seal's border/label. Distinct from
        // `warning` (Caution Yellow — an unsafe condition) even though
        // both read as "amber" at a glance; see §37 for the full semantic
        // split. First authorized use was EWO-014 (the sidebar slogan's
        // "Outfit" word); EWO-065A widens this to the two uses above.
        // Still not a general-purpose accent — reach for `cyan`/`success`
        // first unless the concept genuinely is a Quartermaster one.
        gold: '#C9A227',
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
