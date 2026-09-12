import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configuración de Vite (el "motor" que arma y publica la app).
export default defineConfig({
  plugins: [react()],
});
