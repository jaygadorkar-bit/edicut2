import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

function filesUnder(root, relative) {
  const path = join(root, relative);
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(relative, entry.name);
    return entry.isDirectory() ? filesUnder(root, child) : entry.isFile() ? [child] : [];
  }).sort();
}

function fingerprint(root, files, salt = "") {
  const hash = createHash("sha256").update(salt);
  for (const file of files) {
    hash.update(file).update("\0");
    hash.update(existsSync(join(root, file)) ? readFileSync(join(root, file)) : "<missing>").update("\0");
  }
  return hash.digest("hex");
}

function readStamp(path) {
  try { return readFileSync(path, "utf8"); } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return "";
  }
}

function writeStamp(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function runPnpm(args, root) {
  const result = spawnSync("pnpm", args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`pnpm ${args.join(" ")} failed (${result.status ?? result.signal})`);
}

export function prepareDockerDev({ root = process.cwd(), run = runPnpm, log = console.log } = {}) {
  // Discover the same apps/* and packages/* workspaces as pnpm-workspace.yaml.
  const workspaces = ["apps", "packages"].flatMap((directory) =>
    readdirSync(join(root, directory), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(root, directory, entry.name, "package.json")))
      .map((entry) => join(directory, entry.name))
  ).sort();
  const manifests = [
    "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "Dockerfile",
    ".npmrc", ".pnpmfile.cjs", "pnpmfile.cjs",
    ...workspaces.flatMap((workspace) => [join(workspace, "package.json"), join(workspace, ".npmrc")]),
    ...filesUnder(root, "patches"),
  ];
  const dependencies = fingerprint(root, manifests, `${process.version}:${process.platform}:${process.arch}:v1`);
  const stamps = ["", ...workspaces].map((workspace) => join(root, workspace, "node_modules", ".edicut-dependencies"));
  const binariesPresent = existsSync(join(root, "node_modules/.bin/tsc")) &&
    existsSync(join(root, "apps/web/node_modules/.bin/react-router"));

  if (!binariesPresent || stamps.some((stamp) => readStamp(stamp) !== dependencies)) {
    // Invalidate first: an interrupted/failed install must never leave a valid stamp.
    stamps.forEach((stamp) => writeStamp(stamp, ""));
    log("[docker-dev] Installing changed or missing dependencies...");
    run(["install", "--frozen-lockfile", "--prefer-offline", "--store-dir", "/pnpm/store"], root);
    stamps.forEach((stamp) => writeStamp(stamp, dependencies));
  } else {
    log("[docker-dev] Dependencies unchanged; skipping install.");
  }

  let upstream = dependencies;
  for (const name of ["shared", "db"]) {
    const workspace = join("packages", name);
    const source = fingerprint(root, [
      "tsconfig.base.json", join(workspace, "tsconfig.json"), join(workspace, "package.json"),
      ...filesUnder(root, join(workspace, "src")),
    ], upstream);
    const outputFiles = filesUnder(root, join(workspace, "dist"));
    const output = fingerprint(root, outputFiles);
    const stamp = join(root, "node_modules/.cache/edicut-dev", `${name}.json`);
    const expected = JSON.stringify({ source, output });
    if (outputFiles.length === 0 || readStamp(stamp) !== expected) {
      writeStamp(stamp, "");
      log(`[docker-dev] Building @edicut/${name}...`);
      // Force emission on cache misses, including a removed/partially deleted dist.
      run(["--filter", `@edicut/${name}`, "exec", "tsc", "-p", "tsconfig.json", "--incremental", "false"], root);
      writeStamp(stamp, JSON.stringify({ source, output: fingerprint(root, filesUnder(root, join(workspace, "dist"))) }));
    } else {
      log(`[docker-dev] @edicut/${name} unchanged; skipping build.`);
    }
    upstream = source;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { prepareDockerDev(); } catch (error) {
    console.error(`[docker-dev] ${error.message}`);
    process.exitCode = 1;
  }
}
