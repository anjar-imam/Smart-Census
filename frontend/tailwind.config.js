/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17243b",
        muted: "#718096",
        brand: "#137c72",
        "brand-dark": "#0c615b",
        canvas: "#f5f7fb",
        line: "#e7ebf1",
      },
      boxShadow: {
        panel: "0 6px 24px rgba(34, 52, 79, .055)",
      },
    },
  },
  plugins: [],
};
