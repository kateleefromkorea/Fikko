import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// The mobile app (iOS and Android, via Capacitor). It has its own entry, shell
// and screens in mobile/src, and borrows the shared layer (data hooks, auth,
// lib, ui components, habit cards) from the web app's src/ through `@`.
// Nothing in src/ imports from here, so mobile changes never reach the web app.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname, ".."), "");
  const apiOrigin = env.VITE_API_ORIGIN || "https://fikko-eta.vercel.app";

  return {
    plugins: [react(), tailwindcss()],
    // Same Supabase keys as the web app (Fikko/.env.local).
    envDir: "..",
    resolve: {
      alias: {
        "@mobile": path.resolve(import.meta.dirname, "./src"),
        "@": path.resolve(import.meta.dirname, "../src"),
      },
      dedupe: ["react", "react-dom"],
    },
    server: {
      port: 5188,
      strictPort: true,
      fs: { allow: [".."] },
      // In the browser, /api goes to the deployed web app's functions.
      proxy: { "/api": { target: apiOrigin, changeOrigin: true } },
    },
  };
});
