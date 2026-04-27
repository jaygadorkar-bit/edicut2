import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const cfRoot = path.join(root, "apps", "cf-web");
const appRoot = path.join(cfRoot, "src", "app");

const warnings = [];
const blockers = [];

function walk(dir, visitor) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, visitor);
      continue;
    }

    visitor(fullPath);
  }
}

if (!existsSync(path.join(cfRoot, "wrangler.jsonc"))) {
  blockers.push("Missing apps/cf-web/wrangler.jsonc for the Cloudflare worker target.");
}

if (!existsSync(path.join(cfRoot, "open-next.config.ts"))) {
  blockers.push("Missing apps/cf-web/open-next.config.ts for the OpenNext adapter.");
}

if (existsSync(path.join(root, "wrangler.toml"))) {
  blockers.push("Legacy root wrangler.toml is still present. Cloudflare config should live under apps/cf-web.");
}

const cfPackageJson = JSON.parse(readFileSync(path.join(cfRoot, "package.json"), "utf8"));
if (cfPackageJson.devDependencies?.["@cloudflare/next-on-pages"]) {
  blockers.push("Deprecated @cloudflare/next-on-pages dependency is still present in apps/cf-web/package.json.");
}

if (!cfPackageJson.devDependencies?.["@opennextjs/cloudflare"]) {
  blockers.push("Missing @opennextjs/cloudflare dependency in apps/cf-web/package.json.");
}

walk(appRoot, (filePath) => {
  if (!/\.(ts|tsx)$/.test(filePath)) {
    return;
  }

  const source = readFileSync(filePath, "utf8");
  const relativePath = path.relative(root, filePath).replace(/\\/g, "/");
  const usesDb = source.includes('@edicut/platform-core/db');
  const usesNodeAuth = source.includes('@edicut/platform-core/auth"') || source.includes("@edicut/platform-core/auth'");
  const edgeRuntime = source.includes('export const runtime = "edge"') || source.includes('export const runtime = "experimental-edge"');

  if (usesDb) {
    warnings.push(`${relativePath}: direct DB import in cf-web route/component.`);
  }

  if (usesNodeAuth) {
    warnings.push(`${relativePath}: imports node-backed auth helper instead of edge-safe auth.`);
  }

  if (edgeRuntime && usesDb) {
    blockers.push(`${relativePath}: marked as edge runtime while importing DB code.`);
  }
});

console.log("Cloudflare audit");

if (blockers.length > 0) {
  console.log("\nBlockers:");
  for (const item of blockers) {
    console.log(`- ${item}`);
  }
}

if (warnings.length > 0) {
  console.log("\nWarnings:");
  for (const item of warnings) {
    console.log(`- ${item}`);
  }
}

if (blockers.length === 0 && warnings.length === 0) {
  console.log("\nNo Cloudflare-specific issues found.");
}

process.exit(blockers.length > 0 ? 1 : 0);
