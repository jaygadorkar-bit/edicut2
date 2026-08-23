import { reactRouter } from "@react-router/dev/vite";
// import { cloudflareDevProxy } from "@react-router/dev/vite/cloudflare"; // Removed because it breaks React hooks
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ isSsrBuild }) => ({
  cacheDir: ".vite-cache",
  server: {
    host: "0.0.0.0",
    watch: {
      usePolling: true,
      interval: 250,
    },
    hmr: {
      host: "localhost",
      clientPort: 3000,
      overlay: true,
    },
  },
  build: {
    cssCodeSplit: true,
    sourcemap: process.env.NODE_ENV !== "production",
    assetsInlineLimit: 2048,
    rollupOptions: isSsrBuild
      ? undefined
      : {
          output: {
            manualChunks: {
              react: ["react", "react-dom", "react-router"],
            },
          },
        },
  },
  plugins: [reactRouter(), tsconfigPaths(), tailwindcss()],
}));
