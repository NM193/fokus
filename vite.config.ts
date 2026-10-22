import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// A fixed port that fails loudly, so a Tauri shell can be pointed at it later.
// 1420 is taken by Tzz when both run.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1424,
    strictPort: true,
  },
});
