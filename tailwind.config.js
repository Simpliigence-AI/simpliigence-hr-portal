/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#e8eef8',
          100: '#c5d3ed',
          500: '#1a3a6b',
          600: '#153060',
          700: '#0f1e3d',
          800: '#0a1530',
          900: '#060d1f',
        },
      },
    },
  },
  plugins: [],
};
