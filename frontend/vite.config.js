// Configuration de l'outil de build Vite.
// "plugin-react" active le support JSX + le rechargement à chaud (Hot Reload)
// pendant le développement, pour voir les changements instantanément.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Redirige les appels "/api/..." vers le backend FastAPI pendant le
    // développement local, pour éviter les soucis de CORS sur le poste dev.
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
