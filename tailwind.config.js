/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Angels Oasis CRM design system: white, plum, black — nothing else.
        plum: {
          DEFAULT: "#4A1D3D",
          dark: "#2E1226",
          light: "#6B2C56",
          50: "#F5EEF2",
          100: "#E7D6E1",
        },
        ink: {
          DEFAULT: "#0A0A0A", // "black" — kept as a named token instead of raw #000
          soft: "#1F1F1F",
        },
      },
      fontFamily: {
        serif: ["'Playfair Display'", "Georgia", "serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
