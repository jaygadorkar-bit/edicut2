import { reactRouter } from "@react-router/dev/vite";
// import { cloudflareDevProxy } from "@react-router/dev/vite/cloudflare"; // Removed because it breaks React hooks
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { chatWebSocketPlugin } from "./dev/chat-websocket";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig(({ mode, isSsrBuild }) => {
  const localEnv = loadEnv(mode, workspaceRoot, "");
  // React Router's dev server runs from apps/web; keep this server-side config
  // out of Vite's client env while loading the same keys as the Worker.
  for (const name of [
    "NEXT_PUBLIC_RECAPTCHA_SITE_KEY", "RECAPTCHA_SECRET_KEY",
    "YOUTUBE_OAUTH_CLIENT_ID", "YOUTUBE_OAUTH_CLIENT_SECRET", "YOUTUBE_TOKEN_SECRET",
  ]) {
    if (process.env[name] === undefined && localEnv[name]) process.env[name] = localEnv[name];
  }

  return {
    envDir: workspaceRoot,
    cacheDir: process.env.DEV_CACHE_DIR ?? ".vite-cache",
    server: {
      host: "0.0.0.0",
      strictPort: true,
      watch: {
        // Windows bind mounts need polling; native development can use OS events.
        usePolling: process.env.CHOKIDAR_USEPOLLING === "true",
        interval: Number(process.env.CHOKIDAR_INTERVAL) || 1000,
        ignored: [
          "**/.codex*/**",
          "**/.pnpm-store*/**",
          "**/.react-router/**",
          "**/.wrangler*/**",
          "**/chrome-profile/**",
          "**/scratch/**",
          "**/artifacts/**",
          "**/media/**",
          "**/coverage/**",
          "**/build/**",
          "**/*.tsbuildinfo",
          "**/*.{test,spec}.{ts,tsx}",
        ],
      },
      hmr: {
        host: "localhost",
        // Docker exposes the development server on host port 3002.
        clientPort: Number(process.env.DEV_PORT ?? 3002),
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
    ssr: {
      noExternal: ["react-router", "@react-router/dev", "@react-router/cloudflare"],
    },
    plugins: [chatWebSocketPlugin(), reactRouter(), tsconfigPaths(), tailwindcss()],
  };
});
