import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
config({ path: path.join(repositoryRoot, ".env.local") });
config({ path: path.join(repositoryRoot, ".env") });

const databaseUrl = process.env.SUPABASE_DATABASE_URL;
const projectRef = process.env.SUPABASE_PROJECT_REF;
if (!databaseUrl || !projectRef) {
  console.error("Set SUPABASE_DATABASE_URL and SUPABASE_PROJECT_REF in the root .env before pushing migrations.");
  process.exit(1);
}

let target;
try {
  const url = new URL(databaseUrl);
  const username = decodeURIComponent(url.username);
  const matchesProject = url.hostname.includes(projectRef) || username.endsWith("." + projectRef);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !matchesProject) {
    throw new Error();
  }
  target = url;
} catch {
  console.error("SUPABASE_DATABASE_URL does not identify the configured Supabase project.");
  process.exit(1);
}

const nodeDirectory = path.dirname(process.execPath);
const npxCli = path.join(nodeDirectory, "node_modules", "npm", "bin", "npx-cli.js");
const extraArgs = process.argv.slice(2);
const result = spawnSync(process.execPath, [
  npxCli,
  "--yes",
  "supabase@2.121.0",
  "db",
  "push",
  "--db-url",
  target.href,
  "--skip-vault",
  ...extraArgs,
], { cwd: repositoryRoot, stdio: "inherit", windowsHide: true });

if (result.error) {
  console.error("Could not start the Supabase CLI.");
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
