/** @type {import('tailwindcss').Config} */
// PALETA DE MARCA (tricolor financiero):
//  - teal   = AZUL MARINO (principal, confianza)
//  - aqua   = TURQUESA (favorito de Paola, acentos y portada)
//  - dorado = ORO (lujo, resaltes y botones especiales)
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        teal: {
          DEFAULT: "#1E50A0", // azul marino principal
          dark: "#0C2E66",    // azul muy oscuro
          light: "#C9DBF4",
          soft: "#EEF3FB",
        },
        aqua: {
          DEFAULT: "#009B94", // turquesa (favorito)
          dark: "#02635E",
          light: "#8AEAE5",
          soft: "#E6F6F5",
        },
        dorado: {
          DEFAULT: "#C9A227", // oro
          light: "#E2C56B",
          dark: "#A6852E",
        },
        tinta: "#1A2233",
        humo: "#64748B",
        nube: "#F4F6FA",
      },
      fontFamily: {
        display: ["Sora", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
