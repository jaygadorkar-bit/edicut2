import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    "node_modules/**",
    "build/**",
    "dist/**",
    ".react-router/**",
    ".vite-cache/**",
    ".wrangler/**",
    ".wrangler-out/**",
    ".vercel/**",
    "*.tsbuildinfo",
  ]),
]);
