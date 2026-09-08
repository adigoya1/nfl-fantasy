/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./pages/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        fpl: {
          purple: "#37003c",
          purpleDark: "#240028",
          purpleLight: "#4e0057",
          green: "#00ff87",
          greenDark: "#04e07a",
          pink: "#e90052",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        // Headings/scores use this instead -- Inter alone (the default
        // Tailwind/shadcn/AI-tool font) reads as generic; pairing it with a
        // more distinctive display face for big text is a normal editorial
        // move that makes the rest of the app feel considered rather than
        // templated. See globals.css for where h1-h3 get this automatically.
        display: ["Space Grotesk", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
