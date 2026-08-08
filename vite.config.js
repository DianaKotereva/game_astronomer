import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173, host: "127.0.0.1" },
  preview: { port: 4173, host: "127.0.0.1" },
  build: {
    target: "esnext",
    sourcemap: true,
    chunkSizeWarningLimit: 4096,
  },
  // Everything ships from the repository. No runtime CDN requests.
  assetsInclude: ["**/*.bin"],
});
