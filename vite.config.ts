import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  // GitHub Pages serves the app under /<repo>/; set VITE_BASE there. Local and Capacitor builds use "/".
  base: process.env.VITE_BASE ?? "/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: {
        name: "Unbeatable",
        short_name: "Unbeatable",
        lang: "it",
        display: "standalone",
        orientation: "portrait",
        background_color: "#06070d",
        theme_color: "#06070d",
        icons: [
          { src: "apple-touch-icon.png", sizes: "180x180", type: "image/png" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,mp3}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "index.html",
      },
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
