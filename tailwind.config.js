/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand Pack palette. Keep legacy plum/ink names as aliases used by app screens.
        plum: {
          DEFAULT: "#533841",
          dark: "#36272C",
          light: "#715760",
          50: "#FBF5F0",
          100: "#EEEBE7",
        },
        ink: {
          DEFAULT: "#222222",
          soft: "#333333",
        },
        forest: {
          DEFAULT: "#3F6950",
          deep: "#18291C",
        },
        sage: {
          DEFAULT: "#A9CBB7",
          light: "#C9DED2",
        },
        mauve: {
          DEFAULT: "#9F7785",
          deep: "#8F6170",
        },
        linen: "#EEEBE7",
        cream: "#FBF5F0",
        hairline: "#E7E5E4",
      },
      fontFamily: {
        serif: ["Fraunces", "Georgia", "Cambria", "'Times New Roman'", "serif"],
        sans: ["Inter", "system-ui", "-apple-system", "'Segoe UI'", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
