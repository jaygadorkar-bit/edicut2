import { reactRouter } from "@react-router/dev/vite";
// import { cloudflareDevProxy } from "@react-router/dev/vite/cloudflare"; // Removed because it breaks React hooks
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { chatWebSocketPlugin } from "./dev/chat-websocket.ts";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig(({ mode }) => {
  const localEnv = loadEnv(mode, workspaceRoot, "");
  // Supabase's URL and publishable key are public client configuration. Keep
  // the allowlist explicit so server credentials from the same .env can never
  // be exposed to the browser bundle.
  const supabaseUrl = process.env.VITE_SUPABASE_URL
    || localEnv.VITE_SUPABASE_URL
    || process.env.SUPABASE_URL
    || localEnv.SUPABASE_URL
    || "";
  const supabasePublishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || localEnv.VITE_SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_PUBLISHABLE_KEY
    || localEnv.SUPABASE_PUBLISHABLE_KEY
    || "";
  // React Router's dev server and prerender build run from apps/web. Make the
  // same server-only settings available to loaders without adding them to the
  // browser environment or client bundle.
  for (const name of [
    "APP_URL", "APP_ENV", "GMAIL_SENDER_EMAIL",
    "CRYPTOMUS_MERCHANT_ID", "CRYPTOMUS_PAYMENT_API_KEY",
    "CRYPTOMUS_TEST_WEBHOOK_ENABLED", "CRYPTOMUS_TEST_WEBHOOK_CALLBACK_URL",
    "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DATABASE_URL",
    "NEXT_PUBLIC_RECAPTCHA_SITE_KEY", "RECAPTCHA_SECRET_KEY",
    "YOUTUBE_OAUTH_CLIENT_ID", "YOUTUBE_OAUTH_CLIENT_SECRET", "YOUTUBE_TOKEN_SECRET",
    "GOOGLE_DRIVE_ACCOUNT_EMAIL",
  ]) {
    if (process.env[name] === undefined && localEnv[name]) process.env[name] = localEnv[name];
  }

  return {
    // Keep router contexts and React's hook dispatcher on the same runtime in
    // the pnpm workspace and across Vite's persistent dependency cache.
    resolve: {
      dedupe: ["react", "react-dom", "react-router"],
    },
    define: {
      __EDICUT_SUPABASE_URL__: JSON.stringify(supabaseUrl),
      __EDICUT_SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(supabasePublishableKey),
    },
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
          // Ignore source recordings without excluding public hero media from
          // Vite's asset index and file watcher.
          resolve(workspaceRoot, "media/**").replace(/\\/g, "/"),
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
      sourcemap: mode !== "production",
      assetsInlineLimit: 2048,
    },
    ssr: {
      noExternal: ["react-router", "@react-router/dev", "@react-router/cloudflare"],
    },
    plugins: [chatWebSocketPlugin(), reactRouter(), tailwindcss()],
  };
});
