import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const [, , command] = process.argv;

if (!command) {
  console.error("Usage: node scripts/run-cf-command.mjs <build|preview|deploy|upload>");
  process.exit(1);
}

const appDir = process.cwd();
if (command === "build") {
  for (const dirName of [".next", ".open-next"]) {
    const fullPath = path.join(appDir, dirName);
    if (existsSync(fullPath)) {
      rmSync(fullPath, { recursive: true, force: true });
    }
  }
}

const child = spawn("pnpm", ["dlx", "@opennextjs/cloudflare", command], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
