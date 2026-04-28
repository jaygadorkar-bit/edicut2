import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ isSsrBuild }) => ({
  cacheDir: ".vite-cache",
  build: {
    cssCodeSplit: true,
    sourcemap: false,
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
