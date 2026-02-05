/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Medical imaging dark palette
        'viewer-bg': '#1a1a2e',
        'panel-bg': '#16213e',
        'accent': '#4a90d9',
        'accent-hover': '#3a7bc8',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: true,
  },
}
