
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx,mdx}",
    "./pages/**/*.{js,jsx,ts,tsx,mdx}",
    "./components/**/*.{js,jsx,ts,tsx,mdx}",
    "./src/**/*.{js,jsx,ts,tsx,mdx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter", "ui-sans-serif", "system-ui", "sans-serif"
        ],
      },
    },
  },
  plugins: [],
};
