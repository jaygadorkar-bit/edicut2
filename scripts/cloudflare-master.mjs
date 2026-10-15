// Development CLI only. Never import into the app or deploy this token as a
// Worker secret. The existing analytics token in .env is deliberately retained.
import fs from "node:fs";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
const root = new URL("../", import.meta.url);
const env = dotenv.parse(fs.readFileSync(new URL(".env", root), "utf8"));
const token = env.CLOUDFLARE_MASTER_API_TOKEN;
if (!token) throw new Error("Set CLOUDFLARE_MASTER_API_TOKEN locally in .env");
if (!process.argv.slice(2).length) {
  console.log("Usage: node scripts/cloudflare-master.mjs <wrangler arguments>. Uses the local master token without replacing the analytics token.");
} else {
  const web = createRequire(new URL("apps/web/package.json", root));
  const child = spawn(process.execPath, [web.resolve("wrangler"), ...process.argv.slice(2)], {
    cwd: fileURLToPath(new URL("apps/web/", root)), stdio: "inherit",
    env: { ...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: "f2c46bb116722bcb7dc4be44e500154b" },
  });
  child.on("error", () => { console.error("Unable to launch Wrangler"); process.exitCode = 1; });
  child.on("exit", code => { process.exitCode = code ?? 1; });
}
