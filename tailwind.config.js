/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        felt:  { DEFAULT: '#0B3D2E', dark: '#082B20', light: '#0E4F3A' },
        gold:  { DEFAULT: '#C9A84C', light: '#E0C06A', dark: '#A07830' },
        shell: { DEFAULT: '#0A0A0F', light: '#12121A' },
        card:  { DEFAULT: '#F5F0E8', border: '#DDD5C0' },
      },
      fontFamily: {
        cinzel: ['Cinzel', 'serif'],
        inter:  ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
