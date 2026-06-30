import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy /api to the FastAPI backend so cookies are same-origin in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // bind 0.0.0.0 so it's reachable through dev-container port forwarding
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
